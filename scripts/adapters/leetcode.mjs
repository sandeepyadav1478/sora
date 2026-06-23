import { makeEnvelope, stableId } from "../lib/envelope.mjs";

export const id = "leetcode";
export const needs = []; // no secrets — public GraphQL

const GQL_URL = "https://leetcode.com/graphql";
const UA = "sora-portfolio-aggregator";

const fmtRank = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Tags to exclude — soft skills, database category labels, or non-algorithm noise
const EXCLUDED_TAGS = new Set([
  "Database", "Shell", "Concurrency", "JavaScript", "SQL",
]);

/** Canonical display names for tag normalisation */
const TAG_DISPLAY = {
  "Depth-First Search":    "DFS",
  "Breadth-First Search":  "BFS",
  "Dynamic Programming":   "DP",
  "Hash Table":            "Hash Table",
  "Binary Search":         "Binary Search",
  "Divide and Conquer":    "Divide & Conquer",
  "Bit Manipulation":      "Bit Manipulation",
};

function displayTag(name) {
  return TAG_DISPLAY[name] ?? name;
}

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

    // Skip if fewer than 5 problems solved — not a meaningful signal yet
    if (all < 5) return [];

    const rankLabel = ranking > 0 ? `rank #${fmtRank(ranking)}` : "unranked";

    // --- Tag breakdown: advanced + intermediate, >= 3 solved, no excluded tags ---
    const rawTags = [
      ...(user.tagProblemCounts?.advanced      ?? []),
      ...(user.tagProblemCounts?.intermediate  ?? []),
    ];
    const tagBreakdown = rawTags
      .filter((t) => t.problemsSolved >= 3 && !EXCLUDED_TAGS.has(t.tagName))
      .map((t) => ({ tag: displayTag(t.tagName), count: t.problemsSolved }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // --- Languages ---
    const languages = (user.languageProblemCount ?? [])
      .filter((l) => l.problemsSolved > 0)
      .map((l) => ({ lang: l.languageName, count: l.problemsSolved }));

    // Python3 count for the title
    const python3Entry = languages.find((l) => l.lang === "Python3");
    const python3Count = python3Entry?.count ?? 0;

    // --- Calendar ---
    const cal = user.userCalendar;
    const calendar = cal
      ? {
          activeYears:    cal.activeYears ?? [],
          totalActiveDays: cal.totalActiveDays ?? 0,
          ...(typeof cal.streak === "number" && cal.streak >= 7
            ? { streak: cal.streak }
            : {}),
        }
      : undefined;

    // --- Beats stats ---
    const beatsArr = raw?.data?.problemsSolvedBeatsStats ?? [];
    const beatsMap  = Object.fromEntries(
      beatsArr
        .filter((b) => typeof b.percentage === "number" && b.percentage > 0)
        .map((b) => [b.difficulty.toLowerCase(), b.percentage])
    );
    const beats =
      Object.keys(beatsMap).length > 0
        ? {
            ...(beatsMap.easy   !== undefined ? { easy:   beatsMap.easy   } : {}),
            ...(beatsMap.medium !== undefined ? { medium: beatsMap.medium } : {}),
            ...(beatsMap.hard   !== undefined ? { hard:   beatsMap.hard   } : {}),
          }
        : undefined;

    // --- Contest ---
    const cr = raw?.data?.userContestRanking;
    const contest =
      cr && cr.attendedContestsCount >= 1
        ? {
            attended:      cr.attendedContestsCount,
            rating:        cr.rating,
            ...(typeof cr.topPercentage === "number" && cr.topPercentage < 50
              ? { topPercentage: cr.topPercentage }
              : {}),
          }
        : undefined;

    // --- Submission calendar (heatmap) ---
    let submissionCalendar;
    let submissionCalendarTotal;
    const rawCalStr = user.submissionCalendar;
    if (typeof rawCalStr === "string" && rawCalStr.length > 2) {
      try {
        const calObj = JSON.parse(rawCalStr);
        const total = Object.values(calObj).reduce((sum, v) => sum + (Number(v) || 0), 0);
        if (total > 0) {
          submissionCalendar = rawCalStr;
          submissionCalendarTotal = total;
        }
      } catch {
        // malformed — skip
      }
    }

    // --- Recent accepted submissions ---
    const rawRecent = raw?.data?.recentAcSubmissionList ?? [];
    const recentSubmissions = rawRecent
      .filter((s) => s.lang && String(s.lang).trim() !== "" && Number(s.timestamp) > 0)
      .map((s) => ({
        title:     s.title,
        titleSlug: s.titleSlug,
        timestamp: s.timestamp,
        lang:      s.lang,
        runtime:   s.runtime,
        memory:    s.memory,
      }));

    // --- Badges ---
    const rawBadges = user.badges ?? [];
    const badges = rawBadges
      .map((b) => ({
        name:         b.name,
        displayName:  b.displayName,
        category:     b.category,
        creationDate: b.creationDate,
      }))
      .filter((b) => b.name);

    const rawActive = user.activeBadge;
    const activeBadge = rawActive?.name ? { name: rawActive.name } : null;

    // --- Profile extras (only include when > 0) ---
    const profile = user.profile ?? {};
    const reputation   = (profile.reputation   > 0) ? profile.reputation   : undefined;
    const postViews    = (profile.postViewCount > 0) ? profile.postViewCount : undefined;
    const solutionCount = (profile.solutionCount > 0) ? profile.solutionCount : undefined;

    // Build title
    const titleSuffix =
      python3Count > 0 && python3Count !== all
        ? `Python ${python3Count}`
        : `Python ${all}`;
    const title = `LeetCode: ${all} solved · ${titleSuffix} (${rankLabel})`;

    return [
      makeEnvelope({
        id:     stableId("leetcode", "rating", handle),
        source: "leetcode",
        kind:   "rating",
        title,
        url:    `https://leetcode.com/${handle}/`,
        date:   generatedAt,
        payload: {
          platform: "leetcode",
          solved:   { all, easy, medium, hard },
          ranking,
          ...(tagBreakdown.length > 0      ? { tagBreakdown }          : {}),
          ...(languages.length > 0         ? { languages }             : {}),
          ...(calendar                     ? { calendar }              : {}),
          ...(beats                        ? { beats }                 : {}),
          ...(contest                      ? { contest }               : {}),
          ...(submissionCalendar !== undefined
            ? { submissionCalendar, submissionCalendarTotal }           : {}),
          ...(recentSubmissions.length > 0 ? { recentSubmissions }     : {}),
          ...(badges.length > 0            ? { badges }                : {}),
          ...(activeBadge                  ? { activeBadge }           : {}),
          ...(reputation   !== undefined   ? { reputation }            : {}),
          ...(postViews    !== undefined   ? { postViews }             : {}),
          ...(solutionCount !== undefined  ? { solutionCount }         : {}),
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
        query: `
query UserFullStats($handle: String!) {
  matchedUser(username: $handle) {
    submitStats {
      acSubmissionNum { difficulty count submissions }
    }
    profile {
      ranking
      skillTags
      reputation
      postViewCount
      solutionCount
      categoryDiscussCount
    }
    tagProblemCounts {
      advanced     { tagName problemsSolved }
      intermediate { tagName problemsSolved }
      fundamental  { tagName problemsSolved }
    }
    languageProblemCount { languageName problemsSolved }
    userCalendar(year: null) {
      activeYears
      streak
      totalActiveDays
    }
    submissionCalendar
    badges { id name shortName displayName icon creationDate category }
    activeBadge { id name }
  }
  userContestRanking(username: $handle) {
    attendedContestsCount
    rating
    globalRanking
    topPercentage
  }
  recentAcSubmissionList(username: $handle, limit: 10) {
    id title titleSlug timestamp lang runtime memory
  }
}`,
        variables: { handle: cfg.handle },
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
