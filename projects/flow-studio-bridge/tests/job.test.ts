import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchTestBrowser } from "./helpers.js";
import { runGenerateJob } from "../src/flow/job.js";
import { BudgetExceededError, FlowLimitReachedError, getQuotaStatus } from "../src/flow/quota.js";
import type { FlowConfig } from "../src/config.js";

const FIXTURES_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)), "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

function readJobsLog(config: FlowConfig): Array<Record<string, unknown>> {
  const path = resolve(process.cwd(), config.logsDir, "jobs.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("job.ts", () => {
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
    workDir = mkdtempSync(resolve(tmpdir(), "flow-studio-bridge-job-"));
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
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("runs a job end to end: generates, downloads both assets, increments the ledger by 1, logs success", async () => {
    await page.setContent(loadFixture("flow-app.html"));
    const result = await runGenerateJob(page, config, { prompt: "a quiet harbor at dawn" });

    expect(result.assets).toHaveLength(2);
    for (const asset of result.assets) expect(existsSync(asset.path)).toBe(true);

    expect(getQuotaStatus(config).used).toBe(1);

    const jobs = readJobsLog(config);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].outcome).toBe("success");
    expect(jobs[0].id).toBe(result.id);
    expect((jobs[0].outputPaths as string[]).length).toBe(2);
  });

  it("refuses to start (and never touches the page) when the budget is already used up", async () => {
    await page.setContent(loadFixture("flow-app.html"));
    config.dailyBudget = 0;

    await expect(runGenerateJob(page, config, { prompt: "should not run" })).rejects.toBeInstanceOf(BudgetExceededError);

    expect(getQuotaStatus(config).used).toBe(0); // never recorded — job never started
    const jobs = readJobsLog(config);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].outcome).toBe("BUDGET_EXCEEDED");

    // no output directory should have been created — proves the page was never touched
    expect(existsSync(config.outputDir)).toBe(false);
  });

  it("detects Flow's own limit-reached notice as a distinct terminal state, not a challenge", async () => {
    await page.setContent(loadFixture("flow-app-limit-reached.html"));

    await expect(runGenerateJob(page, config, { prompt: "one more please" })).rejects.toBeInstanceOf(FlowLimitReachedError);

    // the job attempted generation (spent no budget since it never recorded success)
    expect(getQuotaStatus(config).used).toBe(0);
    const jobs = readJobsLog(config);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].outcome).toBe("LIMIT_REACHED");
  });
});
