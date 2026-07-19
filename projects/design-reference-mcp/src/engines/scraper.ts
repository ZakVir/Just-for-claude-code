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
/**
 * Path depth (non-empty segments, ignoring query/hash) of an href. Gallery
 * sites near-universally put top nav/category links one segment deep
 * ("/sections", "/motion") and actual item/detail pages two or more
 * ("/websites/93513-hyperice-..."). Traversal cost is free here — the page
 * is already fetched and in memory — so we scan every anchor rather than
 * bailing out early, which previously stopped at whatever nav icons happen
 * to appear first in document order and never reached real content.
 */
function pathDepth(href: string, baseUrl: string): number {
  try {
    const u = new URL(href, baseUrl);
    return u.pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function extractCards(html: string, baseUrl: string): SearchResult[] {
  const $ = cheerio.load(html);
  const candidates: Array<SearchResult & { depth: number }> = [];
  const seen = new Set<string>();
  const baseHost = new URL(baseUrl).hostname;

  $("a").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    if (!href) return;
    const $img = $a.find("img").first();
    if (!$img.length) return;

    const src =
      $img.attr("src") ||
      $img.attr("data-src") ||
      $img.attr("data-lazy-src") ||
      ($img.attr("srcset") ?? "").split(",")[0]?.trim().split(" ")[0];
    if (!src) return;

    const absHref = absolutize(baseUrl, href);
    const absSrc = absolutize(baseUrl, src);
    if (!absHref || !absSrc) return;

    // Cross-domain links from a gallery's own listing page are almost always
    // sponsor/affiliate slots, not curated content — skip them. This also
    // means a JS-rendered gallery whose static HTML is mostly ads correctly
    // yields nothing here instead of surfacing those ads as design references.
    let hrefHost: string;
    try {
      hrefHost = new URL(absHref).hostname;
    } catch {
      return;
    }
    if (hrefHost !== baseHost) return;
    // Site chrome (logo/icon/favicon/avatar), not a design reference.
    if (/logo|favicon|\bicon\b|avatar/i.test(src) || /logo|favicon|\bicon\b|avatar/i.test(href)) return;

    if (seen.has(absHref)) return;
    seen.add(absHref);

    const title =
      $img.attr("alt")?.trim() ||
      $a.attr("title")?.trim() ||
      $a.text().trim().slice(0, 120) ||
      "Untitled";

    candidates.push({
      thumb_url: absSrc,
      source_url: absHref,
      title,
      tags: [],
      source: "",
      depth: pathDepth(href, baseUrl),
    });
  });

  // Prefer deep (item/detail-page) links over shallow nav/category links;
  // fall back to shallow links only if nothing deeper was found at all.
  const deep = candidates.filter((c) => c.depth >= 2);
  const pool = deep.length ? deep : candidates;
  return pool.slice(0, 60).map(({ depth, ...rest }) => rest);
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
  let pool = sourcesByEngine("scraper").filter(
    (s) => !sourceFilter || s.id === sourceFilter || s.name === sourceFilter,
  );
  if (!pool.length) return [];

  const qterms = terms(query);

  // Pattern queries ("pricing table", "login form") almost never appear
  // literally in a screenshot's alt text — the real signal is which gallery
  // specializes in that pattern (e.g. Collect UI's good_for mentions
  // "pricing"). Query those galleries first so a small `limit` doesn't run
  // out before reaching the source that actually matches.
  const sourceScore = new Map(
    pool.map((s) => [s.id, qterms.length ? scoreMatch(s.good_for ?? "", qterms) : 0]),
  );
  pool = [...pool].sort((a, b) => (sourceScore.get(b.id) ?? 0) - (sourceScore.get(a.id) ?? 0));

  const results: SearchResult[] = [];

  // Query one gallery at a time, stopping once we have enough candidates.
  // Never fan out to all 14 unless the caller asked for that many results.
  for (const s of pool) {
    if (results.length >= limit * 3) break;
    try {
      const html = await fetchHtml(s.url);
      const cards = extractCards(html, s.url);
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
    .map((r) => {
      if (!qterms.length) return { r, score: 1 };
      // A card scores on its own title/source match, plus a boost carried
      // over from its gallery's good_for match — so cards from a gallery
      // that specializes in the requested pattern surface even when the
      // individual screenshot's alt text says nothing about it.
      const titleScore = scoreMatch(`${r.title} ${r.source}`, qterms);
      const gallerySourceScore = sourceScore.get(r.source) ?? 0;
      return { r, score: titleScore + gallerySourceScore };
    })
    .sort((a, b) => b.score - a.score);
  // An explicit sourceFilter means the caller already chose this gallery —
  // return its cards regardless of query score. Otherwise, a degenerate
  // query (no usable terms) browses the fetched cards; a real query that
  // matches nothing (no title AND no gallery specialization) returns empty
  // rather than padding with irrelevant cards.
  const chosen = sourceFilter || qterms.length === 0 ? scored : scored.filter((x) => x.score > 0);
  return chosen.slice(0, limit).map((x) => x.r);
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
