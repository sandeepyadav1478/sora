import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseFeed } from "../lib/parseFeed.mjs";
import { normalizeVideos, fetch_ } from "../adapters/youtube.mjs";

const origFetch = globalThis.fetch;

const { xml } = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/youtube.json", import.meta.url), "utf8")
);
// `feedTitle` mirrors what fetch_ forwards from parseFeed(xml).feedTitle so the
// pure transform can populate payload.channel without a network round-trip.
const cfg = { handle: "UCBJycsmduvYEL83R_U4JriQ", maxVideos: 10, feedTitle: "Marques Brownlee" };

test("youtube: maps the first entry to a valid video envelope", () => {
  const items = parseFeed(xml).items;
  const out = normalizeVideos(items, cfg);
  assert.ok(out.length > 0, "expected at least one envelope");

  const top = out[0]; // sorted date-desc -> the WWDC 2026 video
  assert.equal(top.source, "youtube");
  assert.equal(top.kind, "video");
  assert.equal(top.id, "youtube:video:_gCXmKjDecU");
  assert.equal(top.title, "WWDC 2026 Impressions: Yeah, That's About Right");
  assert.equal(top.url, "https://www.youtube.com/watch?v=_gCXmKjDecU");
  // parseFeed maps Atom `date` to <updated> (falling back to <published>); the adapter
  // forwards that. The captured live fixture's <updated> is the value below.
  assert.equal(top.date, "2026-06-11T15:50:16.000Z");
  assert.equal(top.payload.channel, "Marques Brownlee");
  assert.equal(top.payload.thumbnail, "https://i4.ytimg.com/vi/_gCXmKjDecU/hqdefault.jpg");
  // views is a live counter; the captured fixture's value is below.
  assert.equal(top.payload.views, 3333754);
});

test("youtube: dedup key is the bare videoId and the id-kind invariant holds", () => {
  const out = normalizeVideos(parseFeed(xml).items, cfg);
  for (const e of out) {
    // INVARIANT (must-fix §3.3): id.split(":")[1] === envelope.kind
    assert.equal(e.id.split(":")[1], "video");
    assert.equal(e.id.split(":")[1], e.kind);
    // dedup key = third segment = the bare YouTube video id (no "yt:video:" prefix)
    const key = e.id.split(":")[2];
    assert.match(key, /^[\w-]{6,}$/);
    assert.equal(e.id, `youtube:video:${key}`);
  }
  // no duplicate ids
  const ids = out.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("youtube: respects maxVideos cap, newest first", () => {
  const out = normalizeVideos(parseFeed(xml).items, { handle: "UC_x", maxVideos: 3 });
  assert.equal(out.length, 3);
  const dates = out.map((e) => Date.parse(e.date));
  assert.deepEqual([...dates].sort((a, b) => b - a), dates);
});

test("youtube: returns [] on garbage / non-array input", () => {
  assert.deepEqual(normalizeVideos(null, cfg), []);
  assert.deepEqual(normalizeVideos(undefined, cfg), []);
  assert.deepEqual(normalizeVideos("nope", cfg), []);
  assert.deepEqual(normalizeVideos([], cfg), []);
  assert.deepEqual(normalizeVideos([{ title: "no id, dropped" }], cfg), []);
});

// fetch_ mock tests — requires a valid UC… handle (>=22 chars total, regex ^UC[\w-]{20,}$)
const VALID_HANDLE = "UCBJycsmduvYEL83R_U4JriQ";

const MOCK_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/"
      xmlns="http://www.w3.org/2005/Atom">
  <title>TestChannel</title>
  <entry>
    <yt:videoId>abc123456789</yt:videoId>
    <title>Test Video</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123456789"/>
    <updated>2026-01-01T00:00:00+00:00</updated>
    <id>yt:video:abc123456789</id>
    <media:thumbnail url="https://i4.ytimg.com/vi/abc123456789/hqdefault.jpg"/>
    <media:statistics views="42"/>
  </entry>
</feed>`;

test("fetch_ returns envelopes for a valid channel", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => MOCK_ATOM_XML,
  });
  try {
    const out = await fetch_({ handle: VALID_HANDLE });
    assert.ok(Array.isArray(out));
    assert.ok(out.length >= 1);
    assert.equal(out[0].source, "youtube");
    assert.equal(out[0].kind, "video");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("fetch_ returns [] for missing cfg", async () => {
  const out = await fetch_(undefined);
  assert.deepEqual(out, []);
});

test("fetch_ returns [] on network error", async () => {
  globalThis.fetch = async () => {
    throw new Error("Network failed");
  };
  try {
    const out = await fetch_({ handle: VALID_HANDLE });
    assert.deepEqual(out, []);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("fetch_ returns [] on non-200 HTTP response", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => "" });
  try {
    const out = await fetch_({ handle: VALID_HANDLE });
    assert.deepEqual(out, []);
  } finally {
    globalThis.fetch = origFetch;
  }
});
