/**
 * runtime.ts — shared, lazily-initialized browser session + queue, wired
 * into every MCP tool. There is exactly one BrowserContext and one JobQueue
 * for the lifetime of the server process, so all tool calls share the same
 * isolated profile and the same strict serialization.
 */
import type { BrowserContext, Page } from "playwright";
import type { FlowConfig } from "./config.js";
import { launchSession } from "./browser/session.js";
import { JobQueue } from "./queue.js";

export interface FlowRuntime {
  config: FlowConfig;
  getContext(): Promise<BrowserContext>;
  getPage(): Promise<Page>;
  queue: JobQueue;
}

export function createRuntime(config: FlowConfig): FlowRuntime {
  let contextPromise: Promise<BrowserContext> | null = null;

  function getContext(): Promise<BrowserContext> {
    if (!contextPromise) contextPromise = launchSession(config);
    return contextPromise;
  }

  async function getPage(): Promise<Page> {
    const context = await getContext();
    return context.pages()[0] ?? (await context.newPage());
  }

  return { config, getContext, getPage, queue: new JobQueue() };
}
