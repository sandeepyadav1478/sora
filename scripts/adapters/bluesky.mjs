import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";
import { synthTitle, truncate } from "../lib/text.mjs";
import { safeIso } from "../lib/datetime.mjs";

export const id = "bluesky";
export const needs = []; // public AppView, zero auth

const APPVIEW = "https://public.api.bsky.app";

/** Public AppView endpoint for an actor's author feed (handle or DID both work). */
export function FEED_URL(handle) {
  return `${APPVIEW}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=50`;
}

/** rkey = last "/"-segment of an at:// uri. */
function rkeyOf(uri) {
  return String(uri).split("/").pop();
}

/** Pure transform: getAuthorFeed response -> Envelope[]. No network.
 *  Curation: keep ORIGINALS only — drop reposts (item.reason) and replies (post.record.reply). */
export function normalizeFeed(raw, cfg) {
  if (!raw || !Array.isArray(raw.feed)) return [];
  const max = (cfg && cfg.maxPosts) || 25;
  const out = [];

  for (const item of raw.feed) {
    if (!item || !item.post) continue;
    // DROP reposts: item-level reason present.
    if (item.reason) continue;

    const post = item.post;
    const record = post.record || {};
    // DROP replies: record.reply present.
    if (record.reply) continue;

    const uri = post.uri;
    const handle = post.author && post.author.handle;
    const date = safeIso(post.indexedAt);
    if (!uri || !handle || !date) continue; // skip malformed items

    const rkey = rkeyOf(uri);
    const text = typeof record.text === "string" ? record.text : "";

    out.push(
      makeEnvelope({
        id: stableId("bluesky", "post", uri), // at:// embeds DID -> stable across renames
        source: "bluesky",
        kind: "post",
        title: synthTitle(text, "Post on Bluesky"),
        url: `https://bsky.app/profile/${handle}/post/${rkey}`,
        date,
        payload: text ? { feed: "bluesky", excerpt: truncate(text, 280) } : { feed: "bluesky" },
      })
    );
  }

  return out
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, max);
}

/** Adapter entry point: fetch + normalize. Returns [] on any error (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const raw = await fetchJson(FEED_URL(cfg.handle));
    return normalizeFeed(raw, cfg);
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
