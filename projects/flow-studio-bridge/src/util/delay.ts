/**
 * delay.ts — randomized inter-action delay, per safety rule #6. Never call
 * Flow with fixed, bot-shaped timing between actions.
 */
import type { FlowConfig } from "../config.js";

/** Wait a random duration in [config.minActionDelayMs, config.maxActionDelayMs]. */
export async function randomDelay(config: FlowConfig): Promise<void> {
  const span = Math.max(0, config.maxActionDelayMs - config.minActionDelayMs);
  const ms = config.minActionDelayMs + Math.floor(Math.random() * (span + 1));
  await new Promise((r) => setTimeout(r, ms));
}
