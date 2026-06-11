import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSources, emptyCache } from "../lib/cache.mjs";
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
