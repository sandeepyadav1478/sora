import cache from "@/data/sources-cache.json";

export interface ActivityItem {
  id: string;
  source: string;
  kind:
    | "commit" // git push / commit activity
    | "release" // tagged release
    | "post" // blog post / social post
    | "video" // youtube video
    | "package" // published package (npm, pypi)
    | "rating" // score / stat snapshot (wakatime, leetcode, codeforces, stackoverflow)
    | "badge" // credential / certification (credly, huggingface)
    | "repo" // repository snapshot (github stars, topics, language)
    | "profile"; // user profile snapshot (github, huggingface)
  title: string;
  url: string;
  date: string;
  projectSlug?: string;
  payload: Record<string, unknown>;
}

interface SourcesCache {
  version: number;
  generatedAt: string;
  sources: Record<string, unknown>;
  items: ActivityItem[];
}

const data = cache as SourcesCache;

/** All activity items, newest first. Filtering happens in adapters at sync time — cache only contains items worth showing. */
export function getActivityItems(limit?: number): ActivityItem[] {
  const items = data.items ?? [];
  return typeof limit === "number" ? items.slice(0, limit) : items;
}

// ============================================================================
// LiveStats — headline numbers extracted from the sources cache
// ============================================================================

export interface LiveStats {
  // WakaTime
  wakatimeTotalHours?: string; // e.g. "29 hrs 19 mins" from humanReadableTotal
  wakatimeAllTimeHours?: string; // "2,370 hrs since 2021" from all_time envelope (if present)
  wakatimeAiPercent?: number; // AI coding % from public stats (if present)
  wakatimeTopLanguage?: string; // first language in languages array

  // GitHub
  githubTotalStars?: number; // sum of repo.stars across repo envelopes
  githubFollowers?: number; // from profile envelope
  githubTopRepoStars?: number; // highest single repo stars
  githubTopRepoName?: string; // name of highest-star repo
  githubAccountYears?: number; // accountAgeYears from profile envelope

  // LeetCode
  leetcodeSolved?: number; // solved.all
  leetcodeTopTag?: string; // tagBreakdown[0].tag if present
  leetcodeActiveYears?: number; // calendar.activeYears.length if present
  leetcodeBeatEasy?: number; // beats.easy percentage if present

  // Codeforces
  codeforcesRating?: number; // latest rating from profile envelope

  // Credly
  credlyBadgeCount?: number; // count of badge envelopes
  credlyValidationCount?: number; // count where payload.typeCategory === "Validation"

  // PyPI
  pypiMonthlyDownloads?: number; // payload.monthlyDownloads if present

  // StackOverflow
  soCollectives?: string[]; // payload.collectives array
}

