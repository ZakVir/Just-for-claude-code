# calm-companion-app

Screen designs (design only — no working code) for **Puff**, a mobile app
built around a single idea: when you're overwhelmed, a small creature
visibly breathes with you until you're not.

## What it is

Six mobile screen mockups covering a first session end to end — Welcome,
Check-in, Breathing, Complete, Companion, Settings — presented as a single
self-contained HTML design deck (`design-deck.html`), published as an
Artifact.

## Research

Built using [`design-reference-mcp`](../design-reference-mcp): 15 distinct
registry sources across the `mobile-app-screen` and `component-library`
`site_type`s (component libraries and animation/icon libraries for the UI
language), plus a real Coolors palette pulled via `design_get_detail`'s
hex-URL parser. Full session log and rendered proof screenshots in
[`proof/`](./proof).

## Design plan

- **Color** — the real pulled Coolors palette (sky `#A2D2FF`, powder
  `#BDE0FE`, bloom `#FFAFCC`→`#E8799E` deepened for AA text contrast, petal
  `#FFC8DD`, mist `#CDB4DB`), applied as flat fields tied to app *state*
  (rest / breath / bond) rather than a decorative gradient wash, plus a
  deliberately chosen violet-biased ink/paper neutral pair (not pure
  black/white, not the generic warm-cream default).
- **Type** — Fraunces (soft optical-size serif) for the handful of moments
  that carry feeling; Plus Jakarta Sans for everything actually tapped.
  Both embedded as real webfont data URIs.
- **Layout** — a real design-studio deck: a compact intro with physical
  palette swatches, six phone frames in the true chronological order of a
  first session, a research-credits section in place of a raw log dump.
  The phone mockups render as a fixed, real design (they don't reflow with
  the deck's own light/dark toggle) — the same reasoning an app-store
  screenshot doesn't change when you flip your phone's theme.

## Files

- `design-deck.html` — the published artifact source
- `proof/mcp-session.log` — real MCP CLI session (all `site_type`s
  required, per the current server)
- `proof/design-deck-full.png` — full-page render
