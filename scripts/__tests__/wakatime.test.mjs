import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeStats } from "../adapters/wakatime.mjs";
import { fetch_ as wakatimeFetch } from "../adapters/wakatime.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/wakatime.json", import.meta.url), "utf8")
);

const cfg = {
  enabled: true,
  handle: "octocat",
  profileUrl: "https://wakatime.com/@octocat",
  range: "last_7_days",
};

test("normalizeStats produces exactly one self-overwriting rating item", () => {
  const out = normalizeStats(fixture, cfg);
  assert.equal(out.length, 1, "must be a SINGLE item (no date in key -> self-overwrites)");
});

test("normalizeStats: envelope core fields are correct", () => {
  const [item] = normalizeStats(fixture, cfg);
  assert.equal(item.source, "wakatime");
  assert.equal(item.kind, "rating");
  assert.equal(item.title, "40 hrs 2 mins coding this week");
  assert.equal(item.url, "https://wakatime.com/@octocat");
  // Prefers the full-ISO top-level `end`; safeIso normalizes to a real ISO string.
  assert.equal(item.date, new Date("2026-06-10T23:59:59Z").toISOString());
});

test("normalizeStats: id is the stable, DATE-LESS dedup key", () => {
  const [item] = normalizeStats(fixture, cfg);
  // id MUST NOT contain the date — mergeSources REPLACES by id, a date-keyed id only churns.
  assert.equal(item.id, "wakatime:rating:last_7_days");
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(item.id), "id must contain no date");
});

test("normalizeStats: id-kind invariant — id.split(':')[1] === kind", () => {
  const [item] = normalizeStats(fixture, cfg);
  assert.equal(item.id.split(":")[1], "rating");
  assert.equal(item.id.split(":")[1], item.kind);
});

test("normalizeStats: payload carries the PROVISIONAL stats shape", () => {
  const [item] = normalizeStats(fixture, cfg);
  assert.equal(item.payload.platform, "wakatime");
  assert.equal(item.payload.totalSeconds, 144123);
  assert.equal(item.payload.humanReadableTotal, "40 hrs 2 mins");
  assert.equal(item.payload.range, "last_7_days");
  assert.equal(item.payload.dailyAverage, 20589);
  assert.deepEqual(
    item.payload.languages,
    ["TypeScript", "Python", "Astro"],
    "top languages by name, trimmed"
  );
});

test("normalizeStats: falls back to generatedAt when no usable end date", () => {
  const noDate = { data: { total_seconds: 10, human_readable_total: "10 secs" } };
  const [item] = normalizeStats(noDate, { ...cfg, generatedAt: "2026-06-11T00:00:00.000Z" });
  assert.equal(item.date, "2026-06-11T00:00:00.000Z");
});

test("normalizeStats: returns [] on garbage / empty input (never throws)", () => {
  assert.deepEqual(normalizeStats(null, cfg), []);
  assert.deepEqual(normalizeStats({}, cfg), []);
  assert.deepEqual(normalizeStats({ data: null }, cfg), []);
  assert.deepEqual(normalizeStats("nope", cfg), []);
});

test("fetch_ returns [] when WAKATIME_API_KEY is absent (graceful, no network, no throw)", async () => {
  const saved = process.env.WAKATIME_API_KEY;
  delete process.env.WAKATIME_API_KEY;
  try {
    const out = await wakatimeFetch(cfg);
    assert.deepEqual(out, [], "missing secret -> [] without throwing");
  } finally {
    if (saved !== undefined) process.env.WAKATIME_API_KEY = saved;
  }
});
