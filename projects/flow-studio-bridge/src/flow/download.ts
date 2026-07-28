/**
 * download.ts — retrieves generated assets to ./output/<jobId>/.
 *
 * Safety rule #5: images are saved via Playwright's own download event
 * (`download.saveAs`), which writes the bytes Flow's server actually sent —
 * byte for byte. This file must never decode, re-encode, resize, or strip
 * metadata/watermarks from what it downloads.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "playwright";
import type { FlowConfig } from "../config.js";
import { resolveAllElements } from "../browser/resolve.js";
import { guard } from "../browser/guards.js";
import { randomDelay } from "../util/delay.js";
import { log } from "../log.js";

export interface DownloadedAsset {
  path: string;
  suggestedFilename: string;
}

/**
 * Click every visible resultDownloadButton (one per result tile, assumed to
 * be in the same DOM order as the tiles) and save each triggered download
 * unmodified to outputDir/<jobId>/.
 */
export async function downloadResults(page: Page, config: FlowConfig, jobId: string): Promise<DownloadedAsset[]> {
  await guard(page, config, "download:start");
  const outputDir = resolve(process.cwd(), config.outputDir, jobId);
  mkdirSync(outputDir, { recursive: true });

  const { locators: buttons } = await resolveAllElements(page, "resultDownloadButton");
  const assets: DownloadedAsset[] = [];

  for (let i = 0; i < buttons.length; i++) {
    await guard(page, config, `download:before-${i}`);
    const [download] = await Promise.all([page.waitForEvent("download"), buttons[i].click()]);
    const suggested = download.suggestedFilename();
    const destPath = resolve(outputDir, suggested || `result-${i}.bin`);
    await download.saveAs(destPath);
    assets.push({ path: destPath, suggestedFilename: suggested });
    log.info({ path: destPath }, "downloaded result asset");
    await randomDelay(config);
    await guard(page, config, `download:after-${i}`);
  }

  return assets;
}
