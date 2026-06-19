# Plan 4d-1: GitHub Adapter Upgrade + curl Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the GitHub adapter to support authenticated multi-page fetch (up to 300 events, including private repos), differentiate private/public commits in the payload, and replace all `gh` CLI calls in `sync-sources.yml` with `curl` + GitHub REST API.

**Architecture:** The adapter adds `GITHUB_READ_TOKEN` opt-in (absent = current unauthenticated behaviour, no regression), multi-page loop, and `visibility` field in commit payloads. The workflow replaces 3 `gh`-dependent steps with inline `curl`/Python. `ActivityCard.astro` renders a lock badge for `payload.visibility === "private"`.

**Tech Stack:** Node 22 ESM, GitHub REST API v3, `curl`, Python 3 (stdlib only, pre-installed on ubuntu-latest), Astro v5.

## Global Constraints

- **Never use `gh` CLI** — use `curl` + GitHub REST API or Python `urllib.request` everywhere
- **Never add Co-Authored-By** to commits
- **Template ships disabled** — `maxPages: 1`, `enabled: false`, blank handle
- **`GITHUB_READ_TOKEN` is never committed** — GitHub Actions secret only
- **Security invariant** — authenticated endpoint `/events` only when token present; unauthenticated always uses `/events/public`
- **Existing tests must keep passing** — 106 tests before; after Task 1 expect 113+

---

### Task 1: Upgrade GitHub adapter + tests

**Files:**
- Modify: `scripts/adapters/github.mjs`
- Modify: `scripts/__tests__/github.test.mjs`
- Modify: `scripts/adapters/__fixtures__/github-events.json`
- Modify: `src/config.sources.mjs` (add `maxPages: 1` to template config)

**Interfaces:**
- Produces: `normalizeEvents(events, cfg)` — unchanged signature, new `payload.visibility` field; `fetch_(cfg)` — now multi-page, token-aware

- [ ] **Step 1: Add private-repo event fixture entries to `scripts/adapters/__fixtures__/github-events.json`**

Open the file and append two new events (after the existing array entries, before the closing `]`):

```json
,
{
  "id": "2001",
  "type": "PushEvent",
  "public": false,
  "repo": { "name": "octocat/secret-project" },
  "payload": {
    "ref": "refs/heads/main",
    "head": "fff999",
    "commits": [
      { "sha": "fff999", "message": "feat: private commit message" }
    ]
  },
  "created_at": "2026-06-12T08:00:00Z"
},
{
  "id": "2002",
  "type": "PushEvent",
  "public": true,
  "repo": { "name": "octocat/hello" },
  "payload": {
    "ref": "refs/heads/main",
    "head": "eee888",
    "commits": [
      { "sha": "eee888", "message": "docs: public commit" }
    ]
  },
  "created_at": "2026-06-12T07:00:00Z"
}
```

Also add the `"public": true` field to the existing events (id 1001-1004) so the fixture is consistent — add `"public": true` to each.

- [ ] **Step 2: Write the failing tests**

Add these tests at the end of `scripts/__tests__/github.test.mjs`:

```js
test("normalizeEvents: private repo commit has visibility:private and no message in payload", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 50 });
  const priv = out.find((e) => e.payload && e.payload.repo === "octocat/secret-project");
  assert.ok(priv, "private repo commit must appear");
  assert.equal(priv.payload.visibility, "private");
  assert.equal(priv.payload.message, undefined, "private commits must not expose message");
  assert.equal(priv.payload.sha, undefined, "private commits must not expose sha");
  assert.equal(priv.url, "https://github.com/octocat/secret-project", "private url = repo homepage");
  assert.equal(priv.title, "Pushed to secret-project");
});

test("normalizeEvents: public repo commit has visibility:public with message", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 50 });
  const pub = out.find((e) => e.payload && e.payload.sha === "eee888");
  assert.ok(pub, "public commit must appear");
  assert.equal(pub.payload.visibility, "public");
  assert.ok(pub.payload.message, "public commits must have message");
  assert.ok(pub.payload.sha, "public commits must have sha");
});

test("normalizeEvents: events with no public field default to visibility:public", () => {
  const noFlag = [
    {
      type: "PushEvent",
      repo: { name: "octocat/test" },
      payload: { ref: "refs/heads/main", commits: [{ sha: "abc", message: "test" }] },
      created_at: "2026-06-01T00:00:00Z",
    },
  ];
  const out = normalizeEvents(noFlag, { handle: "octocat", maxCommits: 25 });
  assert.equal(out[0].payload.visibility, "public");
});
```

