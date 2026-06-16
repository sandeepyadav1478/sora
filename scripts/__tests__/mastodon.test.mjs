import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeStatuses } from "../adapters/mastodon.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/mastodon.json", import.meta.url), "utf8")
);

const cfg = { instance: "mastodon.social", user: "Gargron", maxPosts: 25 };

test("normalizeStatuses maps an original post to a post envelope (id/source/kind/title/url/date)", () => {
  const out = normalizeStatuses(fixture, cfg);
  const post = out.find((e) => e.id === "mastodon:post:116731432225015068");
  assert.ok(post, "original post must be present");
  assert.equal(post.source, "mastodon");
  assert.equal(post.kind, "post");
  assert.equal(post.url, "https://mastodon.social/@Gargron/116731432225015068"); // status.url, NOT uri
  assert.equal(post.date, "2026-06-11T12:18:21.289Z"); // status.created_at, passed through
  // title is synthesized from stripped HTML content; never empty, no tags
  assert.ok(post.title.length > 0);
  assert.ok(!/[<>]/.test(post.title), "title must not contain HTML tags");
  assert.ok(post.title.includes("Haken"), "title derives from stripped content");
});

test("dedup id is stableId('mastodon','post',status.id) and satisfies the id-kind invariant", () => {
  const out = normalizeStatuses(fixture, cfg);
  const post = out.find((e) => e.id === "mastodon:post:116731432225015068");
  assert.equal(post.id, "mastodon:post:116731432225015068");
  assert.equal(post.id.split(":")[1], "post"); // id-kind invariant (must-fix §3.3)
  assert.equal(post.id.split(":")[1], post.kind);
});

test("payload carries feed:'mastodon' and an excerpt", () => {
  const out = normalizeStatuses(fixture, cfg);
  const post = out.find((e) => e.id === "mastodon:post:116731432225015068");
  assert.equal(post.payload.feed, "mastodon");
  assert.ok(typeof post.payload.excerpt === "string" && post.payload.excerpt.length > 0);
});

test("curation: boosts (reblog!==null) and replies (in_reply_to_id!==null) are dropped", () => {
  const out = normalizeStatuses(fixture, cfg);
  // The boost and the reply ids must never appear as envelopes.
  assert.equal(out.some((e) => e.id === "mastodon:post:116731957320725067"), false); // boost
  assert.equal(out.some((e) => e.id === "mastodon:post:116731785476092840"), false); // reply
  // Every surviving envelope is an original top-level post.
  assert.ok(out.length >= 1);
  assert.ok(out.every((e) => e.kind === "post"));
});

test("normalizeStatuses returns [] for empty/garbage input (never throws)", () => {
  assert.deepEqual(normalizeStatuses([], cfg), []);
  assert.deepEqual(normalizeStatuses(null, cfg), []);
  assert.deepEqual(normalizeStatuses(undefined, cfg), []);
  assert.deepEqual(normalizeStatuses([{ junk: true }, 42, null], cfg), []);
});
