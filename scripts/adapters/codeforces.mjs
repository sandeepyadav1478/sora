import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { toIso } from "../lib/datetime.mjs";
import { fetchJson } from "../lib/http.mjs";

export const id = "codeforces";
export const needs = []; // zero-secret: public user.rating endpoint

const API = "https://codeforces.com/api";

/** Codeforces API URL for a handle's full rating history. */
export function RATING_URL(handle) {
  return `${API}/user.rating?handle=${encodeURIComponent(handle)}`;
}

/** Pure transform: user.rating response -> Envelope[]. No network.
 * Response shape: { status: "OK", result: [ { contestId, contestName, rank,
 *   ratingUpdateTimeSeconds (UNIX SECONDS), oldRating, newRating, handle } ] }.
 * GOTCHA: must check status==="OK"; a FAILED response has no usable result. */
export function normalizeRatings(raw, cfg) {
  if (!raw || raw.status !== "OK" || !Array.isArray(raw.result)) return [];
  const out = [];
  for (const r of raw.result) {
    if (!r || r.contestId == null || r.ratingUpdateTimeSeconds == null) continue;
    const oldRating = r.oldRating ?? 0;
    const newRating = r.newRating ?? 0;
    const d = toIso(r.ratingUpdateTimeSeconds);
    if (!d) continue;
    out.push(
      makeEnvelope({
        id: stableId("codeforces", "rating", r.contestId),
        source: "codeforces",
        kind: "rating",
        title: `${r.contestName || `Contest ${r.contestId}`}: ${oldRating}→${newRating}`,
        url: `https://codeforces.com/contest/${r.contestId}`,
        date: d, // UNIX SECONDS -> ISO
        payload: {
          platform: "codeforces",
          contestId: r.contestId,
          rating: newRating,
          rank: r.rank,
        },
      })
    );
  }
  // Cap newest-first; dedupAndSort in the spine does the final global sort.
  return out
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cfg?.maxRatings ?? 50);
}

/** Adapter entry point: fetch + normalize. Returns [] on any error (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const raw = await fetchJson(RATING_URL(cfg.handle));
    return normalizeRatings(raw, cfg);
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
