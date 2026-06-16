import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchText } from "../lib/http.mjs";
import { parseFeed } from "../lib/parseFeed.mjs";
import { safeIso } from "../lib/datetime.mjs";
import { synthTitle } from "../lib/text.mjs";

export const id = "youtube";
export const needs = []; // zero-secret: the RSS feed needs no API key

const FEED = "https://www.youtube.com/feeds/videos.xml";

/** Build the keyless channel feed URL. channelId MUST be the UC… id (not an @handle). */
export function FEED_URL(channelId) {
  return `${FEED}?channel_id=${encodeURIComponent(channelId)}`;
}

/** Pull the bare YouTube video id from parseFeed item fields.
 *  Prefers <yt:videoId>; falls back to the <id> guid "yt:video:<id>". */
function videoIdOf(item) {
  if (item.videoId) return String(item.videoId).trim();
  const g = String(item.guid || "");
  const m = g.match(/yt:video:([\w-]+)/);
  return m ? m[1] : "";
}

/** Pure transform: parseFeed items -> Envelope[]. No network. This is what unit tests call. */
export function normalizeVideos(items, cfg) {
  if (!Array.isArray(items)) return [];
  const channel = cfg && cfg.channel ? cfg.channel : (cfg && cfg.feedTitle) || "";
  const out = [];
  for (const item of items) {
    if (!item) continue;
    const vid = videoIdOf(item);
    if (!vid) continue; // no stable id -> drop (covers garbage entries)
    const date = safeIso(item.date);
    if (!date) continue; // unparseable date would throw in makeEnvelope
    const url = item.link || `https://www.youtube.com/watch?v=${vid}`;
    const payload = { channel };
    if (item.thumbnail) payload.thumbnail = item.thumbnail;
    if (item.views != null && item.views !== "") {
      const v = Number(item.views);
      if (Number.isFinite(v)) payload.views = v;
    }
    out.push(
      makeEnvelope({
        id: stableId("youtube", "video", vid),
        source: "youtube",
        kind: "video",
        title: synthTitle(item.title, `YouTube video ${vid}`),
        url,
        date,
        payload,
      })
    );
  }
  return out
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, (cfg && cfg.maxVideos) ?? 15);
}

/** Adapter entry point: fetch + normalize. Returns [] on any error (never throws). */
export async function fetch_(cfg) {
  try {
    const channelId = cfg && cfg.handle;
    if (!channelId || !/^UC[\w-]{20,}$/.test(channelId)) return []; // require a UC… id
    const xml = await fetchText(FEED_URL(channelId));
    const feed = parseFeed(xml);
    // pass the feed-level title through so payload.channel is populated
    return normalizeVideos(feed.items, { ...cfg, channel: cfg.channel || feed.feedTitle });
  } catch {
    return [];
  }
}

// Contract alias (`fetch_` avoids shadowing global fetch internally).
export { fetch_ as fetch };
