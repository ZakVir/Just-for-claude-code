import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext } from "playwright";
import { launchTestBrowser } from "./helpers.js";
import { checkLogin } from "../src/flow/login-check.js";
import type { FlowConfig } from "../src/config.js";

const FIXTURES_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)), "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

const baseConfig: FlowConfig = {
  profileDir: "./.flow-profile",
  flowUrl: "https://labs.google/fx/tools/flow",
  dailyBudget: 25,
  outputDir: "./output",
  logsDir: "./logs",
  minActionDelayMs: 900,
  maxActionDelayMs: 2000,
  maxRetries: 2,
  headlessDefault: true,
};

async function contextServing(browser: Browser, html: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: html }));
  return context;
}

describe("login-check.ts", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launchTestBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  afterEach(async () => {
    // contexts are closed per-test below
  });

  it("reports signedIn: false when Flow shows a sign-in prompt", async () => {
    const context = await contextServing(browser, loadFixture("signed-out.html"));
    const status = await checkLogin(context, baseConfig);
    expect(status.signedIn).toBe(false);
    expect(status.account).toBeNull();
    await context.close();
  });

  it("reports signedIn: true with the visible account text, without reading cookies", async () => {
    const context = await contextServing(browser, loadFixture("flow-app.html"));
    const status = await checkLogin(context, baseConfig);
    expect(status.signedIn).toBe(true);
    expect(status.account).toBe("you@example.com");
    await context.close();
  });

  it("reports matchesConfigured against config.account", async () => {
    const context = await contextServing(browser, loadFixture("flow-app.html"));
    const status = await checkLogin(context, { ...baseConfig, account: "someone-else@example.com" });
    expect(status.matchesConfigured).toBe(false);
    await context.close();
  });
});
