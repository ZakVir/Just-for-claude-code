/**
 * tools/flow_doctor.ts — selector health report. Resolves every logical
 * element in selectors/flow.map.json and reports which strategy won, or
 * MISS. Read-only: never clicks or fills anything.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FlowRuntime } from "../runtime.js";
import { runDoctor } from "../flow/doctor.js";

export function registerFlowDoctor(server: McpServer, runtime: FlowRuntime): void {
  server.tool("flow_doctor", "Resolve every logical UI element against the live Flow page and report which strategy won, or MISS.", {}, async () => {
    const page = await runtime.getPage();
    const rows = await runtime.queue.run(runtime.config, "flow_doctor", () => runDoctor(page));
    return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
  });
}
