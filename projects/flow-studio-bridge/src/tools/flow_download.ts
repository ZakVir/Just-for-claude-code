/**
 * tools/flow_download.ts — retrieve assets currently visible on the page
 * to ./output/<jobId>/. Downloads exactly what Flow delivers via its own
 * download buttons (see flow/download.ts) — no re-encoding, no metadata
 * stripping.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FlowRuntime } from "../runtime.js";
import { downloadResults } from "../flow/download.js";

const inputShape = {
  jobId: z.string().min(1).describe("Identifier used as the output subfolder name: ./output/<jobId>/"),
};

export function registerFlowDownload(server: McpServer, runtime: FlowRuntime): void {
  server.tool(
    "flow_download",
    "Download every currently-visible result asset to ./output/<jobId>/, unmodified, using Flow's own download buttons.",
    inputShape,
    async ({ jobId }) => {
      const page = await runtime.getPage();
      const assets = await runtime.queue.run(runtime.config, "flow_download", () => downloadResults(page, runtime.config, jobId));
      return { content: [{ type: "text" as const, text: JSON.stringify({ jobId, assets }, null, 2) }] };
    },
  );
}
