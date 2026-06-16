# Plan 3: Sync Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily GitHub Actions workflow that runs the content aggregator, commits the updated cache to main (triggering deploy), and notifies forkers via a GitHub Issue + Actions `::warning::` annotations when any adapter fails.

**Architecture:** Three additions: (1) `buildReport` exported from `sync-sources.mjs` + `--report` flag writes `sync-report.json` after each run; (2) `scripts/process-report.mjs` reads that JSON and feeds `GITHUB_OUTPUT` + writes `/tmp/issue_body.md`; (3) `.github/workflows/sync-sources.yml` orchestrates sync → commit → issue management using `gh` CLI (pre-installed in Actions).

**Tech Stack:** Node 22 ESM, GitHub Actions (ubuntu-latest), `gh` CLI, pnpm 10.11.1.

---

### Task 1: `buildReport` + `--report` flag + test + `.gitignore`

**Files:**
- Modify: `scripts/sync-sources.mjs`
- Create: `scripts/__tests__/sync-report.test.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Add `sync-report.json` to `.gitignore`**

Open `.gitignore` and add one line after the `.env` block:

```
sync-report.json
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/__tests__/sync-report.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../sync-sources.mjs";

const RESULTS = [
  { source: "github", ok: true, items: [] },
  { source: "pypi", ok: false, items: [], error: "HTTP 404 for https://pypi.org/pypi/foo/json" },
  { source: "npm", ok: true, items: [] },
];

test("buildReport: failures array contains only failed sources with sanitized error", () => {
  const r = buildReport(RESULTS, "2026-06-16T02:00:00.000Z");
  assert.deepEqual(r.failures, [
    { source: "pypi", error: "HTTP 404 for https://pypi.org/pypi/foo/json" },
  ]);
});

test("buildReport: successes array contains only successful source names", () => {
  const r = buildReport(RESULTS, "2026-06-16T02:00:00.000Z");
  assert.deepEqual(r.successes, ["github", "npm"]);
});

test("buildReport: generatedAt is preserved verbatim", () => {
  const r = buildReport(RESULTS, "2026-06-16T02:00:00.000Z");
  assert.equal(r.generatedAt, "2026-06-16T02:00:00.000Z");
});

test("buildReport: empty results → zero failures, zero successes", () => {
  const r = buildReport([], "2026-06-16T02:00:00.000Z");
  assert.deepEqual(r, {
    generatedAt: "2026-06-16T02:00:00.000Z",
    failures: [],
    successes: [],
  });
});

test("buildReport: missing error field on a failure → empty string, not undefined", () => {
  const r = buildReport(
    [{ source: "rss", ok: false, items: [] }],
    "2026-06-16T02:00:00.000Z",
  );
  assert.deepEqual(r.failures, [{ source: "rss", error: "" }]);
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
node --test 'scripts/__tests__/sync-report.test.mjs'
```

Expected: FAIL — `buildReport` is not exported yet.

- [ ] **Step 4: Implement `buildReport` and the `--report` flag in `sync-sources.mjs`**

Add `writeFile` to the top imports:

```js
import { writeFile } from "node:fs/promises";
```

Add the `REPORT` constants after `DRY_RUN` (line 20):

```js
const REPORT = process.argv.includes("--report");
const REPORT_PATH = resolve(__dirname, "../sync-report.json");
```

Add the exported `buildReport` function before `nowIso()`:

```js
export function buildReport(results, generatedAt) {
  return {
    generatedAt,
    failures: results
      .filter((r) => !r.ok)
      .map(({ source, error }) => ({ source, error: error ?? "" })),
    successes: results.filter((r) => r.ok).map((r) => r.source),
  };
}
```

In `run()`, insert the report-write block **before** the existing `if (DRY_RUN)` check. The tail of `run()` should read:

```js
  const next = mergeSources(prev, results, generatedAt);
  const serialized = JSON.stringify(next, null, 2) + "\n";

  // Leak guard (spec §2.5): never write a cache containing a secret value.
  assertNoSecrets(serialized, secrets);

  if (REPORT) {
    const report = buildReport(results, generatedAt);
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`Sync report: ${report.failures.length} failure(s), ${report.successes.length} success(es)`);
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] would write ${next.items.length} item(s) to ${CACHE_PATH}`);
    return;
  }
  await writeCache(CACHE_PATH, next);
  console.log(`\nWrote ${next.items.length} item(s) to ${CACHE_PATH}`);
```

- [ ] **Step 5: Run all tests to confirm 90 pass**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **90 tests passing** (85 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/sync-sources.mjs scripts/__tests__/sync-report.test.mjs
git commit -m "feat(sync): export buildReport + add --report flag"
```

---

### Task 2: `scripts/process-report.mjs` — workflow helper

**Files:**
- Create: `scripts/process-report.mjs`

This script is called by the GitHub Actions workflow after `sync-sources.mjs --report` completes. It reads `sync-report.json`, writes `failure_count` to `$GITHUB_OUTPUT`, emits `::warning::` annotations to stdout (one per failed adapter), and writes the formatted issue body to `/tmp/issue_body.md`. Using a file for the issue body avoids shell quoting issues with multi-line strings in the workflow.

- [ ] **Step 1: Create `scripts/process-report.mjs`**

```js
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const report = JSON.parse(readFileSync("sync-report.json", "utf8"));

// Write failure_count to GitHub Actions output (read by if: conditions in workflow)
const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `failure_count=${report.failures.length}\n`);
}

