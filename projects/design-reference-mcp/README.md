# design-reference-mcp

A local MCP server that gives an agent (Maya) fast, cache-first access to
design references: component libraries, design systems, curated galleries,
Behance, Cosmos, and live-site screenshots — plus a self-growing local index
of saved keepers.

Node 18+, TypeScript, the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).

## What it does

Six tools, routed across four engines + one wrapper:

| Tool | What it does |
| --- | --- |
| `design_search` | Search across sources by query + **required** `site_type` (see below), optionally narrowed by `category`/`source`/`color`. Returns ≤ `limit` (default 5, max 20) results. |
| `design_get_detail` | Fetch the full image (base64) + metadata for a result URL. Screenshots live-site sources. |
| `extract_tokens` | Pull colors/fonts/spacing/radius/shadows from a live URL via computed styles. |
| `list_sources` | Return the full source registry (what each source is good for) plus the full `site_type` list. |
| `save_reference` | Save a reference into the local keeper index (`cache/keepers/`). |
| `retrieve_saved` | Search the local keeper index — always checked before any network call. |

### `site_type` — required on every `design_search` call

Every search has to say up front what it's actually looking for: a public
page that **advertises or sells the business**, or an actual **logged-in
user/admin product surface**. Those draw from completely different parts of
the registry — no gallery here has screenshots labeled "admin dashboard" —
so the tool won't guess; the MCP protocol layer rejects the call outright if
`site_type` is missing or invalid (see `src/config.ts`'s `SITE_TYPES` for the
full definitions).

| `site_type` | kind | What it's for |
| --- | --- | --- |
| `marketing-landing-page` | marketing | A public page that advertises the business and drives a signup/purchase |
| `saas-landing-page` | marketing | A marketing page for a software product specifically |
| `pricing-page` | marketing | Plans/tiers/pricing presentation |
| `portfolio-site` | marketing | Personal/agency/freelancer portfolio |
| `blog-content-site` | marketing | Editorial or blog-style content site |
| `ecommerce-storefront` | marketing | Public product-browsing storefront |
| `admin-dashboard` | product | Internal staff tool — tables, filters, bulk actions |
| `user-dashboard` | product | Logged-in customer's account/home screen |
| `saas-app-ui` | product | General in-product screens beyond the marketing site |
| `checkout-flow` | product | Cart, payment, order-confirmation screens |
| `onboarding-flow` | product | Multi-step signup / first-run wizard |
| `settings-panel` | product | Account settings / preferences / configuration |
| `mobile-app-screen` | product | Native or responsive mobile app UI reference |
| `component-library` | product | Not a page — just browsing components/icons/tokens directly |

`marketing` kinds route to the scraper/screenshot galleries + landing-page
template repos (visual inspiration for a public page). `product` kinds route
to the `repo` engine's component-lib and design-system sources — the actual
building blocks you'd use to build a working admin/user app, since this
registry's galleries don't curate app-UI screenshots. Passing an explicit
`source` overrides `site_type` entirely; `category` further narrows within
whatever `site_type` selected.

Engines:

- **`api`** — Behance, Google Fonts (official APIs, keyed).
- **`repo`** — 30 GitHub component/design-system repos + 6 design-system doc
  sites + Coolors URL parsing (no network needed for search).
- **`scraper`** — 14 curated galleries (Land-book, Lapa Ninja, Refero, …),
  fetched and parsed with cheerio.
- **`screenshot`** — 12 "the value is the live site" sources (Awwwards,
  SiteInspire, single-page-only Dribbble/Nicelydone, …), captured with
  headless Playwright.
