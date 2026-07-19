/**
 * auth engine — STUB ONLY. Not implemented in v1, not wired into index.ts.
 *
 * This exists so the module shape is on record for a future version, and so
 * gated sources have somewhere to point once real auth support lands. Do not
 * import this from index.ts or any other engine. Do not add login flows,
 * session storage, or credential handling here without a v-next scoping pass.
 */
export const ENABLED = false as const;

export function assertDisabled(): never {
  throw new Error(
    "auth engine is disabled in v1. Gated sources (Savee, Pinterest, Mobbin full, Page Flows) " +
      "are not scraped or logged into — design_search returns a free alternative instead.",
  );
}
