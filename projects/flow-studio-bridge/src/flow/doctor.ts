/**
 * doctor.ts — resolves every logical element in selectors/flow.map.json
 * against a live page and reports which strategy won, or MISS. Backs both
 * `npm run doctor` and the `flow_doctor` MCP tool (M5). Read-only: never
 * clicks or fills anything.
 */
import type { Page } from "playwright";
import { resolveElement, staticLogicalNames, SelectorMissError } from "../browser/resolve.js";

export interface DoctorRow {
  name: string;
  ok: boolean;
  strategy: string | null;
  resolveTimeMs: number | null;
  error: string | null;
}

/** Example params used only to diagnose the parameterized logical elements. */
const EXAMPLE_PARAMS: Record<string, Record<string, string>> = {
  modelOption: { param: "Nano Banana Pro" },
  aspectRatioOption: { param: "16:9" },
};

/** Resolve every logical element (static + one example of each parameterized one) and report the outcome for each. */
export async function runDoctor(page: Page): Promise<DoctorRow[]> {
  const rows: DoctorRow[] = [];

  for (const name of staticLogicalNames()) {
    rows.push(await resolveOne(page, name));
  }
  for (const [name, params] of Object.entries(EXAMPLE_PARAMS)) {
    rows.push(await resolveOne(page, name, params));
  }

  return rows;
}

async function resolveOne(page: Page, name: string, params?: Record<string, string>): Promise<DoctorRow> {
  try {
    const result = await resolveElement(page, name, params);
    return {
      name: params ? `${name}(${Object.values(params)[0]})` : name,
      ok: true,
      strategy: `${result.strategyType}[${result.strategyIndex}]`,
      resolveTimeMs: Math.round(result.resolveTimeMs),
      error: null,
    };
  } catch (err) {
    return {
      name: params ? `${name}(${Object.values(params)[0]})` : name,
      ok: false,
      strategy: null,
      resolveTimeMs: null,
      error: err instanceof SelectorMissError ? "MISS" : (err as Error).message,
    };
  }
}

/** Render a DoctorRow[] as a plain-text table for CLI output. */
export function formatDoctorReport(rows: DoctorRow[]): string {
  const nameWidth = Math.max(...rows.map((r) => r.name.length), "logical name".length);
  const header = `${"logical name".padEnd(nameWidth)}  ${"strategy".padEnd(20)}  ${"ms".padEnd(6)}  status`;
  const lines = rows.map((r) => {
    const strategy = (r.strategy ?? "-").padEnd(20);
    const ms = (r.resolveTimeMs?.toString() ?? "-").padEnd(6);
    const status = r.ok ? "OK" : `MISS (${r.error})`;
    return `${r.name.padEnd(nameWidth)}  ${strategy}  ${ms}  ${status}`;
  });
  return [header, "-".repeat(header.length), ...lines].join("\n");
}
