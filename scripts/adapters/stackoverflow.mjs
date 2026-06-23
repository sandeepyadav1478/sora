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

function topAnswerTagsUrl(userId) {
  return `${API}/users/${encodeURIComponent(userId)}/top-answer-tags?site=${SITE}`;
}

function tagsUrl(userId) {
  return (
    `${API}/users/${encodeURIComponent(userId)}/tags` +
    `?site=${SITE}&order=desc&sort=popular`
  );
}

function badgesUrl(userId) {
  return (
    `${API}/users/${encodeURIComponent(userId)}/badges` +
    `?site=${SITE}&order=desc&sort=rank`
  );
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
 * Pure transform: user profile response + optional enrichment responses -> rating Envelope or null. No network.
 * Emits only when reputation >= 10 OR the user belongs to at least one collective.
 * (Low reputation alone is not worth showcasing; collective membership is a strong signal.)
 */
export function normalizeProfile(profileRaw, topTagsRaw, tagsRaw, badgesRaw) {
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

  // --- top-answer-tags ---
  const topAnswerTagItems = topTagsRaw && Array.isArray(topTagsRaw.items) ? topTagsRaw.items : [];
  const topAnswerTags = topAnswerTagItems
    .filter((t) => t && typeof t.answer_count === "number" && t.answer_count >= 1)
    .sort((a, b) => (b.answer_score ?? 0) - (a.answer_score ?? 0))
    .slice(0, 10)
    .map((t) => ({ tag: t.tag_name, answerScore: t.answer_score ?? 0, answerCount: t.answer_count }));

  // --- all tags ---
  const tagItems = tagsRaw && Array.isArray(tagsRaw.items) ? tagsRaw.items : [];
  const allTags = tagItems
    .filter((t) => t && typeof t.count === "number" && t.count >= 1)
    .slice(0, 20)
    .map((t) => ({ tag: t.name, count: t.count }));

  // --- badges ---
  const badgeItems = badgesRaw && Array.isArray(badgesRaw.items) ? badgesRaw.items : [];
  const badges = badgeItems.map((b) => ({
    name: b.name,
    rank: b.rank,
    type: b.badge_type,
    awardCount: b.award_count ?? 1,
  }));
  const badgeSummary = { gold: 0, silver: 0, bronze: 0 };
  for (const b of badgeItems) {
    const r = b.rank;
    if (r === "gold" || r === "silver" || r === "bronze") badgeSummary[r]++;
  }

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
      topAnswerTags,
      allTags,
      badges,
      badgeSummary,
    },
  });
}

/** Adapter entry point: fetch answers + user profile + enrichment data in parallel, then batch-fetch questions. Never throws. */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return []; // handle is the SO numeric user_id
    const userId = cfg.userId ?? cfg.handle;
    const pageSize = Math.min(Math.max(cfg.maxPosts ?? 25, 1), 100);
    const headers = { "Accept-Encoding": "gzip" }; // API is gzipped; fetchJson sets UA + timeout

    const [answersRaw, userRaw, topTagsRaw, tagsRaw, badgesRaw] = await Promise.all([
      fetchJson(answersUrl(cfg.handle, pageSize), { headers }),
      fetchJson(userProfileUrl(userId), { headers }),
      fetchJson(topAnswerTagsUrl(userId), { headers }),
      fetchJson(tagsUrl(userId), { headers }),
      fetchJson(badgesUrl(userId), { headers }),
    ]);

    const ids = (Array.isArray(answersRaw.items) ? answersRaw.items : [])
      .map((a) => a && a.question_id)
      .filter((qid) => qid != null);
    const uniqueIds = [...new Set(ids)];
    const questionsRaw = uniqueIds.length ? await fetchJson(questionsUrl(uniqueIds), { headers }) : { items: [] };

    const postEnvelopes = normalizeAnswers(answersRaw, questionsRaw, cfg);
    const profileEnvelope = normalizeProfile(userRaw, topTagsRaw, tagsRaw, badgesRaw);

    return profileEnvelope ? [profileEnvelope, ...postEnvelopes] : postEnvelopes;
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
