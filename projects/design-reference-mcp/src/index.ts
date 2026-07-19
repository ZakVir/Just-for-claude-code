#!/usr/bin/env node
/**
 * index.ts — MCP server entry: tool registration + engine routing.
 *
 * Six tools, routed across four engines (api, repo, scraper, screenshot) and
 * one wrapper (SearXNG, self-hosted). The auth engine is never imported here —
 * gated sources are handled inline with a "not available free" message.
 *
 * Guardrails enforced at this layer:
 *  - retrieve_saved always checked before any network call (design_search
 *    prepends local keeper matches; design_get_detail/extract_tokens rely on
 *    each engine's own urlcache-first fetch).
 *  - limit is clamped to [1, 20], default 5 — no "fetch all" path.
 *  - gated sources short-circuit to a fixed alternative message.
 *
 * Also supports a CLI mode for local testing without a full MCP client:
 *   node dist/index.js --cli <tool_name> '<json-args>'
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  SOURCES,
  SITE_TYPES,
  SITE_TYPE_IDS,
  clampLimit,
  sourceForUrl,
  sourcesForSiteType,
  filterByCategoryText,
  type Source,
} from "./config.js";
import * as repoEngine from "./engines/repo.js";
import * as scraperEngine from "./engines/scraper.js";
import * as wrapperEngine from "./engines/wrapper.js";
import * as screenshotEngine from "./engines/screenshot.js";
import { extractTokens } from "./engines/tokens.js";
import { type SearchResult, type DetailResult } from "./engines/types.js";
import { extFromMime } from "./util/image.js";
import * as keepers from "./cache/keepers.js";
import { closeBrowser } from "./engines/screenshot.js";

const GATED_MESSAGE = (s: Source) => `Not available free — try ${s.alternative}.`;

function gatedResult(s: Source): SearchResult {
  return {
    thumb_url: "",
    source_url: s.url,
    title: GATED_MESSAGE(s),
    tags: ["gated"],
    source: s.id,
    license: "n/a",
  };
}

/**
 * Route design_search across the right engine(s).
 *
 * `site_type` is required — every call must say up front whether it's
 * looking for a public-facing page that advertises/sells the business
 * ("marketing" kind: routes to the scraper/screenshot galleries + landing
 * templates) or an actual logged-in user/admin product surface ("product"
 * kind: routes to component-lib/design-system repos — the real building
 * blocks, since no gallery here curates "admin dashboard" screenshots).
 * `source` (an explicit single registry id) overrides site_type entirely.
 * `category` further narrows the site_type-selected pool by free text.
 */
async function routeSearch(args: {
  query: string;
  site_type: string;
  category?: string;
  source?: string;
  color?: string;
  limit: number;
}): Promise<SearchResult[]> {
  const { query, site_type, category, source, color, limit } = args;

  // Explicit source wins over site_type — the caller already knows exactly
  // where to look. Gated sources short-circuit — never scraped.
  if (source) {
    const src = SOURCES.find((s) => s.id === source || s.name === source);
    if (!src) {
      return [
        {
          thumb_url: "",
          source_url: "",
          title: `Unknown source "${source}". Call list_sources for valid ids.`,
          tags: ["error"],
          source: "unknown",
        },
      ];
    }
    if (src.gated) return [gatedResult(src)];

    switch (src.engine) {
      case "api":
        // Google Fonts is a lookup/hydration helper, not a design_search source.
        return [];
      case "wrapper":
        return wrapperEngine.search(query, limit, color);
      case "repo":
        return repoEngine.search(query, limit, src.id);
      case "scraper":
        return scraperEngine.search(query, limit, src.id);
      case "screenshot":
        return screenshotEngine.search(query, limit, src.id);
      default:
        return [];
    }
  }

  const siteType = SITE_TYPES.find((t) => t.id === site_type);
  if (!siteType) {
    return [
      {
        thumb_url: "",
        source_url: "",
        title: `Unknown site_type "${site_type}". Call list_sources for valid ids, or see the tool description for the full list.`,
        tags: ["error"],
        source: "unknown",
      },
    ];
  }

  let matches = sourcesForSiteType(site_type);
  if (category) matches = filterByCategoryText(matches, category);

  const idsFor = (engine: string) => matches.filter((s) => s.engine === engine).map((s) => s.id);
  const engines = new Set(matches.map((s) => s.engine));
  const results: SearchResult[] = [];
  // Pass the site_type-matched source ids down so each engine restricts to
  // (and always returns from) exactly those sources — the site_type/category
  // match is itself the signal, not a further query-term match against thin
  // per-source metadata.
  if (engines.has("repo")) results.push(...repoEngine.search(query, limit, idsFor("repo")));
  if (engines.has("scraper")) results.push(...(await scraperEngine.search(query, limit, idsFor("scraper"))));
  if (engines.has("screenshot")) results.push(...screenshotEngine.search(query, limit, idsFor("screenshot")));
  // SearXNG is visual inspiration, not real components — only worth
  // layering in for marketing-kind requests.
  if (siteType.kind === "marketing" && results.length < limit && wrapperEngine.available()) {
    results.push(...(await wrapperEngine.search(query, limit - results.length, color).catch(() => [])));
  }
  return results.slice(0, limit);
}

