import cache from "@/data/sources-cache.json";
import { ACTIVITY_FILTER } from "@/config";

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

/** Returns false if item fails a minimum threshold — keep the feed shame-free. */
function meetsThreshold(item: ActivityItem): boolean {
  const p = item.payload;

  if (item.kind === "repo") {
    const stars = typeof p.stars === "number" ? p.stars : 0;
    return stars >= ACTIVITY_FILTER.repo_min_stars;
  }

  if (item.kind === "package") {
    const dl = typeof p.downloads === "number" ? p.downloads : 0;
    return dl >= ACTIVITY_FILTER.package_min_downloads;
  }

  if (item.kind === "video") {
    const views = typeof p.views === "number" ? p.views : 0;
    return views >= ACTIVITY_FILTER.video_min_views;
  }

  if (item.kind === "rating") {
    const platform = typeof p.platform === "string" ? p.platform : "";

    if (platform === "leetcode") {
      const solved = p.solved as Record<string, number> | undefined;
      return (solved?.all ?? 0) >= ACTIVITY_FILTER.leetcode_min_solved;
    }

    if (platform === "codeforces") {
      return (
        (typeof p.rating === "number" ? p.rating : 0) >=
        ACTIVITY_FILTER.codeforces_min_rating
      );
    }

    if (platform === "stackoverflow") {
      return (
        (typeof p.reputation === "number" ? p.reputation : 0) >=
        ACTIVITY_FILTER.stackoverflow_min_reputation
      );
    }

    if (platform === "wakatime") {
      return (
        (typeof p.totalSeconds === "number" ? p.totalSeconds : 0) >=
        ACTIVITY_FILTER.wakatime_min_seconds
      );
    }
  }

  return true; // commits, releases, posts, badges, profiles — always show
}

/** All activity items, newest first, with threshold filtering applied. */
export function getActivityItems(limit?: number): ActivityItem[] {
  const items = (data.items ?? []).filter(meetsThreshold);
  return typeof limit === "number" ? items.slice(0, limit) : items;
}
