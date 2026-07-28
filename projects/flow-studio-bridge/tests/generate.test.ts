import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchTestBrowser } from "./helpers.js";
import { generateImage } from "../src/flow/generate.js";
import type { FlowConfig } from "../src/config.js";

const FIXTURES_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)), "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

function wasGenerateClicked(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as unknown as { __generateClicked?: boolean }).__generateClicked));
}

describe("generate.ts", () => {
  let browser: Browser;
  let page: Page;
  let logsDir: string;
  let config: FlowConfig;

  beforeAll(async () => {
    browser = await launchTestBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    logsDir = mkdtempSync(resolve(tmpdir(), "flow-studio-bridge-test-"));
    config = {
      profileDir: "./.flow-profile",
      flowUrl: "https://labs.google/fx/tools/flow",
      dailyBudget: 25,
      outputDir: resolve(logsDir, "output"),
      logsDir,
      minActionDelayMs: 1,
      maxActionDelayMs: 5,
      maxRetries: 2,
      headlessDefault: true,
    };
    page = await browser.newPage();
    await page.setContent(loadFixture("flow-app.html"));
  });

  afterEach(() => {
    rmSync(logsDir, { recursive: true, force: true });
  });

  it("dryRun fills the prompt, sets model and aspect, and never clicks Generate", async () => {
    const result = await generateImage(page, config, {
      prompt: "a calm morning by the lake",
      model: "Imagen 4",
      aspect: "9:16",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.clickedGenerate).toBe(false);
    expect(existsSync(result.screenshotPath)).toBe(true);
    expect(await wasGenerateClicked(page)).toBe(false);

    const promptValue = await page.getByRole("textbox").inputValue();
    expect(promptValue).toBe("a calm morning by the lake");
  });

  it("live mode (dryRun: false) clicks Generate", async () => {
    const result = await generateImage(page, config, {
      prompt: "a foggy pine forest",
      dryRun: false,
    });

    expect(result.dryRun).toBe(false);
    expect(result.clickedGenerate).toBe(true);
    expect(await wasGenerateClicked(page)).toBe(true);
  });

  it("defaults to dryRun true when unspecified", async () => {
    const result = await generateImage(page, config, { prompt: "no dryRun specified" });
    expect(result.dryRun).toBe(true);
    expect(await wasGenerateClicked(page)).toBe(false);
  });
});
