/**
 * keepers — the self-growing local index of saved references.
 *
 * save(): writes a screenshot/preview + meta.json into cache/keepers/.
 * search(): the retrieve_saved tool's backing store — always consulted
 *   before any network call (guardrail #2).
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { PATHS } from "../config.js";
import { sourceForUrl } from "../config.js";
import { terms, scoreMatch } from "../engines/types.js";

export interface KeeperMeta {
  source_url: string;
  local_screenshot: string;
  source: string;
  type: string;
  tags: string[];
  patterns: string[];
  why_good: string;
  palette: string[];
  license: string;
  saved_at: string;
}

export interface SaveInput {
  url: string;
  tags?: string[];
  why_good: string;
  notes?: string;
  /** Raw image bytes to persist (already fetched/screenshotted by the caller). */
  image?: Buffer;
  image_ext?: string;
  type?: string;
  patterns?: string[];
  palette?: string[];
  license?: string;
}

async function ensureDir(): Promise<void> {
  await mkdir(PATHS.keepers, { recursive: true });
}

export async function save(input: SaveInput): Promise<KeeperMeta> {
  await ensureDir();
  const id = randomUUID();
  const ext = input.image_ext ?? "png";
  const relScreenshot = `cache/keepers/${id}.${ext}`;
  const absScreenshot = join(PATHS.keepers, `${id}.${ext}`);

  if (input.image) {
    await writeFile(absScreenshot, input.image);
  }

  const src = sourceForUrl(input.url);
  const meta: KeeperMeta = {
    source_url: input.url,
    local_screenshot: relScreenshot,
    source: src?.id ?? new URL(input.url).hostname,
    type: input.type ?? "reference",
    tags: input.tags ?? [],
    patterns: input.patterns ?? [],
    why_good: input.why_good + (input.notes ? ` — ${input.notes}` : ""),
    palette: input.palette ?? [],
    license: input.license ?? src?.license ?? "n/a",
    saved_at: new Date().toISOString(),
  };

  await writeFile(join(PATHS.keepers, `${id}.meta.json`), JSON.stringify(meta, null, 2));
  return meta;
}

export async function listAll(): Promise<KeeperMeta[]> {
  await ensureDir();
  const files = await readdir(PATHS.keepers);
  const metas: KeeperMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".meta.json")) continue;
    try {
      const raw = await readFile(join(PATHS.keepers, f), "utf8");
      metas.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  return metas;
}

export async function search(query: string, tags?: string[]): Promise<KeeperMeta[]> {
  const all = await listAll();
  const qterms = terms(query ?? "");
  const wantTags = (tags ?? []).map((t) => t.toLowerCase());

  const filtered = all.filter((m) => {
    if (wantTags.length && !wantTags.some((t) => m.tags.map((x) => x.toLowerCase()).includes(t))) {
      return false;
    }
    return true;
  });

  if (!qterms.length) return filtered;

  const scored = filtered
    .map((m) => ({
      m,
      score: scoreMatch(
        `${m.tags.join(" ")} ${m.patterns.join(" ")} ${m.why_good} ${m.type} ${m.source}`,
        qterms,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((x) => x.m);
}

export async function readScreenshotBase64(meta: KeeperMeta): Promise<string | null> {
  try {
    // local_screenshot is stored as "cache/keepers/<file>"; PATHS.keepers
    // already points at that directory, so just take the filename.
    const abs = join(PATHS.keepers, meta.local_screenshot.replace(/^cache\/keepers\//, ""));
    await stat(abs);
    return (await readFile(abs)).toString("base64");
  } catch {
    return null;
  }
}
