# flow-studio-bridge

A local MCP server that drives the Google Flow web UI (`labs.google/fx/tools/flow`)
through Playwright to batch-generate images with Nano Banana Pro, using an
isolated, already-logged-in Chrome profile.

Google publishes no API for Flow. This tool automates the web UI itself —
carefully, conservatively, and only through the same clickable affordances a
human has. See "What this tool will not do" below before using it.

**Status: M1-M6 complete.** All five MCP tools are implemented and registered.
43 tests pass (`npm test`), and the server has been verified end to end with
a real MCP JSON-RPC handshake over stdio. What has *not* been verified from
this build environment is a real Google sign-in and a real live Flow
session — that requires the user's own Google account in a headed browser,
which is exactly the safety boundary this tool is built around (see below).

## What this tool will not do

- **It will never see your other Google logins.** It only ever opens one
  dedicated, isolated browser profile (`./.flow-profile` by default) that you
  sign into by hand, once, via `npm run login`. It never attaches to your
  regular Chrome, never reads your regular Chrome's profile directory, and
  never connects to an already-running browser.
- **It will never touch your password, cookies, or session tokens.** There is
  no code path anywhere in this tool that reads a password field, extracts a
  cookie, exports "storage state," or reads `document.cookie`. Signing in is
  something you do by hand in a real browser window; staying signed in is
  Chrome's own job, not this tool's.
- **It will refuse to continue past any CAPTCHA, "unusual traffic" notice, or
  re-authentication prompt.** It never tries to solve, click through, or
  retry past one of these. If it sees one, it stops the entire job queue
  immediately, saves a screenshot, and tells you to go look.
- **It will never call Flow's internal APIs directly.** Every action is a
  real click, type, or navigation through the same UI you'd use yourself. It
  never intercepts network requests or replays internal API calls.
- **It will never alter, strip, or re-encode what Flow generates.** Downloaded
  images are saved exactly as delivered, watermarks (SynthID/C2PA) and all.
  No image post-processing happens anywhere in this codebase.

## Why not just use an existing Flow automation tool?

Existing community tools tend to fail in three specific ways this project
deliberately avoids:

1. They hardcode CSS selectors against Flow's hashed/obfuscated class names,
   which rot on every Flow redesign. This tool only ever targets accessible
   roles, labels, text, or structural relationships — see "Selector strategy."
2. They attach to your primary Chrome profile, exposing your whole Google
   session to the automation. This tool only ever launches an isolated,
   dedicated profile.
3. Some forge internal API calls or attempt to defeat bot challenges. This
   tool interacts through visible UI only and hard-aborts on any challenge.

## Quota strategy: prefer variations over separate generations

Image generation in Flow costs 0 credits but is capped by an unpublished
daily server-side limit that automation cannot raise. The efficient move is
therefore **fewer, richer generations** rather than more generations.

Flow's own Agent mode supports asking for multiple variations of an image
along a stated axis (e.g. "20 variations with different lighting") in a
*single* request. `flow_generate_variations` composes one such Agent
instruction instead of looping single-image generation N times, so the local
quota ledger only increments by 1 per batch, not by N. **This is the
recommended default tool for anything beyond a single image.**

## Setup

```bash
cd projects/flow-studio-bridge
npm install
npx playwright install chrome
cp config.example.json config.json   # edit profileDir/account/dailyBudget as you like
npm run login                        # opens a headed browser — sign in by hand
npm run status                       # verifies the isolated profile sees you as signed in
npm run doctor                       # resolves every logical UI element against live Flow
```

`config.json` is gitignored and never committed — only `config.example.json`
is tracked. The isolated profile directory (`.flow-profile/`), `output/`, and
`logs/` are also gitignored.

### Connecting it as an MCP server

```bash
npm run build
claude mcp add flow-studio-bridge -- node /path/to/flow-studio-bridge/dist/index.js
```

The server expects `config.json` to exist in its working directory (same as
`npm run login`/`npm run status`). It exposes exactly five tools:
`flow_status`, `flow_generate_image`, `flow_generate_variations`,
`flow_download`, `flow_doctor`.

## Build order (all complete)

- **M1** — scaffold, config, isolated session launch, manual login flow,
  login verification via visible UI text only.
- **M2** — selector map + resolution engine + interstitial guards +
  `flow_doctor`.
- **M3** — single-image generation with `dryRun` default true.
- **M4** — live generation, download, quota ledger, budget enforcement.
- **M5** — serial job queue, STOP-file handling, MCP server with all five
  tools.
- **M6** — Agent-mode multi-variation generation (`flow_generate_variations`
  composes one instruction for N variants; the quota ledger increments by 1
  per batch, not by N).

## Testing approach

This build environment has no display and no Google account to sign into
live Flow with, so the test suite (`npm test`, 43 tests) exercises every
module against synthetic Flow-like DOM fixtures in `fixtures/` rather than
the real site — including a captcha interstitial, a limit-reached notice, a
signed-out state, and a full generate → download → ledger-increment success
path. `npm run doctor` and a real Google sign-in are left for you to run
locally, where you have both a display and your own account.

## Selector strategy

`selectors/flow.map.json` (from M2 onward) maps each logical UI element to an
ordered list of resolution strategies, tried in this priority order: Playwright
role + accessible name, label, test id, text, then a structural relationship
to a stable anchor. **Hashed CSS class names are never used as a selector
strategy anywhere in this codebase.** `npm run doctor` resolves every logical
element against a live Flow page and reports which strategy won for each —
turning "Flow redesigned and something broke" into a one-command diagnosis.

## Safety rules (full list)

1. Isolated profile only — `launchPersistentContext`, never CDP, never the
   default Chrome profile.
2. Never handle credentials — no password fields, no OAuth, no token
   extraction, no cookies, no `storageState()`.
3. Hard abort on any challenge or interstitial — screenshot, halt the queue,
   never retry past it.
4. UI-driving only — no network interception, no forged API calls.
5. No output tampering — images saved exactly as delivered, no
   post-processing, watermarks intact.
6. Conservative, serial, budgeted — one job at a time, randomized delays,
   bounded retries, a daily budget enforced locally.
7. Observable and interruptible — every job logged to `jobs.jsonl`,
   screenshots on failure, a `./STOP` file halts the queue between jobs,
   `--dry-run` never clicks Generate.
