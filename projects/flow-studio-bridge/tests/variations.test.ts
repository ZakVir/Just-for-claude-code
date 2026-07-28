import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchTestBrowser } from "./helpers.js";
import { generateVariations, composeAgentInstruction } from "../src/flow/variations.js";
import { runVariationsJob } from "../src/flow/job.js";
import { getQuotaStatus } from "../src/flow/quota.js";
import type { FlowConfig } from "../src/config.js";

const FIXTURES_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)), "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

function wasGenerateClicked(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as unknown as { __generateClicked?: boolean }).__generateClicked));
}

describe("variations.ts", () => {
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
    workDir = mkdtempSync(resolve(tmpdir(), "flow-studio-bridge-variations-"));
    config = {
      profileDir: "./.flow-profile",
      flowUrl: "https://labs.google/fx/tools/flow",
      dailyBudget: 25,
      outputDir: resolve(workDir, "output"),
      logsDir: resolve(workDir, "logs"),
      minActionDelayMs: 1,
      maxActionDelayMs: 5,
      maxRetries: 0,
      headlessDefault: true,
    };
    page = await browser.newPage();
    await page.setContent(loadFixture("flow-app.html"));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("composes a single Agent-mode instruction naming the count and axis", () => {
    const instruction = composeAgentInstruction("a lighthouse at dusk", "lighting", 8);
    expect(instruction).toContain("8 variations");
    expect(instruction).toContain("lighting");
    expect(instruction).toContain("a lighthouse at dusk");
  });

  it("dryRun turns Agent mode on, fills the composed instruction, and never clicks Generate", async () => {
    const result = await generateVariations(page, config, {
      basePrompt: "a lighthouse at dusk",
      variationAxis: "lighting",
      count: 8,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.clickedGenerate).toBe(false);
    expect(existsSync(result.screenshotPath)).toBe(true);
    expect(await wasGenerateClicked(page)).toBe(false);

    const agentToggle = page.getByRole("switch", { name: /agent/i });
    expect(await agentToggle.getAttribute("aria-checked")).toBe("true");

    const promptValue = await page.getByRole("textbox").inputValue();
    expect(promptValue).toBe(result.composedInstruction);
  });

  it("live mode clicks Generate exactly once regardless of the requested count", async () => {
    const result = await generateVariations(page, config, {
      basePrompt: "a lighthouse at dusk",
      variationAxis: "lighting",
      count: 20,
      dryRun: false,
    });
    expect(result.clickedGenerate).toBe(true);
    expect(await wasGenerateClicked(page)).toBe(true);
  });

  it("runVariationsJob increments the quota ledger by exactly 1, not by count, and downloads all results", async () => {
    const result = await runVariationsJob(page, config, {
      basePrompt: "a lighthouse at dusk",
      variationAxis: "lighting",
      count: 12,
    });

    expect(result.assets).toHaveLength(2); // the fixture exposes 2 result tiles regardless of requested count
    expect(getQuotaStatus(config).used).toBe(1); // <-- the whole point: 1 unit, not 12
  });
});
