import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseFeed } from "../lib/parseFeed.mjs";
import { normalizeRss } from "../adapters/rss.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/rss.json", import.meta.url), "utf8")
);

// normalizeRss is pure and takes ALREADY-PARSED feeds: an array of
// { feedTitle, items } objects (one per configured feed). The real fetch_
// calls parseFeed; the test parses the captured XML the same way.
const parsedRss = parseFeed(fixture.rss);
const parsedAtom = parseFeed(fixture.atom);

test("normalizeRss maps an RSS 2.0 item to a post envelope", () => {
  const out = normalizeRss([parsedRss], { maxPosts: 50 });
  assert.ok(out.length >= 1, "expected at least one item");
  const e = out[0];
  assert.equal(e.source, "rss");
  assert.equal(e.kind, "post");
  // id = rss:post:{feedBase}:{guid||link}; namespaced to avoid cross-feed guid collisions
  const feedBase0 = parsedRss.feedUrl || parsedRss.feedTitle || "";
  assert.equal(e.id, `rss:post:${feedBase0}:${parsedRss.items[0].guid || parsedRss.items[0].link}`);
  assert.ok(e.title && e.title.length > 0, "title must be non-empty");
  // url = link (the article URL), NOT the guid
  assert.equal(e.url, parsedRss.items[0].link);
  assert.equal(e.payload.feed, parsedRss.feedTitle);
  // date is a valid ISO string (NaN guarded before makeEnvelope)
  assert.equal(Number.isNaN(Date.parse(e.date)), false);
});

test("normalizeRss maps an Atom entry (rel=alternate link, <id> guid, <published> date)", () => {
  const out = normalizeRss([parsedAtom], { maxPosts: 50 });
  const e = out[0];
  assert.equal(e.source, "rss");
  assert.equal(e.kind, "post");
  assert.equal(e.url, parsedAtom.items[0].link); // the rel=alternate href
  const feedBase1 = parsedAtom.feedUrl || parsedAtom.feedTitle || "";
  assert.equal(e.id, `rss:post:${feedBase1}:${parsedAtom.items[0].guid || parsedAtom.items[0].link}`);
  assert.equal(Number.isNaN(Date.parse(e.date)), false);
});

test("id-kind invariant: id.split(':')[1] === envelope.kind === 'post'", () => {
  const out = normalizeRss([parsedRss, parsedAtom], { maxPosts: 50 });
  assert.ok(out.length >= 2);
  for (const e of out) {
    assert.equal(e.id.split(":")[1], e.kind);
    assert.equal(e.id.split(":")[1], "post");
  }
});

test("title falls back to synthTitle(excerpt) when an item has no title", () => {
  const noTitle = {
    feedTitle: "Some Blog",
    items: [
      {
        title: "",
        link: "https://example.com/a-post/",
        guid: "https://example.com/a-post/",
        date: "2026-06-01T00:00:00Z",
        excerpt: "This is the opening sentence of a post that lacks a title element entirely.",
      },
    ],
  };
  const out = normalizeRss([noTitle], { maxPosts: 50 });
  assert.equal(out.length, 1);
  assert.ok(out[0].title.length > 0, "synthTitle must never yield empty (would throw in makeEnvelope)");
});

test("drops items with an unparseable date (NaN guarded, never throws)", () => {
  const badDate = {
    feedTitle: "Bad Blog",
    items: [
      { title: "Keep me", link: "https://ok.com/1", guid: "g1", date: "2026-06-01T00:00:00Z", excerpt: "" },
      { title: "Drop me", link: "https://ok.com/2", guid: "g2", date: "not-a-date", excerpt: "" },
    ],
  };
  const out = normalizeRss([badDate], { maxPosts: 50 });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Keep me");
});

test("returns [] for garbage / empty input (never throws)", () => {
  assert.deepEqual(normalizeRss([], { maxPosts: 50 }), []);
  assert.deepEqual(normalizeRss(null, { maxPosts: 50 }), []);
  assert.deepEqual(normalizeRss([{ feedTitle: "x", items: null }], { maxPosts: 50 }), []);
  assert.deepEqual(normalizeRss([{}], { maxPosts: 50 }), []);
});

test("caps total posts at maxPosts (latest first)", () => {
  const many = {
    feedTitle: "Busy Blog",
    items: Array.from({ length: 10 }, (_, i) => ({
      title: `Post ${i}`,
      link: `https://b.com/${i}`,
      guid: `g${i}`,
      date: new Date(2026, 0, i + 1).toISOString(),
      excerpt: "",
    })),
  };
  const out = normalizeRss([many], { maxPosts: 3 });
  assert.equal(out.length, 3);
  // newest first: 2026-01-10, -09, -08
  assert.ok(Date.parse(out[0].date) >= Date.parse(out[1].date));
});
