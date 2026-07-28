/**
 * variations.ts — placeholder for M6 (Agent-mode multi-variation
 * generation). The flow_generate_variations tool is registered now so the
 * full 5-tool MCP surface exists per M5, but its real implementation
 * — composing one Agent-mode instruction for N variants instead of looping
 * flow_generate_image N times — lands in M6.
 */
import type { Page } from "playwright";
import type { FlowConfig } from "../config.js";

export interface VariationsParams {
  basePrompt: string;
  variationAxis: string;
  count: number;
  referenceImages?: string[];
  dryRun?: boolean;
}

export async function generateVariations(_page: Page, _config: FlowConfig, _params: VariationsParams): Promise<never> {
  throw new Error("flow_generate_variations is not implemented yet — lands in M6");
}
