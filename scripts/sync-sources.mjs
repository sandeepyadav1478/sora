/* eslint-disable no-console */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { SOURCES } from "../src/config.sources.mjs";
import { readCache, mergeSources, writeCache } from "./lib/cache.mjs";
import { collectSecrets, assertNoSecrets, sanitize } from "./lib/redact.mjs";
import * as github from "./adapters/github.mjs";
import * as codeforces from "./adapters/codeforces.mjs";
import * as pypi from "./adapters/pypi.mjs";
import * as npm from "./adapters/npm.mjs";
import * as rss from "./adapters/rss.mjs";
import * as youtube from "./adapters/youtube.mjs";
import * as stackoverflow from "./adapters/stackoverflow.mjs";
import * as bluesky from "./adapters/bluesky.mjs";
import * as mastodon from "./adapters/mastodon.mjs";
import * as huggingface from "./adapters/huggingface.mjs";
import * as wakatime from "./adapters/wakatime.mjs";
import * as leetcode from "./adapters/leetcode.mjs";
import * as credly from "./adapters/credly.mjs";
import * as linkedin from "./adapters/linkedin.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(__dirname, "../src/data/sources-cache.json");
const DRY_RUN = process.argv.includes("--dry-run");
const REPORT = process.argv.includes("--report");
const REPORT_PATH = resolve(__dirname, "../sync-report.json");

// Adapter registry. Plan 2 appends more entries here.
const ADAPTERS = { github, codeforces, pypi, npm, rss, youtube, stackoverflow, bluesky, mastodon, huggingface, wakatime, leetcode, credly, linkedin };

/** A source runs when it is enabled. Each adapter validates its own required
 *  config (handle/packages/feeds/instance) inside fetch(), returning [] if incomplete. */
export function shouldRun(cfg) {
  return Boolean(cfg && cfg.enabled);
}

export function buildReport(results, generatedAt) {
  return {
    generatedAt,
    failures: results
      .filter((r) => !r.ok)
      .map(({ source, error }) => ({ source, error: error ?? "" })),
    successes: results.filter((r) => r.ok).map((r) => r.source),
  };
}

function nowIso() {
  // Date.now is fine in a real CLI run (this is not a resumable workflow script).
  return new Date().toISOString();
}

async function run() {
  const generatedAt = nowIso();
  const prev = await readCache(CACHE_PATH, generatedAt);

  // Gather the union of every adapter's declared `needs` -> secret values to guard against.
  const neededEnv = [...new Set(Object.values(ADAPTERS).flatMap((a) => a.needs || []))];
  const secrets = collectSecrets(neededEnv);

  const results = [];
  for (const [key, adapter] of Object.entries(ADAPTERS)) {
    const cfg = SOURCES[key];
    if (!shouldRun(cfg)) {
      console.log(`- ${key}: skipped (disabled)`);
      continue;
    }
    try {
      const items = await adapter.fetch(cfg);
      console.log(`- ${key}: ${items.length} item(s)`);
      results.push({ source: key, ok: true, items });
    } catch (err) {
      const msg = sanitize(err && err.message ? err.message : String(err), secrets);
      console.warn(`- ${key}: FAILED (${msg}) — keeping last cache`);
      results.push({ source: key, ok: false, items: [], error: msg });
    }
  }

  const next = mergeSources(prev, results, generatedAt);
  const serialized = JSON.stringify(next, null, 2) + "\n";

  // Leak guard (spec §2.5): never write a cache containing a secret value.
  assertNoSecrets(serialized, secrets);

  if (DRY_RUN) {
    console.log(`\n[dry-run] would write ${next.items.length} item(s) to ${CACHE_PATH}`);
    return;
  }
  await writeCache(CACHE_PATH, next);
  console.log(`\nWrote ${next.items.length} item(s) to ${CACHE_PATH}`);

  if (REPORT) {
    const report = buildReport(results, generatedAt);
    assertNoSecrets(JSON.stringify(report), secrets);
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`Sync report: ${report.failures.length} failure(s), ${report.successes.length} success(es)`);
  }
}

// Only run when invoked directly as a CLI; importing for tests must not trigger a sync.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error("sync-sources fatal:", err.message);
    process.exit(1);
  });
}
