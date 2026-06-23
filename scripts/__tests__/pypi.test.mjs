import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizePackage, fetch_ } from "../adapters/pypi.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/pypi.json", import.meta.url), "utf8")
);

test("normalizePackage emits one package envelope for the current release", () => {
  const out = normalizePackage(fixture, { maxPackages: 25 });
  assert.equal(out.length, 1);
  const e = out[0];
  const { name, version } = fixture.info;

  // id / source / kind
  assert.equal(e.source, "pypi");
  assert.equal(e.kind, "package");
  assert.equal(e.id, `pypi:package:${name}@${version}`);

  // id-kind invariant (must-fix §3.3): id.split(":")[1] === envelope.kind
  assert.equal(e.id.split(":")[1], "package");
  assert.equal(e.id.split(":")[1], e.kind);

  // title / url
  assert.equal(e.title, `${name} ${version}`);
  assert.equal(e.url, fixture.info.release_url);

  // date = earliest upload_time_iso_8601 across the release files, ISO-parseable
  const earliest = fixture.urls
    .map((u) => u.upload_time_iso_8601)
    .sort()[0];
  assert.equal(e.date, earliest);
  assert.ok(!Number.isNaN(Date.parse(e.date)));

  // payload: registry + version; no downloads field without stats
  assert.equal(e.payload.registry, "pypi");
  assert.equal(e.payload.version, version);
  assert.equal("monthlyDownloads" in e.payload, false);
});

test("dedup key (id) is the immutable name@version", () => {
  const out = normalizePackage(fixture, { maxPackages: 25 });
  const { name, version } = fixture.info;
  assert.equal(out[0].id, `pypi:package:${name}@${version}`);
});

test("falls back to package_url when release_url is missing", () => {
  const noReleaseUrl = {
    ...fixture,
    info: { ...fixture.info, release_url: "" },
  };
  const out = normalizePackage(noReleaseUrl, { maxPackages: 25 });
  assert.equal(out[0].url, fixture.info.package_url);
});

test("skips a release whose files array is empty (no upload time to date it)", () => {
  const noFiles = { ...fixture, urls: [] };
  assert.deepEqual(normalizePackage(noFiles, { maxPackages: 25 }), []);
});

test("returns [] on garbage / missing info (never throws)", () => {
  assert.deepEqual(normalizePackage(null, { maxPackages: 25 }), []);
  assert.deepEqual(normalizePackage({}, { maxPackages: 25 }), []);
  assert.deepEqual(normalizePackage({ info: {} }, { maxPackages: 25 }), []);
  assert.deepEqual(normalizePackage("nope", { maxPackages: 25 }), []);
});

// --- enriched payload tests ---

test("monthlyDownloads appears in payload when pypistats returns data", () => {
  const stats = { data: { last_month: 315, last_week: 28, last_day: 0 } };
  const out = normalizePackage(fixture, { maxPackages: 25 }, stats);
  assert.equal(out.length, 1);
  assert.equal(out[0].payload.monthlyDownloads, 315);
  assert.equal(out[0].payload.weeklyDownloads, 28);
});

test("title includes download count when stats are present", () => {
  const stats = { data: { last_month: 315, last_week: 28, last_day: 0 } };
  const out = normalizePackage(fixture, { maxPackages: 25 }, stats);
  const { name, version } = fixture.info;
  assert.equal(out[0].title, `${name} ${version} · 315 downloads/mo`);
});

test("keywords is an array (comma-separated string input)", () => {
  const withKeywords = {
    ...fixture,
    info: {
      ...fixture.info,
      keywords: "doppler, durable, event-sourcing, messaging, middleware, outbox, sqlite",
    },
  };
  const out = normalizePackage(withKeywords, { maxPackages: 25 });
  assert.equal(out.length, 1);
  assert.ok(Array.isArray(out[0].payload.keywords));
  // capped at 5
  assert.ok(out[0].payload.keywords.length <= 5);
  assert.ok(out[0].payload.keywords.every((k) => typeof k === "string"));
});

test("keywords is absent (not empty array) when info.keywords is empty", () => {
  const noKeywords = {
    ...fixture,
    info: { ...fixture.info, keywords: "" },
  };
  const out = normalizePackage(noKeywords, { maxPackages: 25 });
  assert.equal(out.length, 1);
  assert.equal("keywords" in out[0].payload, false);
});

test("filter skips package with < 10 monthly downloads", () => {
  const stats = { data: { last_month: 5, last_week: 2, last_day: 0 } };
  const out = normalizePackage(fixture, { maxPackages: 25 }, stats);
  assert.deepEqual(out, []);
});

test("filter passes package with exactly 10 monthly downloads", () => {
  const stats = { data: { last_month: 10, last_week: 3, last_day: 0 } };
  const out = normalizePackage(fixture, { maxPackages: 25 }, stats);
  assert.equal(out.length, 1);
  assert.equal(out[0].payload.monthlyDownloads, 10);
});