- **`wrapper`** — Cosmos via the third-party [parse.bot](https://parse.bot)
  API. Optional; treated as best-effort.
- **`auth`** — **stub only, disabled in v1.** Gated sources (Savee,
  Pinterest, Mobbin full, Page Flows) return a free alternative instead of
  being scraped or logged into.

## Guardrails

- **Rate limits** (`src/util/ratelimit.ts`): per-host token bucket + min
  delay + concurrency cap. Behance stays under 120/hr (cap is 150/hr/IP).
  Scrapers wait 2–5s between requests, concurrency 1 per host. Screenshots
  are fully serialized (concurrency 1, globally).
- **Cache-first**: `retrieve_saved` and the on-disk `cache/urlcache/` are
  always checked before a network call. A URL already in the cache is never
  re-fetched.
- **Per-request caps**: `design_search` never returns more than `limit`
  (default 5, max 20). There is no "fetch all" path anywhere in the codebase.
- **robots.txt**: checked before every scrape/screenshot
  (`src/util/robots.ts`), with a realistic User-Agent and exponential
  backoff on HTTP 429/503.
- **No auth engine**: `src/engines/auth.ts` is a stub that is never imported
  by `index.ts`. Gated sources short-circuit to
  `"Not available free — try {alternative}."`
- **License field**: every repo result carries a `license` (most are MIT) so
  Maya knows what's safe to reuse.

## Setup

```bash
cd projects/design-reference-mcp
npm install
npx playwright install chromium   # needed for the screenshot engine + extract_tokens
cp .env.example .env              # fill in keys — all optional for v0
npm run build
```

### Environment variables

| Var | Used by | Required? |
| --- | --- | --- |
| `BEHANCE_API_KEY` | `api` engine (Behance) | No — degrades to "not configured" |
| `GOOGLE_FONTS_KEY` | `api` engine (Google Fonts font hydration) | No |
| `PARSE_BOT_KEY` | `wrapper` engine (Cosmos) | No — optional, third-party |

Without any keys, `design_search`/`design_get_detail` still work great over
the `repo` and `scraper` engines (30 repos, 6 design-system docs, 14
galleries) — that's the v0 slice, useful from the first run.

## Local testing (CLI mode)

Every tool can be invoked directly without an MCP client:

```bash
node dist/index.js --cli list_sources
node dist/index.js --cli design_search '{"query":"saas landing page","site_type":"marketing-landing-page","limit":3}'
node dist/index.js --cli design_search '{"query":"button","site_type":"admin-dashboard","source":"shadcn-ui"}'
node dist/index.js --cli design_get_detail '{"url":"https://github.com/shadcn-ui/ui"}'
node dist/index.js --cli extract_tokens '{"url":"https://stripe.com"}'
node dist/index.js --cli save_reference '{"url":"https://stripe.com","tags":["saas","dark"],"why_good":"Clear hierarchy, restrained color"}'
node dist/index.js --cli retrieve_saved '{"query":"saas"}'
```

## Install into any MCP-compatible agent

This is a standard MCP server communicating over stdio — it isn't tied to
one client. It runs the same way in Claude Code, Codex, Claude Desktop,
Cursor, or any other agent/IDE that speaks the Model Context Protocol. The
only two things every client needs are the launch command and, optionally,
the three env vars.

```bash
node >= 18
npx playwright install chromium        # screenshot engine
```

Launch command (what every client below wraps):

```bash
node /path/to/design-reference-mcp/dist/index.js
```

Env vars (all optional — see `.env.example`): `BEHANCE_API_KEY`,
`GOOGLE_FONTS_KEY`, `PARSE_BOT_KEY`.

### Claude Code

```bash
claude mcp add design-reference \
  -e BEHANCE_API_KEY=your_key \
  -e GOOGLE_FONTS_KEY=your_key \
  -e PARSE_BOT_KEY=your_key \
  -- node /path/to/design-reference-mcp/dist/index.js
```

### Codex CLI

```bash
codex mcp add design-reference \
  --env BEHANCE_API_KEY=your_key \
  --env GOOGLE_FONTS_KEY=your_key \
  --env PARSE_BOT_KEY=your_key \
  -- node /path/to/design-reference-mcp/dist/index.js
```

Or add it directly to `~/.codex/config.toml`:

```toml
[mcp_servers.design-reference]
command = "node"
args = ["/path/to/design-reference-mcp/dist/index.js"]
env = { BEHANCE_API_KEY = "your_key", GOOGLE_FONTS_KEY = "your_key", PARSE_BOT_KEY = "your_key" }
```

### Any other MCP client (Claude Desktop, Cursor, Windsurf, …)

Most clients use the same `mcpServers` JSON block, typically in a
`claude_desktop_config.json`, `mcp.json`, or equivalent settings file:

```json
{
  "mcpServers": {
    "design-reference": {
      "command": "node",
      "args": ["/path/to/design-reference-mcp/dist/index.js"],
      "env": {
        "BEHANCE_API_KEY": "your_key",
        "GOOGLE_FONTS_KEY": "your_key",
        "PARSE_BOT_KEY": "your_key"
      }
    }
  }
}
```

Consult that client's docs for the exact config file location — the
`command`/`args`/`env` shape above is the de facto standard across MCP
clients.

## Project structure

```
design-reference-mcp/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── GUIDELINES.md             # Maya's design bible
├── src/
│   ├── index.ts              # MCP server entry, tool registration, CLI routing
│   ├── config.ts              # keys, rate limits, registry loader
│   ├── engines/
│   │   ├── api.ts             # Behance + Google Fonts
│   │   ├── repo.ts            # GitHub repos, design systems, Coolors URL parse
│   │   ├── scraper.ts         # HTML fetch + parse inline preview images (cheerio)
│   │   ├── screenshot.ts      # Playwright headless capture of live sites
│   │   ├── wrapper.ts         # Cosmos via parse.bot
│   │   ├── tokens.ts          # extract_tokens: computed-style extraction
│   │   └── auth.ts            # OFF by default. Stub only. Not wired in v1.
│   ├── sources/registry.json  # full source list
│   ├── cache/
│   │   ├── urlcache.ts / urlcache/   # fetched URL → response cache
│   │   └── keepers.ts / keepers/     # saved screenshots + meta.json
│   └── util/
│       ├── ratelimit.ts       # per-source token-bucket limiter
│       ├── robots.ts          # robots.txt check + exponential backoff
│       └── image.ts           # base64 encode, dominant-color extraction
└── dist/                      # build output (gitignored)
```

## Build order (as shipped)

- **v0**: `repo` + `scraper` engines + `design_search` / `design_get_detail`
  / `save_reference` / `retrieve_saved`. Covers all 30 repos + design systems
  + galleries.
- **v1**: `api` (Behance, Google Fonts) + `wrapper` (Cosmos) + rate limiter +
  URL cache.
- **v2**: `screenshot` engine (Awwwards, Godly, award galleries, single
  Dribbble/Nicelydone pages) + `extract_tokens`.

All three versions are implemented in this codebase; the ordering above
reflects build/commit history and priority, not feature gaps.
