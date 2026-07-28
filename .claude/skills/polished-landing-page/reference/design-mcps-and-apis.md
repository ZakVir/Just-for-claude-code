# Design & asset MCPs and APIs for AI agents

A reference of MCP servers and public APIs an agent can use for design
files, UI components, stock assets, icons, fonts, and templates while
working through the `polished-landing-page` stages (mainly Stage 5 —
imagery, and Stage 7 — components). Bundled with that skill; not a
standalone skill itself. `bootstrap-prompt.md` in this folder turns this
into a one-shot install script you can paste into any Claude Code chat.

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
