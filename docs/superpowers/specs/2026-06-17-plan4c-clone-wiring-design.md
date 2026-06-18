# Plan 4c: Clone Wiring Design

## Goal

Wire the personal site (`sandeepyadav1478.github.io`) with the full content aggregator infra from the sora template, enable real source handles, fix profile links, and harden workflows — without touching any personal content in `config.ts`.

## Repository

- **Template (source of infra):** `/Users/sandeep.yadav/tmp/sora`
- **Clone (target):** `/Users/sandeep.yadav/tmp/personal-site`
- **Deployed at:** `https://sandeepyadav1478.github.io`

## Approach: Surgical File Copy

The repos share no git history, so a full merge produces 70+ add/add conflicts. Instead, copy only the new infra files that don't exist in the clone, and patch the files that do exist. Personal content in `config.ts` is never overwritten.

## Changes

### Group 1: New infra files (copied verbatim from template — zero conflicts)

These files do not exist in the clone at all:

- `scripts/` — entire directory (all adapters, lib, tests, fixtures, sync-sources.mjs, process-report.mjs)
- `src/config.sources.mjs` — source config (copied then patched with real handles, see Group 2)
- `src/data/sources-cache.json` — empty skeleton `{"version":1,"generatedAt":"...","sources":{},"items":[]}`
- `src/data/` — `sources/` subdirectory (already exists, no conflict)
- `.github/workflows/sync-sources.yml` — daily sync cron workflow
- `src/assets/icons/IconDownload.svg`, `IconHeart.svg`, `IconClock.svg`, `IconCode.svg`, `IconTrophy.svg`
- `sync-report.json` added to `.gitignore`

### Group 2: Source config — real handles

After copying `src/config.sources.mjs` from template, patch it with real handles:

```js
export const SOURCES = {
  github:       { enabled: true,  handle: "sandeepyadav1478", maxCommits: 25 },
  codeforces:   { enabled: true,  handle: "sandeepyadav1478", maxRatings: 50 },
  pypi:         { enabled: true,  handle: "sqloutbox",        maxPackages: 25 },
  npm:          { enabled: false, packages: [],               maxPackages: 25 },
  rss:          { enabled: false, feeds: [],                  maxPosts: 50 },
  youtube:      { enabled: false, handle: "",                 maxVideos: 15 },
  stackoverflow:{ enabled: false, handle: "",                 maxPosts: 25 },
  bluesky:      { enabled: false, handle: "",                 maxPosts: 25 },
  mastodon:     { enabled: false, instance: "", user: "",     maxPosts: 25 },
  huggingface:  { enabled: true,  handle: "sandeepyadav1478", maxBadges: 50 },
  wakatime: {
    enabled: true,
    handle: "sandeepyadav1478",
    profileUrl: "https://wakatime.com/@sandeepyadav1478",
    range: "last_7_days",
  },
  leetcode:     { enabled: true,  handle: "sandeepyadav1478" },
};
```

`WAKATIME_API_KEY` is **not** committed — it goes in GitHub Actions encrypted secrets after the PR is merged.

### Group 3: `src/config.ts` — additive changes only

Three patches, no content removed:

**A. Fix `CONNECT.calendlyUrl` placeholder:**
```ts
calendlyUrl: "https://calendly.com/sandeepyadav1478",
```

**B. Add Topmate to `SOCIALS_CONFIG`:**
```ts
{ name: "Topmate", url: "https://topmate.io/sandeepyadav1478" },
```
(Topmate is not in the template's supported icon names — add a generic link icon fallback or add the icon. Handled in Group 6.)

**C. Add `ACTIVITY_DISPLAY` block after `SECTIONS`** (identical to template — all `false`):
```ts
export const ACTIVITY_DISPLAY = {
  commit_branch: false, commit_tooltip: false,
  // ... all 23 flags, all false
} as const;
```

### Group 4: `src/components/ActivityCard.astro`

Replace with the template version (payload badges + tooltips + icons). The clone has no customised version of this file so the copy is safe.

### Group 5: Workflow hardening (update existing files)

**`ci.yml`** — three changes:
- `node-version: [20]` → `[22]`
- `pnpm install` → `pnpm install --frozen-lockfile`
- Add step before build: `run: pnpm run test:sync`

**`deploy.yml`** — two changes:
- `version: 10` → `10.11.1`
- `pnpm install` → `pnpm install --frozen-lockfile`

**`sync-upstream.yml`** — three changes:
- Add `concurrency: group: sync-upstream, cancel-in-progress: true`
- Add `timeout-minutes: 10` to job
- Add `git diff --check` guard before `git add -A` in conflict path

### Group 6: `package.json` — add `test:sync` script

```json
"test:sync": "node --test 'scripts/__tests__/*.test.mjs'"
```

Also add Topmate icon: `src/assets/icons/IconTopmate.svg` — a simple Tabler-style external-link SVG used as fallback for unknown social names in `SOCIALS_CONFIG`.

## `sync-sources.yml` — WAKATIME_API_KEY secret

The workflow references `${{ secrets.WAKATIME_API_KEY }}`. After merging, add it via:
- GitHub → `sandeepyadav1478.github.io` repo → Settings → Secrets and variables → Actions → New secret
- Name: `WAKATIME_API_KEY`
- Value: your WakaTime API key from `https://wakatime.com/settings/account` (API key section)

This is done manually after the PR merges — never committed.

## Files Changed

| File | Action |
|---|---|
| `scripts/` | Copy from template (new) |
| `src/config.sources.mjs` | Copy from template + patch real handles (new) |
| `src/data/sources-cache.json` | Copy from template (new) |
| `.github/workflows/sync-sources.yml` | Copy from template (new) |
| `src/assets/icons/IconDownload.svg` | Copy from template (new) |
| `src/assets/icons/IconHeart.svg` | Copy from template (new) |
| `src/assets/icons/IconClock.svg` | Copy from template (new) |
| `src/assets/icons/IconCode.svg` | Copy from template (new) |
| `src/assets/icons/IconTrophy.svg` | Copy from template (new) |
| `src/components/ActivityCard.astro` | Replace with template version |
| `src/config.ts` | Patch: calendlyUrl, add Topmate social, add ACTIVITY_DISPLAY |
| `.github/workflows/ci.yml` | Patch: Node 22, frozen-lockfile, test:sync step |
| `.github/workflows/deploy.yml` | Patch: pnpm 10.11.1, frozen-lockfile |
| `.github/workflows/sync-upstream.yml` | Patch: concurrency, timeout, conflict guard |
| `package.json` | Add test:sync script |
| `.gitignore` | Add sync-report.json |

## Out of Scope

- Credly adapter (Plan 4d — needs template adapter first)
- Any changes to personal content in `config.ts` (bio, works, experience, skills)
- Enabling `npm`, `rss`, `youtube`, `stackoverflow`, `bluesky`, `mastodon`
