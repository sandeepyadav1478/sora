import cache from "@/data/sources-cache.json";

export interface ActivityItem {
  id: string;
  source: string;
  kind:
    | "commit"   // git push / commit activity
    | "release"  // tagged release
    | "post"     // blog post / social post
    | "video"    // youtube video
    | "package"  // published package (npm, pypi)
    | "rating"   // score / stat snapshot (wakatime, leetcode, codeforces, stackoverflow)
    | "badge"    // credential / certification (credly, huggingface)
    | "repo"     // repository snapshot (github stars, topics, language)
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

/** All activity items, newest first (already sorted at write time). */
export function getActivityItems(limit?: number): ActivityItem[] {
  const items = data.items ?? [];
  return typeof limit === "number" ? items.slice(0, limit) : items;
}
