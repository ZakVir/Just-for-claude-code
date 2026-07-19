/**
 * config.ts — keys, rate limits, and registry loading.
 *
 * All secrets come from env (see .env.example). Nothing is hard-coded.
 * The registry is the single source of truth for what each source is and
 * which engine handles it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname is dist/ when compiled or src/ under tsx — either way its parent
// is the project root, so the cache lives in one stable place regardless of
// how the server is run, and is never inside the gitignored dist/ output.
const PROJECT_ROOT = join(__dirname, "..");

export type Engine = "api" | "repo" | "scraper" | "screenshot" | "wrapper" | "gated";

export interface Source {
  id: string;
  name: string;
  engine: Engine;
  url: string;
  good_for?: string;
  endpoint?: string;
  detail_endpoint?: string;
  register?: string;
  rate_cap_per_hr?: number;
  requires_key?: string;
  license?: string;
  category?: string;
  optional?: boolean;
  note?: string;
  gated?: boolean;
  alternative?: string;
  single_page_only?: boolean;
  parse_hex_from_url?: boolean;
}

interface Registry {
  version: number;
  note: string;
  sources: Source[];
}

const registry: Registry = JSON.parse(
  readFileSync(join(__dirname, "sources", "registry.json"), "utf8"),
);

export const SOURCES: Source[] = registry.sources;

export function getSource(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}

export function sourcesByEngine(engine: Engine): Source[] {
  return SOURCES.filter((s) => s.engine === engine);
}

/**
 * Match a URL to its registered source. Hostname alone is not enough — many
 * sources (all 30 GitHub repos, github.com/{owner}/{repo}) share a hostname,
 * so we rank candidates by longest matching path prefix and only fall back
 * to a bare hostname match for single-tenant domains (registry url has no
 * path, e.g. a gallery's root domain).
 */
export function sourceForUrl(url: string): Source | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");

  let best: Source | undefined;
  let bestLen = -1;
  for (const s of SOURCES) {
    let su: URL;
    try {
      su = new URL(s.url);
    } catch {
      continue;
    }
    if (su.hostname.replace(/^www\./, "") !== host) continue;
    const sPath = su.pathname.replace(/\/+$/, "");
    const matches = sPath === "" || path === sPath || path.startsWith(`${sPath}/`);
    if (!matches) continue;
    if (sPath.length > bestLen) {
      best = s;
      bestLen = sPath.length;
    }
  }
  return best;
}

/** API keys — read once, referenced everywhere. */
export const KEYS = {
  behance: process.env.BEHANCE_API_KEY?.trim() || "",
  googleFonts: process.env.GOOGLE_FONTS_KEY?.trim() || "",
  parseBot: process.env.PARSE_BOT_KEY?.trim() || "",
  parseBotCosmosId: process.env.PARSE_BOT_COSMOS_ID?.trim() || "cosmos",
} as const;

export function hasKey(name?: string): boolean {
  if (!name) return true;
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Per-source rate-limit policy. Token-bucket parameters live here so the
 * limiter is entirely config-driven.
 *
 * - Behance: <= 120 req/hr (cap is 150/hr/IP — stay under).
 * - Scrapers: 2-5s min delay, concurrency 1-2 per host.
 * - Screenshots: serialized, one at a time.
 */
export interface RatePolicy {
  /** Sustained requests allowed per hour. */
  perHour: number;
  /** Minimum milliseconds between two requests to the same host. */
  minDelayMs: number;
  /** Max simultaneous in-flight requests per host. */
  concurrency: number;
}

export const RATE_POLICIES: Record<Engine, RatePolicy> = {
  api: { perHour: 120, minDelayMs: 500, concurrency: 2 },
  repo: { perHour: 600, minDelayMs: 250, concurrency: 3 },
  scraper: { perHour: 300, minDelayMs: 3000, concurrency: 1 },
  screenshot: { perHour: 120, minDelayMs: 4000, concurrency: 1 },
  wrapper: { perHour: 120, minDelayMs: 1000, concurrency: 1 },
  gated: { perHour: 0, minDelayMs: 0, concurrency: 0 },
};

/** Behance-specific override to respect its documented cap explicitly. */
export const BEHANCE_MAX_PER_HOUR = 120;

/** Realistic User-Agent used for all outbound scraping/screenshotting. */
export const USER_AGENT =
  "design-reference-mcp/0.1 (+https://github.com/; local research agent; respects robots.txt)";

/** Filesystem paths for the two caches — always under src/cache, never dist/. */
export const PATHS = {
  urlCache: join(PROJECT_ROOT, "src", "cache", "urlcache"),
  keepers: join(PROJECT_ROOT, "src", "cache", "keepers"),
} as const;

/** Per-request hard caps. No "fetch all" path anywhere. */
export const SEARCH_LIMIT_DEFAULT = 5;
export const SEARCH_LIMIT_MAX = 20;

export function clampLimit(limit?: number): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) return SEARCH_LIMIT_DEFAULT;
  return Math.max(1, Math.min(SEARCH_LIMIT_MAX, Math.floor(limit)));
}
