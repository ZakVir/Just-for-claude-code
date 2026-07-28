/**
 * config.ts — loads and validates config.json against a strict zod schema.
 *
 * Must never read config.json's account/profileDir fields as a way to reach
 * into credential material — they only name a filesystem directory and an
 * expected display string for login-check.ts to compare against visible UI
 * text. This module must never read cookies, tokens, or storage state itself.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
  /** Directory for the isolated Playwright persistent context. Never the user's default Chrome profile. */
  profileDir: z.string().min(1).default("./.flow-profile"),
  /** Google Flow tool URL to drive. */
  flowUrl: z.string().url().default("https://labs.google/fx/tools/flow"),
  /** Expected signed-in account, matched against visible UI text only (not an auth secret). */
  account: z.string().min(1).optional(),
  /** Max generations allowed per day, enforced by the local ledger in flow/quota.ts. */
  dailyBudget: z.number().int().positive().default(25),
  /** Where flow_download writes retrieved assets, per job id subfolder. */
  outputDir: z.string().min(1).default("./output"),
  /** Where jobs.jsonl and failure screenshots are written. */
  logsDir: z.string().min(1).default("./logs"),
  /** Lower bound of the randomized inter-action delay (ms). */
  minActionDelayMs: z.number().int().nonnegative().default(900),
  /** Upper bound of the randomized inter-action delay (ms). */
  maxActionDelayMs: z.number().int().nonnegative().default(2000),
  /** Max retries on transient failure before a job is marked failed. */
  maxRetries: z.number().int().nonnegative().default(2),
  /** Default headless mode for the MCP server's own browser launches (login always forces headed). */
  headlessDefault: z.boolean().default(true),
});

export type FlowConfig = z.infer<typeof ConfigSchema>;

const CONFIG_PATH = resolve(process.cwd(), "config.json");

/** Load config.json from the current working directory and validate it. Throws with a readable message if missing or invalid. */
export function loadConfig(): FlowConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `config.json not found at ${CONFIG_PATH}. Copy config.example.json to config.json and fill in your values.`,
    );
  }
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`config.json is invalid:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
