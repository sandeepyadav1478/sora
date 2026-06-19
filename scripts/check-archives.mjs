import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getArchivedRepos } from "./lib/parseWorks.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CACHE_PATH = resolve(__dirname, "../src/data/sources-cache.json");
const ALERTS_PATH = resolve(__dirname, "../archive-alerts.json");

try {
  const cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  const archived = getArchivedRepos();

  const activeRepos = new Set(
    (cache.items || [])
      .filter((it) => it.source === "github" && it.payload?.repo)
      .map((it) => it.payload.repo)
  );

  const alerts = archived.filter(({ githubRepo }) => activeRepos.has(githubRepo));

  writeFileSync(ALERTS_PATH, JSON.stringify(alerts, null, 2) + "\n");
  console.log(`Archive check: ${alerts.length} unarchive candidate(s)`);
} catch (e) {
  console.warn("check-archives: skipped —", e.message);
  writeFileSync(ALERTS_PATH, "[]\n");
}
