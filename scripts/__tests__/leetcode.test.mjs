import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeStats } from "../adapters/leetcode.mjs";
import { fetch_ as leetcodeFetch } from "../adapters/leetcode.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/leetcode.json", import.meta.url), "utf8")
);

const cfg = { enabled: true, handle: "sandeepyadav1478" };
const GEN = "2026-06-17T02:00:00.000Z";

test("normalizeStats produces exactly one self-overwriting rating item", () => {
  const out = normalizeStats(fixture, cfg, GEN);
  assert.equal(out.length, 1, "must be SINGLE item — date-less id self-overwrites");
});

test("normalizeStats: envelope core fields are correct", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  assert.equal(item.source, "leetcode");
  assert.equal(item.kind, "rating");
  assert.equal(item.title, "LeetCode: 61 solved (rank #2,215,747)");
  assert.equal(item.url, "https://leetcode.com/sandeepyadav1478/");
  assert.equal(item.date, GEN);
});

test("normalizeStats: id is the stable date-less dedup key", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  assert.equal(item.id, "leetcode:rating:sandeepyadav1478");
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(item.id), "id must contain no date");
});

test("normalizeStats: id-kind invariant — id.split(':')[1] === kind", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  assert.equal(item.id.split(":")[1], item.kind);
  assert.equal(item.kind, "rating");
});

test("normalizeStats: payload shape is correct", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  assert.equal(item.payload.platform, "leetcode");
  assert.deepEqual(item.payload.solved, { all: 61, easy: 48, medium: 13, hard: 0 });
  assert.equal(item.payload.ranking, 2215747);
});

test("normalizeStats: returns [] when matchedUser is null (non-existent handle)", () => {
  const notFound = { data: { matchedUser: null } };
  assert.deepEqual(normalizeStats(notFound, cfg, GEN), []);
});

test("normalizeStats: returns [] on garbage / empty input (never throws)", () => {
  assert.deepEqual(normalizeStats(null, cfg, GEN), []);
  assert.deepEqual(normalizeStats({}, cfg, GEN), []);
  assert.deepEqual(normalizeStats("nope", cfg, GEN), []);
});

test("fetch_ returns [] when handle is missing (graceful, no network, no throw)", async () => {
  const out = await leetcodeFetch({ enabled: true, handle: "" });
  assert.deepEqual(out, []);
});

test("normalizeStats: ranking=0 shows 'unranked' not 'rank #0'", () => {
  const unranked = {
    data: {
      matchedUser: {
        submitStats: { acSubmissionNum: [
          { difficulty: "All", count: 5 },
          { difficulty: "Easy", count: 5 },
          { difficulty: "Medium", count: 0 },
          { difficulty: "Hard", count: 0 },
        ]},
        profile: { ranking: 0 },
      },
    },
  };
  const [item] = normalizeStats(unranked, cfg, GEN);
  assert.ok(item.title.includes("unranked"), `expected 'unranked' in title, got: ${item.title}`);
  assert.ok(!item.title.includes("#0"), `title must not contain '#0', got: ${item.title}`);
  assert.equal(item.payload.ranking, 0, "raw ranking still stored as 0 in payload");
});
