/**
 * scraper engine — HTML fetch + parse inline preview images for the 14
 * gallery sources (Land-book, Lapa Ninja, etc).
 *
 * search(): fetch the source's listing page (or a query/tag path when the
 *   site supports one), pull card-like elements via cheerio, and return
 *   thumb/title/url tuples. Best-effort generic selectors since these sites
 *   don't share a template; results are ranked by query-term match against
 *   title/alt text when a query is given.
 * getDetail(): re-fetch the page, return the first large inline image as
 *   base64 plus any visible text metadata.
 *
 * Respects robots.txt + rate limits via util/robots.ts + util/ratelimit.ts.
 * Never crawls beyond a single listing page — no "fetch all" path.
 */
import * as cheerio from "cheerio";
import { sourcesByEngine, sourceForUrl, type Source } from "../config.js";
import { fetchWithBackoff } from "../util/robots.js";
import { withRateLimit } from "../util/ratelimit.js";
import { toBase64 } from "../util/image.js";
import { type SearchResult, type DetailResult, terms, scoreMatch } from "./types.js";
import { getCached, setCached } from "../cache/urlcache.js";

function absolutize(base: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const cached = await getCached(url);
  if (cached) return cached.toString("utf8");

  const res = await withRateLimit(host(url), "scraper", () => fetchWithBackoff(url));
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const text = await res.text();
  await setCached(url, Buffer.from(text, "utf8"));
  return text;
}

/**
 * Generic card scraper: looks for anchors that wrap (or are near) an <img>,
 * pulling the first N as candidate cards. Works reasonably across the
 * gallery-style sites in the registry without per-site selectors.
 */
function extractCards(html: string, baseUrl: string, cap: number): SearchResult[] {
  const $ = cheerio.load(html);
  const out: SearchResult[] = [];
  const seen = new Set<string>();

  $("a").each((_, el) => {
    if (out.length >= cap * 4) return; // gather extra candidates for ranking, still bounded
    const $a = $(el);
    const href = $a.attr("href");
    if (!href) return;
    const $img = $a.find("img").first();
    const img = $img.length ? $img : $a.closest("*").find("img").first();
    if (!img || !img.length) return;

    const src =
      img.attr("src") ||
      img.attr("data-src") ||
      img.attr("data-lazy-src") ||
      (img.attr("srcset") ?? "").split(",")[0]?.trim().split(" ")[0];
    if (!src) return;

    const absHref = absolutize(baseUrl, href);
    const absSrc = absolutize(baseUrl, src);
    if (!absHref || !absSrc) return;
    if (seen.has(absHref)) return;
    seen.add(absHref);

    const title =
      img.attr("alt")?.trim() ||
      $a.attr("title")?.trim() ||
      $a.text().trim().slice(0, 120) ||
      "Untitled";

    out.push({
      thumb_url: absSrc,
      source_url: absHref,
      title,
      tags: [],
      source: "",
    });
  });

  return out;
}

export function handles(url: string): boolean {
  const s = sourceForUrl(url);
  return s?.engine === "scraper";
}

export async function search(
  query: string,
  limit: number,
  sourceFilter?: string,
): Promise<SearchResult[]> {
  const pool = sourcesByEngine("scraper").filter(
    (s) => !sourceFilter || s.id === sourceFilter || s.name === sourceFilter,
  );
  if (!pool.length) return [];

  const qterms = terms(query);
  const results: SearchResult[] = [];

  // Query one gallery at a time, stopping once we have enough candidates.
  // Never fan out to all 14 unless the caller asked for that many results.
  for (const s of pool) {
    if (results.length >= limit * 3) break;
    try {
      const html = await fetchHtml(s.url);
      const cards = extractCards(html, s.url, limit);
      for (const c of cards) {
        c.source = s.id;
        c.license = "editorial";
        c.tags = s.good_for ? [s.good_for] : [];
      }
      results.push(...cards);
    } catch {
      // A single gallery failing (robots, network, structure) should not
      // sink the whole search — skip it.
      continue;
    }
  }

  const scored = results
    .map((r) => ({ r, score: qterms.length ? scoreMatch(`${r.title} ${r.source}`, qterms) : 1 }))
    .sort((a, b) => b.score - a.score);
  const anyMatch = scored.some((x) => x.score > 0);
  return (anyMatch ? scored.filter((x) => x.score > 0) : scored).slice(0, limit).map((x) => x.r);
}

export async function getDetail(url: string): Promise<DetailResult> {
  const src = sourceForUrl(url);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title = $("h1").first().text().trim() || $("title").first().text().trim() || undefined;

  // Largest-looking inline image: prefer og:image, else first sizable <img>.
  let imgUrl =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content");
  if (!imgUrl) {
    $("img").each((_, el) => {
      if (imgUrl) return;
      const $img = $(el);
      const s = $img.attr("src") || $img.attr("data-src");
      if (s && !/logo|icon|avatar/i.test(s)) imgUrl = s;
    });
  }

  let image_base64: string | undefined;
  let image_mime: string | undefined;
  if (imgUrl) {
    const abs = absolutize(url, imgUrl);
    if (abs) {
      try {
        const cachedImg = await getCached(abs);
        let buf: Buffer;
        let contentType = "image/png";
        if (cachedImg) {
          buf = cachedImg;
        } else {
          const res = await withRateLimit(host(abs), "scraper", () => fetchWithBackoff(abs));
          buf = Buffer.from(await res.arrayBuffer());
          contentType = res.headers.get("content-type") ?? contentType;
          await setCached(abs, buf);
        }
        image_base64 = toBase64(buf);
        image_mime = contentType;
      } catch {
        /* best-effort */
      }
    }
  }

  return {
    source_url: url,
    source: src?.id ?? host(url),
    title,
    image_base64,
    image_mime,
    license: "editorial",
    metadata: { good_for: src?.good_for },
    note: image_base64 ? undefined : "Could not locate a preview image on this page.",
  };
}

export const gallerySources = (): Source[] => sourcesByEngine("scraper");
