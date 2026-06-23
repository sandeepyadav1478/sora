import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeStats, normalizePublicStats } from "../adapters/wakatime.mjs";
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
  const noDate = { data: { total_seconds: 7200, human_readable_total: "2 hrs" } };
  const [item] = normalizeStats(noDate, { ...cfg, generatedAt: "2026-06-11T00:00:00.000Z" });
  assert.equal(item.date, "2026-06-11T00:00:00.000Z");
});

test("normalizeStats: returns [] on garbage / empty input (never throws)", () => {
  assert.deepEqual(normalizeStats(null, cfg), []);
  assert.deepEqual(normalizeStats({}, cfg), []);
  assert.deepEqual(normalizeStats({ data: null }, cfg), []);
  assert.deepEqual(normalizeStats("nope", cfg), []);
});

// --- normalizePublicStats tests ---

const publicFixture = {
  data: {
    categories: [
      { name: "Coding", percent: 69.91 },
      { name: "AI Coding", percent: 13.68 },
      { name: "Meeting", percent: 12.25 },
    ],
    editors: [
      { name: "VS Code", percent: 80.65 },
      { name: "Claude Code", percent: 5.5 },
      { name: "PyCharm", percent: 1.47 },
      { name: "Vim", percent: 0.3 },
    ],
    languages: [
      { name: "Python", percent: 60.48 },
      { name: "Terraform", percent: 1.75 },
      { name: "Docker", percent: 1.09 },
      { name: "Bash", percent: 0.98 },
      { name: "YAML", percent: 0.2 },
    ],
    operating_systems: [
      { name: "Mac", percent: 53.19 },
      { name: "Linux", percent: 20.82 },
      { name: "Windows", percent: 13.74 },
      { name: "Unknown", percent: 0.5 },
    ],
  },
};

test("normalizePublicStats: happy path produces one envelope with correct id", () => {
  const out = normalizePublicStats(publicFixture, cfg);
  assert.equal(out.length, 1);
  const [item] = out;
  assert.equal(item.id, "wakatime:rating:public-alltime");
  assert.equal(item.source, "wakatime");
  assert.equal(item.kind, "rating");
  assert.equal(item.payload.subkind, "public");
  assert.equal(item.payload.platform, "wakatime");
});

test("normalizePublicStats: categories are filtered to percent > 0", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  assert.deepEqual(item.payload.categories, [
    { name: "Coding", percent: 69.91 },
    { name: "AI Coding", percent: 13.68 },
    { name: "Meeting", percent: 12.25 },
  ]);
});

test("normalizePublicStats: editors top 5 filtered to percent > 0.5", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  // Vim at 0.3 should be filtered out
  assert.deepEqual(item.payload.editors, [
    { name: "VS Code", percent: 80.65 },
    { name: "Claude Code", percent: 5.5 },
    { name: "PyCharm", percent: 1.47 },
  ]);
});

test("normalizePublicStats: languages filtered to percent >= 0.5", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  // YAML at 0.2 should be filtered out
  assert.deepEqual(item.payload.languages, [
    { name: "Python", percent: 60.48 },
    { name: "Terraform", percent: 1.75 },
    { name: "Docker", percent: 1.09 },
    { name: "Bash", percent: 0.98 },
  ]);
});

test("normalizePublicStats: os filtered to percent > 1", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  // Unknown at 0.5 should be filtered out
  assert.deepEqual(item.payload.os, [
    { name: "Mac", percent: 53.19 },
    { name: "Linux", percent: 20.82 },
    { name: "Windows", percent: 13.74 },
  ]);
});

test("normalizePublicStats: extracts aiCodingPercent correctly", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  assert.equal(item.payload.aiCodingPercent, 13.68);
});

test("normalizePublicStats: aiCodingPercent is 0 when no AI Coding category", () => {
  const raw = {
    data: {
      categories: [{ name: "Coding", percent: 100 }],
      editors: [],
      languages: [],
      operating_systems: [],
    },
  };
  const [item] = normalizePublicStats(raw, cfg);
  assert.equal(item.payload.aiCodingPercent, 0);
});

