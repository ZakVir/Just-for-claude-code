/**
 * generate.ts — single-image generation: fill the prompt, set model/aspect/
 * output count, optionally attach reference images, then either stop
 * (dryRun) or click Generate for real.
 *
 * Safety rule #7: `dryRun` defaults to true and must provably never click
 * the Generate button — it fills every field, captures a confirmation
 * screenshot, and returns before touching the button locator at all.
 * Safety rule #4: every step is a real click/fill through resolve.ts's
 * accessible-role locators — no network interception, no forged calls.
 * Safety rule #3: guard() runs before and after every interaction; a
 * detected challenge aborts this function immediately (the caller/queue is
 * responsible for stopping further jobs).
 */
import type { Page } from "playwright";
import type { FlowConfig } from "../config.js";
import { resolveElement } from "../browser/resolve.js";
import { guard } from "../browser/guards.js";
import { randomDelay } from "../util/delay.js";
import { captureScreenshot } from "../util/screenshot.js";
import { log } from "../log.js";

export interface GenerateParams {
  prompt: string;
  /** Defaults to "Nano Banana Pro". */
  model?: string;
  /** e.g. "16:9", "1:1", "9:16". */
  aspect?: string;
  /** Number of outputs, 1-4. */
  count?: number;
  /** Local file paths to attach as reference images, if Flow exposes a file input on the page. */
  referenceImages?: string[];
  /** Defaults to true. When true, every field is filled but Generate is never clicked. */
  dryRun?: boolean;
}

export interface GenerateResult {
  dryRun: boolean;
  clickedGenerate: boolean;
  screenshotPath: string;
}

async function selectDropdownOption(
  page: Page,
  config: FlowConfig,
  selectorName: string,
  optionName: string,
  value: string,
  label: string,
): Promise<void> {
  await guard(page, config, `${label}:before-open`);
  const selector = (await resolveElement(page, selectorName)).locator;
  await selector.click();
  await randomDelay(config);
  await guard(page, config, `${label}:after-open`);

  const option = (await resolveElement(page, optionName, { param: value })).locator;
  await option.click();
  await randomDelay(config);
  await guard(page, config, `${label}:after-select`);
}

/**
 * Attach local reference images via a native file input, if one is present
 * on the page. Not part of the mapped logical-element set: `input[type=file]`
 * is a stable native HTML attribute, not a hashed class, so it's targeted
 * directly rather than through resolve.ts.
 */
async function attachReferenceImages(page: Page, config: FlowConfig, paths: string[]): Promise<void> {
  const fileInput = page.locator('input[type="file"]');
  const count = await fileInput.count();
  if (count === 0) {
    log.warn("no file input found on the page — skipping reference image attachment");
    return;
  }
  await fileInput.first().setInputFiles(paths);
  await randomDelay(config);
  await guard(page, config, "reference-images:after-attach");
}

/** Generate one image (or stop short of it, when dryRun). */
export async function generateImage(page: Page, config: FlowConfig, params: GenerateParams): Promise<GenerateResult> {
  const dryRun = params.dryRun ?? true;

  await guard(page, config, "generate:start");
  const promptInput = (await resolveElement(page, "promptInput")).locator;
  await promptInput.click();
  await randomDelay(config);
  await promptInput.fill(params.prompt);
  await randomDelay(config);
  await guard(page, config, "generate:after-prompt");

  if (params.model) {
    await selectDropdownOption(page, config, "modelSelector", "modelOption", params.model, "model");
  }
  if (params.aspect) {
    await selectDropdownOption(page, config, "aspectRatioSelector", "aspectRatioOption", params.aspect, "aspect");
  }
  if (params.count && params.count > 1) {
    await guard(page, config, "count:before-open");
    const selector = (await resolveElement(page, "outputCountSelector")).locator;
    await selector.click();
    await randomDelay(config);
    const option = page.getByRole("option", { name: new RegExp(`^${params.count}$`) });
    await option.click();
    await randomDelay(config);
    await guard(page, config, "count:after-select");
  }
  if (params.referenceImages?.length) {
    await attachReferenceImages(page, config, params.referenceImages);
  }

  await guard(page, config, "generate:before-click");
  const screenshotPath = await captureScreenshot(page, config, dryRun ? "dry-run" : "pre-generate");

  if (dryRun) {
    log.info({ screenshotPath }, "dryRun: stopping before Generate — button was never clicked");
    return { dryRun: true, clickedGenerate: false, screenshotPath };
  }

  const generateButton = (await resolveElement(page, "generateButton")).locator;
  await generateButton.click();
  await randomDelay(config);
  await guard(page, config, "generate:after-click");

  return { dryRun: false, clickedGenerate: true, screenshotPath };
}
