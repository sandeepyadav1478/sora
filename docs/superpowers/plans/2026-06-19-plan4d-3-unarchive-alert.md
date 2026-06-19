# Plan 4d-3: Auto-Unarchive Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When daily sync detects pushes to a repo listed as `githubRepo` in a `status: "archived"` work entry, open a GitHub Issue alerting the forker to promote it back to active. Uses `curl` + Python `urllib.request` — no `gh` CLI.

**Architecture:** `scripts/lib/parseWorks.mjs` reads works frontmatter (zero-dep regex); `scripts/check-archives.mjs` cross-references against the live cache; `sync-sources.yml` gets two new steps. `archive-alerts.json` is a temp file (never committed).

**Tech Stack:** Node 22 ESM, Python 3 stdlib (`urllib.request`, `json`), GitHub REST API, `curl`.

## Global Constraints

- **No `gh` CLI** — all GitHub API calls via `curl` or Python `urllib.request`
- **No new dependencies** — zero-dep frontmatter parser (regex), no `gray-matter`
- **`archive-alerts.json` never committed** — added to `.gitignore`
- **No Co-Authored-By** in commits
- **Never throws** — both new scripts catch all errors and exit cleanly

---

### Task 1: `parseWorks.mjs` + tests

**Files:**
- Create: `scripts/lib/parseWorks.mjs`
- Create: `scripts/__tests__/parseWorks.test.mjs`
- Create: `scripts/adapters/__fixtures__/works/archived-with-repo.md`
- Create: `scripts/adapters/__fixtures__/works/archived-no-repo.md`
- Create: `scripts/adapters/__fixtures__/works/active-with-repo.md`
- Create: `scripts/adapters/__fixtures__/works/no-frontmatter.md`

**Interfaces:**
- Produces: `getArchivedRepos(worksDir?) → [{title, githubRepo}]`

- [ ] **Step 1: Create test fixture files**

Create `scripts/adapters/__fixtures__/works/archived-with-repo.md`:
```md
---
title: "my-old-lib"
type: oss
status: archived
pubDatetime: 2023-01-01T00:00:00Z
description: "An old library."
githubRepo: "octocat/my-old-lib"
---
Content here.
```

Create `scripts/adapters/__fixtures__/works/archived-no-repo.md`:
```md
---
title: "no-repo-work"
type: oss
status: archived
pubDatetime: 2023-02-01T00:00:00Z
description: "Archived but no githubRepo field."
---
Content here.
```

Create `scripts/adapters/__fixtures__/works/active-with-repo.md`:
```md
---
title: "active-project"
type: project
status: active
pubDatetime: 2024-01-01T00:00:00Z
description: "Active project with githubRepo set."
githubRepo: "octocat/active-project"
---
Content here.
```

Create `scripts/adapters/__fixtures__/works/no-frontmatter.md`:
```md
Just some content with no frontmatter block at all.
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/__tests__/parseWorks.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getArchivedRepos } from "../lib/parseWorks.mjs";

const FIXTURES_DIR = resolve(
  fileURLToPath(import.meta.url),
  "../../adapters/__fixtures__/works"
);

test("getArchivedRepos returns archived entries with githubRepo set", () => {
  const out = getArchivedRepos(FIXTURES_DIR);
  assert.equal(out.length, 1, "only one fixture has status:archived + githubRepo");
  assert.equal(out[0].title, "my-old-lib");
  assert.equal(out[0].githubRepo, "octocat/my-old-lib");
});

test("getArchivedRepos ignores archived entries without githubRepo", () => {
  const out = getArchivedRepos(FIXTURES_DIR);
  assert.ok(!out.some((r) => r.title === "no-repo-work"), "no-repo entry must be excluded");
});

test("getArchivedRepos ignores active entries even with githubRepo set", () => {
  const out = getArchivedRepos(FIXTURES_DIR);
  assert.ok(!out.some((r) => r.githubRepo === "octocat/active-project"), "active entry must be excluded");
});

test("getArchivedRepos never throws on malformed or missing frontmatter", () => {
  assert.doesNotThrow(() => getArchivedRepos(FIXTURES_DIR));
});
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
node --test 'scripts/__tests__/parseWorks.test.mjs'
```

