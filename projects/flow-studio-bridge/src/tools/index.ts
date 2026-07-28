/**
 * tools/index.ts — registers all five (and only five) MCP tools. Do not
 * add a sixth without checking with the user first, per the build brief.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FlowRuntime } from "../runtime.js";
import { registerFlowStatus } from "./flow_status.js";
import { registerFlowGenerateImage } from "./flow_generate_image.js";
import { registerFlowGenerateVariations } from "./flow_generate_variations.js";
import { registerFlowDownload } from "./flow_download.js";
import { registerFlowDoctor } from "./flow_doctor.js";

export function registerAllTools(server: McpServer, runtime: FlowRuntime): void {
  registerFlowStatus(server, runtime);
  registerFlowGenerateImage(server, runtime);
  registerFlowGenerateVariations(server, runtime);
  registerFlowDownload(server, runtime);
  registerFlowDoctor(server, runtime);
}
