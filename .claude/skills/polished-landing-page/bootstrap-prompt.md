# Landing page setup: install MCPs + adopt design guidelines

> **How to use this file:** paste this entire document as your first
> message in a new Claude Code chat. It's self-contained — it doesn't
> depend on any other file existing in the project. Claude will install
> every MCP server below (pausing to ask for API keys/accounts it can't
> generate itself), then follow the guidelines for the rest of the
> session whenever it's building a landing page, marketing site, or
> similar.

---

## Instructions to Claude

Work through every server below, in order. For each one that needs an
API key, account, or a web-based connect flow, **ask me for it and wait**
— don't skip the server, and don't fabricate a credential. If a step
needs a toolchain you don't have (Go, Node.js, git), tell me what's
missing rather than silently skipping. At the end, list what actually
got installed vs. what's still pending on something from me.

### Design files

**Figma MCP** — free during Figma's current beta (their docs say it
becomes paid usage-based later); only needs OAuth, no key to collect:
```
claude mcp add --transport http figma https://mcp.figma.com/mcp
```

### UI components

**shadcn/ui MCP (Shadcn Space)** — free. Walk me through the connect
flow at https://shadcnspace.com/docs/getting-started/mcp-server-docs,
which generates a personal remote URL; add that as `mcpServers.shadcn`.

**Shadcn Studio MCP** — needs a Node.js + Tailwind project already set
up. Confirm I have one, then follow the integration steps at
https://shadcnstudio.com/mcp.

**FlyonUI Tailwind MCP** — follow the setup at https://flyonui.com/mcp
and add the resulting `mcpServers` entry.

**Storybook MCP** — only useful if I have a running Storybook instance.
Ask if I do; if yes, clone https://github.com/storybookjs/mcp, point it
at my Storybook URL, and add as a local `command` server per its README.

**21st.dev** — not a traditional MCP install: use its Magic MCP/CLI
integration from https://21st.dev, or just use `npx shadcn add` to pull
components directly when needed. Free to browse/copy with a ~2/day
unauthenticated cap.

### Stock photos / video / 3D / audio (all need a free API key from me)

For each of these: ask me if I already have the key, or want to sign up
for one now (all are free-tier signups, no card required for any of
them), then install.

**Unsplash MCP Server** — needs Go 1.24+ and a free key from
unsplash.com/developers (1,000 req/hr free tier):
```
git clone https://github.com/douglarek/unsplash-mcp-server
cd unsplash-mcp-server && make build
claude mcp add unsplash -e UNSPLASH_ACCESS_KEY=<key> -- <path>/cmd/server/unsplash-mcp-server
```

**Pexels MCP** — needs a free key from pexels.com/api. Clone the repo at
https://mcpservers.org/servers/codechap/mcp-server-pexels, follow its
setup, add as a local server with the key in `env`.

**Pixabay MCP Server** — needs a free key from a Pixabay account. Clone
https://mcpservers.org/servers/Unlock-MCP/pixabay-mcp-server, follow its
setup, add as a local server with the key in `env`.

**Sketchfab MCP** — needs a Sketchfab account + API token. Clone
https://mcpservers.org/servers/gregkop/sketchfab-mcp-server, follow its
setup, add as a local server with the token in `env`.

**Freesound MCP Server** — needs a free Freesound API key. Clone
https://mcpservers.org/servers/johnkimdw/freesound-mcp-server, follow
its setup, add as a local server with the key in `env`.

### Site builders (need an existing account on each platform)

**Webflow MCP** — needs a Webflow account + API token/OAuth. Follow
https://developers.webflow.com/mcp/reference/overview once I confirm I
have (or want) an account.

**Canva MCP** — needs a Canva account + API access. Follow
https://www.canva.dev/docs/apps/mcp-server/ once confirmed.

**Framer Plugin MCP** — needs a Framer account + project. Clone
https://github.com/Sheshiyer/framer-plugin-mcp and follow its setup once
confirmed.

### Fallback: plain HTTP APIs, no MCP/install needed

If any install above fails or I'd rather skip a local build, these work
as direct HTTP calls instead — same underlying free tiers as their MCP
wrappers, just called with `curl`/`fetch`:

| Need | Endpoint | Key? |
|---|---|---|
| Icons | `api.iconify.design` | **No key** |
| Font loading | `fonts.googleapis.com/css2?family=...` | **No key** |
| Photos | `api.unsplash.com`, `api.pexels.com`, `pixabay.com/api` | Yes, free, one per service |

**Skip The Noun Project's API specifically** — unlike the others above,
it's a 30-day trial then $25/month minimum, not an ongoing free tier.
Its *website* has free manual downloads, but that's not usable
programmatically. Use Iconify instead for the same need.

### Confirm what's active

After working through the list, show me what's actually installed
(`claude mcp list` or equivalent) versus what's still waiting on a
decision or credential from me.

### Actively use what's installed — don't just have it available

Once a source is set up, prefer it over guessing or hand-rolling:

- Need a photo, icon, 3D model, sound, or font for a page? Pull it from
  an installed source instead of describing a placeholder or leaving a
  `TODO`.
- Working from an existing Figma file, or need to check a design system
  against a spec? Use the Figma MCP instead of asking me to describe it.
- Building shadcn/ui components? Pull real component/prop data from the
  shadcn MCP instead of guessing prop names.
- Deploying to Webflow, editing in Canva, or prototyping in Framer? Use
  the matching MCP instead of walking me through the manual UI.

If none of these apply to what I'm asking for, that's fine — don't force
them in. But when the task is genuinely "get an image / icon / 3D asset
/ sound / font / component / site edit," use the tool instead of
skipping it.

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
   decoration. Use the installed MCPs/APIs above, or generate original
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
   copies/day unauthenticated cap), plus the shadcn/Figma MCPs above. If
   the page feels sluggish from heavy animation, ask for a performance-
   optimization pass — usually one cheap follow-up prompt.

**Checkpoint with git as you go** (local commits per stage that lands
well — free rollback points, no remote needed) and **deploy last**, once
it's right locally, with sharing set to public (Webflow/Canva MCPs above
can help here if the project uses either platform).

**Explicitly excluded from "free," despite how it's sometimes
described:** **The Noun Project's API** — 30-day trial only, then
$25/month minimum (its website's manual downloads are free, its API for
programmatic access isn't). **motionsites.ai** — mostly paywalled; only
its "Copy"-labeled templates (no lock icon) are actually free.
