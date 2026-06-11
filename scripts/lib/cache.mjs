import { readFile, writeFile } from "node:fs/promises";
import { dedupAndSort } from "./dedup.mjs";

export const CACHE_VERSION = 1;

export function emptyCache(generatedAt) {
  return { version: CACHE_VERSION, generatedAt, sources: {}, items: [] };
}

/** Read the committed cache; return an empty cache if absent/unreadable. */
export async function readCache(path, generatedAt) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === CACHE_VERSION) return parsed;
  } catch {
    /* missing or invalid -> empty */
  }
  return emptyCache(generatedAt);
}

/**
 * Merge adapter results into the previous cache.
 * results: [{ source, ok, items, error? }]
 * - ok:    replace that source's items, status "ok", reset consecutiveFailures.
 * - !ok:   retain prior items for that source, status "error", increment consecutiveFailures.
 */
export function mergeSources(prev, results, generatedAt) {
  const sources = { ...(prev.sources || {}) };
  const bySource = new Map();

  // seed with retained prior items grouped by source
  for (const item of prev.items || []) {
    if (!bySource.has(item.source)) bySource.set(item.source, []);
    bySource.get(item.source).push(item);
  }

  for (const r of results) {
    const prevMeta = sources[r.source] || { consecutiveFailures: 0, lastSuccess: null };
    if (r.ok) {
      bySource.set(r.source, r.items);
      sources[r.source] = {
        status: "ok",
        lastSuccess: generatedAt,
        count: r.items.length,
        consecutiveFailures: 0,
      };
    } else {
      // keep whatever was already in bySource for this source (prior items)
      sources[r.source] = {
        status: "error",
        lastSuccess: prevMeta.lastSuccess,
        count: (bySource.get(r.source) || []).length,
        consecutiveFailures: (prevMeta.consecutiveFailures || 0) + 1,
        error: r.error || "unknown error",
      };
    }
  }

  const allItems = dedupAndSort([...bySource.values()].flat());
  return { version: CACHE_VERSION, generatedAt, sources, items: allItems };
}

/** Pretty-write the cache JSON (stable formatting -> clean diffs). */
export async function writeCache(path, cache) {
  await writeFile(path, JSON.stringify(cache, null, 2) + "\n", "utf8");
}