- [ ] **Step 3: Run tests — confirm new tests fail**

```bash
node --test 'scripts/__tests__/github.test.mjs'
```

Expected: 3 new tests FAIL (visibility field not implemented yet).

- [ ] **Step 4: Update `normalizeEvents` in `scripts/adapters/github.mjs`**

Replace the `normalizeEvents` function. Key changes: add `visibility` to payload; private commits skip message/sha, use repo homepage URL.

```js
export function normalizeEvents(events, cfg) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const ev of events) {
    if (!ev || !ev.repo || !ev.created_at) continue;
    const repo = ev.repo.name;
    const isPublic = ev.public !== false; // default true if field absent
    if (ev.type === "PushEvent" && ev.payload) {
      const branch = String(ev.payload.ref || "").replace("refs/heads/", "") || undefined;
      const repoShort = repo.includes("/") ? repo.split("/")[1] : repo;
      const commits = Array.isArray(ev.payload.commits)
        ? ev.payload.commits.filter((c) => c && c.sha)
        : [];
      if (!isPublic) {
        // Private repo: basic info only — no commit message, no sha exposed
        const sha = (commits[0] && commits[0].sha) || ev.payload.head;
        if (!sha) continue;
        out.push(
          makeEnvelope({
            id: stableId("github", "commit", sha),
            source: "github",
            kind: "commit",
            title: `Pushed to ${repoShort}`,
            url: `https://github.com/${repo}`,
            date: ev.created_at,
            payload: { repo, branch, visibility: "private" },
          })
        );
      } else if (commits.length > 0) {
        for (const c of commits) {
          out.push(
            makeEnvelope({
              id: stableId("github", "commit", c.sha),
              source: "github",
              kind: "commit",
              title: (c.message || "").split("\n")[0] || `Pushed to ${repoShort}`,
              url: `https://github.com/${repo}/commit/${c.sha}`,
              date: ev.created_at,
              payload: { repo, sha: c.sha, branch, message: c.message || "", visibility: "public" },
            })
          );
        }
      } else if (ev.payload.head) {
        const sha = ev.payload.head;
        out.push(
          makeEnvelope({
            id: stableId("github", "commit", sha),
            source: "github",
            kind: "commit",
            title: `Pushed to ${repoShort}`,
            url: `https://github.com/${repo}/commit/${sha}`,
            date: ev.created_at,
            payload: { repo, sha, branch, message: "", visibility: "public" },
          })
        );
      }
    } else if (ev.type === "ReleaseEvent" && ev.payload && ev.payload.release) {
      const rel = ev.payload.release;
      out.push(
        makeEnvelope({
          id: stableId("github", "release", `${repo}@${rel.tag_name}`),
          source: "github",
          kind: "release",
          title: `${repo} ${rel.name || rel.tag_name}`,
          url: rel.html_url || `https://github.com/${repo}/releases`,
          date: ev.created_at,
          payload: { repo, version: rel.tag_name },
        })
      );
    }
  }
  const commits = out
    .filter((e) => e.kind === "commit")
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cfg.maxCommits ?? 25);
  const releases = out.filter((e) => e.kind === "release");
  return [...commits, ...releases];
}
```

- [ ] **Step 5: Update `fetch_` in `scripts/adapters/github.mjs`**

Replace the `fetch_` function with the multi-page, token-aware version:

```js
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const handle = cfg.handle;
    const token = process.env.GITHUB_READ_TOKEN;
    const maxPages = cfg.maxPages ?? 1;
    const baseUrl = token
      ? `${API}/users/${encodeURIComponent(handle)}/events`
      : `${API}/users/${encodeURIComponent(handle)}/events/public`;

    let allEvents = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = `${baseUrl}?per_page=100&page=${page}`;
      const headers = { "User-Agent": UA, Accept: "application/vnd.github+json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) break;
      const pageEvents = await res.json();
      if (!Array.isArray(pageEvents) || pageEvents.length === 0) break;
      allEvents = allEvents.concat(pageEvents);
    }
    return normalizeEvents(allEvents, cfg);
  } catch {
    return [];
  }
}
```

Also update the security comment at the top and the `needs` export:

```js
export const needs = []; // GITHUB_READ_TOKEN is optional — adapter self-validates
```

Remove the old `EVENTS_URL` export and the hard guard `if (!url.endsWith("/events/public"))` — the new fetch_ handles endpoint selection internally. But keep `EVENTS_URL` for the existing test. Update `EVENTS_URL` to return the public endpoint (unchanged) — it's still tested and exported for the security test.

- [ ] **Step 6: Add `maxPages: 1` to template `src/config.sources.mjs`**

In `src/config.sources.mjs`, update the github entry:

```js
  github: {
    enabled: false,
    handle: "",
    maxCommits: 25,
    maxPages: 1, // 1=default (unauthenticated, ~30 events). Set 3 + GITHUB_READ_TOKEN for full history.
  },
