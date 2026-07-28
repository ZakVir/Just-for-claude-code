/**
 * guards.ts — interstitial/challenge detection. Runs before and after every
 * interaction with the page.
 *
 * Safety rule #3: if this detects a captcha, a "verify you're human"/
 * "unusual traffic" notice, a re-authentication wall, or a consent
 * interstitial, the caller MUST treat it as terminal: screenshot, mark the
 * job HALTED_CHALLENGE, drain and stop the whole queue, and return an error.
 * This module only detects — it must never attempt to solve, click through,
 * dismiss, or retry past what it finds. A halt is correct behavior.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Page } from "playwright";
import type { FlowConfig } from "../config.js";
import { log } from "../log.js";

export interface ChallengeCheck {
  halted: boolean;
  reason: string | null;
}

const CHALLENGE_TEXT_PATTERNS: RegExp[] = [
  /unusual traffic/i,
  /verify (that )?you.?re( a)? human/i,
  /i.?m not a robot/i,
  /captcha/i,
  /suspicious activity/i,
  /confirm it.?s (really )?you/i,
  /re-?enter your password/i,
  /verify it.?s you/i,
  /before you continue to google/i,
];

const CAPTCHA_FRAME_PATTERN = /recaptcha|hcaptcha|captcha/i;

/**
 * Inspect the current page for any known challenge/interstitial signal.
 * Read-only: never interacts with what it finds.
 */
export async function checkForChallenge(page: Page): Promise<ChallengeCheck> {
  for (const frame of page.frames()) {
    if (CAPTCHA_FRAME_PATTERN.test(frame.url())) {
      return { halted: true, reason: `challenge iframe detected: ${frame.url()}` };
    }
  }

  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  for (const pattern of CHALLENGE_TEXT_PATTERNS) {
    if (pattern.test(bodyText)) {
      return { halted: true, reason: `page text matched challenge pattern ${pattern}` };
    }
  }

  return { halted: false, reason: null };
}

/** Raised whenever guard() detects a challenge. Callers must drain and stop the queue on this, never retry. */
export class ChallengeHaltError extends Error {
  constructor(public reason: string, public screenshotPath: string) {
    super(`HALTED_CHALLENGE: ${reason}`);
    this.name = "ChallengeHaltError";
  }
}

/**
 * Check the page for a challenge and, if found, capture a screenshot to
 * config.logsDir and throw ChallengeHaltError. Call this immediately before
 * and immediately after every UI interaction (click/fill/select).
 */
export async function guard(page: Page, config: FlowConfig, label: string): Promise<void> {
  const check = await checkForChallenge(page);
  if (!check.halted) return;

  const screenshotPath = resolve(process.cwd(), config.logsDir, `challenge-${label}-${Date.now()}.png`);
  mkdirSync(dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  log.error({ reason: check.reason, screenshotPath }, "HALTED_CHALLENGE");
  throw new ChallengeHaltError(check.reason!, screenshotPath);
}