test("payload includes license, requiresPython, releaseCount when present", () => {
  const withMeta = {
    ...fixture,
    info: {
      ...fixture.info,
      license: "MIT",
      requires_python: ">=3.10",
    },
  };
  const out = normalizePackage(withMeta, { maxPackages: 25 });
  assert.equal(out.length, 1);
  assert.equal(out[0].payload.license, "MIT");
  assert.equal(out[0].payload.requiresPython, ">=3.10");
  assert.ok(typeof out[0].payload.releaseCount === "number");
  assert.ok(out[0].payload.releaseCount > 0);
});

test("isTyped is true when Typing :: Typed classifier is present", () => {
  const typed = {
    ...fixture,
    info: {
      ...fixture.info,
      classifiers: [
        ...(fixture.info.classifiers || []),
        "Typing :: Typed",
      ],
    },
  };
  const out = normalizePackage(typed, { maxPackages: 25 });
  assert.equal(out.length, 1);
  assert.equal(out[0].payload.isTyped, true);
});

test("isTyped is false when Typing :: Typed classifier is absent", () => {
  const notTyped = {
    ...fixture,
    info: {
      ...fixture.info,
      classifiers: (fixture.info.classifiers || []).filter(
        (c) => c !== "Typing :: Typed"
      ),
    },
  };
  const out = normalizePackage(notTyped, { maxPackages: 25 });
  assert.equal(out.length, 1);
  assert.equal(out[0].payload.isTyped, false);
});

test("devStatus extracted from Development Status classifier", () => {
  const withStatus = {
    ...fixture,
    info: {
      ...fixture.info,
      classifiers: ["Development Status :: 4 - Beta"],
    },
  };
  const out = normalizePackage(withStatus, { maxPackages: 25 });
  assert.equal(out.length, 1);
  assert.equal(out[0].payload.devStatus, "Beta");
});

test("topicCategory extracted from Topic classifier", () => {
  const withTopic = {
    ...fixture,
    info: {
      ...fixture.info,
      classifiers: ["Topic :: System :: Distributed Computing"],
    },
  };
  const out = normalizePackage(withTopic, { maxPackages: 25 });
  assert.equal(out.length, 1);
  assert.equal(out[0].payload.topicCategory, "Distributed Computing");
});

// --- fetch_ mock tests ---

const origFetch = globalThis.fetch;

test("fetch_ returns envelopes for a valid package", async () => {
  globalThis.fetch = async (url) => {
    if (url.includes("pypistats")) {
      return { ok: true, json: async () => ({ data: { last_month: 100, last_week: 25, last_day: 1 } }) };
    }
    return {
      ok: true,
      json: async () => ({
        info: {
          name: "mylib",
          summary: "A library",
          version: "2.0.0",
          release_url: "https://pypi.org/project/mylib/2.0.0/",
          package_url: "https://pypi.org/project/mylib/",
          keywords: "",
          classifiers: [],
          license: null,
          requires_python: null,
        },
        urls: [{ upload_time_iso_8601: "2026-01-01T00:00:00Z" }],
        releases: { "1.0.0": [], "2.0.0": [] },
      }),
    };
  };
  try {
    const out = await fetch_({ handle: "mylib" });
    assert.ok(Array.isArray(out));
    assert.ok(out.length >= 1);
    assert.equal(out[0].source, "pypi");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("fetch_ returns [] for missing cfg", async () => {
  const out = await fetch_(undefined);
  assert.deepEqual(out, []);
});

test("fetch_ returns [] on network error", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network failed");
  };
  try {
    const out = await fetch_({ handle: "mylib" });
    assert.deepEqual(out, []);
  } finally {
    globalThis.fetch = orig;
  }
});

test("fetch_ returns [] on non-200 HTTP response", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  try {
    const out = await fetch_({ handle: "mylib" });
    assert.deepEqual(out, []);
  } finally {
    globalThis.fetch = orig;
  }
});

test("fetch_ proceeds normally when pypistats fetch fails", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes("pypistats")) throw new Error("pypistats down");
    return {
      ok: true,
      json: async () => ({
        info: {
          name: "mylib",
          version: "1.0.0",
          release_url: "https://pypi.org/project/mylib/1.0.0/",
          package_url: "https://pypi.org/project/mylib/",
          keywords: "",
          classifiers: [],
          license: null,
          requires_python: null,
        },
        urls: [{ upload_time_iso_8601: "2026-01-01T00:00:00Z" }],
        releases: { "1.0.0": [] },
      }),
    };
  };
  try {
    const out = await fetch_({ handle: "mylib" });
    assert.ok(Array.isArray(out));
    assert.ok(out.length >= 1);
    // no monthlyDownloads since stats failed
    assert.equal("monthlyDownloads" in out[0].payload, false);
  } finally {
    globalThis.fetch = orig;
  }
});
