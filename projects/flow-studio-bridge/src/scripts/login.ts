/**
 * scripts/login.ts — `npm run login` entry point.
 *
 * Opens a headed browser against the isolated profile directory and waits
 * for the user to sign into their Google account by hand. This is the only
 * sanctioned way credentials ever touch this tool: typed by the human into
 * Chrome's own sign-in UI, persisted by Chrome itself to the profile
 * directory on disk. Never extracts, inspects, or exports what was typed.
 */
import { loadConfig } from "../config.js";
import { launchSession, closeSession } from "../browser/session.js";
import { checkLogin } from "../flow/login-check.js";
import { log } from "../log.js";

async function main() {
  const config = loadConfig();
  const context = await launchSession(config, { headed: true });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(config.flowUrl, { waitUntil: "domcontentloaded" });

  log.info("Browser window opened. Sign in to your Google account by hand, then return here.");
  log.info("Waiting for a signed-in account to appear (checked every 3s)... Press Ctrl+C to cancel.");

  // Poll for a signed-in state rather than reading any auth material directly.
  let status = await checkLogin(context, config);
  while (!status.signedIn) {
    await new Promise((r) => setTimeout(r, 3000));
    status = await checkLogin(context, config);
  }

  log.info({ account: status.account }, "Signed in. Profile saved to disk. You can close the browser window now.");
  await closeSession(context);
}

main().catch((err) => {
  log.error({ err }, "login flow failed");
  process.exit(1);
});
