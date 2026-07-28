import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchTestBrowser } from "./helpers.js";
import { downloadResults } from "../src/flow/download.js";
import type { FlowConfig } from "../src/config.js";

const FIXTURES_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)), "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("download.ts", () => {
  let browser: Browser;
  let page: Page;
  let workDir: string;
  let config: FlowConfig;

  beforeAll(async () => {
    browser = await launchTestBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    workDir = mkdtempSync(resolve(tmpdir(), "flow-studio-bridge-download-"));
    config = {
      profileDir: "./.flow-profile",
      flowUrl: "https://labs.google/fx/tools/flow",
      dailyBudget: 25,
      outputDir: resolve(workDir, "output"),
      logsDir: resolve(workDir, "logs"),
      minActionDelayMs: 1,
      maxActionDelayMs: 5,
      maxRetries: 2,
      headlessDefault: true,
    };
    page = await browser.newPage();
    await page.setContent(loadFixture("flow-app.html"));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("downloads every result asset unmodified to output/<jobId>/, using Flow's own suggested filenames", async () => {
    const assets = await downloadResults(page, config, "job-123");

    expect(assets).toHaveLength(2);
    expect(assets.map((a) => a.suggestedFilename).sort()).toEqual(["result-1.png", "result-2.png"]);

    for (const asset of assets) {
      expect(existsSync(asset.path)).toBe(true);
      expect(asset.path).toContain(resolve(config.outputDir, "job-123"));
    }

    const filesOnDisk = readdirSync(resolve(config.outputDir, "job-123")).sort();
    expect(filesOnDisk).toEqual(["result-1.png", "result-2.png"]);
  });
});
