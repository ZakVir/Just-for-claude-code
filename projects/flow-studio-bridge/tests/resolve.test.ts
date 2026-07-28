import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchTestBrowser } from "./helpers.js";
import { resolveElement, resolveAllElements, SelectorMissError, __clearMapCache } from "../src/browser/resolve.js";

const FIXTURES_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)), "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("resolve.ts against the flow-app fixture", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchTestBrowser();
  });

  beforeEach(async () => {
    __clearMapCache();
    page = await browser.newPage();
    await page.setContent(loadFixture("flow-app.html"));
  });

  afterAll(async () => {
    await browser.close();
  });

  it("resolves promptInput via the role strategy", async () => {
    const result = await resolveElement(page, "promptInput");
    expect(result.strategyType).toBe("role");
  });

  it("resolves generateButton via the role strategy", async () => {
    const result = await resolveElement(page, "generateButton");
    expect(result.strategyType).toBe("role");
    await expect(result.locator.textContent()).resolves.toMatch(/generate/i);
  });

  it("resolves modelSelector via role/combobox", async () => {
    const result = await resolveElement(page, "modelSelector");
    expect(result.strategyType).toBe("role");
  });

  it("resolves aspectRatioSelector by falling back to the second (button) strategy", async () => {
    // fixture's aspect-ratio control has no combobox role, so strategy 1 (combobox) must miss
    // and strategy 2 (button, name match) must win — proves the fallback chain actually falls back.
    const result = await resolveElement(page, "aspectRatioSelector");
    expect(result.strategyType).toBe("role");
    expect(result.strategyIndex).toBe(1);
  });

  it("resolves agentToggle via role/switch", async () => {
    const result = await resolveElement(page, "agentToggle");
    expect(result.strategyType).toBe("role");
  });

  it("resolves both resultTiles via role/img, plural-aware", async () => {
    const result = await resolveAllElements(page, "resultTile");
    expect(result.strategyType).toBe("role");
    expect(result.locators).toHaveLength(2);
  });

  it("resolves both resultDownloadButtons, plural-aware", async () => {
    const result = await resolveAllElements(page, "resultDownloadButton");
    expect(result.strategyType).toBe("role");
    expect(result.locators).toHaveLength(2);
  });

  it("resolves quotaIndicator via the text strategy", async () => {
    const result = await resolveElement(page, "quotaIndicator");
    expect(result.strategyType).toBe("text");
  });

  it("resolves modelOption with a substituted param, once its dropdown is open", async () => {
    await (await resolveElement(page, "modelSelector")).locator.click();
    const opened = page.locator("#model-list");
    await opened.waitFor({ state: "visible" });
    const result = await resolveElement(page, "modelOption", { param: "Imagen 4" });
    expect(["role", "text"]).toContain(result.strategyType);
  });

  it("resolves aspectRatioOption with a substituted param, once its dropdown is open", async () => {
    await (await resolveElement(page, "aspectRatioSelector")).locator.click();
    await page.locator("#aspect-list").waitFor({ state: "visible" });
    const result = await resolveElement(page, "aspectRatioOption", { param: "9:16" });
    expect(["role", "text"]).toContain(result.strategyType);
  });

  it("throws SelectorMissError for limitReachedNotice when it is not present", async () => {
    await expect(resolveElement(page, "limitReachedNotice")).rejects.toBeInstanceOf(SelectorMissError);
  });

  it("throws a plain error for an unknown logical name", async () => {
    await expect(resolveElement(page, "notARealElement")).rejects.toThrow(/Unknown logical element/);
  });
});

describe("resolve.ts against the limit-reached fixture", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchTestBrowser();
  });

  beforeEach(async () => {
    __clearMapCache();
    page = await browser.newPage();
    await page.setContent(loadFixture("limit-reached.html"));
  });

  afterAll(async () => {
    await browser.close();
  });

  it("resolves limitReachedNotice", async () => {
    const result = await resolveElement(page, "limitReachedNotice");
    expect(result).toBeTruthy();
  });

  it("misses generateButton because the fixture has no such button", async () => {
    await expect(resolveElement(page, "generateButton")).rejects.toBeInstanceOf(SelectorMissError);
  });
});
