/**
 * variations.ts — Agent-mode multi-variation generation: one composed
 * instruction produces N variants along a stated axis, in a single
 * generation request. This is the quota-efficient path (see quota.ts and
 * job.ts's runVariationsJob): the local ledger charges 1 unit for the whole
 * batch, never N, because Flow's own daily cap is per-request, not
 * per-output-image.
 *
 * Safety rule #7: dryRun defaults to true and provably never clicks
 * Generate, same as generate.ts.
 */
import type { Page } from "playwright";
import type { FlowConfig } from "../config.js";
import { resolveElement } from "../browser/resolve.js";
import { guard } from "../browser/guards.js";
import { randomDelay } from "../util/delay.js";
import { captureScreenshot } from "../util/screenshot.js";
import { attachReferenceImages } from "./generate.js";
import { log } from "../log.js";

export interface VariationsParams {
  basePrompt: string;
  variationAxis: string;
  /** How many variants to request in the single Agent-mode instruction. */
  count: number;
  referenceImages?: string[];
  dryRun?: boolean;
}

export interface VariationsResult {
  dryRun: boolean;
  clickedGenerate: boolean;
  composedInstruction: string;
  screenshotPath: string;
}

/**
 * Build one Agent-mode instruction asking for `count` variants of
 * `basePrompt` that each differ along `variationAxis` — mirrors Google's own
 * documented Agent-mode example ("20 variations of an image with different
 * lighting") rather than looping N single-image requests.
 */
export function composeAgentInstruction(basePrompt: string, variationAxis: string, count: number): string {
  return `Generate ${count} variations of this image, each with a different ${variationAxis}: ${basePrompt}`;
}

async function ensureAgentModeOn(page: Page, config: FlowConfig): Promise<void> {
  await guard(page, config, "agent-toggle:before");
  const toggle = (await resolveElement(page, "agentToggle")).locator;
  const checked = await toggle.getAttribute("aria-checked");
  if (checked !== "true") {
    await toggle.click();
    await randomDelay(config);
  }
  await guard(page, config, "agent-toggle:after");
}

/** Compose the Agent instruction, fill it in with Agent mode on, and either stop (dryRun) or click Generate once. */
export async function generateVariations(page: Page, config: FlowConfig, params: VariationsParams): Promise<VariationsResult> {
  const dryRun = params.dryRun ?? true;
  const composedInstruction = composeAgentInstruction(params.basePrompt, params.variationAxis, params.count);

  await guard(page, config, "variations:start");
  await ensureAgentModeOn(page, config);

  const promptInput = (await resolveElement(page, "promptInput")).locator;
  await promptInput.click();
  await randomDelay(config);
  await promptInput.fill(composedInstruction);
  await randomDelay(config);
  await guard(page, config, "variations:after-prompt");

  if (params.referenceImages?.length) {
    await attachReferenceImages(page, config, params.referenceImages);
  }

  await guard(page, config, "variations:before-click");
  const screenshotPath = await captureScreenshot(page, config, dryRun ? "variations-dry-run" : "variations-pre-generate");

  if (dryRun) {
    log.info({ screenshotPath, composedInstruction }, "dryRun: stopping before Generate — button was never clicked");
    return { dryRun: true, clickedGenerate: false, composedInstruction, screenshotPath };
  }

  const generateButton = (await resolveElement(page, "generateButton")).locator;
  await generateButton.click();
  await randomDelay(config);
  await guard(page, config, "variations:after-click");

  return { dryRun: false, clickedGenerate: true, composedInstruction, screenshotPath };
}
