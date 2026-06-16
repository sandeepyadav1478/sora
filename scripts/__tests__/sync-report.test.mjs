import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../sync-sources.mjs";

const RESULTS = [
  { source: "github", ok: true, items: [] },
  { source: "pypi", ok: false, items: [], error: "HTTP 404 for https://pypi.org/pypi/foo/json" },
  { source: "npm", ok: true, items: [] },
];

test("buildReport: failures array contains only failed sources with sanitized error", () => {
  const r = buildReport(RESULTS, "2026-06-16T02:00:00.000Z");
  assert.deepEqual(r.failures, [
    { source: "pypi", error: "HTTP 404 for https://pypi.org/pypi/foo/json" },
  ]);
});

test("buildReport: successes array contains only successful source names", () => {
  const r = buildReport(RESULTS, "2026-06-16T02:00:00.000Z");
  assert.deepEqual(r.successes, ["github", "npm"]);
});

test("buildReport: generatedAt is preserved verbatim", () => {
  const r = buildReport(RESULTS, "2026-06-16T02:00:00.000Z");
  assert.equal(r.generatedAt, "2026-06-16T02:00:00.000Z");
});

test("buildReport: empty results → zero failures, zero successes", () => {
  const r = buildReport([], "2026-06-16T02:00:00.000Z");
  assert.deepEqual(r, {
    generatedAt: "2026-06-16T02:00:00.000Z",
    failures: [],
    successes: [],
  });
});

test("buildReport: missing error field on a failure → empty string, not undefined", () => {
  const r = buildReport(
    [{ source: "rss", ok: false, items: [] }],
    "2026-06-16T02:00:00.000Z",
  );
  assert.deepEqual(r.failures, [{ source: "rss", error: "" }]);
});
