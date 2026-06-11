# Content Sources (Activity Feed)

The Activity Feed pulls your recent public activity at build time and renders it as a dated stream. It is **zero-secret** and **read-only** — it only ever calls public APIs.

> **This repo is public.** Never put secrets, tokens, or private details in `config.sources.mjs`, in `src/data/`, or in commits. The feed only fetches *public* data.

## Enable the GitHub feed

1. In `src/config.sources.mjs`, set:
   ```js
   github: { enabled: true, handle: "YOUR_GITHUB_USERNAME", maxCommits: 25 }
   ```
2. In `src/config.ts`, set `SECTIONS.showActivity: true`.
3. Generate the cache locally (optional — CI does this automatically once the sync workflow lands):
   ```bash
   npm run sync:sources
   ```
4. Build: `npm run build`. Your latest commits and releases appear under "Recent Activity".

## How it works

- Source: `GET /users/{handle}/events/public` — public events only, no token.
- Commits from **any branch** (including unmerged) appear, capped at `maxCommits` (latest first).
- The GitHub events API sometimes returns a minimal push payload without per-commit messages; in that case each push is shown by its head commit ("Pushed to <repo>").
- If the API is briefly unavailable, the last cached data is kept — the site never breaks.
- The events API reaches back ~90 days / 300 events; it is a *recent activity* feed, not a full history.

## Run the tests

```bash
npm run test:sync
```

## Security

- No secrets are required or used for the GitHub feed.
- The only optional secret in the whole aggregator (WakaTime, added later) lives in **GitHub Actions secrets**, never in the repo.
