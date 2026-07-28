/**
 * job.ts — runs one generation request start to finish: budget check,
 * generate, wait for results (or Flow's own limit notice, or a challenge),
 * download, record usage, append a jobs.jsonl record. This is the unit
 * queue.ts (M5) will serialize; it does not itself serialize anything.
 *
 * Safety rule #6: checkBudget() runs before any UI interaction — a job that
 * would exceed the daily budget never touches the page at all.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "playwright";
import type { FlowConfig } from "../config.js";
import { generateImage, type GenerateParams } from "./generate.js";
import { downloadResults, type DownloadedAsset } from "./download.js";
import { checkBudget, recordUsage, checkFlowLimitNotice, FlowLimitReachedError } from "./quota.js";
import { resolveAllElements } from "../browser/resolve.js";
import { guard, ChallengeHaltError } from "../browser/guards.js";
import { appendJobRecord, type JobOutcome } from "../util/joblog.js";
import { log } from "../log.js";

export interface JobResult {
  id: string;
  assets: DownloadedAsset[];
}

async function waitForResults(page: Page, config: FlowConfig, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await guard(page, config, "wait-for-results");
    await checkFlowLimitNotice(page);
    try {
      await resolveAllElements(page, "resultTile");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`Timed out waiting for generation results after ${timeoutMs}ms`);
}

/**
 * Run one real (non-dry-run) generation request end to end. `cost` is the
 * number of budget units this job consumes — 1 for a single generation
 * request, regardless of how many output images it produces (that's the
 * quota-efficiency point of flow_generate_variations, M6).
 */
export async function runGenerateJob(
  page: Page,
  config: FlowConfig,
  params: GenerateParams,
  opts: { tool?: string; cost?: number } = {},
): Promise<JobResult> {
  const id = randomUUID();
  const tool = opts.tool ?? "flow_generate_image";
  const cost = opts.cost ?? 1;
  const startedAt = Date.now();

  function record(outcome: JobOutcome, outputPaths: string[], error?: string) {
    appendJobRecord(config, {
      id,
      timestamp: new Date(startedAt).toISOString(),
      tool,
      prompt: params.prompt,
      model: params.model,
      aspect: params.aspect,
      outcome,
      durationMs: Date.now() - startedAt,
      outputPaths,
      error,
    });
  }

  try {
    checkBudget(config, cost);
  } catch (err) {
    record("BUDGET_EXCEEDED", [], (err as Error).message);
    throw err;
  }

  try {
    await generateImage(page, config, { ...params, dryRun: false });
    await waitForResults(page, config);
    const assets = await downloadResults(page, config, id);
    recordUsage(config, cost);
    record("success", assets.map((a) => a.path));
    return { id, assets };
  } catch (err) {
    const outcome: JobOutcome =
      err instanceof ChallengeHaltError ? "HALTED_CHALLENGE" : err instanceof FlowLimitReachedError ? "LIMIT_REACHED" : "failed";
    log.error({ id, outcome, err }, "generation job failed");
    record(outcome, [], (err as Error).message);
    throw err;
  }
}
