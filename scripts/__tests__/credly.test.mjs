import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCredy, fetch_ } from "../adapters/credly.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/credly.json", import.meta.url), "utf8")
);

const origFetch = globalThis.fetch;

// ── normalizeCredy ─────────────────────────────────────────────────────────

test("normalizeCredy: happy-path badge maps to correct envelope fields", () => {
  const out = normalizeCredy(fixture, { maxBadges: 50 });
  const e = out.find(x => x.id.includes("badge-001"));
  assert.ok(e, "badge-001 must be in output");
  assert.equal(e.source, "credly");
  assert.equal(e.kind, "badge");
  assert.equal(e.id, "credly:badge:badge-001");
  assert.equal(e.id.split(":")[1], e.kind, "id-kind invariant");
  assert.equal(e.title, "AWS Certified Solutions Architect – Associate");
  assert.equal(e.url, "https://www.credly.com/badges/badge-001");
  assert.equal(Number.isNaN(Date.parse(e.date)), false);
  assert.equal(e.payload.issuer, "Amazon Web Services");
  assert.equal(e.payload.expired, false);
  assert.equal(e.payload.expiresAt, null);
});

test("normalizeCredy: expired badge included with payload.expired=true by default", () => {
  const out = normalizeCredy(fixture, { maxBadges: 50 });
  const e = out.find(x => x.id.includes("badge-002"));
  assert.ok(e, "expired badge-002 must be present when includeExpired defaults to true");
  assert.equal(e.payload.expired, true);
  assert.equal(e.payload.expiresAt, "2020-01-01");
});

test("normalizeCredy: expired badge excluded when includeExpired:false", () => {
  const out = normalizeCredy(fixture, { maxBadges: 50, includeExpired: false });
  const e = out.find(x => x.id.includes("badge-002"));
  assert.equal(e, undefined, "expired badge-002 must be excluded when includeExpired:false");
});

test("normalizeCredy: pending badge is filtered out", () => {
  const out = normalizeCredy(fixture, { maxBadges: 50 });
  const e = out.find(x => x.id.includes("badge-003"));
  assert.equal(e, undefined, "pending badge-003 must not appear in output");
});

test("normalizeCredy: caps at maxBadges and sorts newest-first", () => {
  const out = normalizeCredy(fixture, { maxBadges: 2 });
  assert.equal(out.length, 2);
  assert.ok(Date.parse(out[0].date) >= Date.parse(out[1].date));
});

test("normalizeCredy: minimal badge (empty issuer/description/imageUrl) still valid", () => {
  const out = normalizeCredy(fixture, { maxBadges: 50 });
  const e = out.find(x => x.id.includes("badge-004"));
  assert.ok(e, "minimal badge-004 must be present");
  assert.equal(e.payload.expired, false);
  assert.equal(e.payload.expiresAt, null);
  assert.equal(e.payload.imageUrl, null);
});

test("normalizeCredy: returns [] on null/empty/garbage input", () => {
  assert.deepEqual(normalizeCredy(null, {}), []);
  assert.deepEqual(normalizeCredy([], {}), []);
  assert.deepEqual(normalizeCredy("not-an-array", {}), []);
  assert.deepEqual(normalizeCredy([{ state: "accepted" }], {}), []);
});

test("normalizeCredy: accepts { data: [...] } wrapper shape", () => {
  const out = normalizeCredy({ data: fixture }, { maxBadges: 50 });
  assert.ok(out.length >= 1, "must handle wrapped data key");
});

// ── fetch_ ─────────────────────────────────────────────────────────────────

test("fetch_: happy path — mock returns fixture, output has credly envelopes", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => fixture });
  const out = await fetch_({ handle: "user" });
  assert.ok(Array.isArray(out));
  assert.ok(out.length >= 1);
  assert.equal(out[0].source, "credly");
  globalThis.fetch = origFetch;
});

test("fetch_: missing handle returns []", async () => {
  assert.deepEqual(await fetch_(undefined), []);
  assert.deepEqual(await fetch_({}), []);
  assert.deepEqual(await fetch_({ handle: "" }), []);
});

test("fetch_: network error returns []", async () => {
  globalThis.fetch = async () => { throw new Error("Network failed"); };
  const out = await fetch_({ handle: "user" });
  assert.deepEqual(out, []);
  globalThis.fetch = origFetch;
});

test("fetch_: HTTP 404 returns []", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const out = await fetch_({ handle: "nobody" });
  assert.deepEqual(out, []);
  globalThis.fetch = origFetch;
});

test("fetch_: HTTP 429 rate limit returns []", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const out = await fetch_({ handle: "user" });
  assert.deepEqual(out, []);
  globalThis.fetch = origFetch;
});
