/**
 * tools/flow_generate_image.ts — one prompt -> N outputs. Routed through
 * the shared queue for both dryRun and live calls, so no two tool calls
 * ever touch the page concurrently. dryRun defaults to true.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FlowRuntime } from "../runtime.js";
import { generateImage } from "../flow/generate.js";
import { runGenerateJob } from "../flow/job.js";

const inputShape = {
  prompt: z.string().min(1).describe("What to generate"),
  model: z.string().default("Nano Banana Pro").describe("Model name as shown in Flow's model selector"),
  aspect: z.string().optional().describe("Aspect ratio, e.g. '16:9', '1:1', '9:16'"),
  count: z.number().int().min(1).max(4).optional().describe("Number of outputs, 1-4"),
  referenceImages: z.array(z.string()).optional().describe("Local file paths to attach as reference images"),
  dryRun: z.boolean().default(true).describe("When true (default), fills every field but never clicks Generate"),
};

export function registerFlowGenerateImage(server: McpServer, runtime: FlowRuntime): void {
  server.tool(
    "flow_generate_image",
    "Generate one or more images from a single prompt. dryRun defaults to true — set it to false only when you intend to actually spend a generation against the daily budget. For more than one image along a varying theme, prefer flow_generate_variations instead: it costs 1 budget unit no matter how many variants it returns.",
    inputShape,
    async (params) => {
      const page = await runtime.getPage();
      const result = await runtime.queue.run(runtime.config, "flow_generate_image", async () => {
        if (params.dryRun) {
          return generateImage(page, runtime.config, params);
        }
        return runGenerateJob(page, runtime.config, params);
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
