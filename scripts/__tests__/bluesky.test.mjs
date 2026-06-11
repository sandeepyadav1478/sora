import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeFeed } from "../adapters/bluesky.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/bluesky.json", import.meta.url), "utf8")
);
const cfg = { handle: "bsky.app", maxPosts: 50 };

// Helper: last path segment of an at:// uri is the rkey.
const rkeyOf = (uri) => uri.split("/").pop();

test("bluesky: maps an original post to a correct post envelope", () => {
  const out = normalizeFeed(fixture, cfg);
  assert.ok(out.length > 0, "expected at least one original post");

  // Find the known original from the fixture by its uri.
  const original = fixture.feed.find(
    (it) => !it.reason && !it.post.record.reply
  );
  const post = original.post;
  const rkey = rkeyOf(post.uri);
  const env = out.find((e) => e.id === `bluesky:post:${post.uri}`);
  assert.ok(env, "original post should be present in output");

  // Field correctness.
  assert.equal(env.source, "bluesky");
  assert.equal(env.kind, "post");
  assert.equal(env.id, `bluesky:post:${post.uri}`); // dedup key = at:// uri (DID-stable)
  assert.equal(env.url, `https://bsky.app/profile/${post.author.handle}/post/${rkey}`);
  assert.equal(env.date, post.indexedAt);
  assert.ok(env.title.length > 0, "title must be non-empty (synthTitle guard)");
  assert.equal(env.payload.feed, "bluesky");

  // id-kind invariant (must-fix §3.3).
  assert.equal(env.id.split(":")[1], "post");
});

test("bluesky: DROPS reposts (item .reason) and replies (record.reply)", () => {
  const out = normalizeFeed(fixture, cfg);
  const outUris = new Set(out.map((e) => e.id.replace("bluesky:post:", "")));

  const repostUris = fixture.feed.filter((it) => it.reason).map((it) => it.post.uri);
  const replyUris = fixture.feed
    .filter((it) => it.post.record.reply)
    .map((it) => it.post.uri);

  assert.ok(repostUris.length > 0, "fixture must contain a repost to test the filter");
  assert.ok(replyUris.length > 0, "fixture must contain a reply to test the filter");

  for (const uri of repostUris) {
    assert.ok(!outUris.has(uri), `repost should be dropped: ${uri}`);
  }
  for (const uri of replyUris) {
    assert.ok(!outUris.has(uri), `reply should be dropped: ${uri}`);
  }

  // Output count == number of originals in the fixture.
  const expectedOriginals = fixture.feed.filter(
    (it) => !it.reason && !it.post.record.reply
  ).length;
  assert.equal(out.length, Math.min(expectedOriginals, cfg.maxPosts));
});

test("bluesky: caps at cfg.maxPosts, newest first", () => {
  const out = normalizeFeed(fixture, { handle: "bsky.app", maxPosts: 2 });
  assert.ok(out.length <= 2);
  if (out.length === 2) {
    assert.ok(Date.parse(out[0].date) >= Date.parse(out[1].date), "sorted date desc");
  }
});

test("bluesky: returns [] on garbage input", () => {
  assert.deepEqual(normalizeFeed(null, cfg), []);
  assert.deepEqual(normalizeFeed({}, cfg), []);
  assert.deepEqual(normalizeFeed({ feed: "nope" }, cfg), []);
  assert.deepEqual(normalizeFeed({ feed: [{}, { post: {} }] }, cfg), []);
});
