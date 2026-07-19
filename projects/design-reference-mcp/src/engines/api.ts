/**
 * api engine — Behance + Google Fonts official APIs.
 *
 * Behance: GET https://api.behance.net/v2/projects?q={query}&api_key={KEY}
 *   Detail: GET /v2/projects/{id} -> modules[].src
 *   Rate cap is 150/hr/IP; util/ratelimit.ts's "api" policy stays at 120/hr.
 * Google Fonts: GET https://www.googleapis.com/webfonts/v1/webfonts?key={KEY}
 *   Used to hydrate font-pairing results discovered by the scraper engine
 *   (Fontpair) with real family/weight/license data.
 *
 * When a key is missing we do not fail hard — we return a clear
 * "not available" note per guardrail #5's spirit (no auth engine bypass,
 * no silent crash), so the caller can decide what to show Maya.
 */
import { KEYS, hasKey } from "../config.js";
import { fetchWithBackoff } from "../util/robots.js";
import { withRateLimit } from "../util/ratelimit.js";
import { toBase64 } from "../util/image.js";
import { type SearchResult, type DetailResult } from "./types.js";
import { getCached, setCached } from "../cache/urlcache.js";

const BEHANCE_HOST = "api.behance.net";
const FONTS_HOST = "www.googleapis.com";

interface BehanceProject {
  id: number;
  name: string;
  url: string;
  covers?: Record<string, string>;
  fields?: string[];
  owners?: Array<{ display_name: string }>;
}

interface BehanceSearchResponse {
  projects?: BehanceProject[];
}

function behanceThumb(p: BehanceProject): string {
  const covers = p.covers ?? {};
  return covers["404"] || covers["max_808"] || covers["232"] || Object.values(covers)[0] || "";
}

export async function searchBehance(query: string, limit: number): Promise<SearchResult[]> {
  if (!hasKey("BEHANCE_API_KEY")) {
    return [
      {
        thumb_url: "",
        source_url: "https://www.behance.net/dev",
        title: "Behance API key not configured",
        tags: ["not-available"],
        source: "behance",
        license: "n/a",
      },
    ];
  }

  const url = `https://api.behance.net/v2/projects?q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(KEYS.behance)}`;
  const res = await withRateLimit(BEHANCE_HOST, "api", () => fetchWithBackoff(url, { ignoreRobots: true }));
  if (!res.ok) {
    throw new Error(`Behance search failed: ${res.status}`);
  }
  const json = (await res.json()) as BehanceSearchResponse;
  const projects = (json.projects ?? []).slice(0, limit);

  return projects.map((p) => ({
    thumb_url: behanceThumb(p),
    source_url: p.url,
    title: p.name,
    tags: p.fields ?? [],
    source: "behance",
    license: "editorial",
  }));
}

export async function getBehanceDetail(url: string): Promise<DetailResult> {
  if (!hasKey("BEHANCE_API_KEY")) {
    return {
      source_url: url,
      source: "behance",
      note: "Not available free — try Dribbble single pages or Awwwards.",
      license: "n/a",
    };
  }

  const idMatch = url.match(/\/gallery\/(\d+)\//) ?? url.match(/behance\.net\/(?:.*\/)?(\d+)/);
  const id = idMatch?.[1];
  if (!id) {
    return { source_url: url, source: "behance", note: "Could not parse Behance project id from URL." };
  }

  const apiUrl = `https://api.behance.net/v2/projects/${id}?api_key=${encodeURIComponent(KEYS.behance)}`;
  const res = await withRateLimit(BEHANCE_HOST, "api", () => fetchWithBackoff(apiUrl, { ignoreRobots: true }));
  if (!res.ok) throw new Error(`Behance detail failed: ${res.status}`);
  const json = (await res.json()) as {
    project?: { name?: string; modules?: Array<{ type: string; src?: string }> };
  };
  const modules = json.project?.modules ?? [];
  const firstImage = modules.find((m) => m.type === "image" && m.src)?.src;

  let image_base64: string | undefined;
  let image_mime: string | undefined;
  if (firstImage) {
    try {
      const cached = await getCached(firstImage);
      if (cached) {
        image_base64 = toBase64(cached);
        image_mime = "image/jpeg";
      } else {
        const imgRes = await fetchWithBackoff(firstImage, { ignoreRobots: true });
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          image_mime = imgRes.headers.get("content-type") ?? "image/jpeg";
          image_base64 = toBase64(buf);
          await setCached(firstImage, buf, image_mime);
        }
      }
    } catch {
      /* best-effort */
    }
  }

  return {
    source_url: url,
    source: "behance",
    title: json.project?.name,
    image_base64,
    image_mime,
    license: "editorial",
    metadata: { module_count: modules.length },
  };
}

export interface FontFamily {
  family: string;
  category?: string;
  variants?: string[];
  license?: string;
}

/** Hydrate a font family name against the Google Fonts catalog. */
export async function lookupFont(familyName: string): Promise<FontFamily | null> {
  if (!hasKey("GOOGLE_FONTS_KEY")) return null;
  const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(KEYS.googleFonts)}`;
  const res = await withRateLimit(FONTS_HOST, "api", () => fetchWithBackoff(url, { ignoreRobots: true }));
  if (!res.ok) return null;
  const json = (await res.json()) as { items?: Array<{ family: string; category?: string; variants?: string[] }> };
  const match = json.items?.find((f) => f.family.toLowerCase() === familyName.toLowerCase());
  if (!match) return null;
  return { family: match.family, category: match.category, variants: match.variants, license: "OFL/Apache (per family)" };
}

export function googleFontsAvailable(): boolean {
  return hasKey("GOOGLE_FONTS_KEY");
}

export function behanceAvailable(): boolean {
  return hasKey("BEHANCE_API_KEY");
}
