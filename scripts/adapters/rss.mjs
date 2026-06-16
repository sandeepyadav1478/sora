import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchText } from "../lib/http.mjs";
import { parseFeed } from "../lib/parseFeed.mjs";
import { stripHtml, truncate, synthTitle } from "../lib/text.mjs";
import { safeIso } from "../lib/datetime.mjs";

export const id = "rss";
export const needs = []; // zero-secret: public feed URLs only

/**
 * Pure transform: an array of ALREADY-PARSED feeds -> Envelope[]. No network.
 * Each element is the parseFeed() result: { feedTitle, items: [{ title, link, date, excerpt, guid }] }.
 * Handles BOTH RSS and Atom because parseFeed already unified the two dialects.
 */
export function normalizeRss(parsedFeeds, cfg) {
  if (!Array.isArray(parsedFeeds)) return [];
  const out = [];
  for (const feed of parsedFeeds) {
    if (!feed || !Array.isArray(feed.items)) continue;
    const feedTitle = feed.feedTitle || "";
    for (const item of feed.items) {
      if (!item) continue;

      // url = link (Atom: rel=alternate href; RSS: <link>). No link -> nothing to point at.
      const url = item.link;
      if (!url) continue;

      // GUARD NaN before makeEnvelope: drop items whose date won't parse.
      const date = safeIso(item.date);
      if (!date) continue;

      // id key = guid || link (RSS guid often ≠ link, e.g. HN comments URL).
      const key = item.guid || item.link;

      const excerpt = item.excerpt ? truncate(stripHtml(item.excerpt), 280) : "";

      // title = item.title || synthTitle(excerpt). synthTitle NEVER returns empty,
      // so makeEnvelope's title check can't throw on a title-less item.
      const title = (item.title && item.title.trim()) || synthTitle(excerpt, url);

      const payload = { feed: feedTitle };
      if (excerpt) payload.excerpt = excerpt;
      if (Array.isArray(item.tags) && item.tags.length) payload.tags = item.tags;

      out.push(
        makeEnvelope({
          id: stableId("rss", "post", key),
          source: "rss",
          kind: "post",
          title,
          url,
          date,
          payload,
        })
      );
    }
  }

  // Cap latest-first; dedupAndSort in the spine does the final global sort.
  return out
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cfg?.maxPosts ?? 50);
}

/** Adapter entry point: fetch every configured feed + normalize. Returns [] on any error (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !Array.isArray(cfg.feeds) || cfg.feeds.length === 0) return [];
    const parsed = [];
    for (const feedUrl of cfg.feeds) {
      if (!feedUrl) continue;
      try {
        const xml = await fetchText(feedUrl); // UA + timeout + non-200 throw handled in http.mjs
        parsed.push(parseFeed(xml));
      } catch {
        // One bad/slow feed must not sink the rest.
        continue;
      }
    }
    return normalizeRss(parsed, cfg);
  } catch {
    return [];
  }
}

// Contract alias (`fetch_` avoids shadowing global fetch internally).
export { fetch_ as fetch };
