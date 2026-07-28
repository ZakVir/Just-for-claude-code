/**
 * quota.ts — local budget ledger. Enforces safety rule #6's dailyBudget: a
 * generation request is refused before it starts if it would push today's
 * count over config.dailyBudget. A `flow_generate_variations` batch that
 * returns N images still costs exactly 1 unit here — the ledger tracks
 * generation *requests*, not output images, which is the whole point of
 * preferring variations over separate calls.
 *
 * Also detects Flow's own "limit reached" UI (a distinct terminal state
 * from a challenge/interstitial) via the `limitReachedNotice` logical
 * element, and records when it was seen.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Page } from "playwright";
import type { FlowConfig } from "../config.js";
import { resolveElement, SelectorMissError } from "../browser/resolve.js";
import { log } from "../log.js";

const LEDGER_FILENAME = "quota-ledger.json";

interface Ledger {
  date: string;
  used: number;
}

export interface QuotaStatus {
  used: number;
  budget: number;
  remaining: number;
  /** ISO timestamp of the next UTC-midnight reset. */
  resetsAt: string;
}

export class BudgetExceededError extends Error {
  constructor(public used: number, public budget: number, public cost: number) {
    super(`Daily budget would be exceeded: ${used} used + ${cost} requested > ${budget} budget`);
    this.name = "BudgetExceededError";
  }
}

export class FlowLimitReachedError extends Error {
  constructor(public detectedAt: string) {
    super(`Flow's own daily limit UI was detected at ${detectedAt}`);
    this.name = "FlowLimitReachedError";
  }
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextUTCMidnight(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

function ledgerPath(config: FlowConfig): string {
  return resolve(process.cwd(), config.logsDir, LEDGER_FILENAME);
}

function readLedger(config: FlowConfig): Ledger {
  const path = ledgerPath(config);
  if (!existsSync(path)) return { date: todayUTC(), used: 0 };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Ledger;
  if (raw.date !== todayUTC()) return { date: todayUTC(), used: 0 };
  return raw;
}

function writeLedger(config: FlowConfig, ledger: Ledger): void {
  const path = ledgerPath(config);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2));
}

/** Current ledger state: used/budget/remaining/reset time. Never mutates. */
export function getQuotaStatus(config: FlowConfig): QuotaStatus {
  const ledger = readLedger(config);
  return {
    used: ledger.used,
    budget: config.dailyBudget,
    remaining: Math.max(0, config.dailyBudget - ledger.used),
    resetsAt: nextUTCMidnight(),
  };
}

/** Throws BudgetExceededError if starting a job costing `cost` would exceed today's budget. Call before every job. */
export function checkBudget(config: FlowConfig, cost = 1): void {
  const status = getQuotaStatus(config);
  if (status.used + cost > status.budget) {
    throw new BudgetExceededError(status.used, status.budget, cost);
  }
}

/** Record that a job costing `cost` generation request(s) actually ran. Call only after a job succeeds. */
export function recordUsage(config: FlowConfig, cost = 1): QuotaStatus {
  const ledger = readLedger(config);
  ledger.used += cost;
  writeLedger(config, ledger);
  const status = getQuotaStatus(config);
  log.info(status, "quota ledger updated");
  return status;
}

/** Throws FlowLimitReachedError if Flow's own daily-limit notice is visible on the page. A no-op otherwise. */
export async function checkFlowLimitNotice(page: Page): Promise<void> {
  try {
    await resolveElement(page, "limitReachedNotice");
  } catch (err) {
    if (err instanceof SelectorMissError) return;
    throw err;
  }
  const detectedAt = new Date().toISOString();
  log.error({ detectedAt }, "Flow's own daily limit UI detected — this is a distinct terminal state from a challenge");
  throw new FlowLimitReachedError(detectedAt);
}
