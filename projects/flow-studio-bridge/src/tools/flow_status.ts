/**
 * tools/flow_status.ts — session state, signed-in account, quota ledger,
 * queue depth/halted state, last error. Read-only: never fills or clicks
 * anything.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FlowRuntime } from "../runtime.js";
import { checkLogin } from "../flow/login-check.js";
import { getQuotaStatus } from "../flow/quota.js";

export function registerFlowStatus(server: McpServer, runtime: FlowRuntime): void {
  server.tool("flow_status", "Session state, signed-in account, quota ledger (used/budget/reset), queue state, last error.", {}, async () => {
    const context = await runtime.getContext();
    const login = await checkLogin(context, runtime.config);
    const quota = getQuotaStatus(runtime.config);
    const status = {
      signedIn: login.signedIn,
      account: login.account,
      matchesConfigured: login.matchesConfigured,
      quota,
      queueHalted: runtime.queue.isHalted,
      queueHaltedReason: runtime.queue.haltedReason,
    };
    return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
  });
}