```

- [ ] **Step 7: Run full test suite**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **109 tests passing** (106 existing + 3 new).

- [ ] **Step 8: Commit**

```bash
git add scripts/adapters/github.mjs scripts/__tests__/github.test.mjs scripts/adapters/__fixtures__/github-events.json src/config.sources.mjs
git commit -m "feat(adapters): github multi-page fetch, GITHUB_READ_TOKEN opt-in, private/public visibility"
```

---

### Task 2: ActivityCard lock badge for private commits

**Files:**
- Modify: `src/components/ActivityCard.astro`

**Interfaces:**
- Consumes: `payload.visibility` from Task 1

- [ ] **Step 1: Add lock badge to the commit block in `ActivityCard.astro`**

In `src/components/ActivityCard.astro`, find the commit block (around line 44-49):

```ts
if (kind === "commit") {
  const branch = typeof p.branch === "string" ? p.branch : "";
  if (ACTIVITY_DISPLAY.commit_branch && branch)
    badges.push({ glyph: "⎇", text: branch });
  if (ACTIVITY_DISPLAY.commit_tooltip) tip = trunc(p.message);
}
```

Replace with:

```ts
if (kind === "commit") {
  const branch = typeof p.branch === "string" ? p.branch : "";
  const isPrivate = p.visibility === "private";
  if (isPrivate) badges.push({ glyph: "🔒", text: "private" });
  if (ACTIVITY_DISPLAY.commit_branch && branch && !isPrivate)
    badges.push({ glyph: "⎇", text: branch });
  if (ACTIVITY_DISPLAY.commit_tooltip && !isPrivate) tip = trunc(p.message);
}
```

Private commits: show lock badge, suppress branch badge and tooltip (no message to show).

- [ ] **Step 2: Run build to confirm no TypeScript errors**

```bash
pnpm run build 2>&1 | grep -c "error TS"
```

Expected: `0`

- [ ] **Step 3: Run full test suite**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **109 tests passing**.

- [ ] **Step 4: Commit**

```bash
git add src/components/ActivityCard.astro
git commit -m "feat(ui): show lock badge for private repo commits in ActivityCard"
```

---

### Task 3: Replace `gh` CLI with `curl` in `sync-sources.yml`

**Files:**
- Modify: `.github/workflows/sync-sources.yml`

**Interfaces:**
- Consumes: `${{ secrets.GITHUB_TOKEN }}`, `${{ github.repository }}`
- Produces: working issue management via GitHub REST API, no `gh` dependency

- [ ] **Step 1: Remove `GH_TOKEN` from job-level env and add `GITHUB_READ_TOKEN` to Run sync step**

Find the job-level `env:` block:
```yaml
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Remove it entirely (delete all 2 lines).

