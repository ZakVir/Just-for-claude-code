import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkLogin } from "../src/flow/login-check.js";
import { getQuotaStatus } from "../src/flow/quota.js";
import { JobQueue } from "../src/queue.js";
import type { FlowConfig } from "../src/config.js";
import { launchTestBrowser } from "./helpers.js";

const FIXTURES_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)), "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("the pieces behind flow_status compose correctly", () => {
  let workDir: string;
  let config: FlowConfig;

  beforeEach(() => {
    workDir = mkdtempSync(resolve(tmpdir(), "flow-studio-bridge-runtime-"));
    config = {
      profileDir: "./.flow-profile",
      flowUrl: "https://labs.google/fx/tools/flow",
      dailyBudget: 10,
      outputDir: resolve(workDir, "output"),
      logsDir: resolve(workDir, "logs"),
      minActionDelayMs: 1,
      maxActionDelayMs: 5,
      maxRetries: 2,
      headlessDefault: true,
    };
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("reports signed-in account, quota, and queue state — the exact shape flow_status returns", async () => {
    const browser = await launchTestBrowser();
    const context = await browser.newContext();
    await context.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: loadFixture("flow-app.html") }));

    const login = await checkLogin(context, config);
    const quota = getQuotaStatus(config);
    const queue = new JobQueue();

    const status = {
      signedIn: login.signedIn,
      account: login.account,
      matchesConfigured: login.matchesConfigured,
      quota,
      queueHalted: queue.isHalted,
      queueHaltedReason: queue.haltedReason,
    };

    expect(status.signedIn).toBe(true);
    expect(status.account).toBe("you@example.com");
    expect(status.quota).toEqual({ used: 0, budget: 10, remaining: 10, resetsAt: quota.resetsAt });
    expect(status.queueHalted).toBe(false);
    expect(status.queueHaltedReason).toBeNull();

    await context.close();
    await browser.close();
  });
});
