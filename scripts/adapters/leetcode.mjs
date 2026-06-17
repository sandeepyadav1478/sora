import { makeEnvelope, stableId } from "../lib/envelope.mjs";

export const id = "leetcode";
export const needs = []; // no secrets — public GraphQL

const GQL_URL = "https://leetcode.com/graphql";
const UA = "sora-portfolio-aggregator";

export function normalizeStats(raw, cfg, generatedAt) {
  try {
    const user = raw?.data?.matchedUser;
    if (!user) return [];
    const nums = user.submitStats?.acSubmissionNum;
    if (!Array.isArray(nums)) return [];

    const byDiff = Object.fromEntries(nums.map((n) => [n.difficulty, n.count]));
    const all    = byDiff["All"]    ?? 0;
    const easy   = byDiff["Easy"]   ?? 0;
    const medium = byDiff["Medium"] ?? 0;
    const hard   = byDiff["Hard"]   ?? 0;
    const ranking = user.profile?.ranking ?? 0;
    const handle  = cfg?.handle ?? "unknown";

    return [
      makeEnvelope({
        id:     stableId("leetcode", "rating", handle),
        source: "leetcode",
        kind:   "rating",
        title:  `LeetCode: ${all} solved (rank #${ranking.toLocaleString("en-US")})`,
        url:    `https://leetcode.com/${handle}/`,
        date:   generatedAt,
        payload: {
          platform: "leetcode",
          solved:   { all, easy, medium, hard },
          ranking,
        },
      }),
    ];
  } catch {
    return [];
  }
}

export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.enabled) return [];
    if (!cfg.handle) return [];
    const res = await fetch(GQL_URL, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":   UA,
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        query: `{ matchedUser(username: "${cfg.handle}") { submitStats { acSubmissionNum { difficulty count } } profile { ranking } } }`,
      }),
    });
    if (!res.ok) return [];
    const raw = await res.json();
    return normalizeStats(raw, cfg, new Date().toISOString());
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
