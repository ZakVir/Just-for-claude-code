# Design & asset MCPs and APIs for AI agents

A reference of MCP servers and public APIs an agent can use for design
files, UI components, stock assets, icons, fonts, and templates while
working through the `polished-landing-page` stages (mainly Stage 5 —
imagery, and Stage 7 — components). Bundled with that skill; not a
standalone skill itself.

Every "free" claim below was checked directly against the resource's own
docs/pricing page before being added — see the verdict on each entry.
Two entries were corrected from how they're often described online (Figma
MCP, The Noun Project) — see their notes.

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

## Design files & design systems (MCP)

### Figma MCP Server
- **Link:** https://developers.figma.com/docs/figma-mcp-server/
- **What it does:** Tools include `download_assets` (export icons/images
  as SVG/PNG/JPG/PDF), `search_design_system`, `get_libraries` (community
  + org UI kits), `get_design_context`, `generate_figma_design` (turn
  live UI into Figma layers).
- **Free access:** ⚠️ Free *during beta only* — Figma's own docs state
  this will become a paid, usage-based feature later. Don't build a
  process that assumes it stays free.
- **Add it:**
  ```
  claude mcp add --transport http figma https://mcp.figma.com/mcp
  ```
  First use triggers a Figma OAuth login.

## UI component generation (MCP)

### shadcn/ui MCP — Shadcn Space
- **Link:** https://shadcnspace.com/mcp
- **What it does:** Real shadcn/ui component data (props, variants,
  blocks) so the agent generates accurate code instead of guessing.
- **Free access:** Confirmed free for the MCP server itself (Shadcn
  Space's own FAQ: *"Yes, you can connect your IDE and start using the
  MCP Server for free"*). A separate paid "All Access Pass" exists for
  something beyond the MCP — not required for this use case.
- **Add it:** follow the connect flow at
  https://shadcnspace.com/docs/getting-started/mcp-server-docs

### 21st.dev
Already covered in the main skill's resource table — free to browse/copy
with a ~2/day unauthenticated cap. Also installable via `npx shadcn add`
and its Magic MCP integration from the site.

### Other component MCPs (not independently verified — check before relying on them)
- **Shadcn Studio MCP** (shadcnstudio.com/mcp) — 700+ blocks, needs a
  Node.js + Tailwind project.
- **FlyonUI Tailwind MCP** (flyonui.com/mcp) — 500+ Tailwind blocks.
- **Storybook MCP** (github.com/storybookjs/mcp) — pulls previews from
  *your own* running Storybook instance, not a public library.

## Stock photos / video / icons / fonts (plain APIs — no MCP needed)

These are simple enough that an agent can just call them with `curl`/
`fetch`; no MCP wrapper required.

| API | Link | Free access | Key needed |
|---|---|---|---|
| Unsplash | unsplash.com/developers | Free "Demo" tier: 1,000 req/hr. Paid Enterprise tier exists for scale/Unsplash+ | Yes — free Access Key via app registration |
| Pexels | pexels.com/api | Free — Pexels' own page: *"It's free."* Default rate limit, liftable with attribution for larger apps | Yes — free key via signup |
| Pixabay | pixabay.com/api/docs | Free, 100 req/60s default limit, attribution requested | Yes — free key via account |
| Iconify | iconify.design/docs/api | Free, public service, 300k+ icons from 200+ open sets | **No key at all** |
| Google Fonts Developer API | developers.google.com/fonts/docs/developer_api | Free in practice (standard Google Cloud API), though the docs page itself doesn't state pricing explicitly — cite Google Cloud's general API terms if you need a source | Yes — Google API key |

### Corrected: The Noun Project API
- **Link:** https://thenounproject.com/developers/
- **What it's often described as:** a free icon/photo API.
- **What it actually is:** a **30-day free trial only** (1,000 calls/day
  service, 150/day icons), then pay-per-use ($0.0025–0.0095/call) with a
  **$25/month minimum**. Don't list this as "free" — use Iconify instead
  for free icon access; it covers the same need with no key and no time
  limit.

### Not independently verified — spot-check before relying on them
These are smaller/community MCP wrappers around the plain APIs above (or
similar services). The underlying APIs they wrap are generally free per
their own docs, but the MCP wrapper projects themselves are third-party
and weren't checked here:
- **Unsplash MCP Server** — github.com/douglarek/unsplash-mcp-server (local, Go, needs your own free Unsplash key)
- **Pexels MCP** — mcpservers.org/servers/codechap/mcp-server-pexels
- **Pixabay MCP Server** — mcpservers.org/servers/Unlock-MCP/pixabay-mcp-server
- **Sketchfab MCP** (3D models) — mcpservers.org/servers/gregkop/sketchfab-mcp-server
- **Freesound MCP** (audio/SFX) — mcpservers.org/servers/johnkimdw/freesound-mcp-server

## Site builders (MCP) — outside this skill's scope, listed for reference

- **Webflow MCP** — developers.webflow.com/mcp/reference/overview — needs a Webflow account + API token.
- **Canva MCP** — canva.dev/docs/apps/mcp-server — needs a Canva account.
- **Framer Plugin MCP** — github.com/Sheshiyer/framer-plugin-mcp — needs a Framer account/project.

None of these three were free-tier-verified here since they're full
platform accounts, not simple asset sources — check their own pricing
before assuming free use.