export function getLiveStats(): LiveStats {
  const items = data.items ?? [];
  const stats: LiveStats = {};

  // --- WakaTime ---
  // Public all-time stats envelope (id contains "public-alltime")
  const wakaPublic = items.find(
    (i) =>
      i.source === "wakatime" && i.id === "wakatime:rating:public-alltime",
  );
  if (wakaPublic) {
    const p = wakaPublic.payload;
    if (typeof p.aiCodingPercent === "number")
      stats.wakatimeAiPercent = p.aiCodingPercent;
    const langs = p.languages as
      | Array<{ name: string; percent: number }>
      | undefined;
    if (langs?.length) stats.wakatimeTopLanguage = langs[0].name;
    const editors = p.editors as
      | Array<{ name: string; percent: number }>
      | undefined;
    if (editors?.some((e) => e.name?.toLowerCase().includes("claude")))
      stats.wakatimeTopLanguage = stats.wakatimeTopLanguage; // keep, just mark editor
  }

  // All-time hours envelope
  const wakaAllTime = items.find(
    (i) => i.source === "wakatime" && i.id === "wakatime:rating:all_time",
  );
  if (wakaAllTime?.payload?.text) {
    stats.wakatimeAllTimeHours = wakaAllTime.payload.text as string;
  }

  // Weekly/range rating envelope (the one with humanReadableTotal but not all_time)
  const wakaRange = items.find(
    (i) =>
      i.source === "wakatime" &&
      i.kind === "rating" &&
      i.id !== "wakatime:rating:public-alltime" &&
      i.id !== "wakatime:rating:all_time",
  );
  if (wakaRange?.payload?.humanReadableTotal) {
    stats.wakatimeTotalHours = wakaRange.payload.humanReadableTotal as string;
    // Also pick up top language from this envelope if not already set
    if (!stats.wakatimeTopLanguage) {
      const langs = wakaRange.payload.languages as
        | string[]
        | Array<{ name: string }>
        | undefined;
      if (Array.isArray(langs) && langs.length > 0) {
        const first = langs[0];
        stats.wakatimeTopLanguage =
          typeof first === "string" ? first : first.name;
      }
    }
  }

  // --- GitHub repos — aggregate stars ---
  const repos = items.filter((i) => i.source === "github" && i.kind === "repo");
  if (repos.length > 0) {
    const totalStars = repos.reduce(
      (s, r) => s + ((r.payload.stars as number) || 0),
      0,
    );
    stats.githubTotalStars = totalStars;
    const top = repos.reduce((best, r) =>
      ((r.payload.stars as number) || 0) > ((best.payload.stars as number) || 0)
        ? r
        : best,
    );
    stats.githubTopRepoStars = top.payload.stars as number;
    stats.githubTopRepoName = top.payload.name as string;
  }

  // --- GitHub profile ---
  const ghProfile = items.find(
    (i) => i.source === "github" && i.kind === "profile",
  );
  if (ghProfile) {
    if (typeof ghProfile.payload.followers === "number")
      stats.githubFollowers = ghProfile.payload.followers;
    if (typeof ghProfile.payload.accountAgeYears === "number")
      stats.githubAccountYears = ghProfile.payload.accountAgeYears;
  }

  // --- LeetCode ---
  const lc = items.find((i) => i.source === "leetcode" && i.kind === "rating");
  if (lc) {
    const solved = lc.payload.solved as Record<string, number> | undefined;
    if (typeof solved?.all === "number") stats.leetcodeSolved = solved.all;
    const tags = lc.payload.tagBreakdown as
      | Array<{ tag: string; count: number }>
      | undefined;
    if (tags?.length) stats.leetcodeTopTag = tags[0].tag;
    const cal = lc.payload.calendar as
      | { activeYears?: number[] }
      | undefined;
    if (cal?.activeYears?.length)
      stats.leetcodeActiveYears = cal.activeYears.length;
    const beats = lc.payload.beats as { easy?: number } | undefined;
    if (typeof beats?.easy === "number") stats.leetcodeBeatEasy = beats.easy;
  }

  // --- Codeforces — latest rating from highest contestId ---
  const cfRatings = items.filter(
    (i) => i.source === "codeforces" && i.kind === "rating",
  );
  if (cfRatings.length > 0) {
    const latest = cfRatings.reduce((best, r) =>
      ((r.payload.contestId as number) || 0) >
      ((best.payload.contestId as number) || 0)
        ? r
        : best,
    );
    if (typeof latest.payload.rating === "number")
      stats.codeforcesRating = latest.payload.rating;
  }

  // --- Credly ---
  const badges = items.filter(
    (i) => i.source === "credly" && i.kind === "badge",
  );
  if (badges.length > 0) {
    stats.credlyBadgeCount = badges.length;
    stats.credlyValidationCount = badges.filter(
      (b) => b.payload.typeCategory === "Validation",
    ).length;
  }

  // --- PyPI ---
  const pkg = items.find((i) => i.source === "pypi" && i.kind === "package");
  if (pkg && typeof pkg.payload.monthlyDownloads === "number") {
    stats.pypiMonthlyDownloads = pkg.payload.monthlyDownloads;
  }

  // --- StackOverflow ---
  const so = items.find(
    (i) => i.source === "stackoverflow" && i.kind === "rating",
  );
  if (so) {
    const collectives = so.payload.collectives as string[] | undefined;
    if (collectives?.length) stats.soCollectives = collectives;
  }

  return stats;
}
