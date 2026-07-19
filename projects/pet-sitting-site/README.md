# pet-sitting-site

A small test build for **Pawsome Pet Sitting**, a fictional local dog-walking
and pet-sitting business — built specifically to prove out
[`design-reference-mcp`](../design-reference-mcp) end to end: research real
inspiration through the MCP server, then build a page informed by it.

## What it is

A single self-contained landing page (`index.html` + `styles.css`, no build
step, no dependencies) for a pet-sitting service: hero, services, trust
signals, testimonial, booking CTA, footer.

## How to run

```bash
open index.html      # or just double-click it — it's a static page
```

## Proof this was built using the MCP

See [`proof/`](./proof) for the full paper trail:

- **`proof/mcp-session.log`** — the actual MCP JSON-RPC / CLI session against
  `design-reference-mcp`'s `dist/index.js`: `design_search`,
  `design_get_detail`, `save_reference`, `retrieve_saved` calls with their
  real responses.
- **`proof/pulled-assets/`** — the literal files the MCP pulled down and
  persisted into its self-growing keeper index (`cache/keepers/`), copied
  here for visibility:
  - `hyperice-hero-inspiration.webp` — a real 71KB screenshot the MCP fetched
    from a land-book.com gallery entry (`design_search` → `design_get_detail`
    → `save_reference`), used for the hero's layout hierarchy and whitespace
    rhythm (not its copy or visuals — Hyperice is a recovery-tech brand, not
    pet care).
  - `hyperice-hero-inspiration.meta.json` — the `save_reference` output:
    `source_url`, tags, `why_good`, license (`editorial`).
  - `coolors-warm-palette.meta.json` — a real Coolors palette
    (`#CB997E #DDBEA9 #FFE8D6 #B7B7A4 #A5A58D`) pulled via
    `design_get_detail`'s Coolors hex-URL parser, used verbatim as the page's
    CSS custom properties in `styles.css`.

## What was actually used from research vs. built directly

| From MCP research | Where it shows up |
| --- | --- |
| Coolors warm terracotta/cream/olive palette | `styles.css` `:root` custom properties — every color on the page |
| Hyperice land-book screenshot: big headline + short subhead + single CTA + generous vertical whitespace before the fold | `index.html` hero section structure |
| `shadcn/ui` (MIT, found via `design_search`) — rounded-card + soft-shadow component convention | `.card`, `.testimonial`, `.cta` styling |
| `cruip/open-react-template` (GPL-3.0, found via `design_search`) | Considered but **not used directly** — its landing-page section rhythm (hero → logos → features → CTA) informed the page outline, no code copied (GPL-3.0 would require this whole page to be GPL too) |

## Known limitation surfaced during this research

Search results are as good as what a plain HTML fetch can see. Two galleries
in the registry (Collect UI, and Coolors' own `/palettes/trending` listing)
render their real content client-side via JavaScript, so the `scraper`
engine's static-HTML approach genuinely can't see it — confirmed during this
session, and the engine now returns nothing for those rather than faking a
result (see the design-reference-mcp PR history for the fix). land-book,
lapa-ninja, and the `repo` engine's registry worked as designed.
