#!/usr/bin/env node
/**
 * index.ts — MCP server entry point (stdio transport). Registers exactly
 * five tools (see tools/index.ts) against one shared, isolated browser
 * session and one shared serial job queue (see runtime.ts).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createRuntime } from "./runtime.js";
import { registerAllTools } from "./tools/index.js";
import { log } from "./log.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const runtime = createRuntime(config);

  const server = new McpServer({ name: "flow-studio-bridge", version: "0.1.0" });
  registerAllTools(server, runtime);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("flow-studio-bridge MCP server connected over stdio");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
