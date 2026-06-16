# Plan 3: Sync Workflow Design

## Goal

Add a GitHub Actions workflow that runs the content aggregator on a daily cron, commits the updated cache, and notifies the forker when any source adapter fails.

## Architecture

Two touch-points only:

1. **`scripts/sync-sources.mjs`** — add `--report` flag: writes `sync-report.json` with per-adapter results before exiting.
2. **`.github/workflows/sync-sources.yml`** — new workflow: runs sync, commits cache if changed, reads report, manages GitHub Issue + emits `::warning::` annotations.

No new dependencies. No new services. `sync-report.json` is never committed (added to `.gitignore`).

## Flow

```
cron (daily 2am UTC) or workflow_dispatch
  → checkout + pnpm install
  → node scripts/sync-sources.mjs --report
      writes src/data/sources-cache.json   (live cache, committed if changed)
      writes sync-report.json              (temp, read by workflow, never committed)
  → if cache changed: git commit + push    (triggers existing deploy.yml automatically)
  → read sync-report.json
      any failures → open/update GitHub Issue + emit ::warning:: per failed source
      all clean    → close open failure issue (if any) + no warnings
```

## The `--report` Flag

`sync-sources.mjs` already builds a `results` array of `{source, ok, items, error?}` before calling `mergeSources`. With `--report`:

- Write `sync-report.json` to the repo root (sibling of `package.json`) after the cache write (or dry-run skip).
- Shape: `{ generatedAt: <ISO>, failures: [{source, error}], successes: [source, ...] }`
- The file is written even if the process is about to exit cleanly — the workflow always finds it.
- Added to `.gitignore` so it is never accidentally committed.

## GitHub Issue Behaviour

| Situation | Action |
|---|---|
| One or more adapters failed | Open issue (if none open) or edit body (if already open) |
| All adapters succeeded | Close the open issue (if any) with a comment |
| No sources enabled (template repo) | Sync is a no-op; report has 0 failures; issue untouched |

**Issue identity:** Fixed title `"[Sora] Sync failures"`. Workflow searches open issues by exact title using the GitHub API — no stored issue number needed.

**Issue body:** Lists each failed source and its sanitized error message, plus the run URL for the Actions log.

**Label:** `sync-failure` (created by workflow if absent).

**`::warning::` annotations:** One per failed adapter, emitted via `echo "::warning::source <name> failed: <error>"`. Visible in the Actions summary without opening the full log.

## Template Safety

- Commit step is skipped when `git diff --quiet` (idempotent — no empty commits).
- Template repo (`sandeepyadav1478/sora`) has all sources `enabled: false`, so sync writes 0 items. The cache file is unchanged; no commit is made.
- `WAKATIME_API_KEY` absence is handled inside the adapter (returns `[]`); workflow needs no special casing.
- Workflow uses `secrets.GITHUB_TOKEN` (always available, no setup needed for the commit + issue steps).

## Permissions

```yaml
permissions:
  contents: write   # git push the updated cache
  issues: write     # open / close / edit the failure issue
```

## Workflow Triggers

```yaml
on:
  schedule:
    - cron: "0 2 * * *"   # daily 2am UTC
  workflow_dispatch:        # manual run from Actions UI
```

## Files Changed

| File | Change |
|---|---|
| `scripts/sync-sources.mjs` | Add `--report` flag: write `sync-report.json` |
| `scripts/__tests__/sync-report.test.mjs` | Tests for report file shape and content |
| `.github/workflows/sync-sources.yml` | New workflow (sync + commit + issue management) |
| `.gitignore` | Add `sync-report.json` |

## Out of Scope

- Manual-JSON layer (not needed — adapters are the content)
- Slack / email notifications (GitHub Issue is sufficient)
- Per-source issue granularity (one consolidated issue is simpler)
- Retry logic on adapter failure (adapter keeps last cache; next cron run retries naturally)
