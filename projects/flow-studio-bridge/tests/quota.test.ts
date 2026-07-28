import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkBudget, recordUsage, getQuotaStatus, BudgetExceededError } from "../src/flow/quota.js";
import type { FlowConfig } from "../src/config.js";

describe("quota.ts", () => {
  let logsDir: string;
  let config: FlowConfig;

  beforeEach(() => {
    logsDir = mkdtempSync(resolve(tmpdir(), "flow-studio-bridge-quota-"));
    config = {
      profileDir: "./.flow-profile",
      flowUrl: "https://labs.google/fx/tools/flow",
      dailyBudget: 3,
      outputDir: resolve(logsDir, "output"),
      logsDir,
      minActionDelayMs: 1,
      maxActionDelayMs: 5,
      maxRetries: 2,
      headlessDefault: true,
    };
  });

  afterEach(() => {
    rmSync(logsDir, { recursive: true, force: true });
  });

  it("starts at zero used with the full budget remaining", () => {
    const status = getQuotaStatus(config);
    expect(status).toEqual({ used: 0, budget: 3, remaining: 3, resetsAt: status.resetsAt });
  });

  it("allows a job within budget and increments usage on recordUsage", () => {
    expect(() => checkBudget(config, 1)).not.toThrow();
    const status = recordUsage(config, 1);
    expect(status.used).toBe(1);
    expect(status.remaining).toBe(2);
  });

  it("refuses job N+1 once the budget of N is used", () => {
    recordUsage(config, 1);
    recordUsage(config, 1);
    recordUsage(config, 1);
    expect(getQuotaStatus(config).used).toBe(3);
    expect(() => checkBudget(config, 1)).toThrow(BudgetExceededError);
  });

  it("a single flow_generate_variations batch costs exactly 1 unit regardless of output count", () => {
    recordUsage(config, 1); // one Agent-mode request, however many images it returned
    expect(getQuotaStatus(config).used).toBe(1);
  });

  it("persists usage across separate loads (a fresh ledger read still sees prior usage today)", () => {
    recordUsage(config, 2);
    const status = getQuotaStatus(config);
    expect(status.used).toBe(2);
    expect(status.remaining).toBe(1);
  });
});
