/**
 * queue.ts — strictly serial job queue.
 *
 * Safety rule #6: exactly one job runs at a time, ever — jobs are chained
 * onto a single promise tail, never run concurrently. Each job gets
 * util/retry.ts's exponential backoff for transient failures.
 * Safety rule #3 and quota.ts's limit-reached state: a ChallengeHaltError
 * or FlowLimitReachedError from any job permanently halts the queue —
 * every subsequent job (already queued or not) is rejected immediately
 * without touching the browser, which is what "drain and stop" means here.
 * Safety rule #7: a `./STOP` file is checked before every job starts.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ChallengeHaltError } from "./browser/guards.js";
import { FlowLimitReachedError } from "./flow/quota.js";
import { withRetry } from "./util/retry.js";
import type { FlowConfig } from "./config.js";
import { log } from "./log.js";

export class HaltedQueueError extends Error {
  constructor(public reason: string) {
    super(`Job queue is halted: ${reason}`);
    this.name = "HaltedQueueError";
  }
}

function stopFilePresent(): boolean {
  return existsSync(resolve(process.cwd(), "STOP"));
}

export class JobQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private halted: string | null = null;

  get isHalted(): boolean {
    return this.halted !== null;
  }

  get haltedReason(): string | null {
    return this.halted;
  }

  /** Run `fn` strictly after every previously enqueued job, one at a time, with retry-on-transient-failure. */
  run<T>(config: FlowConfig, label: string, fn: () => Promise<T>): Promise<T> {
    if (this.halted) return Promise.reject(new HaltedQueueError(this.halted));

    const scheduled = this.tail.then(() => this.execute(config, label, fn));
    this.tail = scheduled.catch(() => undefined);
    return scheduled;
  }

  private async execute<T>(config: FlowConfig, label: string, fn: () => Promise<T>): Promise<T> {
    if (this.halted) throw new HaltedQueueError(this.halted);

    if (stopFilePresent()) {
      this.halted = "STOP file present";
      log.warn({ label }, "STOP file detected — halting the queue before this job");
      throw new HaltedQueueError(this.halted);
    }

    try {
      return await withRetry(config, label, fn);
    } catch (err) {
      if (err instanceof ChallengeHaltError) {
        this.halted = `HALTED_CHALLENGE: ${err.reason}`;
        log.error({ label, reason: err.reason }, "queue halted by a detected challenge — no further jobs will run");
      } else if (err instanceof FlowLimitReachedError) {
        this.halted = `LIMIT_REACHED at ${err.detectedAt}`;
        log.error({ label, detectedAt: err.detectedAt }, "queue halted — Flow's own daily limit was reached");
      }
      throw err;
    }
  }

  /** Test-only: clear halted state and any queued continuation. */
  __resetForTests(): void {
    this.halted = null;
    this.tail = Promise.resolve();
  }
}

export const globalQueue = new JobQueue();
