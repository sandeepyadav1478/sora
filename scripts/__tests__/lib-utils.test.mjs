import { test } from "node:test";
import assert from "node:assert/strict";
import { toIso, safeIso } from "../lib/datetime.mjs";
import { stripHtml, synthTitle, decodeEntities, truncate } from "../lib/text.mjs";
import { parseFeed } from "../lib/parseFeed.mjs";

test("toIso converts unix SECONDS (not ms) to ISO", () => {
  // 1779557700 s == 1779557700000 ms; the *1000 is the load-bearing behavior.
  assert.equal(toIso(1779557700), "2026-05-23T17:35:00.000Z");
});

test("safeIso returns null on garbage (guards makeEnvelope throw)", () => {
  assert.equal(safeIso("not a date"), null);
  assert.equal(safeIso(""), null);
  assert.ok(safeIso("2026-06-11T00:00:00Z"));
});

test("stripHtml replaces tags with space and collapses (never concatenates words)", () => {
  assert.equal(stripHtml("<p>hello</p><p>world</p>"), "hello world");
});

test("decodeEntities handles named + numeric", () => {
  assert.equal(decodeEntities("a &amp; b &#39;c&#39; &#x3c;"), "a & b 'c' <");
});

test("synthTitle never returns empty (falls back)", () => {
  assert.equal(synthTitle("", "Fallback"), "Fallback");
  assert.equal(synthTitle("   ", "FB"), "FB");
  assert.equal(synthTitle("First sentence. Second.", "FB"), "First sentence.");
});

test("truncate ellipsizes", () => {
  assert.equal(truncate("abcdefghij", 5), "abcd…");
});

test("parseFeed reads an RSS item", () => {
  const xml = `<rss><channel><title>My Feed</title>
    <item><title>Post A</title><link>https://x.test/a</link>
    <pubDate>Wed, 11 Jun 2026 06:00:00 GMT</pubDate>
    <description><![CDATA[<b>Body</b> text]]></description><guid>g-a</guid></item>
    </channel></rss>`;
  const { feedTitle, items } = parseFeed(xml);
  assert.equal(feedTitle, "My Feed");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Post A");
  assert.equal(items[0].link, "https://x.test/a");
  assert.equal(items[0].guid, "g-a");
  assert.equal(items[0].excerpt, "Body text");
});

test("parseFeed reads an Atom entry and prefers rel=alternate link", () => {
  const xml = `<feed><title>Atom Feed</title>
    <entry><title>Entry A</title>
    <link rel="self" href="https://x.test/self"/>
    <link rel="alternate" type="text/html" href="https://x.test/post"/>
    <updated>2026-06-11T06:00:00Z</updated><id>id-a</id>
    <summary>Summary text</summary></entry></feed>`;
  const { items } = parseFeed(xml);
  assert.equal(items[0].link, "https://x.test/post");
  assert.equal(items[0].date, "2026-06-11T06:00:00Z");
  assert.equal(items[0].guid, "id-a");
});
