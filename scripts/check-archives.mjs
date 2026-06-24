/* eslint-disable no-console */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getArchivedRepos } from "./lib/parseWorks.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CACHE_PATH = resolve(__dirname, "../src/data/sources-cache.json");
const ALERTS_PATH = resolve(__dirname, "../archive-alerts.json");

/** Pure logic: cross-reference cached github items vs archived repos.
 *  Returns [{title, githubRepo}] for any archived repo with recent GitHub activity. */
export function buildAlerts(cacheItems, archivedRepos) {
  const activeRepos = new Set(
    (cacheItems || [])
      .filter((it) => it.source === "github" && it.payload?.repo && it.payload.repo !== "private")
      .map((it) => it.payload.repo)
  );
  return (archivedRepos || []).filter(({ githubRepo }) => activeRepos.has(githubRepo));
}

// CLI entry point — only runs when executed directly, not when imported for tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    const archived = getArchivedRepos();
    const alerts = buildAlerts(cache.items, archived);
    writeFileSync(ALERTS_PATH, JSON.stringify(alerts, null, 2) + "\n");
    console.log(`Archive check: ${alerts.length} unarchive candidate(s)`);
  } catch (e) {
    console.warn("check-archives: skipped —", e.message);
    writeFileSync(ALERTS_PATH, "[]\n");
  }
}
