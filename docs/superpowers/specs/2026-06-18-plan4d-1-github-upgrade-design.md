# Plan 4d-1: GitHub Adapter Upgrade Design

## Goal

Three changes in one plan:
1. **GitHub adapter** — opt-in `GITHUB_READ_TOKEN` support for private repos + multi-page fetch (up to 300 events)
2. **Private/public card differentiation** — private repo commits show basic info only (no commit message, no SHA exposed in payload)
3. **`sync-sources.yml` migration** — replace all `gh` CLI calls with `curl` + GitHub REST API

## Architecture

**Adapter change:** `scripts/adapters/github.mjs` — `fetch_` checks for `GITHUB_READ_TOKEN` env var. If present: use authenticated `/users/{handle}/events` endpoint (includes private repos), fetch up to `cfg.maxPages` pages. If absent: fall back to unauthenticated `/events/public`, page 1 only (current behaviour — zero regression for forkers who don't set the token).

**Workflow change:** `sync-sources.yml` — remove `GH_TOKEN` job-level env var (which was `gh`-specific). Replace the 3 issue-management steps with `curl` equivalents using `${{ secrets.GITHUB_TOKEN }}` as the Bearer token directly in each step.

## GitHub Adapter

### Token and endpoint selection

```js
const token = process.env.GITHUB_READ_TOKEN;
const baseUrl = token
  ? `${API}/users/${encodeURIComponent(handle)}/events`      // authenticated: all events
  : `${API}/users/${encodeURIComponent(handle)}/events/public`; // unauthenticated: public only
```

### Multi-page fetch

```js
const maxPages = cfg.maxPages ?? 1;
const perPage = 100;
let allEvents = [];
for (let page = 1; page <= maxPages; page++) {
  const url = `${baseUrl}?per_page=${perPage}&page=${page}`;
  const headers = { "User-Agent": UA, Accept: "application/vnd.github+json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) break;
  const page_events = await res.json();
  if (!Array.isArray(page_events) || page_events.length === 0) break;
  allEvents = allEvents.concat(page_events);
}
return normalizeEvents(allEvents, cfg);
```

### Private vs public differentiation

GitHub events have an `ev.public` boolean field (`true` = public repo, `false` = private).

**Public repo PushEvent** (existing behaviour, unchanged):
```js
payload: { repo, sha: c.sha, branch, message: c.message || "", visibility: "public" }
title: c.message.split('\n')[0] || `Pushed to ${repoShort}`
url: `https://github.com/${repo}/commit/${c.sha}`
```

**Private repo PushEvent** (basic info only — no SHA in payload, no message, repo URL not commit URL):
```js
payload: { repo, branch, visibility: "private" }
title: `Pushed to ${repoShort}`
url: `https://github.com/${repo}`   // repo homepage, not a commit link
```

The `visibility` field in payload allows `ActivityCard.astro` to render a lock badge for private items (Plan 4b already has the per-kind payload display system).

### `needs` and config shape

Template `config.sources.mjs`:
```js
github: {
  enabled: false,
  handle: "",
  maxCommits: 25,
  maxPages: 1,   // new: 1=default (30 events unauthenticated), 3=max (300 events authenticated)
}
```

`needs` stays `[]` — `GITHUB_READ_TOKEN` is opt-in, not required. The adapter self-validates.

Personal site `config.sources.mjs`:
```js
github: {
  enabled: true,
  handle: "sandeepyadav1478",
  maxCommits: 50,
  maxPages: 3,
}
```

`GITHUB_READ_TOKEN` — added to personal site GitHub Actions secrets (manual step after deploy).

**Token scope required:** Classic PAT with `repo` scope, OR fine-grained PAT with `Contents: Read` + `Metadata: Read` on all repositories.

## `sync-sources.yml` — curl migration

Remove `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` from job-level `env` (it was only there for the `gh` CLI).

### Label creation (replaces `gh label create`)

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/${{ github.repository }}/labels \
  -d '{"name":"sync-failure","color":"d73a4a","description":"Automatic sync failure notification"}' \
  | grep -qE "^(201|422)$" || true
# 201 = created, 422 = already exists — both acceptable
```

### Issue search (replaces `gh issue list --search`)

```bash
ISSUE_TITLE="%5BSora%5D+Sync+failures"   # URL-encoded "[Sora] Sync failures"
EXISTING=$(curl -s \
  -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/search/issues?q=${ISSUE_TITLE}+in:title+repo:${{ github.repository }}+state:open&per_page=1" \
  | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['number'] if items else '')")
```

### Open issue (replaces `gh issue create`)

```bash
BODY=$(cat /tmp/issue_body.md)
curl -s -o /dev/null \
  -X POST \
  -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/${{ github.repository }}/issues \
  -d "{\"title\":\"[Sora] Sync failures\",\"body\":$(echo "$BODY" | python3 -c \"import sys,json; print(json.dumps(sys.stdin.read()))\"),\"labels\":[\"sync-failure\"]}"
```

### Update issue body (replaces `gh issue edit`)

```bash
BODY=$(cat /tmp/issue_body.md)
curl -s -o /dev/null \
  -X PATCH \
  -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/${{ github.repository }}/issues/${EXISTING} \
  -d "{\"body\":$(echo "$BODY" | python3 -c \"import sys,json; print(json.dumps(sys.stdin.read()))\")}"
```

### Close issue + add comment (replaces `gh issue close --comment`)

```bash
# Close
curl -s -o /dev/null \
  -X PATCH \
  -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/${{ github.repository }}/issues/${EXISTING} \
  -d '{"state":"closed"}'
# Add comment
curl -s -o /dev/null \
  -X POST \
  -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/${{ github.repository }}/issues/${EXISTING}/comments \
  -d '{"body":"All sources synced successfully. Closing."}'
```

## `GITHUB_READ_TOKEN` Secret Setup (manual, post-deploy)

After merging, add to personal site repo secrets:
1. Go to `https://github.com/sandeepyadav1478/sandeepyadav1478.github.io/settings/secrets/actions`
2. **New repository secret**: Name `GITHUB_READ_TOKEN`, Value: classic PAT with `repo` scope from `https://github.com/settings/tokens`

Also pass it in `sync-sources.yml` Run sync step:
```yaml
      - name: Run sync
        continue-on-error: true
        run: node scripts/sync-sources.mjs --report
        env:
          WAKATIME_API_KEY: ${{ secrets.WAKATIME_API_KEY }}
          GITHUB_READ_TOKEN: ${{ secrets.GITHUB_READ_TOKEN }}
```

## Files Changed

| File | Change |
|---|---|
| `scripts/adapters/github.mjs` | Multi-page fetch, token auth, private/public differentiation |
| `scripts/__tests__/github.test.mjs` | Tests for multi-page, private payload shape, visibility field |
| `src/config.sources.mjs` (template) | Add `maxPages: 1` |
| `.github/workflows/sync-sources.yml` | Remove `GH_TOKEN` env, replace 3 issue steps with `curl` |
| `src/components/ActivityCard.astro` | Add lock badge for `payload.visibility === "private"` commits |

## Out of Scope

- Credly adapter (Plan 4d-2+ series)
- Git archives (Plan 4d-2)
- Commit message fetching (separate API call per commit — not in this plan)