async function routeDetail(url: string): Promise<DetailResult> {
  const src = sourceForUrl(url);

  if (src?.gated) {
    return { source_url: url, source: src.id, note: GATED_MESSAGE(src), license: "n/a" };
  }
  if (src?.id === "searxng") return wrapperEngine.getDetail(url);
  if (repoEngine.handles(url)) return repoEngine.getDetail(url);
  if (screenshotEngine.handles(url)) return screenshotEngine.getDetail(url);
  if (scraperEngine.handles(url)) return scraperEngine.getDetail(url);

  // Unregistered URL: treat as a live site worth screenshotting.
  return screenshotEngine.getDetail(url);
}

/**
 * design_search's full logic: cache-first (local keepers) then routed
 * network search, capped at `limit`. Shared by the MCP tool handler and the
 * CLI so the cache-first guardrail applies identically to both.
 */
async function designSearch(args: {
  query: string;
  site_type: string;
  category?: string;
  source?: string;
  color?: string;
  limit?: number;
}): Promise<SearchResult[]> {
  const { query, site_type, category, source, color, limit } = args;
  // Cache-first: always check the local saved index before any network call.
  const saved = await keepers.search(query, category ? [category] : undefined);
  const cap = clampLimit(limit);
  const savedResults: SearchResult[] = saved.slice(0, cap).map((m) => ({
    thumb_url: m.local_screenshot,
    source_url: m.source_url,
    title: `[saved] ${m.why_good.slice(0, 80)}`,
    tags: m.tags,
    source: m.source,
    license: m.license,
  }));

  const remaining = cap - savedResults.length;
  const fresh =
    remaining > 0 ? await routeSearch({ query, site_type, category, source, color, limit: remaining }) : [];

  return [...savedResults, ...fresh].slice(0, cap);
}

/** save_reference's full logic, shared by the MCP tool handler and the CLI. */
async function saveReference(args: {
  url: string;
  tags?: string[];
  why_good: string;
  notes?: string;
}): Promise<keepers.KeeperMeta> {
  const detail = await routeDetail(args.url);
  const image = detail.image_base64 ? Buffer.from(detail.image_base64, "base64") : undefined;
  return keepers.save({
    url: args.url,
    tags: args.tags ?? [],
    why_good: args.why_good,
    notes: args.notes,
    image,
    image_ext: extFromMime(detail.image_mime),
    palette: detail.palette,
    license: detail.license,
  });
}

const server = new McpServer({ name: "design-reference-mcp", version: "0.1.0" });

const SITE_TYPE_DESCRIPTION =
  "REQUIRED. What kind of thing are you looking for — a public-facing page that " +
  "advertises/sells the business, or an actual logged-in user/admin product surface? " +
  "Each maps to a different part of the registry (marketing kinds → galleries + landing " +
  "templates; product kinds → component libraries + design-system tokens). One of: " +
  SITE_TYPES.map((t) => `'${t.id}' (${t.kind}: ${t.description})`).join("; ");

server.tool(
  "design_search",
  "Search design references across galleries, repos, design systems, and a SearXNG wrapper. " +
    "Returns up to `limit` (default 5, max 20) results with thumbnail, source URL, tags, and license. " +
    "site_type is required — see its description for the full list of what to pick from.",
  {
    query: z.string().describe("Free-text search query"),
    site_type: z.enum(SITE_TYPE_IDS).describe(SITE_TYPE_DESCRIPTION),
    category: z.string().optional().describe("Further narrow within site_type, e.g. 'pricing', 'dark', 'color'"),
    source: z.string().optional().describe("Restrict to one registry source id (see list_sources), overrides site_type"),
    color: z.string().optional().describe("Color hint, passed through to sources that support it (e.g. SearXNG)"),
    limit: z.number().int().optional().describe("Max results, default 5, max 20"),
  },
  async ({ query, site_type, category, source, color, limit }) => {
    const combined = await designSearch({ query, site_type, category, source, color, limit });
    return { content: [{ type: "text", text: JSON.stringify(combined, null, 2) }] };
  },
);

