# Landing page setup: install the skill + every MCP, all connected

> **How to use this file:** paste this entire document as your first
> message in a new Claude Code chat, in any project. It's fully
> self-contained — it embeds the actual skill files below, so it doesn't
> need this repo or the skill to already be installed anywhere. Claude
> will write the skill into the current project, install every MCP
> server (pausing to ask for API keys/accounts it can't generate
> itself), and then use both together for the rest of the session.

---

## Instructions to Claude

Do these in order:

### Step 0 — Install the skill itself

Create these two files in the current project **exactly as embedded
below** (don't paraphrase or summarize them — write the literal
content):

- `.claude/skills/polished-landing-page/SKILL.md`
- `.claude/skills/polished-landing-page/reference/design-mcps-and-apis.md`

Once written, this makes `polished-landing-page` a real, invocable skill
in this project going forward (not just one-off guidance for this
session) — confirm it shows up in the available-skills list after
writing it.

<details>
<summary>Embedded file: <code>SKILL.md</code> (click to expand if your client collapses this)</summary>

````markdown
---
name: polished-landing-page
version: "0.2.0"
description: Guide a coding agent through a 7-stage process for building a landing page or marketing site that looks like a designed product, not generic AI output. Covers scoping, design taste, self-verification, brand visual system, original imagery, layout reference, and component-level polish. Includes a vetted list of free-to-use design/component resources.
argument-hint: "[project description]"
allowed-tools: Bash, Read, Write, Edit, WebFetch, AskUserQuestion
user-invocable: true
---

# /polished-landing-page

A checklist-driven workflow for building landing pages that don't read as
"AI slop" — the same green-gradient-hero, same rounded-card, same generic
layout that shows up whenever a coding agent gets a one-line prompt and no
other direction. The fix isn't a better one-shot prompt; it's giving the
agent the same inputs a human designer would use: a clear brief, a real
visual system, real reference material, and a self-check loop.

This is a **process skill** — it has no bundled scripts, just this guide
plus a bundled reference doc (`reference/design-mcps-and-apis.md`) of
MCP servers and APIs for sourcing design assets. Follow the stages below
yourself, using whatever tools you have (Bash, Read/Write/Edit, browser/
screenshot tooling if available). Skip stages that don't apply to the
project; this is a checklist to adapt, not a rigid pipeline.

## Origin

Adapted from three short-form videos on building landing pages with an AI
coding agent: a 7-stage OpenAI Codex tutorial (the backbone of this
skill), and two follow-up clips covering an alternative agent (Manus)
plus a resource roundup. The underlying ideas are general to any coding
agent — this version reframes them for Claude Code specifically and is
meant to be edited as you find what works. The resource list below was
independently checked for actual free-tier access before being added
here — see [Resources](#resources-checked-for-free-access).

## Stage 1 — Scope it before you design anything

A one-line prompt ("build a landing page for X") makes the agent guess
who the page is for and what it should do, and it will guess wrong before
it guesses right. Before writing any code, pin down:

- **Audience** — who is this page for?
- **Product/purpose** — what does it do, in plain language?
- **Primary action** — what is the ONE thing you want a visitor to do?
  (join a waitlist, sign up, book a call, buy something.) This is the
  single most important line in the brief — it decides the CTA, the
  page structure, and what counts as "done."

Write this into the project's `CLAUDE.md` (or create one) so every future
session — not just this one — starts with the same context instead of
re-explaining it per prompt. Also add an explicit autonomy instruction at
the top: *"When you can verify or run something yourself, do it — don't
ask the user to do it for you."* Coding agents default to asking for
things they're fully capable of doing themselves (starting a dev server,
checking the result); naming this once in `CLAUDE.md` removes a lot of
friction.

**For anything beyond a single page, write a short PRD first.** A
paragraph brief is enough for a one-page site; for a multi-page site or
app, put the brief, the page/route list, and any brand material into a
real spec file (a `PRD.md`, or separate files per concern) and have the
agent read all of it before starting, rather than describing everything
inline in one prompt. This is the same idea as the `CLAUDE.md` context
file above, just scaled up — more files, reviewed once, instead of one
long prompt re-explained every session.

## Stage 2 — Load real design taste, not defaults

Left alone, most models converge on the same handful of layouts and color
choices — technically fine, visually interchangeable with every other
AI-generated site. Counter this explicitly:

- If a design-quality skill is installed in this session (check `/help`
  or the available-skills list), invoke it before generating anything.
