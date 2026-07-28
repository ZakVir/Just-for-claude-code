/**
 * api engine — Google Fonts official API.
 *
 * GET https://www.googleapis.com/webfonts/v1/webfonts?key={KEY}
 *   Used to hydrate font-pairing results discovered by the scraper engine
 *   (Fontpair) with real family/weight/license data.
 *
 * Behance is intentionally not here. Adobe deprecated the public Behance
 * API in 2018 (app registration is gone, not just rate-limited) and
 * behance.net/robots.txt separately, explicitly disallows anthropic-ai,
 * Claude-Web, and ClaudeBot sitewide. Behance is registered as a `gated`
 * source instead (see registry.json) — see README.md's "A note on Behance"
 * for the full reasoning.
 *
 * When a key is missing we do not fail hard — we return null/false so the
 * caller can decide what to show Maya, per guardrail #5's spirit (no auth
 * engine bypass, no silent crash).
 */
import { KEYS, hasKey } from "../config.js";
import { fetchWithBackoff } from "../util/robots.js";
import { withRateLimit } from "../util/ratelimit.js";

const FONTS_HOST = "www.googleapis.com";

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
