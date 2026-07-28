import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchTestBrowser } from "./helpers.js";
import { checkForChallenge } from "../src/browser/guards.js";

const FIXTURES_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)), "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("guards.ts checkForChallenge", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchTestBrowser();
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("does not flag a normal Flow page", async () => {
    await page.setContent(loadFixture("flow-app.html"));
    const check = await checkForChallenge(page);
    expect(check.halted).toBe(false);
    expect(check.reason).toBeNull();
  });

  it("flags a captcha/unusual-traffic interstitial", async () => {
    await page.setContent(loadFixture("challenge-captcha.html"));
    const check = await checkForChallenge(page);
    expect(check.halted).toBe(true);
    expect(check.reason).toMatch(/unusual traffic|captcha/i);
  });

  it("flags a limit-reached notice as text, not as a challenge", async () => {
    // the daily-limit UI is a distinct terminal state (quota.ts), not a challenge —
    // guards.ts must not conflate the two.
    await page.setContent(loadFixture("limit-reached.html"));
    const check = await checkForChallenge(page);
    expect(check.halted).toBe(false);
  });
});
