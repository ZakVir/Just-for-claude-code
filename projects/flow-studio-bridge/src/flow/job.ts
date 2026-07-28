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
import { generateVariations, type VariationsParams } from "./variations.js";
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

interface JobMeta {
  tool: string;
  cost: number;
  prompt: string;
  model?: string;
  aspect?: string;
}

/**
 * Shared core: budget check, run the caller's fill-and-click action, wait
 * for results (or a terminal state), download, record usage, log the
 * outcome. `cost` is charged once regardless of how many output images the
 * action produces — that's what makes flow_generate_variations
 * quota-efficient.
 */
async function runJobCore(page: Page, config: FlowConfig, meta: JobMeta, act: () => Promise<unknown>): Promise<JobResult> {
  const id = randomUUID();
  const startedAt = Date.now();

  function record(outcome: JobOutcome, outputPaths: string[], error?: string) {
    appendJobRecord(config, {
      id,
      timestamp: new Date(startedAt).toISOString(),
      tool: meta.tool,
      prompt: meta.prompt,
      model: meta.model,
      aspect: meta.aspect,
      outcome,
      durationMs: Date.now() - startedAt,
      outputPaths,
      error,
    });
  }

  try {
    checkBudget(config, meta.cost);
  } catch (err) {
    record("BUDGET_EXCEEDED", [], (err as Error).message);
    throw err;
  }

  try {
    await act();
    await waitForResults(page, config);
    const assets = await downloadResults(page, config, id);
    recordUsage(config, meta.cost);
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

/** Run one real (non-dry-run) single-image generation request end to end. Costs 1 budget unit. */
export async function runGenerateJob(page: Page, config: FlowConfig, params: GenerateParams): Promise<JobResult> {
  return runJobCore(
    page,
    config,
    { tool: "flow_generate_image", cost: 1, prompt: params.prompt, model: params.model, aspect: params.aspect },
    () => generateImage(page, config, { ...params, dryRun: false }),
  );
}

/**
 * Run one real Agent-mode variations request end to end. Still costs
 * exactly 1 budget unit no matter how many variants params.count asked
 * for — Flow's daily cap is per generation request, not per output image,
 * so this is strictly better quota-per-output than looping
 * runGenerateJob N times.
 */
export async function runVariationsJob(page: Page, config: FlowConfig, params: VariationsParams): Promise<JobResult> {
  return runJobCore(
    page,
    config,
    { tool: "flow_generate_variations", cost: 1, prompt: params.basePrompt },
    () => generateVariations(page, config, { ...params, dryRun: false }),
  );
}
