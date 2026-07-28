/**
 * joblog.ts — appends one JSON line per job to config.logsDir/jobs.jsonl,
 * per safety rule #7. Every job, success or failure, gets a record: id,
 * timestamp, tool, prompt, model, aspect, outcome, duration, output paths.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FlowConfig } from "../config.js";

export type JobOutcome = "success" | "failed" | "HALTED_CHALLENGE" | "LIMIT_REACHED" | "BUDGET_EXCEEDED";

export interface JobRecord {
  id: string;
  timestamp: string;
  tool: string;
  prompt: string;
  model?: string;
  aspect?: string;
  outcome: JobOutcome;
  durationMs: number;
  outputPaths: string[];
  error?: string;
}

export function appendJobRecord(config: FlowConfig, record: JobRecord): void {
  const path = resolve(process.cwd(), config.logsDir, "jobs.jsonl");
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + "\n");
}
