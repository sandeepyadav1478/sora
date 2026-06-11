import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeRatings } from "../adapters/codeforces.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/codeforces.json", import.meta.url), "utf8")
);

test("normalizeRatings maps a contest entry to a rating envelope (fields + url construction)", () => {
  const out = normalizeRatings(fixture, { handle: "tourist", maxRatings: 500 });
  const first = out.find((e) => e.payload.contestId === 2);
  assert.ok(first, "contest 2 must be present");
  assert.equal(first.source, "codeforces");
  assert.equal(first.kind, "rating");
  assert.equal(first.id, "codeforces:rating:2");
  assert.equal(first.title, "Codeforces Beta Round 2: 0→1602"); // oldRating→newRating
  assert.equal(first.url, "https://codeforces.com/contest/2"); // constructed, not from response
  assert.equal(first.date, "2010-02-25T19:00:00.000Z"); // toIso(1267124400) UNIX SECONDS
  assert.equal(first.payload.platform, "codeforces");
  assert.equal(first.payload.rating, 1602); // newRating
  assert.equal(first.payload.rank, 14);
});

test("dedup key + id-kind invariant: id.split(':')[1] === kind", () => {
  const out = normalizeRatings(fixture, { handle: "tourist", maxRatings: 500 });
  for (const e of out) {
    assert.equal(e.id, `codeforces:rating:${e.payload.contestId}`); // stable dedup key = contestId
    assert.equal(e.id.split(":")[1], e.kind); // must-fix §3.3
    assert.equal(e.id.split(":")[1], "rating");
  }
});

test("normalizeRatings caps at maxRatings (newest first)", () => {
  const out = normalizeRatings(fixture, { handle: "tourist", maxRatings: 5 });
  assert.equal(out.length, 5);
  // newest-first: each item's date >= the next item's date
  for (let i = 1; i < out.length; i++) {
    assert.ok(Date.parse(out[i - 1].date) >= Date.parse(out[i].date), "must be sorted date-desc");
  }
});

test("normalizeRatings returns [] on garbage / FAILED status (never throws)", () => {
  assert.deepEqual(normalizeRatings(null, { handle: "x", maxRatings: 50 }), []);
  assert.deepEqual(normalizeRatings({}, { handle: "x", maxRatings: 50 }), []);
  assert.deepEqual(
    normalizeRatings({ status: "FAILED", comment: "handle not found" }, { handle: "x", maxRatings: 50 }),
    []
  );
  assert.deepEqual(normalizeRatings({ status: "OK", result: "nope" }, { handle: "x", maxRatings: 50 }), []);
});