Expected: FAIL — `getArchivedRepos` not exported yet.

- [ ] **Step 4: Implement `scripts/lib/parseWorks.mjs`**

```js
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WORKS_DIR = resolve(
  fileURLToPath(import.meta.url),
  "../../../src/data/works"
);

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*"?([^"#\r\n]*)"?\s*$/);
    if (m) fm[m[1].trim()] = m[2].trim();
  }
  return fm;
}

export function getArchivedRepos(worksDir = DEFAULT_WORKS_DIR) {
  try {
    const files = readdirSync(worksDir).filter((f) => f.endsWith(".md"));
    const out = [];
    for (const f of files) {
      try {
        const content = readFileSync(join(worksDir, f), "utf8");
        const fm = parseFrontmatter(content);
        if (!fm) continue;
        if (fm.status === "archived" && fm.githubRepo && fm.title) {
          out.push({ title: fm.title, githubRepo: fm.githubRepo });
        }
      } catch {
        // skip unreadable files
      }
    }
    return out;
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Run tests — confirm 4 pass**

```bash
node --test 'scripts/__tests__/parseWorks.test.mjs'
```

Expected: **4 tests passing**.

- [ ] **Step 6: Run full suite**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **113 tests passing** (109 from Plan 4d-1 + 4 new).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/parseWorks.mjs scripts/__tests__/parseWorks.test.mjs scripts/adapters/__fixtures__/works/
git commit -m "feat(sync): add parseWorks lib — reads archived repo entries from works collection"
```

---

### Task 2: `check-archives.mjs` + `.gitignore`

**Files:**
- Create: `scripts/check-archives.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `getArchivedRepos()` from Task 1; `src/data/sources-cache.json`
- Produces: `archive-alerts.json` at repo root — `[{title, githubRepo}]`

- [ ] **Step 1: Add `archive-alerts.json` to `.gitignore`**

Open `.gitignore` and add:

```
archive-alerts.json
```

- [ ] **Step 2: Create `scripts/check-archives.mjs`**

```js
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
```

- [ ] **Step 3: Smoke-test locally**

```bash
cd /Users/sandeep.yadav/tmp/sora
node scripts/check-archives.mjs
cat archive-alerts.json
rm archive-alerts.json
```

Expected: `Archive check: 0 unarchive candidate(s)` (template has no real archived repos with `githubRepo` set — the example entry has `draft: true` but even if parsed, `your-username/your-repo` won't be in the cache).

- [ ] **Step 4: Run full test suite**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **113 tests passing**.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-archives.mjs .gitignore
git commit -m "feat(sync): add check-archives CLI — detects active pushes to archived repos"
```

---

### Task 3: Add archive check steps to `sync-sources.yml`

**Files:**
- Modify: `.github/workflows/sync-sources.yml`

**Interfaces:**
- Consumes: `archive-alerts.json` from Task 2
- Produces: GitHub Issues for unarchive candidates via REST API

- [ ] **Step 1: Add "Check git archives" step after "Process sync report"**

In `.github/workflows/sync-sources.yml`, insert after the "Write fallback issue body if process-report crashed" step:

```yaml
      - name: Check git archives
        if: always()
        run: node scripts/check-archives.mjs
```

- [ ] **Step 2: Add "Open unarchive candidate issues" step**

Insert immediately after the "Check git archives" step:

