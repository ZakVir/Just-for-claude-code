import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobQueue, HaltedQueueError } from "../src/queue.js";
import { ChallengeHaltError } from "../src/browser/guards.js";
import { FlowLimitReachedError } from "../src/flow/quota.js";
import type { FlowConfig } from "../src/config.js";

describe("queue.ts", () => {
  let workDir: string;
  let config: FlowConfig;
  let queue: JobQueue;
  let originalCwd: string;

  beforeEach(() => {
    workDir = mkdtempSync(resolve(tmpdir(), "flow-studio-bridge-queue-"));
    originalCwd = process.cwd();
    process.chdir(workDir);
    config = {
      profileDir: "./.flow-profile",
      flowUrl: "https://labs.google/fx/tools/flow",
      dailyBudget: 25,
      outputDir: "./output",
      logsDir: "./logs",
      minActionDelayMs: 1,
      maxActionDelayMs: 5,
      maxRetries: 2,
      headlessDefault: true,
    };
    queue = new JobQueue();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(workDir, { recursive: true, force: true });
  });

  it("runs jobs strictly one at a time, in enqueue order", async () => {
    const events: string[] = [];
    const job = (name: string, ms: number) => async () => {
      events.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      events.push(`${name}:end`);
      return name;
    };

    const results = await Promise.all([
      queue.run(config, "a", job("a", 30)),
      queue.run(config, "b", job("b", 5)),
      queue.run(config, "c", job("c", 5)),
    ]);

    expect(results).toEqual(["a", "b", "c"]);
    // if jobs ran concurrently, b/c would interleave with a's start/end
    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  });

  it("retries a transiently-failing job up to maxRetries before succeeding", async () => {
    let attempts = 0;
    const result = await queue.run(config, "flaky", async () => {
      attempts++;
      if (attempts < 3) throw new Error("transient");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("halts the queue on a ChallengeHaltError and rejects every subsequent job without running it", async () => {
    let secondJobRan = false;

    await expect(
      queue.run(config, "job-that-hits-a-challenge", async () => {
        throw new ChallengeHaltError("captcha", "/tmp/fake.png");
      }),
    ).rejects.toBeInstanceOf(ChallengeHaltError);

    expect(queue.isHalted).toBe(true);
    expect(queue.haltedReason).toMatch(/HALTED_CHALLENGE/);

    await expect(
      queue.run(config, "job-after-halt", async () => {
        secondJobRan = true;
        return "should not happen";
      }),
    ).rejects.toBeInstanceOf(HaltedQueueError);

    expect(secondJobRan).toBe(false);
  });

  it("halts the queue on a FlowLimitReachedError", async () => {
    await expect(
      queue.run(config, "job-hits-limit", async () => {
        throw new FlowLimitReachedError(new Date().toISOString());
      }),
    ).rejects.toBeInstanceOf(FlowLimitReachedError);

    expect(queue.isHalted).toBe(true);
    expect(queue.haltedReason).toMatch(/LIMIT_REACHED/);
  });

  it("halts the queue when a ./STOP file is present before a job starts", async () => {
    writeFileSync(resolve(workDir, "STOP"), "");

    await expect(queue.run(config, "should-not-run", async () => "nope")).rejects.toBeInstanceOf(HaltedQueueError);
    expect(queue.haltedReason).toMatch(/STOP file/);
  });

  it("does not halt the queue for an ordinary job failure (exhausted retries)", async () => {
    await expect(
      queue.run(config, "always-fails", async () => {
        throw new Error("permanently broken");
      }),
    ).rejects.toThrow("permanently broken");

    expect(queue.isHalted).toBe(false);

    const result = await queue.run(config, "next-job-still-runs", async () => "fine");
    expect(result).toBe("fine");
  });
});