Then find the "Run sync" step and update its `env:`:
```yaml
      - name: Run sync
        continue-on-error: true
        run: node scripts/sync-sources.mjs --report
        env:
          WAKATIME_API_KEY: ${{ secrets.WAKATIME_API_KEY }}
          GITHUB_READ_TOKEN: ${{ secrets.GITHUB_READ_TOKEN }}
```

- [ ] **Step 2: Replace "Ensure sync-failure label exists" step**

Replace the entire step (lines with `gh label create`) with:

```yaml
      - name: Ensure sync-failure label exists
        if: always() && (steps.report.outputs.failure_count != '0' || steps.fallback_report.outputs.failure_count != '')
        env:
          GH_API_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          curl -s -o /dev/null \
            -X POST \
            -H "Authorization: Bearer $GH_API_TOKEN" \
            -H "Accept: application/vnd.github+json" \
            "https://api.github.com/repos/${{ github.repository }}/labels" \
            -d '{"name":"sync-failure","color":"d73a4a","description":"Automatic sync failure notification"}' \
            || true
          # 201 = created, 422 = already exists — both acceptable
```

- [ ] **Step 3: Replace "Open or update failure issue" step**

Replace the entire step (lines with `gh issue list`, `gh issue create`, `gh issue edit`) with:

```yaml
      - name: Open or update failure issue
        if: always() && (steps.report.outputs.failure_count != '0' || steps.fallback_report.outputs.failure_count != '')
        env:
          GH_API_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}
        run: |
          ISSUE_TITLE="%5BSora%5D+Sync+failures"
          EXISTING=$(curl -s \
            -H "Authorization: Bearer $GH_API_TOKEN" \
            -H "Accept: application/vnd.github+json" \
            "https://api.github.com/search/issues?q=${ISSUE_TITLE}+in:title+repo:${GH_REPO}+state:open&per_page=1" \
            | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['number'] if items else '')")
          BODY=$(cat /tmp/issue_body.md)
          BODY_JSON=$(echo "$BODY" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
          if [ -z "$EXISTING" ]; then
            curl -s -o /dev/null \
              -X POST \
              -H "Authorization: Bearer $GH_API_TOKEN" \
              -H "Accept: application/vnd.github+json" \
              "https://api.github.com/repos/${GH_REPO}/issues" \
              -d "{\"title\":\"[Sora] Sync failures\",\"body\":${BODY_JSON},\"labels\":[\"sync-failure\"]}"
          else
            curl -s -o /dev/null \
              -X PATCH \
              -H "Authorization: Bearer $GH_API_TOKEN" \
              -H "Accept: application/vnd.github+json" \
              "https://api.github.com/repos/${GH_REPO}/issues/${EXISTING}" \
              -d "{\"body\":${BODY_JSON}}"
          fi
```

- [ ] **Step 4: Replace "Close failure issue on clean sync" step**

Replace the entire step (lines with `gh issue list`, `gh issue close`) with:

