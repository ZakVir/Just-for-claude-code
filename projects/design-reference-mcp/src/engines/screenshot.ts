/**
 * screenshot engine — Playwright headless capture of live sites.
 *
 * Covers the 12 "value is the live site" sources (Awwwards, Godly, SiteInspire,
 * The FWA, etc.) plus single-page-only sources (Dribbble, Nicelydone) where we
 * screenshot exactly the one URL given — never crawl their feeds (anti-bot /
 * ToS reasons noted in the registry).
 *
 * Guardrail: screenshots are serialized — one browser page at a time — via
 * the "screenshot" rate policy (concurrency: 1) in util/ratelimit.ts. We also
 * reuse a single browser instance across calls instead of relaunching Chromium
 * every time.
 */
import { chromium, type Browser } from "playwright";
import { sourceForUrl, sourcesByEngine, type Source } from "../config.js";
import { withRateLimit } from "../util/ratelimit.js";
import { isAllowed } from "../util/robots.js";
import { toBase64, dominantColorsFromPng } from "../util/image.js";
import { getCached, setCached } from "../cache/urlcache.js";
import { type SearchResult, type DetailResult } from "./types.js";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Capture a full-page (viewport-clipped for very tall pages) screenshot as PNG.
 * Serialized via the "screenshot" rate policy — one page at a time, globally.
 */
export async function capture(url: string): Promise<Buffer> {
  const allowed = await isAllowed(url);
  if (!allowed) throw new Error(`Blocked by robots.txt: ${url}`);

  return withRateLimit(host(url), "screenshot", async () => {
    const cached = await getCached(url);
    if (cached) return cached;

    const browser = await getBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      const buf = await page.screenshot({ type: "png", timeout: 15_000 });
      await setCached(url, buf, "image/png");
      return buf;
    } finally {
      await page.close();
    }
  });
}

export function handles(url: string): boolean {
  const s = sourceForUrl(url);
  return s?.engine === "screenshot";
}

/**
 * search() for screenshot-engine sources returns the source's own listing
 * entry (title/url) rather than crawling — actual thumbnails are produced
 * on demand via design_get_detail, which triggers capture(). This keeps
 * search() fast and avoids launching a browser per query.
 */
export function search(
  query: string,
  limit: number,
  sourceFilter?: string | string[],
): SearchResult[] {
  const filterIds = typeof sourceFilter === "string" ? [sourceFilter] : sourceFilter;
  let pool = sourcesByEngine("screenshot");
  if (filterIds?.length) pool = pool.filter((s) => filterIds.includes(s.id) || filterIds.includes(s.name));
  const q = query.trim().toLowerCase();
  const scored = pool
    .map((s) => ({
      s,
      score: [s.name, s.good_for, s.id].join(" ").toLowerCase().includes(q) ? 1 : 0,
    }))
    .sort((a, b) => b.score - a.score);
  // An explicit sourceFilter (single source, or a category-matched set)
  // means the caller already chose these sources — return them regardless
  // of query score. A blank query browses the pool; a real query that
  // matches nothing returns empty rather than padding with unrelated
  // screenshot sources.
  const chosen = filterIds?.length || q === "" ? scored : scored.filter((x) => x.score > 0);
  return chosen.slice(0, limit).map(({ s }) => sourceToResult(s));
}

function sourceToResult(s: Source): SearchResult {
  return {
    thumb_url: s.url,
    source_url: s.url,
    title: s.name + (s.single_page_only ? " (single page only)" : ""),
    tags: s.good_for ? [s.good_for] : [],
    source: s.id,
    license: "editorial",
  };
}

export async function getDetail(url: string): Promise<DetailResult> {
  const src = sourceForUrl(url);
  const png = await capture(url);
  const palette = dominantColorsFromPng(png, 5);
  return {
    source_url: url,
    source: src?.id ?? host(url),
    title: src?.name,
    image_base64: toBase64(png),
    image_mime: "image/png",
    palette,
    license: "editorial",
    metadata: { single_page_only: src?.single_page_only ?? false, good_for: src?.good_for },
  };
}
