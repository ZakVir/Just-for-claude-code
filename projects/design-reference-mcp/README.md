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
| `design_search` | Search across sources by query/category/source/color. Returns ≤ `limit` (default 5, max 20) results. |
| `design_get_detail` | Fetch the full image (base64) + metadata for a result URL. Screenshots live-site sources. |
| `extract_tokens` | Pull colors/fonts/spacing/radius/shadows from a live URL via computed styles. |
| `list_sources` | Return the full source registry and what each source is good for. |
| `save_reference` | Save a reference into the local keeper index (`cache/keepers/`). |
| `retrieve_saved` | Search the local keeper index — always checked before any network call. |

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
node dist/index.js --cli design_search '{"query":"saas landing page","limit":3}'
node dist/index.js --cli design_search '{"query":"button","source":"shadcn-ui"}'
node dist/index.js --cli design_get_detail '{"url":"https://github.com/shadcn-ui/ui"}'
node dist/index.js --cli extract_tokens '{"url":"https://stripe.com"}'
node dist/index.js --cli save_reference '{"url":"https://stripe.com","tags":["saas","dark"],"why_good":"Clear hierarchy, restrained color"}'
node dist/index.js --cli retrieve_saved '{"query":"saas"}'
```

## Install into the agent runtime

```bash
node >= 18
npx playwright install chromium        # screenshot engine
claude mcp add design-reference \
  -e BEHANCE_API_KEY=your_key \
  -e GOOGLE_FONTS_KEY=your_key \
  -e PARSE_BOT_KEY=your_key \
  -- node /path/to/design-reference-mcp/dist/index.js
```

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