```yaml
      - name: Close failure issue on clean sync
        if: always() && steps.report.outputs.failure_count == '0' && steps.fallback_report.outputs.failure_count == ''
        env:
          GH_API_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}
        run: |
          ISSUE_TITLE="%5BSora%5D+Sync+failures"
          EXISTING=$(curl -s \
            -H "Authorization: Bearer $GH_API_TOKEN" \
            -H "Accept: application/vnd.github+json" \
            "https://api.github.com/search/issues?q=${ISSUE_TITLE}+in:title+repo:${GH_REPO}+state:open&per_page=1" \
            | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['number'] if items else '')")
          if [ -n "$EXISTING" ]; then
            curl -s -o /dev/null \
              -X PATCH \
              -H "Authorization: Bearer $GH_API_TOKEN" \
              -H "Accept: application/vnd.github+json" \
              "https://api.github.com/repos/${GH_REPO}/issues/${EXISTING}" \
              -d '{"state":"closed"}'
            curl -s -o /dev/null \
              -X POST \
              -H "Authorization: Bearer $GH_API_TOKEN" \
              -H "Accept: application/vnd.github+json" \
              "https://api.github.com/repos/${GH_REPO}/issues/${EXISTING}/comments" \
              -d '{"body":"All sources synced successfully. Closing."}'
          fi
```

- [ ] **Step 5: Verify workflow file is readable**

```bash
node -e "require('fs').readFileSync('.github/workflows/sync-sources.yml','utf8'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 6: Verify no `gh` commands remain**

```bash
grep -n "\bgh\b" .github/workflows/sync-sources.yml
```

Expected: no output (zero matches).

- [ ] **Step 7: Run full test suite**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **109 tests passing**.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/sync-sources.yml
git commit -m "fix(ci): replace gh CLI with curl + GitHub REST API in sync-sources.yml"
```

---

### Task 4: Update personal site config + sync workflow

This task updates the personal site clone (`/Users/sandeep.yadav/tmp/personal-site`) to use `maxPages: 3` and pass `GITHUB_READ_TOKEN` to the sync step.

**Files (personal-site only):**
- Modify: `src/config.sources.mjs`
- Modify: `.github/workflows/sync-sources.yml`
- Modify: `src/components/ActivityCard.astro`

**Note:** After this task, the GITHUB_READ_TOKEN secret must be added manually to the personal site repo's GitHub Actions secrets.

- [ ] **Step 1: Update github config in personal-site**

In `/Users/sandeep.yadav/tmp/personal-site/src/config.sources.mjs`, update the github entry:

```js
  github: {
    enabled: true,
    handle: "sandeepyadav1478",
    maxCommits: 50,
    maxPages: 3,
  },
```

- [ ] **Step 2: Copy updated adapter and ActivityCard to personal-site**

```bash
cp /Users/sandeep.yadav/tmp/sora/scripts/adapters/github.mjs \
   /Users/sandeep.yadav/tmp/personal-site/scripts/adapters/github.mjs

cp /Users/sandeep.yadav/tmp/sora/src/components/ActivityCard.astro \
   /Users/sandeep.yadav/tmp/personal-site/src/components/ActivityCard.astro
```

- [ ] **Step 3: Copy updated workflow to personal-site**

```bash
cp /Users/sandeep.yadav/tmp/sora/.github/workflows/sync-sources.yml \
   /Users/sandeep.yadav/tmp/personal-site/.github/workflows/sync-sources.yml
```

- [ ] **Step 4: Run test suite in personal-site**

```bash
cd /Users/sandeep.yadav/tmp/personal-site && node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **109 tests passing**.

- [ ] **Step 5: Commit personal-site changes**

```bash
cd /Users/sandeep.yadav/tmp/personal-site
git add src/config.sources.mjs src/components/ActivityCard.astro scripts/adapters/github.mjs .github/workflows/sync-sources.yml
git commit -m "feat: github multi-page fetch (maxPages:3), private visibility, curl issue management"
```

- [ ] **Step 6: Manual secret setup (after push)**

After pushing, add `GITHUB_READ_TOKEN` to personal site secrets:
1. `https://github.com/sandeepyadav1478/sandeepyadav1478.github.io/settings/secrets/actions`
2. New secret → Name: `GITHUB_READ_TOKEN` → Value: classic PAT with `repo` scope from `https://github.com/settings/tokens`

- [ ] **Step 7: Push both repos**

```bash
# Push template
git -C /Users/sandeep.yadav/tmp/sora push origin main

# Push personal site
git -C /Users/sandeep.yadav/tmp/personal-site push origin main
```
