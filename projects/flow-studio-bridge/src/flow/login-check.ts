/**
 * login-check.ts — verifies a signed-in Google account by reading visible
 * UI text only.
 *
 * Safety rule #2: this must never read cookies, tokens, `storageState()`, or
 * `document.cookie`. The only signal used is the accessible name/text of the
 * account UI Flow itself renders on the page (e.g. an avatar button's
 * tooltip or a "Signed in as ..." string) — the same information a human
 * looking at the screen would see. If Flow renders no such visible text, the
 * result is `signedIn: false` with no guessing.
 */
import type { BrowserContext } from "playwright";
import type { FlowConfig } from "../config.js";
import { log } from "../log.js";

export interface LoginStatus {
  signedIn: boolean;
  /** Visible account text found in the UI (e.g. an email or display name), if any. */
  account: string | null;
  /** True when config.account was set and matches the visible account text. */
  matchesConfigured: boolean | null;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Navigate to Flow and inspect visible page text/accessible names for a
 * signed-in account indicator. Returns signedIn: false (not an error) when
 * Flow shows a sign-in prompt instead.
 */
export async function checkLogin(context: BrowserContext, config: FlowConfig): Promise<LoginStatus> {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(config.flowUrl, { waitUntil: "domcontentloaded" });

  const signInPrompt = page.getByRole("button", { name: /sign in/i });
  if (await signInPrompt.count().then((n) => n > 0)) {
    log.info("no signed-in account detected: sign-in button visible");
    return { signedIn: false, account: null, matchesConfigured: null };
  }

  // Look for a visible account indicator: an accessible name/tooltip containing
  // an email-shaped string, exposed by Flow's own account-switcher control.
  const candidates = await page.getByRole("button").all();
  let account: string | null = null;
  for (const el of candidates) {
    const name = (await el.getAttribute("aria-label")) ?? (await el.textContent());
    if (name && EMAIL_RE.test(name)) {
      account = name.match(EMAIL_RE)?.[0] ?? null;
      break;
    }
  }

  const signedIn = account !== null;
  const matchesConfigured = config.account ? (signedIn ? account === config.account : false) : null;
  log.info({ signedIn, account, matchesConfigured }, "login check complete");
  return { signedIn, account, matchesConfigured };
}