test("normalizePublicStats: returns [] when categories is missing", () => {
  const raw = { data: { editors: [], languages: [], operating_systems: [] } };
  assert.deepEqual(normalizePublicStats(raw, cfg), []);
});

test("normalizePublicStats: returns [] when all categories have percent 0", () => {
  const raw = {
    data: {
      categories: [{ name: "Coding", percent: 0 }],
      editors: [],
      languages: [],
      operating_systems: [],
    },
  };
  assert.deepEqual(normalizePublicStats(raw, cfg), []);
});

test("normalizePublicStats: returns [] on garbage / empty input (never throws)", () => {
  assert.deepEqual(normalizePublicStats(null, cfg), []);
  assert.deepEqual(normalizePublicStats({}, cfg), []);
  assert.deepEqual(normalizePublicStats({ data: null }, cfg), []);
  assert.deepEqual(normalizePublicStats("nope", cfg), []);
});

const origFetch = globalThis.fetch;

test("fetch_ returns [] when WAKATIME_API_KEY is absent (graceful, no throw)", async () => {
  const saved = process.env.WAKATIME_API_KEY;
  delete process.env.WAKATIME_API_KEY;
  // Stub fetch so the public endpoint call (which needs no key) returns empty categories -> []
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: { categories: [], editors: [], languages: [], operating_systems: [] } }),
  });
  try {
    const out = await wakatimeFetch(cfg);
    assert.deepEqual(out, [], "missing key + empty public stats -> [] without throwing");
  } finally {
    globalThis.fetch = origFetch;
    if (saved !== undefined) process.env.WAKATIME_API_KEY = saved;
  }
});

test("fetch_ sends correct Basic auth header", async () => {
  const captured = {};
  const apiKey = "test-api-key-123";
  const expectedAuth = "Basic " + Buffer.from(apiKey + ":").toString("base64");
  const savedKey = process.env.WAKATIME_API_KEY;
  process.env.WAKATIME_API_KEY = apiKey;
  globalThis.fetch = async (url, opts) => {
    // Only capture the auth header when it is present (the authed endpoints)
    const authHeader = opts?.headers?.Authorization || opts?.headers?.authorization;
    if (authHeader) captured.auth = authHeader;
    return {
      ok: true,
      json: async () => ({
        data: {
          username: "user",
          human_readable_total: "10 hrs",
          total_seconds: 36000,
          languages: [],
          editors: [],
          categories: [],
          operating_systems: [],
        },
      }),
    };
  };
  try {
    await wakatimeFetch({ ...cfg, enabled: true });
    assert.equal(captured.auth, expectedAuth, "WakaTime must use Basic base64(apiKey:) auth");
  } finally {
    globalThis.fetch = origFetch;
    if (savedKey !== undefined) process.env.WAKATIME_API_KEY = savedKey;
    else delete process.env.WAKATIME_API_KEY;
  }
});

test("fetch_ returns [] for missing cfg", async () => {
  const out = await wakatimeFetch(undefined);
  assert.deepEqual(out, []);
});

test("fetch_ returns [] on network error", async () => {
  const savedKey = process.env.WAKATIME_API_KEY;
  process.env.WAKATIME_API_KEY = "some-key";
  globalThis.fetch = async () => {
    throw new Error("Network failed");
  };
  try {
    const out = await wakatimeFetch({ ...cfg, enabled: true });
    assert.deepEqual(out, []);
  } finally {
    globalThis.fetch = origFetch;
    if (savedKey !== undefined) process.env.WAKATIME_API_KEY = savedKey;
    else delete process.env.WAKATIME_API_KEY;
  }
});

test("fetch_ returns [] on non-200 HTTP response", async () => {
  const savedKey = process.env.WAKATIME_API_KEY;
  process.env.WAKATIME_API_KEY = "some-key";
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  try {
    const out = await wakatimeFetch({ ...cfg, enabled: true });
    assert.deepEqual(out, []);
  } finally {
    globalThis.fetch = origFetch;
    if (savedKey !== undefined) process.env.WAKATIME_API_KEY = savedKey;
    else delete process.env.WAKATIME_API_KEY;
  }
});
