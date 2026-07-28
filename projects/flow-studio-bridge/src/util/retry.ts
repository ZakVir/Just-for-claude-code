/**
 * retry.ts — exponential backoff for transient failures, per safety rule #6:
 * 2s -> 4s -> 8s, capped at config.maxRetries attempts, then the caller's
 * job fails outright. Never retries a ChallengeHaltError — that must
 * propagate immediately and stop the whole queue, not be treated as
 * transient.
 */
import { ChallengeHaltError } from "../browser/guards.js";
import type { FlowConfig } from "../config.js";
import { log } from "../log.js";

const BASE_BACKOFF_MS = 2000;

export async function withRetry<T>(config: FlowConfig, label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ChallengeHaltError) throw err;
      lastErr = err;
      if (attempt === config.maxRetries) break;
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
      log.warn({ label, attempt, backoffMs, err }, "transient failure, retrying after backoff");
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}