- If none exists, write your own short design-principles note (spacing
  scale, type scale, motion restraint, "no default purple/violet gradient
  hero unless the brand calls for it") and put it in `CLAUDE.md` or a
  `design-principles.md` the agent reads first.
- Be explicit about what to avoid, not just what to do — negative
  instructions ("don't use a generic vendor site-builder skill/template
  for the actual design work") are as important as positive ones, since
  agents default to whatever's fastest.
- **React Bits** (reactbits.dev) is a free, open-source (MIT) library of
  animated React components — no signup, no paid tier. If the project is
  React-based and needs polished motion/interaction without hand-rolling
  it, point the agent at it directly instead of letting it default to
  static/generic components.

## Stage 3 — Make the agent verify its own work

Working code isn't the same as a page that looks right. If your agent has
browser/screenshot access, tell it (in `CLAUDE.md`, once) to always:

1. Load the page itself after building or changing it.
2. Check it at both a desktop and a narrow/mobile width.
3. Fix anything visibly broken before reporting "done."

If it doesn't self-correct on the first request, hand it back a
screenshot of the specific problem rather than describing it in words —
layout issues are much easier to fix from an image than from text.

## Stage 4 — Give it a real visual system (`design.md`)

A design-quality skill improves *general* taste; it doesn't give this
particular project its own identity. Without a project-specific visual
system, two different agents given the same skill will still converge on
similar palettes. Fix this with a `design.md`: one file describing the
concrete visual system for *this* brand — color palette (with hex
values), type scale, spacing scale, corner radii, shadow style.

- Write your own, or start from an existing open design-system reference
  and adapt it:
  - If `projects/design-reference-mcp/` exists in this repo, prefer it
    first — its `repo` engine covers 6 design-system doc sites plus
    Coolors palette parsing in one call, and `extract_tokens` can pull a
    real color/type/spacing system straight off any live URL you like.
  - **getdesign.md** — a free, no-signup catalog of 300+ `design.md`
    write-ups for well-known products (Apple, Figma, Stripe, Tesla,
    etc.). Some paid add-ons exist (custom private write-ups, a starter
    kit) but the core catalog is free to browse and use.
  - **aura.build**'s free design.md library — reportedly free to browse
    (per third-party sources; the site is a client-rendered app that's
    hard to verify directly, so do a quick manual check before relying
    on it). The *builder tool* on the same site is a separate, metered
    product (10 free prompts/month, paid beyond that) — don't confuse
    the free reference library with the paid builder.
- Attach or paste the file, then ask the agent to apply it while
  explicitly preserving the layout, structure, and any animation work
  already done — you're re-skinning, not rebuilding.

## Stage 5 — Replace stock imagery with on-brand imagery

Stock photos rarely match a specific brand's visual system, and generic
AI landing pages are easy to spot partly because of mismatched imagery.
Once `CLAUDE.md` (product context) and `design.md` (visual system) both
exist, the agent has enough context to generate or source imagery that
actually matches:

- Create an `assets/` folder and reference it in `CLAUDE.md` so the agent
  knows where generated/sourced images belong.
- Ask for imagery that matches both the design system *and* the specific
  copy/content next to it — not generic decoration.
- If the agent supports a planning mode, use it before an image-heavy
  task, especially if image generation is rate-limited — review the plan
  before letting it burn budget on the wrong images.
- Generating original imagery isn't always the right call — free stock/
  icon/font APIs (Unsplash, Pexels, Pixabay, Iconify, Google Fonts) cover
  a lot of ground cheaply when the brand doesn't need fully custom
  photography. See `reference/design-mcps-and-apis.md` for the vetted
  list, including which need an API key and which don't.

## Stage 6 — Borrow layout ideas, not just colors

Copy and color can be original while the page *structure* still reads as
"default AI layout" — most noticeable in the hero section, since it's the
first thing anyone sees. Layout is hard to specify in text, so show,
don't tell:

- Pull 2-3 real reference screenshots for the section you're unsure about
  (Pinterest boards, Awwwards/Dribbble showcases, or direct competitors
  are good sources). If `projects/design-reference-mcp/` exists in this
  repo, its `screenshot` engine covers 12 of these live-site sources
  directly (Awwwards, SiteInspire, and others) — use it instead of
  fetching manually.
- Give the agent the screenshot(s) and ask it to use them as
  *composition* inspiration — what goes where, not a pixel copy.
- Only do this for sections you're actually unhappy with; don't
  re-litigate parts that already look good.

## Stage 7 — Polish weak components individually

By this point the overall design should be solid; some individual
components (nav, buttons, a section background) may still feel generic.
Rather than re-prompting the whole page, fix these in isolation:

- Component libraries have drop-in pieces — nav patterns, animated
  backgrounds/shaders, buttons — you can hand the agent as a reference or
  literal snippet:
  - **fancycomponents.dev** and **reactbits.dev** — fully free and
    open-source, no signup.
  - **recent.design** (formerly godly.website — the old domain redirects
    here) — free design-inspiration/component gallery to browse, no
    signup wall on content.
  - **21st.dev** — free to browse and copy components without an
    account, but capped at ~2 copies/day unauthenticated; a paid tier
    removes the cap and adds AI generation credits. Fine for occasional
    use, worth knowing the limit exists before relying on it mid-build.
  - If a **Figma MCP server**, **shadcn/ui MCP**, or this repo's own
    `projects/design-reference-mcp/` is connected to this session, prefer
    pulling real component/design data through one of them over guessing
    from a screenshot — see `reference/design-mcps-and-apis.md` for what
    each covers and how free it actually is.
- Apply component-level changes one at a time so you can evaluate each
  before moving to the next.
- If the page feels sluggish after adding heavy animation/motion effects,
  explicitly ask the agent to optimize for performance — this is usually
  a single, cheap follow-up prompt, not a redesign.

## Checkpoint and ship

- **Checkpoint with git as you go.** Ask the agent to make a local commit
  after each stage that lands well, with a clear message. This gives you
  free rollback points if a later stage makes things worse — you don't
  need any remote/hosting setup for this, just local commits.
- **Deploy last.** Once the page is right locally, deploy it (whatever
  your agent's deployment tool/skill is, or a standard host like Vercel/
  Netlify) and make sure sharing is set to public before handing out the
  link. Add a custom domain if this is going to production.

## Resources (checked for free access)

Every link below was independently verified (not just taken from a video)
to actually be usable for free before being added here — see the
per-stage notes above for how each fits into the process.

| Resource | Use it for | Free access |
|---|---|---|
| [reactbits.dev](https://reactbits.dev) | Animated React components | Fully free & open-source (MIT), no signup |
| [fancycomponents.dev](https://fancycomponents.dev) | React components/microinteractions | Fully free & open-source, no signup |
| [recent.design](https://recent.design) | Layout/component inspiration (formerly godly.website) | Free to browse, no signup wall |
| [21st.dev](https://21st.dev) | Component marketplace | Free to browse/copy, ~2 copies/day unauthenticated cap; paid tier removes it |
| [getdesign.md](https://getdesign.md) | `design.md` visual-system references for known products | Core catalog (300+) free, no signup; some paid add-ons exist |
| [aura.build](https://aura.build) | Free `design.md` library (separate from its paid AI builder) | Library is free (the builder tool is a separate metered product — see note below); the site itself is a client-rendered app that automated tools can't read directly, so this rests on external corroboration rather than a first-hand fetch |
| [motionsites.ai](https://motionsites.ai) | Animated-website prompt templates | Freemium — about a third of visible templates (marked "Copy," no lock icon) are free with no apparent signup gate; the rest are "Premium," gated behind $89–349 one-time/annual purchases. Stick to the unlocked "Copy" templates and skip the upsells |
| Pinterest, Awwwards, Dribbble | Layout/visual reference screenshots (Stage 6) | Free to browse |

**Also worth knowing, not landing-page-specific:** blog.vibecoder.me is a
free (no signup) set of guides/learning tracks covering the parts of
AI-assisted coding this skill doesn't — APIs, databases, deployment,
debugging. Useful once the landing page needs to become a real app.

## Notes for editing this skill

This is a first pass — edit stages, swap the resource list for sites you
actually use, or split it into a multi-file skill with bundled reference
docs as it grows. Treat the 7 stages as a checklist to adapt per project,
not a rule to follow rigidly — skip stages that don't apply (e.g. stage 5
is irrelevant if the brand already has a full stock of real photography).
If you add a new resource link, re-verify it's actually free before
adding it here — pricing pages change, and "free" in a video isn't the
same as free today.
````

</details>

<details>
<summary>Embedded file: <code>reference/design-mcps-and-apis.md</code></summary>

````markdown
# Design & asset MCPs and APIs for AI agents

A reference of MCP servers and public APIs an agent can use for design
files, UI components, stock assets, icons, fonts, and templates while
working through the `polished-landing-page` stages (mainly Stage 5 —
imagery, and Stage 7 — components). Bundled with that skill; not a
standalone skill itself.

Every "free" claim below was checked directly against the resource's own
docs/pricing page. Two things are worth flagging up front, both about
*programmatic/API* access specifically (not manual website use, which is
free on both):
- **Figma MCP** is free only during Figma's current beta — their own docs
  say it becomes a paid, usage-based feature later.
- **The Noun Project's API** (not covered below — it has no MCP wrapper
  in this list) is a 30-day trial then $25/month minimum; its *website*
  has genuinely free manual downloads, but that's not what an agent
  calling an API uses. Use Iconify for free, ongoing, keyless icon access
  instead.

## Preferred, if you have this repo: `design-reference-mcp`

Before reaching for the external MCPs below, check whether
`projects/design-reference-mcp/` exists in this repo (it's a sibling
project, not part of this skill). It's a local MCP server purpose-built
for design research and is a better single option than stitching
together several of the external MCPs below — one coherent tool instead
of many, with real guardrails: per-host rate limiting, robots.txt
enforcement, a cache-first policy so nothing is re-fetched, a hard
20-result cap with no "fetch all," and license tagging on every repo
result. It also documents *why* it won't scrape Behance (dead API +
explicit `Disallow` for AI crawlers in their robots.txt) instead of
quietly working around it.

It covers: 30 GitHub component/design-system repos, 6 design-system doc
sites + Coolors palette parsing, 14 curated inspiration galleries, 12
live-site screenshot sources, Google Fonts, and a `design_get_detail` /
`extract_tokens` pair for pulling real colors/fonts/spacing off any live
URL. That's most of Stage 4 (design.md sourcing), Stage 6 (layout
inspiration), and part of Stage 7 (component references) in one server.
It does **not** cover Figma file access, stock photo/icon/3D/audio APIs,
or site-builder platforms (Webflow/Canva/Framer) — those still need the
external MCPs below.

Setup: `cd projects/design-reference-mcp && npm install && npx
playwright install chromium && npm run build`, then
`claude mcp add design-reference -- node
projects/design-reference-mcp/dist/index.js` (all env vars optional —
see its own README for the full client-agnostic install instructions).
Works without any API keys for the repo/scraper engines; Google Fonts
hydration and the optional self-hosted SearXNG wrapper need their own
env vars if you want them.

## How to add an MCP server to Claude Code

```
claude mcp add --transport http <name> <url>          # remote/HTTP server
claude mcp add <name> -- <command> [args...]           # local/stdio server
```

Add `-e KEY=value` for env vars a local server needs (e.g. an API key).
Config lives in `.mcp.json` (project-scoped) or `~/.claude.json`
(user-scoped) — `claude mcp add --scope project|user` picks which.
**Verify exact flags with `claude mcp add --help`** before relying on the
commands below; CLI syntax can drift between Claude Code versions.

---

## Design files & design systems

### Figma MCP Server
- **Link:** https://developers.figma.com/docs/figma-mcp-server/ (tools reference: `.../tools-and-prompts/`)
- **What it does:** `download_assets` (export icons/images as SVG/PNG/JPG/PDF), `search_design_system` (find components/variables/styles), `get_libraries` (community + org UI kits), `get_design_context`, `generate_figma_design` (turn live UI into Figma layers).
- **Free access:** Free during beta; Figma's docs say it becomes paid usage-based later.
- **Add it (remote, preferred):**
  ```
  claude mcp add --transport http figma https://mcp.figma.com/mcp
  ```
  First use triggers Figma OAuth login. A desktop-app server variant also exists.

## UI component generation

### shadcn/ui MCP — Shadcn Space
- **Link:** https://shadcnspace.com/mcp
- **What it does:** Real shadcn/ui component data (props, variants, blocks) so the agent generates accurate code instead of guessing. Endpoints: `/listBlocks`, `/listComponents`, `/search`, `/create-ui`.
- **Free access:** Confirmed free for the MCP server itself (their own FAQ: *"Yes, you can connect your IDE and start using the MCP Server for free"*). A separate paid "All Access Pass" exists for something beyond the MCP.
- **Add it:** follow the connect flow at https://shadcnspace.com/docs/getting-started/mcp-server-docs — it generates a personalized remote `url` entry; add that to `mcpServers`.

### Shadcn Studio MCP
- **Link:** https://shadcnstudio.com/mcp
- **What it does:** 700+ blocks, 1000+ components, Tailwind integration, design-to-code.
- **Add it:** requires a Node.js + Tailwind project already set up; follow the MCP integration steps on the page (not independently verified for free access here — check its pricing before assuming full parity with Shadcn Space).

### FlyonUI Tailwind MCP
- **Link:** https://flyonui.com/mcp
- **What it does:** 500+ Tailwind blocks + components as ready-to-use UI sections.
- **Add it:** follow the MCP setup on the page (component library access + client `mcpServers` entry). Not independently verified for free access here.

### Storybook MCP
- **Link:** https://github.com/storybookjs/mcp
- **What it does:** Pulls component previews and metadata from *your own* running Storybook instance — not a public component library.
- **Add it:** clone the repo, point it at your running Storybook, add as a local `command` server per its README.

### 21st.dev
- **Link:** https://21st.dev
- **What it does:** "npm for design engineers" — community registry of shadcn-compatible components; integrates with AI coding tools.
- **Free access:** Free to browse/copy, ~2 copies/day unauthenticated; paid tier removes the cap and adds AI generation credits.
- **Add it:** use its Magic MCP / CLI integration from the site, or install components directly with `npx shadcn add`.

## Stock photos / video / 3D / audio

### Unsplash MCP Server
- **Link:** https://github.com/douglarek/unsplash-mcp-server
- **What it does:** Search + retrieve photos via the Unsplash API.
- **Needs:** a free `UNSPLASH_ACCESS_KEY` (register an app at unsplash.com/developers — free "Demo" tier, 1,000 req/hr), and Go 1.24+ to build.
- **Add it (local, from repo):**
  ```
  git clone https://github.com/douglarek/unsplash-mcp-server
  cd unsplash-mcp-server && make build
  claude mcp add unsplash -e UNSPLASH_ACCESS_KEY=<your_key> -- <source_dir>/cmd/server/unsplash-mcp-server
  ```

### Pexels MCP
- **Link:** https://mcpservers.org/servers/codechap/mcp-server-pexels
- **What it does:** Photo + video search, curated content.
- **Needs:** a free Pexels API key (pexels.com/api — their own page says "It's free," default rate limit liftable with attribution).
- **Add it:** follow the repo linked on the page; add as a local `command` server with the key in `env`.

### Pixabay MCP Server
- **Link:** https://mcpservers.org/servers/Unlock-MCP/pixabay-mcp-server
- **What it does:** Search and retrieve royalty-free images and videos via the Pixabay API.
- **Needs:** a free Pixabay API key (100 req/60s default limit).
- **Add it:** follow the repo on the page; add as a local server with the key in `env`.

### Sketchfab MCP
- **Link:** https://mcpservers.org/servers/gregkop/sketchfab-mcp-server
- **What it does:** Search, inspect, and download 3D models.
- **Needs:** a Sketchfab account + API token. Not independently verified for free-tier limits here — check Sketchfab's own terms for what's downloadable for free vs paid/licensed.
- **Add it:** follow the repo on the page; add as a local server with the token in `env`.

### Freesound MCP Server
- **Link:** https://mcpservers.org/servers/johnkimdw/freesound-mcp-server
- **What it does:** Search and discover audio/SFX from Freesound.org.
- **Needs:** a free Freesound API key.
- **Add it:** follow the repo on the page; add as a local server with the key in `env`.

## Site builders

### Webflow MCP
- **Link:** https://developers.webflow.com/mcp/reference/overview
- **What it does:** Create/manage sites and CMS via the Webflow API.
- **Needs:** a Webflow account + API token/OAuth.
- **Add it:** follow the reference for the remote endpoint + token.

### Canva MCP
- **Link:** https://www.canva.dev/docs/apps/mcp-server/
- **What it does:** Template creation and visual editing.
- **Needs:** a Canva account + API access.
- **Add it:** follow the Canva dev docs, then add the resulting server entry.

### Framer Plugin MCP
- **Link:** https://github.com/Sheshiyer/framer-plugin-mcp
- **What it does:** Prototyping, animation, publishing.
- **Needs:** a Framer account + project.
- **Add it:** clone the repo, add as a local `command` server per its setup instructions.

None of these three site-builder MCPs were free-tier-verified here since they're full platform accounts, not simple asset sources — check their own current pricing before assuming free use.

## Plain public APIs (no MCP wrapper needed)

These are simple enough that an agent can just call them with `curl`/
`fetch` directly — useful even if you skip installing the MCP wrapper
above (or as a fallback if a wrapper install fails).

| API | Link | Free access | Key needed |
|---|---|---|---|
| Unsplash | unsplash.com/developers | Free "Demo" tier: 1,000 req/hr. Paid Enterprise tier exists for scale/Unsplash+ | Yes — free Access Key via app registration |
| Pexels | pexels.com/api | Free — "It's free." Default rate limit, liftable with attribution for larger apps | Yes — free key via signup |
| Pixabay | pixabay.com/api/docs | Free, 100 req/60s default limit, attribution requested | Yes — free key via account |
| Iconify | iconify.design/docs/api | Free, public service, 300k+ icons from 200+ open sets | **No key at all** |
| Google Fonts | fonts.googleapis.com (CSS delivery) | **Free, no key** for loading fonts via the CSS endpoint; a key is only needed for the separate *metadata* Developer API | No key for font loading; yes for metadata API |
| LottieFiles / Lottie | lottiefiles.com | Free — animations as JSON, fetchable by URL and played with any Lottie player | No key for public/shared animations |

The Noun Project's API is deliberately not listed here — see the flag at
the top of this file. Use Iconify instead.
````

</details>

### Step 1 — Install `design-reference-mcp` if this repo has it

Check whether `projects/design-reference-mcp/` exists in the current
project (it's this repo's own local MCP server, not part of the skill
you just wrote — see it for full details). If it exists:

```
cd projects/design-reference-mcp
npm install
npx playwright install chromium
npm run build
claude mcp add design-reference -- node projects/design-reference-mcp/dist/index.js
```

It works without any API keys for its repo/scraper engines (30 component/
design-system repos, 14 inspiration galleries). Only its optional Google
Fonts hydration and self-hosted SearXNG wrapper need env vars — ask me
before setting those up, don't skip the base install waiting on them.

If this directory doesn't exist (you're not in this repo), skip this
step and rely on the external MCPs in Step 2 instead.

### Step 2 — Install every external MCP server

Now work through every server documented in the `reference/design-mcps-and-apis.md` you just wrote (Figma, Shadcn Space, Shadcn Studio, FlyonUI, Storybook, 21st.dev, Unsplash, Pexels, Pixabay, Sketchfab, Freesound, Webflow, Canva, Framer). For each:

- If it's a simple remote add (Figma) — just run it, no need to ask.
- If it needs an API key, account, or a web-based connect flow — **ask me for it and wait**. Don't skip the server, and don't fabricate a credential.
- If it needs a toolchain you don't have (Go, Node.js, git) — tell me what's missing rather than silently skipping.
- **Fallback:** if an MCP install fails or I'd rather skip a local build, the "Plain public APIs" table in the reference doc covers the same ground via direct `curl`/`fetch` calls instead — use that as a substitute, not a reason to give up on the capability entirely.
- **Skip The Noun Project's API specifically** even if you find it elsewhere — see the flag in the reference doc; use Iconify instead.

### Step 3 — Confirm what's connected

Show me what's actually installed (`claude mcp list` or equivalent) versus what's still waiting on a decision or credential from me, and confirm the `polished-landing-page` skill is showing up as available.

### Step 4 — Actually use all of it, together, for the rest of this session

This is the point of doing all the steps above — don't just have the skill and the MCPs sitting there unused:

- Follow the `polished-landing-page` skill's 7 stages for any landing-page/marketing-site work in this session.
- Whenever a stage calls for an image, icon, 3D asset, sound, font, component, or design-system data, pull it from an installed MCP or the fallback API instead of describing a placeholder, leaving a `TODO`, or guessing from memory.
- For design research specifically (design.md sourcing, layout inspiration, component references) — prefer `design-reference-mcp` if it's installed; it's the single unified option covering most of that ground.
- Working from an existing Figma file, or need to check a design system against a spec? Use the Figma MCP instead of asking me to describe it.
- Building shadcn/ui components? Pull real component/prop data from the shadcn MCP instead of guessing prop names.
- Deploying to Webflow, editing in Canva, or prototyping in Framer? Use the matching MCP instead of walking me through the manual UI.

If a task genuinely doesn't call for any of these, don't force them in — but when it's "get an image / icon / font / component / site edit / design reference," use the tool.
