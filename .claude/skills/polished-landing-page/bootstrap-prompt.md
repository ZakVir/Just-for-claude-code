# Landing page setup: install MCPs + adopt design guidelines

> **How to use this file:** paste this entire document as your first
> message in a new Claude Code chat. It's self-contained — it doesn't
> depend on any other file existing in the project. Claude will install
> the MCP servers below (asking first for anything that needs an account
> or API key from you), then follow the guidelines for the rest of the
> session whenever it's building a landing page, marketing site, or
> similar.

---

## Instructions to Claude

Do the following, in order, then keep the guidelines below in mind for
the rest of this session:

### 1. Install MCP servers

**Install this one now, no questions asked** — it's free (during Figma's
current beta; will become paid usage-based later per Figma's own docs)
and only needs an OAuth login, no key to collect:

```
claude mcp add --transport http figma https://mcp.figma.com/mcp
```

If that command's syntax doesn't match this Claude Code version, run
`claude mcp add --help` and adapt it — don't skip the install over a
flag mismatch.

**Ask me first about these** — each needs something from me (an account,
a free API key, or a setup wizard), so don't silently set them up:

- **shadcn/ui MCP (Shadcn Space)** — free component data for shadcn/ui.
  Ask if I want it; if yes, walk me through the connect flow at
  https://shadcnspace.com/docs/getting-started/mcp-server-docs and add
  whatever `mcpServers` entry it gives us.
- **Unsplash / Pexels / Pixabay MCP servers** — only worth installing as
  MCP servers if I want an agent-native interface to them. Otherwise
  skip installing anything and just call their plain HTTP APIs directly
  when needed (see the table below) — that's simpler and needs no setup
  beyond a free API key.
- Any other MCP I mention by name that isn't listed here — ask me for
  the link/docs before trying to install it from memory.

**Don't install, just use directly as plain HTTP calls** when the task
calls for it — no server, no config, just a request:

| Need | API | Key required? | Notes |
|---|---|---|---|
| Stock photos | `api.unsplash.com` (unsplash.com/developers) | Yes, free — register an app for an Access Key | 1,000 req/hr free tier |
| Stock photos/video | `api.pexels.com` (pexels.com/api) | Yes, free | Rate-limited by default, liftable with attribution for bigger use |
| Stock photos/video/music | `pixabay.com/api` | Yes, free | 100 req/60s default limit |
| Icons | `api.iconify.design` | **No key at all** | 300k+ icons from 200+ open sets — prefer this over generating icon SVGs by hand |
| Web fonts (loading, not metadata) | `fonts.googleapis.com/css2?family=...` | **No key** for the CSS/font-loading endpoint | A key is only needed for the separate *metadata* Developer API, not for loading fonts |

If a key is needed and I haven't given you one, ask me for it (or ask if
I want to skip that source) rather than blocking silently or fabricating
a request that will fail.

### 2. Confirm what's active

After installing, list what's actually available (`claude mcp list` or
equivalent) and tell me in one line what got installed vs. what's
pending on a key/decision from me. Don't just assume the install worked.

### 3. Actively use what's installed — don't just have it available

Once a source is set up, prefer it over guessing or hand-rolling:

- Need a photo, icon, or font for a page? Pull it from the sources above
  instead of describing a placeholder or leaving a `TODO`.
- Working from an existing Figma file, or need to check a design system
  against a spec? Use the Figma MCP instead of asking me to describe it.
- Building shadcn/ui components? Pull real component/prop data from the
  shadcn MCP (if installed) instead of guessing prop names.

If none of these apply to what I'm asking for, that's fine — don't force
them in. But when the task is genuinely "get an image / icon / font /
component," use the tool instead of skipping it.

---

## Landing page design guidelines

The goal: a landing page that reads as *designed*, not as generic AI
output (the same green-gradient hero, same rounded card, same layout
everyone else's agent produces from a one-line prompt). Work through
these in order; skip any that don't apply to the project.

1. **Scope it first.** Before writing code, pin down: who the page is
   for, what the product does in plain language, and the ONE action you
   want a visitor to take (join a waitlist, sign up, buy, book a call —
   this single line decides the CTA and page structure). Write this into
   `CLAUDE.md` so it isn't re-explained every prompt. Add an explicit
   autonomy instruction too: *"When you can verify or run something
   yourself, do it — don't ask the user to."* For anything beyond a
   single page, write a short PRD file instead of one long prompt.

2. **Load real design taste, not model defaults.** Left alone, most
   models converge on the same layouts/colors. Use a design-quality
   skill if one's available in this session; otherwise write your own
   short design-principles note (spacing/type scale, motion restraint,
   "no default purple gradient hero unless the brand calls for it") into
   `CLAUDE.md`. Say what to avoid, not just what to do.

3. **Verify your own work.** If you have browser/screenshot access, load
   the page yourself after building or changing it, check it at desktop
   and narrow/mobile widths, and fix anything visibly broken before
   calling it done. If something's still off, ask for a screenshot of
   the specific problem rather than a text description.

4. **Give it a real visual system (`design.md`).** A design skill
   improves *general* taste, not this project's specific identity. Write
   or source a `design.md` — one file with the concrete visual system
   for this brand (hex color palette, type scale, spacing scale, corner
   radii, shadow style) — and apply it while explicitly preserving
   existing layout/structure/animation. Free sources: **getdesign.md**
   (300+ real product design systems, no signup) and **aura.build**'s
   design.md library.

5. **Replace stock imagery with on-brand imagery.** Once product context
   and visual system both exist, source or generate imagery that matches
   both the brand *and* the specific copy next to it — not generic
   decoration. Use the stock-photo/icon APIs above, or generate original
   images if the agent supports it (use planning mode first if image
   generation is rate-limited).

6. **Borrow layout ideas, not just colors.** Structure can still read as
   "default AI layout" even with original colors — most noticeable in
   the hero section. Pull 2-3 real reference screenshots (Pinterest,
   Awwwards, Dribbble) for sections you're unhappy with and use them as
   *composition* inspiration, not a copy target.

7. **Polish weak components individually.** Fix generic-feeling pieces
   (nav, buttons, a section background) in isolation rather than
   re-prompting the whole page. Free component sources: **reactbits.dev**
   and **fancycomponents.dev** (fully free, open-source), **recent.design**
   (free inspiration/components), **21st.dev** (free browsing, ~2
   copies/day unauthenticated cap), plus the shadcn/Figma MCPs above if
   installed. If the page feels sluggish from heavy animation, ask for a
   performance-optimization pass — usually one cheap follow-up prompt.

**Checkpoint with git as you go** (local commits per stage that lands
well — free rollback points, no remote needed) and **deploy last**, once
it's right locally, with sharing set to public.

**Explicitly excluded, not free despite how it's sometimes described:**
**The Noun Project API** is a 30-day trial only, then $25/month minimum —
use Iconify instead for icons. **motionsites.ai** is mostly paywalled;
only its "Copy"-labeled templates (no lock icon) are actually free — skip
the "Premium" ones unless you're paying for them.
