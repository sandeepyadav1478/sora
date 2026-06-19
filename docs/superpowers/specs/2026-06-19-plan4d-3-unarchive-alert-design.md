# Plan 4d-3: Auto-Unarchive Alert Design

## Goal

When the daily sync detects a push to a repo listed as `githubRepo` in a `status: "archived"` work entry, open a GitHub Issue alerting the forker to promote it back to active. Uses `curl` + GitHub REST API — no `gh` CLI anywhere.

## Architecture

Two new files + one workflow step:

1. **`scripts/lib/parseWorks.mjs`** — zero-dep frontmatter parser. Reads all `.md` files in `src/data/works/`, extracts `{ title, githubRepo, status }` from each. Returns only entries with `status: "archived"` and a non-empty `githubRepo`.

2. **`scripts/check-archives.mjs`** — CLI entry point. Reads archived repos from `parseWorks`, cross-references against the current `src/data/sources-cache.json` for any github items whose `payload.repo` matches an archived repo. Writes `archive-alerts.json` (list of matches) to repo root. Never throws.

3. **`sync-sources.yml`** — two new steps after "Process sync report":
   - "Check git archives" — runs `node scripts/check-archives.mjs`
   - "Open unarchive candidate issues" — for each match in `archive-alerts.json`, opens a GitHub Issue via `curl` if no open issue with that title already exists

## `parseWorks.mjs`

```js
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKS_DIR = resolve(
  fileURLToPath(import.meta.url),
  "../../../src/data/works"
);

/** Extract YAML frontmatter fields without a parser dependency.
 * Returns null if the file has no frontmatter block. */
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

/** Return archived works that have a githubRepo field set. */
export function getArchivedRepos(worksDir = WORKS_DIR) {
  const files = readdirSync(worksDir).filter((f) => f.endsWith(".md"));
  const out = [];
  for (const f of files) {
    const content = readFileSync(join(worksDir, f), "utf8");
    const fm = parseFrontmatter(content);
    if (!fm) continue;
    if (fm.status === "archived" && fm.githubRepo && fm.title) {
      out.push({ title: fm.title, githubRepo: fm.githubRepo });
    }
  }
  return out;
}
```

## `check-archives.mjs`

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

  // Collect all github items from the cache (payload.repo is "owner/repo")
  const activeRepos = new Set(
    (cache.items || [])
      .filter((it) => it.source === "github" && it.payload?.repo)
      .map((it) => it.payload.repo)
  );

  // Find archived repos that appear in the live github feed
  const alerts = archived.filter(({ githubRepo }) => activeRepos.has(githubRepo));

  writeFileSync(ALERTS_PATH, JSON.stringify(alerts, null, 2) + "\n");
  console.log(`Archive check: ${alerts.length} unarchive candidate(s)`);
} catch (e) {
  console.warn("check-archives: skipped —", e.message);
  writeFileSync(ALERTS_PATH, "[]\n");
}
```

`archive-alerts.json` shape:
```json
[
  { "title": "sqloutbox", "githubRepo": "sandeepyadav1478/sqloutbox" }
]
```

Added to `.gitignore` — never committed.

## `sync-sources.yml` — new steps

Insert after the "Process sync report" step:

```yaml
      - name: Check git archives
        if: always()
        run: node scripts/check-archives.mjs

      - name: Open unarchive candidate issues
        if: always()
        run: |
          ALERTS=$(cat archive-alerts.json 2>/dev/null || echo "[]")
          COUNT=$(echo "$ALERTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
          if [ "$COUNT" -eq 0 ]; then
            echo "No unarchive candidates."
            exit 0
          fi

          echo "$ALERTS" | python3 -c "
          import sys, json, subprocess, os, urllib.request

          alerts = json.load(sys.stdin)
          token = os.environ['GITHUB_TOKEN']
          repo = os.environ['GITHUB_REPOSITORY']
          api = f'https://api.github.com/repos/{repo}'
          headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          }

          def api_call(method, path, body=None):
            data = json.dumps(body).encode() if body else None
            req = urllib.request.Request(f'{api}{path}', data=data, headers=headers, method=method)
            try:
              with urllib.request.urlopen(req) as r:
                return json.loads(r.read())
            except Exception as e:
              print(f'API error {path}: {e}')
              return {}

          for alert in alerts:
            title = f'[Sora] Unarchive candidate: {alert[\"githubRepo\"]}'
            # Search for existing open issue
            search_url = f'https://api.github.com/search/issues?q={urllib.parse.quote(title)}+in:title+repo:{repo}+state:open&per_page=1'
            import urllib.parse
            req = urllib.request.Request(search_url, headers=headers)
            try:
              with urllib.request.urlopen(req) as r:
                results = json.loads(r.read())
              if results.get('total_count', 0) > 0:
                print(f'Issue already open for {alert[\"githubRepo\"]} — skipping')
                continue
            except Exception as e:
              print(f'Search error: {e}')

            body = f'''## Unarchive candidate

**Work entry:** {alert[\"title\"]}
**Repo:** {alert[\"githubRepo\"]}

This repo appears in your recent GitHub activity feed but is marked \`status: archived\` in your works.

**To promote it back to active:**
1. Open \`src/data/works/<entry>.md\`
2. Change \`status: archived\` to \`status: active\` (or \`maintained\` / \`in-production\`)
3. Update \`modDatetime\` to today

_This issue will not reopen once you close it unless new activity is detected again._
'''
            api_call('POST', '/issues', {
              'title': title,
              'body': body,
              'labels': ['unarchive-candidate'],
            })
            print(f'Opened issue for {alert[\"githubRepo\"]}')
          "
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
```

## Label

The `unarchive-candidate` label is created lazily by the issue step if needed — the GitHub API returns 422 (label exists) which is acceptable.

Actually, to avoid `gh label create`, the label is created inline via the Python script using the same `api_call` helper:

```python
# Before the loop, ensure label exists
api_call('POST', '/labels', {
  'name': 'unarchive-candidate',
  'color': '0075ca',
  'description': 'Repo has recent activity but is marked archived'
})
# 201 = created, 422 = already exists — both ok
```

## Tests

New test file `scripts/__tests__/parseWorks.test.mjs`:

```js
test("getArchivedRepos returns only archived entries with githubRepo set")
test("getArchivedRepos ignores entries without status:archived")
test("getArchivedRepos ignores archived entries with no githubRepo field")
test("getArchivedRepos never throws on malformed or missing frontmatter")
```

Tests use a `__fixtures__/works/` directory with synthetic `.md` files — no real works data in tests.

## `.gitignore` additions

```
archive-alerts.json
```

## Files Changed

| File | Change |
|---|---|
| `scripts/lib/parseWorks.mjs` | New — zero-dep frontmatter parser + archived repo extractor |
| `scripts/check-archives.mjs` | New — CLI: cross-reference cache vs archived repos, write alerts JSON |
| `scripts/__tests__/parseWorks.test.mjs` | New — 4 tests |
| `scripts/adapters/__fixtures__/works/` | New fixture directory with synthetic .md files for tests |
| `.github/workflows/sync-sources.yml` | Add "Check git archives" + "Open unarchive candidate issues" steps |
| `.gitignore` | Add `archive-alerts.json` |

## Out of Scope

- Auto-closing the unarchive issue when activity stops (manual close by forker)
- Auto-updating the frontmatter (issue is the alert, human makes the change)
- Credly adapter (separate plan)
