/**
 * retry.ts — exponential backoff for transient failures, per safety rule #6:
 * 2s -> 4s -> 8s, capped at config.maxRetries attempts, then the caller's
 * job fails outright. Never retries a ChallengeHaltError or a
 * FlowLimitReachedError — both are terminal states (a challenge needs a
 * human, and a quota ceiling won't clear itself moments later), so both
 * must propagate immediately and halt the whole queue instead of being
 * treated as transient.
 */
import { ChallengeHaltError } from "../browser/guards.js";
import { FlowLimitReachedError } from "../flow/quota.js";
import type { FlowConfig } from "../config.js";
import { log } from "../log.js";

const BASE_BACKOFF_MS = 2000;

function isTerminal(err: unknown): boolean {
  return err instanceof ChallengeHaltError || err instanceof FlowLimitReachedError;
}

export async function withRetry<T>(config: FlowConfig, label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isTerminal(err)) throw err;
      lastErr = err;
      if (attempt === config.maxRetries) break;
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
      log.warn({ label, attempt, backoffMs, err }, "transient failure, retrying after backoff");
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}
