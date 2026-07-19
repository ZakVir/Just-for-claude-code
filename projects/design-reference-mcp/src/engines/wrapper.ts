/**
 * wrapper engine — Cosmos via parse.bot.
 *
 * POST https://api.parse.bot/scraper/{id}/search_elements
 *   body: { query, color, content_type }
 *
 * Third-party wrapper around Cosmos; treated as optional per the spec — if
 * it 4xxs/5xxs or the key is missing, we degrade gracefully rather than
 * treating it as a hard failure of design_search as a whole.
 */
import { KEYS, hasKey } from "../config.js";
import { fetchWithBackoff } from "../util/robots.js";
import { withRateLimit } from "../util/ratelimit.js";
import { type SearchResult, type DetailResult } from "./types.js";

const PARSE_BOT_HOST = "api.parse.bot";

interface CosmosElement {
  url?: string;
  image_url?: string;
  thumbnail_url?: string;
  title?: string;
  tags?: string[];
}

export function available(): boolean {
  return hasKey("PARSE_BOT_KEY");
}

export async function search(query: string, limit: number, color?: string): Promise<SearchResult[]> {
  if (!available()) {
    return [
      {
        thumb_url: "",
        source_url: "https://parse.bot",
        title: "Cosmos wrapper key not configured",
        tags: ["not-available"],
        source: "cosmos",
        license: "n/a",
      },
    ];
  }

  const url = `https://api.parse.bot/scraper/${encodeURIComponent(KEYS.parseBotCosmosId)}/search_elements`;
  try {
    const res = await withRateLimit(PARSE_BOT_HOST, "wrapper", async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        return await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${KEYS.parseBot}`,
          },
          body: JSON.stringify({ query, color, content_type: "design" }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    });

    if (!res.ok) {
      return [
        {
          thumb_url: "",
          source_url: "https://www.cosmos.so",
          title: `Cosmos wrapper unavailable (HTTP ${res.status})`,
          tags: ["not-available"],
          source: "cosmos",
          license: "n/a",
        },
      ];
    }

    const json = (await res.json()) as { elements?: CosmosElement[] };
    const elements = (json.elements ?? []).slice(0, limit);
    return elements.map((e) => ({
      thumb_url: e.thumbnail_url ?? e.image_url ?? "",
      source_url: e.url ?? "https://www.cosmos.so",
      title: e.title ?? "Untitled",
      tags: e.tags ?? [],
      source: "cosmos",
      license: "editorial",
    }));
  } catch (err) {
    return [
      {
        thumb_url: "",
        source_url: "https://www.cosmos.so",
        title: `Cosmos wrapper error: ${(err as Error).message}`,
        tags: ["not-available"],
        source: "cosmos",
        license: "n/a",
      },
    ];
  }
}

export async function getDetail(url: string): Promise<DetailResult> {
  return {
    source_url: url,
    source: "cosmos",
    note: "Cosmos is a search wrapper, not a page host — use design_get_detail on the underlying source_url from a search result instead.",
    license: "editorial",
  };
}
