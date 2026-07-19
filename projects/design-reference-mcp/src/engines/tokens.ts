/**
 * tokens.ts — extract_tokens tool logic.
 *
 * Loads the URL in a headless Playwright page (reusing the screenshot
 * engine's serialized browser) and pulls colors / fonts / spacing / radius /
 * shadows straight from computed styles across a representative sample of
 * elements. This is a heuristic extraction, not a full design-token export —
 * good enough to brief an agent on "what does this site's system look like".
 */
import { withRateLimit } from "../util/ratelimit.js";
import { isAllowed } from "../util/robots.js";

interface RawStyleSample {
  color: string;
  backgroundColor: string;
  fontFamily: string;
  fontSize: string;
  borderRadius: string;
  boxShadow: string;
  padding: string;
  margin: string;
}

export interface ExtractedTokens {
  source_url: string;
  colors: string[];
  fonts: string[];
  spacing: string[];
  radius: string[];
  shadows: string[];
}

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function uniqSorted(vals: string[], limit = 12): string[] {
  return [...new Set(vals.filter(Boolean))].slice(0, limit);
}

export async function extractTokens(url: string): Promise<ExtractedTokens> {
  const allowed = await isAllowed(url);
  if (!allowed) throw new Error(`Blocked by robots.txt: ${url}`);

  // Reuse the screenshot engine's browser + concurrency=1 policy so token
  // extraction and screenshots never run Chromium pages concurrently.
  const { chromium } = await import("playwright");

  return withRateLimit(host(url), "screenshot", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

      const samples = (await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll("body, h1, h2, h3, p, a, button, .btn, [class*='card']"),
        ).slice(0, 60);
        return els.map((el) => {
          const cs = getComputedStyle(el as Element);
          return {
            color: cs.color,
            backgroundColor: cs.backgroundColor,
            fontFamily: cs.fontFamily,
            fontSize: cs.fontSize,
            borderRadius: cs.borderRadius,
            boxShadow: cs.boxShadow,
            padding: cs.padding,
            margin: cs.margin,
          };
        });
      })) as RawStyleSample[];

      const colors = uniqSorted(
        samples.flatMap((s) => [s.color, s.backgroundColor]).filter((c) => c && c !== "rgba(0, 0, 0, 0)"),
        16,
      );
      const fonts = uniqSorted(samples.map((s) => s.fontFamily.split(",")[0].trim().replace(/["']/g, "")));
      const spacing = uniqSorted(samples.flatMap((s) => [s.padding, s.margin]).filter((v) => v && v !== "0px"));
      const radius = uniqSorted(samples.map((s) => s.borderRadius).filter((v) => v && v !== "0px"));
      const shadows = uniqSorted(samples.map((s) => s.boxShadow).filter((v) => v && v !== "none"));

      return { source_url: url, colors, fonts, spacing, radius, shadows };
    } finally {
      await browser.close();
    }
  });
}
