/**
 * resolve.ts — selector-map resolution engine.
 *
 * Reads selectors/flow.map.json and, for a given logical element name, tries
 * each configured strategy in order (role, label, testid, text, structural)
 * until exactly one visible element matches. This indirection is the whole
 * point: when Flow's DOM changes, only flow.map.json needs updating, never
 * this file or call sites. `css_class` is not a supported strategy type on
 * purpose — never add one, even under pressure from a broken selector; add a
 * structural or accessible strategy instead.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { Locator, Page } from "playwright";
import { z } from "zod";
import { PROJECT_ROOT } from "../config.js";
import { log } from "../log.js";

const RoleStrategy = z.object({ type: z.literal("role"), role: z.string(), name: z.string() });
const LabelStrategy = z.object({ type: z.literal("label"), name: z.string() });
const TestIdStrategy = z.object({ type: z.literal("testid"), testId: z.string() });
const TextStrategy = z.object({ type: z.literal("text"), name: z.string() });
const StructuralStrategy = z.object({
  type: z.literal("structural"),
  anchor: z.string(),
  up: z.number().int().nonnegative().default(3),
  role: z.string().optional(),
  name: z.string().optional(),
});

const StrategySchema = z.discriminatedUnion("type", [
  RoleStrategy,
  LabelStrategy,
  TestIdStrategy,
  TextStrategy,
  StructuralStrategy,
]);
export type Strategy = z.infer<typeof StrategySchema>;

const SelectorMapSchema = z.record(
  z.string(),
  z.union([z.string(), z.object({ strategies: z.array(StrategySchema).min(1) })]),
);

export interface ResolveResult {
  locator: Locator;
  strategyType: Strategy["type"];
  strategyIndex: number;
  resolveTimeMs: number;
}

export class SelectorMissError extends Error {
  constructor(public logicalName: string, public attempts: string[]) {
    super(`No strategy resolved "${logicalName}" to exactly one visible element. Tried: ${attempts.join(" -> ")}`);
  }
}

let cachedMap: Record<string, Strategy[]> | null = null;

function loadMap(): Record<string, Strategy[]> {
  if (cachedMap) return cachedMap;
  const mapPath = resolvePath(PROJECT_ROOT, "selectors", "flow.map.json");
  const raw = JSON.parse(readFileSync(mapPath, "utf8"));
  delete raw._comment;
  const parsed = SelectorMapSchema.parse(raw);
  const out: Record<string, Strategy[]> = {};
  for (const [name, entry] of Object.entries(parsed)) {
    if (typeof entry === "string") continue; // stray metadata field, ignore
    out[name] = entry.strategies;
  }
  cachedMap = out;
  return out;
}

/** Test hook: force a re-read of flow.map.json on next resolve. */
export function __clearMapCache(): void {
  cachedMap = null;
}

function substitute(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.split(`{${key}}`).join(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
  return out;
}

async function countVisible(locator: Locator): Promise<number> {
  const all = await locator.all();
  let n = 0;
  for (const el of all) {
    if (await el.isVisible().catch(() => false)) n++;
  }
  return n;
}

async function buildLocator(
  page: Page,
  strategy: Strategy,
  params: Record<string, string> | undefined,
  visited: Set<string>,
): Promise<Locator> {
  switch (strategy.type) {
    case "role":
      return page.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], {
        name: new RegExp(substitute(strategy.name, params), "i"),
      });
    case "label":
      return page.getByLabel(new RegExp(substitute(strategy.name, params), "i"));
    case "testid":
      return page.getByTestId(strategy.testId);
    case "text":
      return page.getByText(new RegExp(substitute(strategy.name, params), "i"));
    case "structural": {
      // Selector maps may reference each other for structural fallbacks (e.g.
      // "the button near the prompt box" and "the box near the generate
      // button"). Without cycle detection two such entries can recurse into
      // each other forever; a name already being resolved up the call stack
      // is a hard miss for this strategy, not a retry.
      if (visited.has(strategy.anchor)) {
        throw new Error(`structural cycle detected resolving "${strategy.anchor}"`);
      }
      const anchorResult = await resolveElementInternal(page, strategy.anchor, params, visited);
      let container: Locator = anchorResult.locator;
      for (let i = 0; i < strategy.up; i++) {
        container = container.locator("xpath=..");
      }
      if (strategy.role) {
        const name = strategy.name ? new RegExp(substitute(strategy.name, params), "i") : undefined;
        return container.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], name ? { name } : undefined);
      }
      return container;
    }
  }
}

function describeStrategy(s: Strategy): string {
  switch (s.type) {
    case "role":
      return `role(${s.role}, /${s.name}/i)`;
    case "label":
      return `label(/${s.name}/i)`;
    case "testid":
      return `testid(${s.testId})`;
    case "text":
      return `text(/${s.name}/i)`;
    case "structural":
      return `structural(anchor=${s.anchor}, up=${s.up}${s.role ? `, role=${s.role}` : ""})`;
  }
}

async function resolveElementInternal(
  page: Page,
  logicalName: string,
  params: Record<string, string> | undefined,
  visited: Set<string>,
): Promise<ResolveResult> {
  const map = loadMap();
  const strategies = map[logicalName];
  if (!strategies) {
    throw new Error(`Unknown logical element "${logicalName}" — not present in selectors/flow.map.json`);
  }

  const nextVisited = new Set(visited);
  nextVisited.add(logicalName);

  const attempts: string[] = [];
  const start = performance.now();
  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    attempts.push(describeStrategy(strategy));
    try {
      const locator = await buildLocator(page, strategy, params, nextVisited);
      const n = await countVisible(locator);
      if (n === 1) {
        const resolveTimeMs = performance.now() - start;
        log.debug({ logicalName, strategy: strategy.type, index: i, resolveTimeMs }, "resolved logical element");
        return { locator, strategyType: strategy.type, strategyIndex: i, resolveTimeMs };
      }
    } catch {
      // strategy itself threw (e.g. bad regex against DOM, or a detected
      // structural cycle) — treat as a miss and try the next one
    }
  }
  throw new SelectorMissError(logicalName, attempts);
}

/**
 * Resolve a logical element name to a Playwright Locator using the ordered
 * strategy list in selectors/flow.map.json. Throws SelectorMissError if no
 * strategy resolves to exactly one visible element.
 */
export async function resolveElement(
  page: Page,
  logicalName: string,
  params?: Record<string, string>,
): Promise<ResolveResult> {
  return resolveElementInternal(page, logicalName, params, new Set());
}

/** All logical element names with no required parameters, for flow_doctor. */
export function staticLogicalNames(): string[] {
  return Object.keys(loadMap()).filter((n) => n !== "modelOption" && n !== "aspectRatioOption");
}
