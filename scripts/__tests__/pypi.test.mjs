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

  // payload: registry + version, no downloads field
  assert.deepEqual(e.payload, { registry: "pypi", version });
  assert.equal("downloads" in e.payload, false);
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

// --- fetch_ mock tests ---

const origFetch = globalThis.fetch;

test("fetch_ returns envelopes for a valid package", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      info: {
        name: "mylib",
        summary: "A library",
        version: "2.0.0",
        release_url: "https://pypi.org/project/mylib/2.0.0/",
        package_url: "https://pypi.org/project/mylib/",
        keywords: "",
      },
      urls: [{ upload_time_iso_8601: "2026-01-01T00:00:00Z" }],
    }),
  });
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
