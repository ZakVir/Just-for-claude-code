# GUIDELINES.md — Maya's design bible

This is the taste reference for judging what `design_search` and
`design_get_detail` turn up, and for deciding what's worth a `save_reference`
call. It's not enforced in code — it's context for the agent (and human)
deciding what's actually good.

## What makes a reference worth keeping

A saved keeper should earn its place. Before calling `save_reference`, be able
to answer: *what specific pattern or decision here is reusable?* Vague
approval ("looks nice") isn't a `why_good` — name the mechanism:

- Clear visual hierarchy — one dominant action per screen, not three
  competing CTAs.
- Restrained color — 1 accent, 1–2 neutrals, used consistently for meaning
  (not decoration).
- Confident type scale — a handful of sizes, not a dozen almost-the-same
  ones.
- Density that matches the audience — dashboards can be dense; marketing
  pages should breathe.
- Motion with purpose — used to explain state change, not to perform.

## Reading a reference

When evaluating a `design_search` result or a fresh screenshot, look for:

1. **Layout pattern** — comparison table, tiered pricing cards, bento grid,
   split-hero, sticky nav with contextual CTA, etc. Name the pattern (this is
   what `patterns` in `meta.json` is for).
2. **Palette** — pull the 2–5 dominant colors (`extract_tokens` or
   `image.ts`'s dominant-color extraction does this mechanically; sanity
   check by eye).
3. **Type** — is it a system font, a licensed display face, or a Google Font
   pairing? Note it even if you can't extract it precisely.
4. **Spacing rhythm** — is there a consistent unit (8px, 4px) or does it look
   ad hoc?
5. **What's reusable vs. what's just aesthetic** — a component library result
   (shadcn, Radix, Mantine, …) usually gives you code; a gallery/screenshot
   result usually gives you a target to reverse-engineer.

## Tagging conventions (for `save_reference` / `meta.json`)

Keep tags short, lowercase, reusable across saves — they're how
`retrieve_saved` finds things later:

- **Domain**: `saas`, `dev-tool`, `ecommerce`, `portfolio`, `docs`
- **Mode**: `dark`, `light`, `high-density`, `minimal`, `maximal`
- **Type**: `landing-page`, `dashboard`, `pricing`, `onboarding`,
  `component`, `icon-set`, `palette`, `type-pairing`

`type` in `meta.json` is the single dominant category (`landing-page`,
`dashboard`, …); `tags` can carry several cross-cutting ones.

## License discipline

Every `repo`-engine result carries a `license` field. Most of the 30 repos in
the registry are **MIT** — safe to lift components from directly with
attribution per their license terms. A few (`cruip/open-react-template` is
GPL-3.0) are copyleft — read before copying wholesale into a proprietary
codebase. Gallery and screenshot sources are `"editorial"` — they're
reference/inspiration, not licensed code; don't copy their markup/assets
verbatim, learn from the pattern and rebuild it.

## What NOT to do

- Don't scrape gated sources (Savee, Pinterest, Mobbin full, Page Flows) or
  attempt to log into them — use the free alternative the tool suggests.
- Don't crawl a gallery's entire feed for one query — `design_search` is
  capped at `limit` (max 20) for a reason; more isn't better, curated is
  better.
- Don't treat a screenshot as a license to redistribute the underlying site's
  assets — it's a reference for hierarchy/pattern/palette, not a source of
  copy-paste code (except where the `repo` engine explicitly gives you
  licensed code).
