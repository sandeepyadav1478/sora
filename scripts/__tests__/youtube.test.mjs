import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseFeed } from "../lib/parseFeed.mjs";
import { normalizeVideos } from "../adapters/youtube.mjs";

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
