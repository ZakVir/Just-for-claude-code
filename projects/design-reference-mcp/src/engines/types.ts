/** Shared result shapes across engines. */

export interface SearchResult {
  thumb_url: string;
  source_url: string;
  title: string;
  tags: string[];
  source: string;
  license?: string;
}

export interface DetailResult {
  source_url: string;
  source: string;
  title?: string;
  /** base64-encoded image the model should actually look at. */
  image_base64?: string;
  image_mime?: string;
  /** Extra text metadata (README excerpt, notes, etc.). */
  metadata?: Record<string, unknown>;
  palette?: string[];
  license?: string;
  note?: string;
}

/** Tokenize a free-text query into lowercased terms for matching. */
export function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9#]+/)
    .filter((t) => t.length > 1);
}

/** Simple relevance score: how many query terms appear in the haystack. */
export function scoreMatch(haystack: string, qterms: string[]): number {
  const h = haystack.toLowerCase();
  let s = 0;
  for (const t of qterms) if (h.includes(t)) s++;
  return s;
}
