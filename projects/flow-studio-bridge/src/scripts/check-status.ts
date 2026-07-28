/**
 * scripts/check-status.ts — dev CLI used to verify M1: launches the isolated
 * profile headlessly, runs login-check.ts, and prints the detected account.
 * This is a temporary verification harness; the real `flow_status` MCP tool
 * is built in M5 and will call the same checkLogin() function.
 */
import { loadConfig } from "../config.js";
import { launchSession, closeSession } from "../browser/session.js";
import { checkLogin } from "../flow/login-check.js";
import { log } from "../log.js";

async function main() {
  const config = loadConfig();
  const context = await launchSession(config);
  const status = await checkLogin(context, config);
  await closeSession(context);
  log.info(status, "current login status");
  console.log(JSON.stringify(status, null, 2));
}

main().catch((err) => {
  log.error({ err }, "status check failed");
  process.exit(1);
});
