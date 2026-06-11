import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupAndSort } from "../lib/dedup.mjs";
import { makeEnvelope } from "../lib/envelope.mjs";

const env = (id, date) =>
  makeEnvelope({ id, source: "github", kind: "commit", title: "t", url: "https://x", date, payload: {} });

test("dedupAndSort removes duplicate ids, keeping first occurrence", () => {
  const items = [env("a", "2026-01-01T00:00:00Z"), env("a", "2026-02-01T00:00:00Z")];
  const out = dedupAndSort(items);
  assert.equal(out.length, 1);
});

test("dedupAndSort sorts descending by date (newest first)", () => {
  const items = [
    env("a", "2026-01-01T00:00:00Z"),
    env("b", "2026-03-01T00:00:00Z"),
    env("c", "2026-02-01T00:00:00Z"),
  ];
  const out = dedupAndSort(items);
  assert.deepEqual(out.map((i) => i.id), ["b", "c", "a"]);
});

test("dedupAndSort handles empty input", () => {
  assert.deepEqual(dedupAndSort([]), []);
});