server.tool(
  "design_get_detail",
  "Fetch full detail for a design reference URL: base64 image (for gated/live sources, a fresh " +
    "screenshot) plus metadata. Cache-first — never re-fetches a URL already in the cache.",
  { url: z.string().url() },
  async ({ url }) => {
    const detail = await routeDetail(url);
    const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
    if (detail.image_base64) {
      content.push({ type: "image", data: detail.image_base64, mimeType: detail.image_mime ?? "image/png" });
    }
    const { image_base64, ...rest } = detail;
    void image_base64;
    content.push({ type: "text", text: JSON.stringify(rest, null, 2) });
    return { content };
  },
);

server.tool(
  "extract_tokens",
  "Extract colors, fonts, spacing, radius, and shadows from a live URL by inspecting computed styles.",
  { url: z.string().url() },
  async ({ url }) => {
    const tokens = await extractTokens(url);
    return { content: [{ type: "text", text: JSON.stringify(tokens, null, 2) }] };
  },
);

server.tool(
  "list_sources",
  "List the full source registry (every gallery, repo, design system, and API this server " +
    "knows about, what it's good for, and which engine handles it) plus the full list of valid " +
    "site_type values for design_search.",
  {},
  async () => {
    const summary = SOURCES.map((s) => ({
      id: s.id,
      name: s.name,
      engine: s.engine,
      url: s.url,
      good_for: s.good_for,
      license: s.license,
      gated: s.gated ?? false,
      alternative: s.alternative,
    }));
    const site_types = SITE_TYPES.map((t) => ({
      id: t.id,
      label: t.label,
      kind: t.kind,
      description: t.description,
    }));
    return { content: [{ type: "text", text: JSON.stringify({ sources: summary, site_types }, null, 2) }] };
  },
);

server.tool(
  "save_reference",
  "Save a design reference to the local keeper index: fetches/screenshots the URL and writes " +
    "cache/keepers/<uuid>.png + meta.json with tags, why_good, and notes.",
  {
    url: z.string().url(),
    tags: z.array(z.string()).default([]),
    why_good: z.string().describe("Why this reference is worth keeping"),
    notes: z.string().optional(),
  },
  async ({ url, tags, why_good, notes }) => {
    const meta = await saveReference({ url, tags, why_good, notes });
    return { content: [{ type: "text", text: JSON.stringify(meta, null, 2) }] };
  },
);

server.tool(
  "retrieve_saved",
  "Search the local saved-reference index FIRST, before any network call. Returns matching " +
    "keepers with their local screenshot path and metadata.",
  {
    query: z.string(),
    tags: z.array(z.string()).optional(),
  },
  async ({ query, tags }) => {
    const results = await keepers.search(query, tags);
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  },
);

async function runCli(toolName: string, jsonArgs: string): Promise<void> {
  const args = jsonArgs ? JSON.parse(jsonArgs) : {};
  const handlers: Record<string, (a: unknown) => Promise<unknown>> = {
    design_search: async (a: any) => {
      if (!a.site_type) {
        throw new Error(
          `design_search requires "site_type". Valid ids: ${SITE_TYPE_IDS.join(", ")}`,
        );
      }
      return designSearch({ query: a.query, site_type: a.site_type, category: a.category, source: a.source, color: a.color, limit: a.limit });
    },
    design_get_detail: async (a: any) => routeDetail(a.url),
    extract_tokens: async (a: any) => extractTokens(a.url),
    list_sources: async () => ({ sources: SOURCES, site_types: SITE_TYPES }),
    save_reference: async (a: any) => saveReference({ url: a.url, tags: a.tags, why_good: a.why_good, notes: a.notes }),
    retrieve_saved: async (a: any) => keepers.search(a.query, a.tags),
  };

  const handler = handlers[toolName];
  if (!handler) {
    console.error(`Unknown tool "${toolName}". Valid: ${Object.keys(handlers).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const result = await handler(args);
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const [, , flag, toolName, jsonArgs] = process.argv;
  if (flag === "--cli") {
    try {
      await runCli(toolName, jsonArgs ?? "{}");
    } finally {
      await closeBrowser();
    }
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
