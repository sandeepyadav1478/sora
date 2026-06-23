import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { toIso } from "../lib/datetime.mjs";
import { fetchJson } from "../lib/http.mjs";

export const id = "codeforces";
export const needs = []; // zero-secret: public user.rating + user.info endpoints

const API = "https://codeforces.com/api";

/** Codeforces API URL for a handle's full rating history. */
export function RATING_URL(handle) {
  return `${API}/user.rating?handle=${encodeURIComponent(handle)}`;
}

/** Codeforces API URL for a handle's user info. */
export function USER_INFO_URL(handle) {
  return `${API}/user.info?handles=${encodeURIComponent(handle)}`;
}

/** Pure transform: user.rating response -> Envelope[]. No network.
 * Response shape: { status: "OK", result: [ { contestId, contestName, rank,
 *   ratingUpdateTimeSeconds (UNIX SECONDS), oldRating, newRating, handle } ] }.
 * GOTCHA: must check status==="OK"; a FAILED response has no usable result.
 * @param {object} raw   - raw API response from /user.rating
 * @param {object} cfg   - adapter config (handle, maxRatings)
 * @param {object|null} userInfo - parsed result[0] from /user.info, or null
 */
export function normalizeRatings(raw, cfg, userInfo = null) {
  if (!raw || raw.status !== "OK" || !Array.isArray(raw.result)) return [];
  const out = [];
  for (const r of raw.result) {
    if (!r || r.contestId == null || r.ratingUpdateTimeSeconds == null) continue;
    const oldRating = r.oldRating ?? 0;
    const newRating = r.newRating ?? 0;
    // Skip unrated entries (rating stays at 0 — no meaningful signal)
    if (newRating < 1) continue;
    const d = toIso(r.ratingUpdateTimeSeconds);
    if (!d) continue;
    const payload = {
      platform: "codeforces",
      contestId: r.contestId,
      rating: newRating,
      rank: r.rank,
    };
    if (userInfo != null) {
      payload.maxRating = userInfo.maxRating;
      payload.maxRank = userInfo.maxRank;
      payload.registrationTimeSeconds = userInfo.registrationTimeSeconds;
    }
    out.push(
      makeEnvelope({
        id: stableId("codeforces", "rating", r.contestId),
        source: "codeforces",
        kind: "rating",
        title: `${r.contestName || `Contest ${r.contestId}`}: ${oldRating}→${newRating}`,
        url: `https://codeforces.com/contest/${r.contestId}`,
        date: d, // UNIX SECONDS -> ISO
        payload,
      })
    );
  }
  // Cap newest-first; dedupAndSort in the spine does the final global sort.
  const sorted = out
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cfg?.maxRatings ?? 50);

  // Augment the most-recent contest with currentRating from userInfo
  if (userInfo != null && sorted.length > 0) {
    sorted[0].payload.currentRating = userInfo.rating;
  }

  return sorted;
}

/** Build a profile envelope from user.info result. Returns null if rating < 1. */
export function normalizeProfile(userInfo, handle, contestsAttended) {
  if (!userInfo || (userInfo.rating ?? 0) < 1) return null;
  return makeEnvelope({
    id: stableId("codeforces", "profile", handle),
    source: "codeforces",
    kind: "profile",
    title: `Codeforces: rating ${userInfo.rating} (${userInfo.rank})`,
    url: `https://codeforces.com/profile/${handle}`,
    date: toIso(userInfo.lastOnlineTimeSeconds),
    payload: {
      platform: "codeforces",
      rating: userInfo.rating,
      maxRating: userInfo.maxRating,
      rank: userInfo.rank,
      maxRank: userInfo.maxRank,
      registrationYear: new Date(userInfo.registrationTimeSeconds * 1000).getFullYear(),
      contestsAttended,
    },
  });
}

/** Adapter entry point: fetch + normalize. Returns [] on any error (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const [ratingsRaw, infoRaw] = await Promise.all([
      fetchJson(RATING_URL(cfg.handle)),
      fetchJson(USER_INFO_URL(cfg.handle)),
    ]);

    // Extract userInfo safely — /user.info returns { status, result: [user] }
    const userInfo =
      infoRaw &&
      infoRaw.status === "OK" &&
      Array.isArray(infoRaw.result) &&
      infoRaw.result[0]
        ? infoRaw.result[0]
        : null;

    const contestEnvelopes = normalizeRatings(ratingsRaw, cfg, userInfo);

    const profileEnvelope = normalizeProfile(
      userInfo,
      cfg.handle,
      Array.isArray(ratingsRaw?.result) ? ratingsRaw.result.length : 0
    );

    return profileEnvelope
      ? [profileEnvelope, ...contestEnvelopes]
      : contestEnvelopes;
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
