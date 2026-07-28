/**
 * robots.txt respect + exponential backoff on 429/503.
 *
 * - Fetches and caches robots.txt per host (in-memory, TTL).
 * - Minimal but correct group matching: honours User-agent: * and our UA,
 *   longest-match Allow/Disallow per the de-facto standard.
 * - fetchWithBackoff wraps fetch with retry on 429/503 (respects Retry-After).
 */
import { USER_AGENT } from "../config.js";

interface RobotsRules {
  allow: string[];
  disallow: string[];
  fetchedAt: number;
}

const ROBOTS_TTL_MS = 60 * 60 * 1000; // 1h
const robotsCache = new Map<string, RobotsRules | null>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

function nowMs(): number {
  try {
    return Date.now();
  } catch {
    return Math.floor(performance.now());
  }
}

function uaToken(): string {
  // The product token portion of our UA, lowercased.
  return USER_AGENT.split("/")[0].toLowerCase();
}

/** Parse robots.txt text into rules that apply to us (UA or *). */
function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[] }> = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      if (!current) {
        current = { agents: ["*"], allow: [], disallow: [] };
        groups.push(current);
      }
      if (field === "allow") current.allow.push(value);
      else current.disallow.push(value);
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const me = uaToken();
  const applies = groups.filter(
    (g) => g.agents.includes("*") || g.agents.some((a) => me.includes(a) || a.includes(me)),
  );
  const merged: RobotsRules = { allow: [], disallow: [], fetchedAt: nowMs() };
  // Prefer specific-UA groups over "*" when both exist.
  const specific = applies.filter((g) => !g.agents.includes("*"));
  const chosen = specific.length ? specific : applies;
  for (const g of chosen) {
    merged.allow.push(...g.allow);
    merged.disallow.push(...g.disallow);
  }
  return merged;
}

async function loadRobots(origin: string): Promise<RobotsRules | null> {
  const cached = robotsCache.get(origin);
  if (cached !== undefined && cached && nowMs() - cached.fetchedAt < ROBOTS_TTL_MS) {
    return cached;
  }
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (res.status === 404 || res.status === 410) {
      // No robots.txt -> everything allowed.
      robotsCache.set(origin, null);
      return null;
    }
    if (!res.ok) {
      // On 5xx/blocked robots, be conservative but don't hard-block: treat as allowed.
      robotsCache.set(origin, null);
      return null;
    }
    const rules = parseRobots(await res.text());
    robotsCache.set(origin, rules);
    return rules;
  } catch {
    robotsCache.set(origin, null);
    return null;
  }
}

function pathMatches(rule: string, path: string): boolean {
  if (rule === "") return false;
  // Support "$" end-anchor and "*" wildcards, per common robots extensions.
  const hasEnd = rule.endsWith("$");
  const core = hasEnd ? rule.slice(0, -1) : rule;
  const parts = core.split("*");
  let pos = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === "") continue;
    const found = path.indexOf(p, pos);
    if (i === 0) {
      if (!path.startsWith(p)) return false;
      pos = p.length;
    } else {
      if (found === -1) return false;
      pos = found + p.length;
    }
  }
  if (hasEnd) return pos === path.length || core.endsWith(path);
  return true;
}

/** True if we are allowed to fetch `url` given robots.txt. */
export async function isAllowed(url: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const rules = await loadRobots(u.origin);
  if (!rules) return true;
  const path = u.pathname + u.search;

  let bestAllow = -1;
  let bestDisallow = -1;
  for (const a of rules.allow) if (pathMatches(a, path)) bestAllow = Math.max(bestAllow, a.length);
  for (const d of rules.disallow) if (pathMatches(d, path)) bestDisallow = Math.max(bestDisallow, d.length);

  if (bestDisallow === -1) return true;
  // Longest match wins; ties go to allow.
  return bestAllow >= bestDisallow;
}

export interface FetchOpts {
  headers?: Record<string, string>;
  maxRetries?: number;
  timeoutMs?: number;
  /** Skip the robots check (only for endpoints we own, e.g. official APIs). */
  ignoreRobots?: boolean;
}

/**
 * fetch() wrapper with:
 *  - robots.txt enforcement (unless ignoreRobots),
 *  - realistic User-Agent,
 *  - exponential backoff on 429 / 503 (honours Retry-After),
 *  - request timeout.
 */
export async function fetchWithBackoff(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { maxRetries = 4, timeoutMs = 20_000, ignoreRobots = false } = opts;

  if (!ignoreRobots) {
    const allowed = await isAllowed(url);
    if (!allowed) {
      throw new Error(`Blocked by robots.txt: ${url}`);
    }
  }

  let attempt = 0;
  // Base backoff 1s, doubling, capped at ~16s.
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...(opts.headers ?? {}) },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(16_000, 1000 * 2 ** attempt);
        attempt++;
        await sleep(backoff);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < maxRetries) {
        const backoff = Math.min(16_000, 1000 * 2 ** attempt);
        attempt++;
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}
