import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeNpm } from "../adapters/npm.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/npm.json", import.meta.url), "utf8")
);
const noDownloads = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/npm-nodownloads.json", import.meta.url), "utf8")
);

const cfg = { maxPackages: 10 };

test("npm: maps latest version to a single package envelope", () => {
  const out = normalizeNpm(fixture, cfg);
  assert.equal(out.length, 1);
  const e = out[0];

  // id / dedup key — id:package:{name}@{version}
  assert.equal(e.id, "npm:package:express@5.2.1");
  // id-kind invariant (must-fix §3.3): id.split(":")[1] === envelope.kind
  assert.equal(e.id.split(":")[1], "package");
  assert.equal(e.id.split(":")[1], e.kind);

  assert.equal(e.source, "npm");
  assert.equal(e.kind, "package");
  assert.equal(e.title, "express 5.2.1");
  // url is CONSTRUCTED (registry does not return it)
  assert.equal(e.url, "https://www.npmjs.com/package/express/v/5.2.1");
  // date = time[version], ISO-parseable
  assert.equal(e.date, "2025-12-01T20:49:43.268Z");
  assert.ok(!Number.isNaN(Date.parse(e.date)));

  // payload carries registry marker, version, and the optional downloads count
  assert.equal(e.payload.registry, "npm");
  assert.equal(e.payload.version, "5.2.1");
  assert.equal(e.payload.downloads, 449230493);
});

test("npm: downloads is optional — {error} host omits it, envelope still valid", () => {
  const out = normalizeNpm(noDownloads, cfg);
  assert.equal(out.length, 1);
  const e = out[0];
  assert.equal(e.id, "npm:package:express@5.2.1");
  assert.equal(e.payload.version, "5.2.1");
  // guarded: no downloads key when the host returned {error}
  assert.equal("downloads" in e.payload, false);
});

test("npm: never emits a created/modified pseudo-entry", () => {
  const out = normalizeNpm(fixture, cfg);
  // only the latest version, nothing keyed off time.created/time.modified
  assert.equal(out.length, 1);
  assert.ok(!out.some((e) => /@created$|@modified$/.test(e.id)));
});

test("npm: returns [] on garbage", () => {
  assert.deepEqual(normalizeNpm(null, cfg), []);
  assert.deepEqual(normalizeNpm({}, cfg), []);
  assert.deepEqual(normalizeNpm({ registry: {} }, cfg), []);
  assert.deepEqual(normalizeNpm({ registry: { "dist-tags": {} } }, cfg), []);
});
