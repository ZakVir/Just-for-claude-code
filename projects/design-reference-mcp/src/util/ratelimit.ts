/**
 * ratelimit.ts — per-source (per-host) token-bucket limiter.
 *
 * Guards three things at once for every host:
 *   1. an hourly budget (token bucket refilled continuously),
 *   2. a minimum delay between consecutive requests,
 *   3. a concurrency cap (max simultaneous in-flight requests).
 *
 * Screenshots use concurrency 1 -> fully serialized. Scrapers use a 2-5s
 * min delay + concurrency 1. Behance stays under 120/hr.
 */
import { RATE_POLICIES, type Engine, type RatePolicy } from "../config.js";

interface Bucket {
  tokens: number;
  capacity: number;
  refillPerMs: number;
  lastRefill: number;
  lastStart: number;
  active: number;
  queue: Array<() => void>;
  policy: RatePolicy;
}

const buckets = new Map<string, Bucket>();

function keyFor(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

function makeBucket(policy: RatePolicy): Bucket {
  const capacity = Math.max(1, policy.perHour);
  return {
    tokens: capacity,
    capacity,
    refillPerMs: policy.perHour / (60 * 60 * 1000),
    lastRefill: nowMs(),
    lastStart: 0,
    active: 0,
    queue: [],
    policy,
  };
}

/**
 * Monotonic-ish clock. Date.now() is unavailable in some sandboxes; fall back
 * to a high-resolution timer origin so the limiter still advances.
 */
function nowMs(): number {
  try {
    return Date.now();
  } catch {
    return Math.floor(performance.now());
  }
}

function refill(b: Bucket): void {
  const now = nowMs();
  const elapsed = now - b.lastRefill;
  if (elapsed <= 0) return;
  b.tokens = Math.min(b.capacity, b.tokens + elapsed * b.refillPerMs);
  b.lastRefill = now;
}

function getBucket(host: string, engine: Engine): Bucket {
  const k = keyFor(host);
  let b = buckets.get(k);
  if (!b) {
    b = makeBucket(RATE_POLICIES[engine]);
    buckets.set(k, b);
  }
  return b;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Acquire a slot for `host` under `engine`'s policy, run `fn`, and release.
 * Blocks (via async waiting) until hourly budget, min-delay, and concurrency
 * all permit the call. Never throws for limiting; only `fn`'s own errors bubble.
 */
export async function withRateLimit<T>(
  host: string,
  engine: Engine,
  fn: () => Promise<T>,
): Promise<T> {
  const b = getBucket(host, engine);

  // Wait for a concurrency slot.
  if (b.active >= b.policy.concurrency) {
    await new Promise<void>((resolve) => b.queue.push(resolve));
  }
  b.active++;

  try {
    // Enforce hourly token budget.
    // Loop because tokens refill over time.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      refill(b);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        break;
      }
      const needed = (1 - b.tokens) / b.refillPerMs;
      await sleep(Math.min(needed, 60_000));
    }

    // Enforce min delay between consecutive starts on this host.
    const since = nowMs() - b.lastStart;
    if (b.lastStart > 0 && since < b.policy.minDelayMs) {
      await sleep(b.policy.minDelayMs - since);
    }
    b.lastStart = nowMs();

    return await fn();
  } finally {
    b.active--;
    const next = b.queue.shift();
    if (next) next();
  }
}

/** Introspection for list_sources / diagnostics. */
export function limiterSnapshot(): Record<string, { tokens: number; active: number; queued: number }> {
  const out: Record<string, { tokens: number; active: number; queued: number }> = {};
  for (const [k, b] of buckets) {
    refill(b);
    out[k] = { tokens: Math.floor(b.tokens), active: b.active, queued: b.queue.length };
  }
  return out;
}

/** Test hook: reset all buckets. */
export function __resetLimiter(): void {
  buckets.clear();
}
