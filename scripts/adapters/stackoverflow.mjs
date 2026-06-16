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
        date: toIso(a.creation_date),
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
    .slice(0, cfg.maxPosts ?? 25);
}

/** Adapter entry point: fetch answers + batch-fetch their questions + normalize. Never throws. */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return []; // handle is the SO numeric user_id
    const pageSize = Math.min(Math.max(cfg.maxPosts ?? 25, 1), 100);
    const headers = { "Accept-Encoding": "gzip" }; // API is gzipped; fetchJson sets UA + timeout
    const answersRaw = await fetchJson(answersUrl(cfg.handle, pageSize), { headers });
    const ids = (Array.isArray(answersRaw.items) ? answersRaw.items : [])
      .map((a) => a && a.question_id)
      .filter((qid) => qid != null);
    const uniqueIds = [...new Set(ids)];
    const questionsRaw = uniqueIds.length ? await fetchJson(questionsUrl(uniqueIds), { headers }) : { items: [] };
    return normalizeAnswers(answersRaw, questionsRaw, cfg);
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
