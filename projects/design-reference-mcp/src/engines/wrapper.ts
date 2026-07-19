/**
 * wrapper engine — SearXNG (self-hosted metasearch).
 *
 * GET {SEARXNG_URL}/search?q={query}&format=json&categories=images
 *
 * Requires a SearXNG instance with `search.formats: [json]` enabled in its
 * settings.yml — most public instances disable JSON output by default to
 * discourage scraping, so this is expected to point at a self-hosted or
 * otherwise trusted instance the operator controls. No vendor API key or
 * account is needed; SEARXNG_URL is the only required configuration.
 *
 * Treated as optional per the original wrapper-engine spec — if the
 * instance is unreachable or misconfigured, we degrade gracefully rather
 * than treating it as a hard failure of design_search as a whole.
 */
import { KEYS, hasKey } from "../config.js";
import { fetchWithBackoff } from "../util/robots.js";
import { withRateLimit } from "../util/ratelimit.js";
import { type SearchResult, type DetailResult } from "./types.js";

interface SearxngResult {
  url?: string;
  title?: string;
  content?: string;
  img_src?: string;
  thumbnail_src?: string;
  engine?: string;
  category?: string;
}

interface SearxngResponse {
  results?: SearxngResult[];
}

export function available(): boolean {
  return hasKey("SEARXNG_URL") && KEYS.searxngUrl.length > 0;
}

function host(): string {
  try {
    return new URL(KEYS.searxngUrl).hostname;
  } catch {
    return "searxng";
  }
}

export async function search(query: string, limit: number, color?: string): Promise<SearchResult[]> {
  if (!available()) {
    return [
      {
        thumb_url: "",
        source_url: "https://docs.searxng.org/",
        title: "SearXNG not configured — set SEARXNG_URL to a self-hosted instance",
        tags: ["not-available"],
        source: "searxng",
        license: "n/a",
      },
    ];
  }

  // Color hints don't map to a SearXNG query param — fold them into the
  // search text instead, same spirit as the original wrapper contract.
  const q = color ? `${query} ${color}` : query;
  const params = new URLSearchParams({ q, format: "json", categories: "images" });
  const url = `${KEYS.searxngUrl}/search?${params.toString()}`;

  try {
    const res = await withRateLimit(host(), "wrapper", () =>
      fetchWithBackoff(url, {
        ignoreRobots: true, // our own configured instance's API, not a scraped page
        headers: KEYS.searxngKey ? { Authorization: `Bearer ${KEYS.searxngKey}` } : undefined,
      }),
    );

    if (!res.ok) {
      return [
        {
          thumb_url: "",
          source_url: KEYS.searxngUrl,
          title: `SearXNG instance unavailable (HTTP ${res.status})`,
          tags: ["not-available"],
          source: "searxng",
          license: "n/a",
        },
      ];
    }

    const json = (await res.json()) as SearxngResponse;
    const results = (json.results ?? []).slice(0, limit);
    if (!results.length) return [];

    return results.map((r) => ({
      thumb_url: r.thumbnail_src || r.img_src || "",
      source_url: r.url ?? KEYS.searxngUrl,
      title: r.title ?? "Untitled",
      tags: [r.engine, r.category].filter((t): t is string => Boolean(t)),
      source: "searxng",
      license: "editorial",
    }));
  } catch (err) {
    return [
      {
        thumb_url: "",
        source_url: KEYS.searxngUrl,
        title: `SearXNG request failed: ${(err as Error).message}`,
        tags: ["not-available"],
        source: "searxng",
        license: "n/a",
      },
    ];
  }
}

export async function getDetail(url: string): Promise<DetailResult> {
  return {
    source_url: url,
    source: "searxng",
    note: "SearXNG is a search wrapper, not a page host — use design_get_detail on the underlying source_url from a search result instead.",
    license: "editorial",
  };
}
