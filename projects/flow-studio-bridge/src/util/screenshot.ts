/**
 * screenshot.ts — capture a full-page screenshot to config.logsDir under a
 * labeled, timestamped filename. Used for dry-run confirmation and failure
 * evidence; never used to alter or post-process a generated image itself.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Page } from "playwright";
import type { FlowConfig } from "../config.js";

export async function captureScreenshot(page: Page, config: FlowConfig, label: string): Promise<string> {
  const path = resolve(process.cwd(), config.logsDir, `${label}-${Date.now()}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  return path;
}
