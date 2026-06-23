import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";
import { toIso } from "../lib/datetime.mjs";
import { synthTitle } from "../lib/text.mjs";

export const id = "stackoverflow";
export const needs = []; // zero-secret: public Stack Exchange API (anonymous quota)

const API = "https://api.stackexchange.com/2.3";
const SITE = "stackoverflow";

function answersUrl(userId, pageSize) {
  return (
    `${API}/users/${encodeURIComponent(userId)}/answers` +
    `?site=${SITE}&order=desc&sort=activity&pagesize=${pageSize}`
  );
}

function questionsUrl(questionIds) {
  // batched: semicolon-joined ids -> one extra call (quota-cheap)
  return `${API}/questions/${questionIds.join(";")}?site=${SITE}`;
}

function userProfileUrl(userId) {
  return `${API}/users/${encodeURIComponent(userId)}?site=${SITE}`;
}

/** Build a question_id -> title map from the questions response. */
function buildTitleMap(questionsRaw) {
  const map = new Map();
  const items = questionsRaw && Array.isArray(questionsRaw.items) ? questionsRaw.items : [];
  for (const q of items) {
    if (q && q.question_id != null && q.title) map.set(q.question_id, q.title);
  }
  return map;
}

/**
 * Pure transform: (answers response, questions response) -> Envelope[]. No network.
 * Title uses the REAL question title; synthTitle(...) fallback for deleted/missing questions
 * guarantees a non-empty title (makeEnvelope throws on a falsy title).
 */
export function normalizeAnswers(answersRaw, questionsRaw, cfg) {
  const items = answersRaw && Array.isArray(answersRaw.items) ? answersRaw.items : [];
  if (items.length === 0) return [];
  const titleByQid = buildTitleMap(questionsRaw);

  const out = [];
  for (const a of items) {
    if (!a || a.answer_id == null || a.creation_date == null) continue;
    // Skip downvoted answers (negative score = not worth showcasing)
    if (typeof a.score === "number" && a.score < 0) continue;
    const d = toIso(a.creation_date);
    if (!d) continue;
    const qTitle = titleByQid.get(a.question_id);
    const title = qTitle
      ? `Answer to: ${qTitle}`
      : synthTitle("", `Answer to question #${a.question_id ?? a.answer_id}`);
    out.push(
      makeEnvelope({
        id: stableId("stackoverflow", "post", a.answer_id),
        source: "stackoverflow",
        kind: "post",
        title,
        url: `https://stackoverflow.com/a/${a.answer_id}`,
        date: d,
        payload: {
          feed: "stackoverflow",
          answer_id: a.answer_id,
          score: a.score,
          is_accepted: a.is_accepted,
        },
      })
    );
  }

  return out
    .sort((x, y) => Date.parse(y.date) - Date.parse(x.date))
    .slice(0, cfg?.maxPosts ?? 25);
}

/**
 * Pure transform: user profile response -> rating Envelope or null. No network.
 * Emits only when reputation >= 10 OR the user belongs to at least one collective.
 * (Low reputation alone is not worth showcasing; collective membership is a strong signal.)
 */
export function normalizeProfile(profileRaw) {
  const items = profileRaw && Array.isArray(profileRaw.items) ? profileRaw.items : [];
  const user = items[0];
  if (!user || user.user_id == null) return null;

  const collectives = (user.collectives || []).map((c) => c.collective?.name).filter(Boolean);
  const reputation = user.reputation ?? 0;

  // Filter: only emit if reputation >= 10 OR collective membership exists
  if (reputation < 10 && collectives.length === 0) return null;

  const d = toIso(user.last_access_date);
  if (!d) return null;

  const collectiveName = collectives.length > 0 ? collectives[0] : null;
  const title = collectiveName
    ? `Stack Overflow: ${reputation} reputation · ${collectiveName}`
    : `Stack Overflow: ${reputation} reputation · member`;

  return makeEnvelope({
    id: stableId("stackoverflow", "rating", String(user.user_id)),
    source: "stackoverflow",
    kind: "rating",
    title,
    url: user.link,
    date: d,
    payload: {
      platform: "stackoverflow",
      reputation,
      badgeCounts: user.badge_counts,
      collectives,
      location: user.location,
      memberSinceYear: new Date(user.creation_date * 1000).getFullYear(),
      lastActiveYear: new Date(user.last_access_date * 1000).getFullYear(),
    },
  });
}

/** Adapter entry point: fetch answers + batch-fetch their questions + user profile + normalize. Never throws. */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return []; // handle is the SO numeric user_id
    const pageSize = Math.min(Math.max(cfg.maxPosts ?? 25, 1), 100);
    const headers = { "Accept-Encoding": "gzip" }; // API is gzipped; fetchJson sets UA + timeout

    const [answersRaw, profileRaw] = await Promise.all([
      fetchJson(answersUrl(cfg.handle, pageSize), { headers }),
      fetchJson(userProfileUrl(cfg.handle), { headers }),
    ]);

    const ids = (Array.isArray(answersRaw.items) ? answersRaw.items : [])
      .map((a) => a && a.question_id)
      .filter((qid) => qid != null);
    const uniqueIds = [...new Set(ids)];
    const questionsRaw = uniqueIds.length ? await fetchJson(questionsUrl(uniqueIds), { headers }) : { items: [] };

    const postEnvelopes = normalizeAnswers(answersRaw, questionsRaw, cfg);
    const profileEnvelope = normalizeProfile(profileRaw);

    return profileEnvelope ? [profileEnvelope, ...postEnvelopes] : postEnvelopes;
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