// Emit ::warning:: annotations — visible in the Actions summary without opening the full log
for (const f of report.failures) {
  process.stdout.write(`::warning::Sync failed for source ${f.source}: ${f.error}\n`);
}

// Write issue body to a temp file (workflow uses --body-file to avoid quoting issues)
const runUrl = [
  process.env.GITHUB_SERVER_URL,
  process.env.GITHUB_REPOSITORY,
  "actions/runs",
  process.env.GITHUB_RUN_ID,
]
  .filter(Boolean)
  .join("/");

const bodyLines = [
  "## Sync failures",
  "",
  runUrl ? `**Run:** ${runUrl}` : "_Run URL unavailable_",
  "",
  ...report.failures.map((f) => `- **${f.source}**: \`${f.error}\``),
  "",
  `_Last updated: ${report.generatedAt}_`,
];
writeFileSync("/tmp/issue_body.md", bodyLines.join("\n"));
```

- [ ] **Step 2: Smoke-test locally**

Create a minimal `sync-report.json` at repo root, run the script, verify the output, then clean up:

```bash
echo '{"generatedAt":"2026-06-16T02:00:00.000Z","failures":[{"source":"pypi","error":"HTTP 404"}],"successes":["github"]}' > sync-report.json
node scripts/process-report.mjs
cat /tmp/issue_body.md
rm sync-report.json
```

Expected stdout: `::warning::Sync failed for source pypi: HTTP 404`

Expected `/tmp/issue_body.md` content:
```
## Sync failures

_Run URL unavailable_

- **pypi**: `HTTP 404`

_Last updated: 2026-06-16T02:00:00.000Z_
```

(Run URL is empty locally because the `GITHUB_*` env vars are absent — that's expected.)

- [ ] **Step 3: Commit**

```bash
git add scripts/process-report.mjs
git commit -m "feat(sync): add process-report workflow helper"
```

---

### Task 3: `.github/workflows/sync-sources.yml`

**Files:**
- Create: `.github/workflows/sync-sources.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Sync content sources

on:
  schedule:
    - cron: "0 2 * * *" # Daily at 2am UTC
  workflow_dispatch: # Manual trigger from the Actions UI

permissions:
  contents: write # push updated cache to main
  issues: write # open / update / close the failure issue

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.11.1

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Run sync
        run: node scripts/sync-sources.mjs --report
        env:
          WAKATIME_API_KEY: ${{ secrets.WAKATIME_API_KEY }}

      - name: Commit updated cache
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if git diff --quiet src/data/sources-cache.json; then
            echo "Cache unchanged — skipping commit"
          else
            git add src/data/sources-cache.json
            git commit -m "chore(sync): update sources cache"
            git push
          fi

      - name: Process sync report
        id: report
        run: node scripts/process-report.mjs

      - name: Ensure sync-failure label exists
        if: steps.report.outputs.failure_count != '0'
        run: |
          gh label create "sync-failure" \
            --color "d73a4a" \
            --description "Automatic sync failure notification" \
            --force 2>/dev/null || true

      - name: Open or update failure issue
        if: steps.report.outputs.failure_count != '0'
        run: |
          ISSUE_TITLE="[Sora] Sync failures"
          EXISTING=$(gh issue list --state open \
            --search "\"$ISSUE_TITLE\" in:title" \
            --json number --jq '.[0].number // empty')
          if [ -z "$EXISTING" ]; then
            gh issue create \
              --title "$ISSUE_TITLE" \
              --body-file /tmp/issue_body.md \
              --label "sync-failure"
          else
            gh issue edit "$EXISTING" --body-file /tmp/issue_body.md
          fi

      - name: Close failure issue on clean sync
        if: steps.report.outputs.failure_count == '0'
        run: |
          ISSUE_TITLE="[Sora] Sync failures"
          EXISTING=$(gh issue list --state open \
            --search "\"$ISSUE_TITLE\" in:title" \
            --json number --jq '.[0].number // empty')
          if [ -n "$EXISTING" ]; then
            gh issue close "$EXISTING" \
              --comment "All sources synced successfully. Closing."
          fi
```

- [ ] **Step 2: Confirm the file is syntactically readable**

```bash
node -e "import('node:fs').then(fs => { fs.readFileSync('.github/workflows/sync-sources.yml','utf8'); console.log('file OK'); })"
```

Expected: `file OK`

- [ ] **Step 3: Run full test suite to confirm nothing is broken**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **90 tests passing**.

- [ ] **Step 4: Run lint and build**

```bash
pnpm run lint && pnpm run format:check && pnpm run build
```

Expected: all three pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/sync-sources.yml
git commit -m "feat(ci): add daily sync-sources workflow with failure issue management"
```
