/**
 * urlcache — fetched URL -> response cache on disk.
 *
 * Guardrail #2: cache-first, never re-fetch a stored URL. Each cached entry
 * is a raw body file plus a small sidecar with content-type + fetched_at, so
 * later reads can rebuild the right MIME type for images vs HTML/JSON.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { PATHS } from "../config.js";

interface Sidecar {
  url: string;
  content_type?: string;
  fetched_at: string;
}

function keyFor(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function paths(url: string): { body: string; meta: string } {
  const k = keyFor(url);
  return {
    body: join(PATHS.urlCache, `${k}.bin`),
    meta: join(PATHS.urlCache, `${k}.json`),
  };
}

async function ensureDir(): Promise<void> {
  await mkdir(PATHS.urlCache, { recursive: true });
}

/** Return cached body for `url`, or null if never fetched before. */
export async function getCached(url: string): Promise<Buffer | null> {
  const { body } = paths(url);
  try {
    await stat(body);
    return await readFile(body);
  } catch {
    return null;
  }
}

export async function getCachedMeta(url: string): Promise<Sidecar | null> {
  const { meta } = paths(url);
  try {
    return JSON.parse(await readFile(meta, "utf8"));
  } catch {
    return null;
  }
}

/** Persist a fetched body under its URL key. Overwrites are allowed only
 * when explicitly called (never automatic — callers must check getCached
 * first per the cache-first guardrail). */
export async function setCached(
  url: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  await ensureDir();
  const { body: bodyPath, meta: metaPath } = paths(url);
  await writeFile(bodyPath, body);
  const sidecar: Sidecar = {
    url,
    content_type: contentType,
    fetched_at: new Date().toISOString(),
  };
  await writeFile(metaPath, JSON.stringify(sidecar, null, 2));
}

export async function hasCached(url: string): Promise<boolean> {
  const { body } = paths(url);
  try {
    await stat(body);
    return true;
  } catch {
    return false;
  }
}