```yaml
      - name: Open unarchive candidate issues
        if: always()
        env:
          GH_API_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}
        run: |
          ALERTS=$(cat archive-alerts.json 2>/dev/null || echo "[]")
          COUNT=$(echo "$ALERTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
          if [ "$COUNT" -eq 0 ]; then
            echo "No unarchive candidates."
            exit 0
          fi
          echo "$ALERTS" | python3 - <<'PYEOF'
import sys, json, os
import urllib.request, urllib.parse

alerts = json.load(sys.stdin)
token = os.environ["GH_API_TOKEN"]
repo  = os.environ["GH_REPO"]
api   = f"https://api.github.com/repos/{repo}"
hdrs  = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
}

def api_call(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{api}{path}", data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"API error {method} {path}: {e}")
        return {}

# Ensure label exists (201=created, 422=exists — both ok)
api_call("POST", "/labels", {
    "name": "unarchive-candidate",
    "color": "0075ca",
    "description": "Repo has recent activity but is marked archived",
})

for alert in alerts:
    title = f"[Sora] Unarchive candidate: {alert['githubRepo']}"
    # Search for existing open issue
    q = urllib.parse.quote(title)
    search = f"https://api.github.com/search/issues?q={q}+in:title+repo:{repo}+state:open&per_page=1"
    req = urllib.request.Request(search, headers=hdrs)
    try:
        with urllib.request.urlopen(req) as r:
            results = json.loads(r.read())
        if results.get("total_count", 0) > 0:
            print(f"Issue already open for {alert['githubRepo']} — skipping")
            continue
    except Exception as e:
        print(f"Search error: {e}")

    body = f"""## Unarchive candidate

**Work entry:** {alert['title']}
**Repo:** {alert['githubRepo']}

This repo appears in your recent GitHub activity feed but is marked `status: archived` in your works.

**To promote it back to active:**
1. Open `src/data/works/<entry>.md`
2. Change `status: archived` to `status: active` (or `maintained` / `in-production`)
3. Update `modDatetime` to today

_This issue will not reopen once you close it unless new activity is detected in a future sync._
"""
    api_call("POST", "/issues", {
        "title": title,
        "body": body,
        "labels": ["unarchive-candidate"],
    })
    print(f"Opened issue for {alert['githubRepo']}")
PYEOF
```

- [ ] **Step 3: Verify no `gh` commands anywhere in the workflow**

```bash
grep -n "\bgh\b" .github/workflows/sync-sources.yml
```

Expected: no output.

- [ ] **Step 4: Verify workflow file is readable**

```bash
node -e "require('fs').readFileSync('.github/workflows/sync-sources.yml','utf8'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 5: Run full test suite**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **113 tests passing**.

- [ ] **Step 6: Run lint + build**

```bash
pnpm run lint && pnpm run format:check && pnpm run build
```

Expected: all three pass.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/sync-sources.yml
git commit -m "feat(ci): add archive check + unarchive candidate issue steps to sync workflow"
```

---

### Task 4: Apply to personal site

**Files (personal-site):**
- Copy: `scripts/lib/parseWorks.mjs`
- Copy: `scripts/check-archives.mjs`
- Copy: `.github/workflows/sync-sources.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Copy new files to personal-site**

```bash
cp /Users/sandeep.yadav/tmp/sora/scripts/lib/parseWorks.mjs \
   /Users/sandeep.yadav/tmp/personal-site/scripts/lib/parseWorks.mjs

cp /Users/sandeep.yadav/tmp/sora/scripts/check-archives.mjs \
   /Users/sandeep.yadav/tmp/personal-site/scripts/check-archives.mjs

cp /Users/sandeep.yadav/tmp/sora/.github/workflows/sync-sources.yml \
   /Users/sandeep.yadav/tmp/personal-site/.github/workflows/sync-sources.yml
```

- [ ] **Step 2: Add `archive-alerts.json` to personal-site `.gitignore`**

Add to `/Users/sandeep.yadav/tmp/personal-site/.gitignore`:

```
archive-alerts.json
```

- [ ] **Step 3: Smoke-test check-archives on personal site**

```bash
cd /Users/sandeep.yadav/tmp/personal-site
node scripts/check-archives.mjs
cat archive-alerts.json
rm archive-alerts.json
```

Expected: `Archive check: 0 unarchive candidate(s)` — sqloutbox is archived but the cache shows it as an active PyPI source, not a github source. Only github push events trigger this check.

- [ ] **Step 4: Run test suite in personal-site**

```bash
cd /Users/sandeep.yadav/tmp/personal-site && node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **113 tests passing**.

- [ ] **Step 5: Commit and push both repos**

```bash
cd /Users/sandeep.yadav/tmp/personal-site
git add scripts/lib/parseWorks.mjs scripts/check-archives.mjs .github/workflows/sync-sources.yml .gitignore
git commit -m "feat(sync): add archive check + unarchive alert to personal site"

git -C /Users/sandeep.yadav/tmp/sora push origin main
git -C /Users/sandeep.yadav/tmp/personal-site push origin main
```
