/**
 * tools/flow_generate_variations.ts — Agent-mode multi-variation
 * generation. One request produces N variants along a stated axis
 * (e.g. "lighting", "camera angle") and costs exactly 1 budget unit,
 * regardless of N — this is the quota-efficient path and the recommended
 * default for anything beyond a single image. Real generation logic lands
 * in M6 (flow/variations.ts); this file only wires the tool surface per M5.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FlowRuntime } from "../runtime.js";
import { generateVariations } from "../flow/variations.js";

const inputShape = {
  basePrompt: z.string().min(1).describe("The core image description"),
  variationAxis: z.string().min(1).describe("What should vary across outputs, e.g. 'lighting', 'camera angle', 'time of day'"),
  count: z.number().int().min(2).max(20).describe("Number of variants to request in the single Agent-mode instruction"),
  referenceImages: z.array(z.string()).optional().describe("Local file paths to attach as reference images"),
  dryRun: z.boolean().default(true).describe("When true (default), composes and fills the Agent instruction but never clicks Generate"),
};

export function registerFlowGenerateVariations(server: McpServer, runtime: FlowRuntime): void {
  server.tool(
    "flow_generate_variations",
    "Generate N variants of one base prompt along a stated axis using Flow's Agent mode, in a single generation request. Prefer this over N separate flow_generate_image calls whenever you want more than one related output — it costs 1 budget unit total, not N.",
    inputShape,
    async (params) => {
      const page = await runtime.getPage();
      const result = await runtime.queue.run(runtime.config, "flow_generate_variations", () =>
        generateVariations(page, runtime.config, params),
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
