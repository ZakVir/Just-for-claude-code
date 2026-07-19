#!/usr/bin/env node
/**
 * index.ts — MCP server entry: tool registration + engine routing.
 *
 * Six tools, routed across four engines (api, repo, scraper, screenshot) and
 * one wrapper (cosmos via parse.bot). The auth engine is never imported here —
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

import { SOURCES, clampLimit, sourceForUrl, type Source } from "./config.js";
import * as repoEngine from "./engines/repo.js";
import * as scraperEngine from "./engines/scraper.js";
import * as apiEngine from "./engines/api.js";
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

/** Route design_search across the right engine(s) based on source/category/query. */
async function routeSearch(args: {
  query: string;
  category?: string;
  source?: string;
  color?: string;
  limit: number;
}): Promise<SearchResult[]> {
  const { query, category, source, color, limit } = args;

  // Explicit source wins. Gated sources short-circuit — never scraped.
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
        return src.id === "behance" ? apiEngine.searchBehance(query, limit) : [];
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

  // Category filter: gather sources whose category/good_for matches, then
  // fan out to only those engines (bounded — never "all sources").
  if (category) {
    const cat = category.toLowerCase();
    const matches = SOURCES.filter(
      (s) => !s.gated && (s.category?.toLowerCase().includes(cat) || s.good_for?.toLowerCase().includes(cat)),
    );
    const engines = new Set(matches.map((s) => s.engine));
    const results: SearchResult[] = [];
    if (engines.has("repo")) results.push(...repoEngine.search(query, limit));
    if (engines.has("scraper")) results.push(...(await scraperEngine.search(query, limit)));
    if (engines.has("screenshot")) results.push(...screenshotEngine.search(query, limit));
    if (engines.has("api") && apiEngine.behanceAvailable()) {
      results.push(...(await apiEngine.searchBehance(query, limit).catch(() => [])));
    }
    return results.slice(0, limit);
  }

  // No source/category: default to the cheap, key-free v0 engines (repo +
  // scraper) so the tool is useful with zero configuration. Layer in api /
  // wrapper results only when keys are configured, staying within `limit`.
  const results: SearchResult[] = [];
  results.push(...repoEngine.search(query, limit));
  if (results.length < limit) {
    results.push(...(await scraperEngine.search(query, limit - results.length)));
  }
  if (results.length < limit && apiEngine.behanceAvailable()) {
    results.push(...(await apiEngine.searchBehance(query, limit - results.length).catch(() => [])));
  }
  if (results.length < limit && wrapperEngine.available()) {
    results.push(...(await wrapperEngine.search(query, limit - results.length, color).catch(() => [])));
  }
  return results.slice(0, limit);
}

async function routeDetail(url: string): Promise<DetailResult> {
  const src = sourceForUrl(url);

  if (src?.gated) {
    return { source_url: url, source: src.id, note: GATED_MESSAGE(src), license: "n/a" };
  }
  if (src?.id === "behance") return apiEngine.getBehanceDetail(url);
  if (src?.id === "cosmos") return wrapperEngine.getDetail(url);
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
  category?: string;
  source?: string;
  color?: string;
  limit?: number;
}): Promise<SearchResult[]> {
  const { query, category, source, color, limit } = args;
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
  const fresh = remaining > 0 ? await routeSearch({ query, category, source, color, limit: remaining }) : [];

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

server.tool(
  "design_search",
  "Search design references across galleries, repos, design systems, Behance, and Cosmos. " +
    "Returns up to `limit` (default 5, max 20) results with thumbnail, source URL, tags, and license.",
  {
    query: z.string().describe("Free-text search query"),
    category: z.string().optional().describe("Filter by category, e.g. 'landing-page', 'component-lib', 'color'"),
    source: z.string().optional().describe("Restrict to one registry source id (see list_sources)"),
    color: z.string().optional().describe("Color hint, passed through to sources that support it (e.g. Cosmos)"),
    limit: z.number().int().optional().describe("Max results, default 5, max 20"),
  },
  async ({ query, category, source, color, limit }) => {
    const combined = await designSearch({ query, category, source, color, limit });
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
  "List the full source registry: every gallery, repo, design system, and API this server knows " +
    "about, what it's good for, and which engine handles it.",
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
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
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
    design_search: async (a: any) => designSearch({ query: a.query, category: a.category, source: a.source, color: a.color, limit: a.limit }),
    design_get_detail: async (a: any) => routeDetail(a.url),
    extract_tokens: async (a: any) => extractTokens(a.url),
    list_sources: async () => SOURCES,
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
