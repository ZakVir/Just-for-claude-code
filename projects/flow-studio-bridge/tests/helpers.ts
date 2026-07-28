import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";

// Sandbox-only pin: this repo's test environment pre-installs a Chromium
// build under /opt/pw-browsers that may lag the `playwright` npm package's
// expected bundled revision. Production code (browser/session.ts) never
// uses this — it always launches via the `chrome` channel. This helper only
// affects the test suite's own browser launches.
const SANDBOX_CHROMIUM_PATHS = [
  "/opt/pw-browsers/chromium-1228/chrome-linux64/chrome",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
];

export async function launchTestBrowser(): Promise<Browser> {
  const executablePath = SANDBOX_CHROMIUM_PATHS.find((p) => existsSync(p));
  return chromium.launch(executablePath ? { executablePath } : {});
}
