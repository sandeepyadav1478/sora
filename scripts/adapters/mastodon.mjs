import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";
import { stripHtml, synthTitle, truncate } from "../lib/text.mjs";

export const id = "mastodon";
export const needs = []; // zero-secret: public REST API

/** Build the account-lookup URL: acct -> numeric account id. */
export function LOOKUP_URL(instance, user) {
  return `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`;
}

/** Build the statuses URL for a resolved numeric account id. */
export function STATUSES_URL(instance, accountId, limit) {
  return `https://${instance}/api/v1/accounts/${encodeURIComponent(accountId)}/statuses?limit=${limit}`;
}

/** Pure transform: Mastodon statuses array -> Envelope[]. No network.
 * Curation: drop boosts (reblog !== null) and replies (in_reply_to_id !== null). */
export function normalizeStatuses(statuses, cfg) {
  if (!Array.isArray(statuses)) return [];
  const out = [];
  for (const s of statuses) {
    if (!s || typeof s !== "object") continue;
    if (!s.id || !s.created_at || !s.url) continue; // need id, date, permalink
    if (s.reblog !== null && s.reblog !== undefined) continue; // drop boosts
    if (s.in_reply_to_id !== null && s.in_reply_to_id !== undefined) continue; // drop replies

    const text = stripHtml(s.content || "");
    out.push(
      makeEnvelope({
        id: stableId("mastodon", "post", s.id),
        source: "mastodon",
        kind: "post",
        title: synthTitle(text, "Post on Mastodon"),
        url: s.url, // human permalink, NOT s.uri
        date: s.created_at, // already ISO-8601
        payload: { feed: "mastodon", excerpt: truncate(text, 280) },
      })
    );
  }
  // Cap newest-first; dedupAndSort in the spine does the final global sort.
  return out
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, (cfg?.maxPosts) ?? 25);
}

/** Adapter entry point: 2-call flow (lookup acct -> id, then statuses).
 * Returns [] on any error (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.instance || !cfg.user) return [];
    const account = await fetchJson(LOOKUP_URL(cfg.instance, cfg.user));
    if (!account || !account.id) return [];
    const limit = Math.min(cfg.maxPosts ?? 25, 40); // Mastodon caps statuses at 40
    const statuses = await fetchJson(STATUSES_URL(cfg.instance, account.id, limit));
    return normalizeStatuses(statuses, cfg);
  } catch {
    return [];
  }
}

// Contract alias (avoids shadowing global fetch internally).
export { fetch_ as fetch };
