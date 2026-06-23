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
  assert.ok(item.title.startsWith("LeetCode: 61 solved"), `unexpected title: ${item.title}`);
  assert.ok(item.title.includes("Python"), `title must include Python: ${item.title}`);
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

test("normalizeStats: payload core shape is correct", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  assert.equal(item.payload.platform, "leetcode");
  assert.deepEqual(item.payload.solved, { all: 61, easy: 48, medium: 13, hard: 0 });
  assert.equal(item.payload.ranking, 2215747);
});

test("normalizeStats: tagBreakdown contains DFS with count >= 1", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  const tags = item.payload.tagBreakdown;
  assert.ok(Array.isArray(tags), "tagBreakdown must be an array");
  const dfs = tags.find((t) => t.tag === "DFS");
  assert.ok(dfs, `expected DFS tag in tagBreakdown, got: ${JSON.stringify(tags)}`);
  assert.ok(dfs.count >= 1, `DFS count must be >= 1, got: ${dfs.count}`);
});

test("normalizeStats: tagBreakdown excludes Database tag", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  const tags = item.payload.tagBreakdown ?? [];
  const db = tags.find((t) => t.tag === "Database");
  assert.ok(!db, "Database must be excluded from tagBreakdown");
});

test("normalizeStats: tagBreakdown is sorted descending and capped at 8", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  const tags = item.payload.tagBreakdown ?? [];
  assert.ok(tags.length <= 8, `tagBreakdown must have at most 8 entries, got ${tags.length}`);
  for (let i = 1; i < tags.length; i++) {
    assert.ok(
      tags[i - 1].count >= tags[i].count,
      `tagBreakdown not sorted at index ${i}: ${tags[i - 1].count} < ${tags[i].count}`
    );
  }
});

test("normalizeStats: languages contains Python3", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  const langs = item.payload.languages;
  assert.ok(Array.isArray(langs), "languages must be an array");
  const py = langs.find((l) => l.lang === "Python3");
  assert.ok(py, `expected Python3 in languages, got: ${JSON.stringify(langs)}`);
  assert.ok(py.count > 0, `Python3 count must be > 0, got: ${py.count}`);
});

test("normalizeStats: calendar.activeYears is a non-empty array", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  const cal = item.payload.calendar;
  assert.ok(cal, "calendar must be present");
  assert.ok(Array.isArray(cal.activeYears), "calendar.activeYears must be an array");
  assert.ok(cal.activeYears.length > 0, "calendar.activeYears must not be empty");
  assert.ok(cal.activeYears.includes(2026), "activeYears must include 2026");
});

test("normalizeStats: calendar.streak absent when streak < 7", () => {
  // fixture streak = 2, below threshold
  const [item] = normalizeStats(fixture, cfg, GEN);
  const cal = item.payload.calendar;
  assert.ok(!("streak" in cal), "streak must be absent when < 7");
});

test("normalizeStats: calendar.streak present when streak >= 7", () => {
  const withStreak = JSON.parse(JSON.stringify(fixture));
  withStreak.data.matchedUser.userCalendar.streak = 10;
  const [item] = normalizeStats(withStreak, cfg, GEN);
  assert.equal(item.payload.calendar.streak, 10, "streak must appear when >= 7");
});

test("normalizeStats: beats payload present with easy and medium percentages", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  const beats = item.payload.beats;
  assert.ok(beats, "beats must be present");
  assert.ok(typeof beats.easy === "number" && beats.easy > 0, `beats.easy must be > 0, got: ${beats.easy}`);
  assert.ok(typeof beats.medium === "number" && beats.medium > 0, `beats.medium must be > 0, got: ${beats.medium}`);
  assert.ok(!("hard" in beats), "beats.hard must be absent when percentage is null");
});

test("normalizeStats: contest payload present when attended >= 1", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  const contest = item.payload.contest;
  assert.ok(contest, "contest must be present");
  assert.ok(contest.attended >= 1, `contest.attended must be >= 1, got: ${contest.attended}`);
  // topPercentage only shown when < 50
  assert.ok("topPercentage" in contest, "topPercentage 48.5 < 50 so must be included");
});

test("normalizeStats: contest.topPercentage absent when >= 50", () => {
  const high = JSON.parse(JSON.stringify(fixture));
  high.data.userContestRanking.topPercentage = 55;
  const [item] = normalizeStats(high, cfg, GEN);
  assert.ok(!("topPercentage" in (item.payload.contest ?? {})), "topPercentage >= 50 must be hidden");
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
          { difficulty: "All",    count: 5 },
          { difficulty: "Easy",   count: 5 },
          { difficulty: "Medium", count: 0 },
          { difficulty: "Hard",   count: 0 },
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
