import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { mergeSources, emptyCache, readCache, writeCache, CACHE_VERSION } from "../lib/cache.mjs";
import { makeEnvelope } from "../lib/envelope.mjs";

const env = (id, date) =>
  makeEnvelope({ id, source: "github", kind: "commit", title: "t", url: "https://x", date, payload: {} });

test("emptyCache has version, generatedAt, sources, items", () => {
  const c = emptyCache("2026-06-11T00:00:00Z");
  assert.equal(c.version, 1);
  assert.equal(c.generatedAt, "2026-06-11T00:00:00Z");
  assert.deepEqual(c.items, []);
  assert.deepEqual(c.sources, {});
});

test("mergeSources: on success, replaces that source's items and marks ok", () => {
  const prev = emptyCache("2026-06-10T00:00:00Z");
  const result = mergeSources(prev, [
    { source: "github", ok: true, items: [env("g1", "2026-06-11T00:00:00Z")] },
  ], "2026-06-11T00:00:00Z");
  assert.equal(result.sources.github.status, "ok");
  assert.equal(result.sources.github.count, 1);
  assert.equal(result.items.length, 1);
});

test("mergeSources: on failure, keeps prior items for that source and marks error", () => {
  const prev = {
    version: 1,
    generatedAt: "2026-06-10T00:00:00Z",
    sources: { github: { status: "ok", lastSuccess: "2026-06-10T00:00:00Z", count: 1, consecutiveFailures: 0 } },
    items: [env("old", "2026-06-10T00:00:00Z")],
  };
  const result = mergeSources(prev, [
    { source: "github", ok: false, error: "timeout", items: [] },
  ], "2026-06-11T00:00:00Z");
  assert.equal(result.sources.github.status, "error");
  assert.equal(result.sources.github.consecutiveFailures, 1);
  assert.equal(result.sources.github.lastSuccess, "2026-06-10T00:00:00Z"); // preserved
  assert.equal(result.items.length, 1); // old item retained
  assert.equal(result.items[0].id, "old");
});

test("mergeSources preserves items + metadata for a source absent from results", () => {
  // A source present in prev but not run this round (e.g. disabled) keeps its data.
  const prev = {
    version: 1,
    generatedAt: "2026-06-10T00:00:00Z",
    sources: { pypi: { status: "ok", lastSuccess: "2026-06-10T00:00:00Z", count: 1, consecutiveFailures: 0 } },
    items: [makeEnvelope({ id: "p1", source: "pypi", kind: "package", title: "t", url: "https://x", date: "2026-06-10T00:00:00Z", payload: {} })],
  };
  const result = mergeSources(prev, [
    { source: "github", ok: true, items: [env("g1", "2026-06-11T00:00:00Z")] },
  ], "2026-06-11T00:00:00Z");
  // pypi metadata untouched, pypi item retained, github added
  assert.equal(result.sources.pypi.status, "ok");
  assert.ok(result.items.some((i) => i.id === "p1"));
  assert.ok(result.items.some((i) => i.id === "g1"));
});

test("readCache returns empty cache on version mismatch", async () => {
  const path = join(tmpdir(), `sora-cache-vmismatch-${process.pid}.json`);
  await writeCache(path, { version: CACHE_VERSION + 99, generatedAt: "x", sources: {}, items: [env("z", "2026-06-11T00:00:00Z")] });
  try {
    const c = await readCache(path, "2026-06-11T00:00:00Z");
    assert.equal(c.version, CACHE_VERSION);
    assert.deepEqual(c.items, []);
  } finally {
    await rm(path, { force: true });
  }
});

test("writeCache then readCache round-trips items", async () => {
  const path = join(tmpdir(), `sora-cache-roundtrip-${process.pid}.json`);
  const cache = mergeSources(emptyCache("2026-06-10T00:00:00Z"), [
    { source: "github", ok: true, items: [env("rt1", "2026-06-11T00:00:00Z")] },
  ], "2026-06-11T00:00:00Z");
  try {
    await writeCache(path, cache);
    const back = await readCache(path, "2026-06-11T00:00:00Z");
    assert.equal(back.version, CACHE_VERSION);
    assert.equal(back.items.length, 1);
    assert.equal(back.items[0].id, "rt1");
  } finally {
    await rm(path, { force: true });
  }
});
