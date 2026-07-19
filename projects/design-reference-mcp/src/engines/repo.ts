/**
 * repo engine — GitHub repos, design-system docs, and Coolors URL parsing.
 *
 * search():  match the query against registered repo-engine sources (name,
 *            good_for, category) and return the best matches. No network call
 *            is needed to list them — the value is the curated index itself.
 * getDetail(): for a GitHub repo, pull the README (raw) + the social-preview
 *            image as base64; for a Coolors URL, parse the palette from the URL;
 *            for design-system docs, return the metadata card.
 *
 * Every repo result carries a `license` field so Maya knows what code is
 * reusable (most are MIT).
 */
import { SOURCES, sourcesByEngine, sourceForUrl, type Source } from "../config.js";
import { fetchWithBackoff } from "../util/robots.js";
import { withRateLimit } from "../util/ratelimit.js";
import { toBase64 } from "../util/image.js";
import { type SearchResult, type DetailResult, terms, scoreMatch } from "./types.js";
import { getCached, setCached } from "../cache/urlcache.js";

function githubOwnerRepo(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") return null;
    const [owner, repo] = u.pathname.replace(/^\//, "").split("/");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

/** GitHub renders a social preview image at this stable endpoint. */
function githubThumb(url: string): string {
  const or = githubOwnerRepo(url);
  return or ? `https://opengraph.githubassets.com/1/${or.owner}/${or.repo}` : url;
}

function toResult(s: Source): SearchResult {
  const tags = [s.category, ...(s.good_for ? s.good_for.split(/[,/]/).map((t) => t.trim()) : [])]
    .filter(Boolean)
    .slice(0, 6) as string[];
  return {
    thumb_url: githubOwnerRepo(s.url) ? githubThumb(s.url) : s.url,
    source_url: s.url,
    title: s.name,
    tags,
    source: s.id,
    license: s.license ?? "unknown",
  };
}

/** Parse hex codes out of a Coolors URL/path (e.g. /635bff-0a2540-...). */
export function parseCoolorsUrl(url: string): string[] {
  const hexes: string[] = [];
  try {
    const u = new URL(url);
    for (const seg of u.pathname.split("/")) {
      for (const tok of seg.split("-")) {
        if (/^[0-9a-fA-F]{6}$/.test(tok)) hexes.push(`#${tok.toUpperCase()}`);
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(hexes)];
}

export function search(query: string, limit: number, sourceFilter?: string): SearchResult[] {
  const qterms = terms(query);
  let pool = sourcesByEngine("repo");
  if (sourceFilter) pool = pool.filter((s) => s.id === sourceFilter || s.name === sourceFilter);

  // Coolors: if the query is itself a coolors URL, surface the parsed palette entry.
  const scored = pool
    .map((s) => ({
      s,
      score: scoreMatch(`${s.name} ${s.good_for ?? ""} ${s.category ?? ""} ${s.id}`, qterms),
    }))
    // If no query terms match anything, fall back to returning the whole (capped) index.
    .sort((a, b) => b.score - a.score);

  const anyMatch = scored.some((x) => x.score > 0);
  const chosen = (anyMatch ? scored.filter((x) => x.score > 0) : scored).slice(0, limit);
  return chosen.map((x) => toResult(x.s));
}

async function fetchReadme(owner: string, repo: string): Promise<string | null> {
  for (const branch of ["main", "master"]) {
    for (const name of ["README.md", "readme.md", "Readme.md"]) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${name}`;
      const cached = await getCached(url);
      if (cached) return cached.toString("utf8");
      try {
        const res = await withRateLimit("raw.githubusercontent.com", "repo", () =>
          fetchWithBackoff(url, { ignoreRobots: true }),
        );
        if (res.ok) {
          const text = await res.text();
          await setCached(url, Buffer.from(text, "utf8"));
          return text;
        }
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

export async function getDetail(url: string): Promise<DetailResult> {
  const src = sourceForUrl(url);
  const license = src?.license ?? "unknown";

  // Coolors palette straight from the URL — no network needed.
  if (/coolors\.co/.test(url)) {
    const palette = parseCoolorsUrl(url);
    return {
      source_url: url,
      source: "coolors",
      title: "Coolors palette",
      palette,
      license: "n/a",
      metadata: { hex_count: palette.length },
      note: palette.length ? undefined : "No hex codes found in this Coolors URL/path.",
    };
  }

  const or = githubOwnerRepo(url);
  if (or) {
    const readme = await fetchReadme(or.owner, or.repo);
    const thumbUrl = githubThumb(url);
    let image_base64: string | undefined;
    let image_mime: string | undefined;
    try {
      const cachedImg = await getCached(thumbUrl);
      if (cachedImg) {
        image_base64 = toBase64(cachedImg);
        image_mime = "image/png";
      } else {
        const res = await withRateLimit("opengraph.githubassets.com", "repo", () =>
          fetchWithBackoff(thumbUrl, { ignoreRobots: true }),
        );
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          image_base64 = toBase64(buf);
          image_mime = res.headers.get("content-type") ?? "image/png";
          await setCached(thumbUrl, buf, image_mime);
        }
      }
    } catch {
      /* image is best-effort */
    }
    return {
      source_url: url,
      source: src?.id ?? `${or.owner}/${or.repo}`,
      title: src?.name ?? `${or.owner}/${or.repo}`,
      image_base64,
      image_mime,
      license,
      metadata: {
        owner: or.owner,
        repo: or.repo,
        readme_excerpt: readme ? readme.slice(0, 4000) : null,
        good_for: src?.good_for,
      },
      note: readme ? undefined : "README not found on main/master.",
    };
  }

  // Design-system docs (non-github): return the card + let the scraper handle images if needed.
  return {
    source_url: url,
    source: src?.id ?? "design-system",
    title: src?.name,
    license,
    metadata: { good_for: src?.good_for, category: src?.category },
    note: "Design-system docs page — use extract_tokens for live tokens.",
  };
}

/** True if `url` belongs to a repo-engine source. */
export function handles(url: string): boolean {
  const s = sourceForUrl(url);
  if (s) return s.engine === "repo";
  return githubOwnerRepo(url) !== null || /coolors\.co/.test(url);
}

export const repoSources = () => sourcesByEngine("repo");
void SOURCES;
