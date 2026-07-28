/**
 * session.ts — owns the one and only browser entry point for this tool.
 *
 * Safety rule #1: this file must be the sole place `playwright` is launched
 * from, and it must always be `chromium.launchPersistentContext(userDataDir)`
 * against the configured isolated profile directory. Never connect via
 * `chromium.connectOverCDP`, never launch against the user's default Chrome
 * user-data-dir, and never accept a caller-supplied profile path outside
 * config. This is what keeps the tool structurally incapable of seeing the
 * user's other Google sessions.
 *
 * Safety rule #2: nothing in this file (or anywhere else) may call
 * `context.cookies()`, `context.storageState()`, or read `document.cookie`.
 * Session persistence is Chrome's own job via the on-disk profile directory.
 */
import { chromium, type BrowserContext } from "playwright";
import { resolve } from "node:path";
import type { FlowConfig } from "../config.js";
import { log } from "../log.js";

export interface SessionOptions {
  /** Force a headed (visible) browser window, e.g. for the login flow. */
  headed?: boolean;
}

/**
 * Launch (or attach to) the single isolated persistent-profile browser
 * context this tool is allowed to use. Must never be given any userDataDir
 * other than the one resolved from config.
 */
export async function launchSession(config: FlowConfig, opts: SessionOptions = {}): Promise<BrowserContext> {
  const userDataDir = resolve(process.cwd(), config.profileDir);
  const headless = opts.headed ? false : config.headlessDefault;
  log.info({ userDataDir, headless }, "launching isolated persistent browser context");
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless,
    viewport: { width: 1400, height: 960 },
  });
  return context;
}

/** Cleanly close the persistent context. Profile state is retained on disk by Chrome itself. */
export async function closeSession(context: BrowserContext): Promise<void> {
  await context.close();
}
