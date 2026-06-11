# Content Aggregator — Design Spec

**Date:** 2026-06-11
**Repo:** `sora` (template). Built here first with world-facing docs; the personal clone inherits it via `sync-upstream.yml` and supplies real handles + content.
**Status:** Approved design — pre-implementation.

---

## 1. Purpose

Turn the portfolio from a hand-edited board into a **build-time aggregator**. A scheduled GitHub Actions job pulls from many sources (GitHub commits/releases, PyPI, blogs, social, coding stats…), normalizes each into a cache file committed to the repo, and Astro renders it. The owner stops hand-editing for routine updates: push a commit, publish a post, ship a release → it shows up on the next sync.

Two render targets:
1. **Activity feed** — a unified, dated stream of small cards (commits, posts, releases, videos, badges).
2. **Per-project enrichment** — live release/commit/star data injected into the matching work card.

### Non-goals (explicitly out of scope)
- **Auto-scraping Credly / LeetCode** — ToS prohibits / bot-gated. Manual JSON instead.
- **LinkedIn / Gmail / Zoom / Wallet / NotebookLM auto-pull** — no free, honest, durable build-time path. Manual JSON instead.
- **The Sveltia CMS** — a separate future track, not this spec.
- **Any paid service or paid API tier** — hard constraint, zero spend.

---

## 2. Directional rule (template vs clone)

| Layer | Built in `sora` (template) | Lives only in the clone |
|---|---|---|
| Machinery (adapters, orchestrator, Actions, components) | ✅ | inherited via sync |
| Documentation | ✅ | inherited |
| Real content (handles, caches, manual JSON) | demo/example only | ✅ real data |

The template ships every source **OFF by default** with example handles. A forker turns on only what they have. This mirrors the existing `sync-upstream.yml` forker-safety gate (`if: github.repository != 'sandeepyadav1478/sora'`).

---

## 3. Architecture

```
GitHub Actions
  ├─ cron: every 6h          ┐ triggers sync workflow
  └─ workflow_dispatch       ┘
        │
        ▼
  scripts/sync-sources.mjs              ← orchestrator (Node 22, ESM)
        │  reads SOURCES config (which adapters are on + their handles)
        │  loads existing src/data/sources-cache.json (for fallback)
        │
        ├─ adapters/github.mjs        ┐
        ├─ adapters/pypi.mjs          │  each adapter:
        ├─ adapters/npm.mjs           │   fetch(cfg) → Envelope[]
        ├─ adapters/rss.mjs           │   • own try/catch + timeout + real UA
        ├─ adapters/bluesky.mjs       │   • resolves to [] on failure (never throws)
        ├─ adapters/mastodon.mjs      │
        ├─ adapters/youtube.mjs       │
        ├─ adapters/codeforces.mjs    │
        ├─ adapters/wakatime.mjs      │  (optional owner API key)
        ├─ adapters/huggingface.mjs   │
        └─ adapters/stackoverflow.mjs ┘
        │
        ▼  per-adapter: success → use fresh; failure → keep last cached entries
        │  merge · dedup · sort by date · stamp per-source status
        ▼
  src/data/sources-cache.json          ← committed; survives API outages
        │
        ▼  (also reads src/data/manual/*.json — hand-curated, same Envelope shape)
        ▼
  astro build → Activity feed + per-project enrichment → deploy to Pages
```

**Soft-fail principle:** an adapter failing does **not** fail the build. The build stays green and serves last-cached data. Only a catastrophic orchestrator crash (e.g. cannot read/write the cache file) fails the job.

---

## 4. The adapter contract

Every adapter is one small ESM file with an identical shape — this is what makes ~11 sources tractable instead of 11 bespoke integrations.

```js
// scripts/adapters/<id>.mjs
export const id = "github";
export const needs = [];               // env var names this adapter requires, e.g. ["WAKATIME_API_KEY"]
export async function fetch(cfg) {      // cfg = the source's config object from SOURCES
  // ... fetch + normalize ...
  return /* Envelope[] */;              // MUST resolve to [] on any error; MUST NOT throw
}
```

- `id` — stable source key, matches the `SOURCES` config key and the `source` field on every envelope it emits.
- `needs` — declares required env vars. The orchestrator skips an adapter (with a logged notice) if a required var is absent, so a forker without WakaTime simply gets no WakaTime — never a crash.
- `fetch(cfg)` — receives that source's config (handle + options); returns a `Promise<Envelope[]>`. Wraps everything in try/catch; returns `[]` on any error. The orchestrator owns retry/fallback policy, not the adapter.

Adding a 12th source later = drop in one file + add one `SOURCES` entry. No orchestrator changes.

---

## 5. Data shape — envelope + typed payload

A single flat shape was rejected: it would either flatten away each source's depth or bloat a common type with dozens of mostly-null fields. Instead, a **two-layer** shape — a thin constant envelope for cross-source operations, and a payload typed per `kind` for full fidelity.

```ts
// THIN ENVELOPE — the minimum to merge, sort, dedup, and render a unified feed
interface Envelope {
  id: string;          // stable dedup key, e.g. "github:commit:<sha>", "pypi:release:<pkg>@<ver>"
  source: SourceId;    // "github" | "pypi" | "rss" | ...
  kind: ItemKind;      // "commit" | "release" | "post" | "video" | "package" | "rating" | "badge"
  title: string;
  url: string;
  date: string;        // ISO 8601 — REQUIRED; the feed sorts on this
  projectSlug?: string;// optional link to a work card (enrichment)
  payload: Payload;    // ← depth lives here, discriminated by `kind`
}
```

```ts
// PAYLOAD — discriminated union keyed by `kind`. Each source emits only what it has.
type Payload =
  | { kind: "commit";  repo: string; sha: string; additions?: number; deletions?: number; message: string }
  | { kind: "release"; repo?: string; pkg?: string; version: string; downloads?: number; notes?: string }
  | { kind: "post";    feed: string; excerpt?: string; readingTime?: number; tags?: string[] }
  | { kind: "video";   channel: string; duration?: number; views?: number; thumbnail?: string }
  | { kind: "package"; registry: "pypi" | "npm"; version: string; downloads?: number }
  | { kind: "rating";  platform: string; rating?: number; rank?: string; solved?: number }
  | { kind: "badge";   issuer: string; image?: string; earnedAt?: string };
```

- The **feed** reads only the envelope (sort by `date`, render `title`/`url`/`source` chip).
- The **detail/enrichment** view reads the typed `payload` for depth.
- A shallow source (a toot) has a tiny payload; a rich one (a PyPI release) has a fat one — by design, nothing forced, nothing flattened.

### Cache file format

```jsonc
// src/data/sources-cache.json
{
  "version": 1,
  "generatedAt": "2026-06-11T06:00:00Z",
  "sources": {
    "github":  { "status": "ok",     "lastSuccess": "2026-06-11T06:00:00Z", "count": 12, "consecutiveFailures": 0 },
    "pypi":    { "status": "stale",   "lastSuccess": "2026-06-09T06:00:00Z", "count": 3,  "consecutiveFailures": 2,
                 "error": "fetch timeout after 10s" }
  },
  "items": [ /* Envelope[] — merged, deduped, sorted desc by date */ ]
}
```

Per-source status drives both staleness logic and the failure-tracking loop (§7). On a failed fetch, that source's existing `items` are retained and its status flips to `stale`/`error`; everything else updates normally.

---

## 6. Configuration (`SOURCES` in `config.ts`)

Single source of truth, consistent with the existing config-driven design.

```ts
export const SOURCES = {
  github:       { enabled: true,  handle: "" /* gh username */, includeCommits: true, includeReleases: true },
  pypi:         { enabled: false, packages: [] as string[] },
  npm:          { enabled: false, user: "" },
  rss:          { enabled: false, feeds: [] as string[] },
  bluesky:      { enabled: false, handle: "" },
  mastodon:     { enabled: false, handle: "" /* @user@instance */ },
  youtube:      { enabled: false, channelId: "" },
  codeforces:   { enabled: false, handle: "" },
  wakatime:     { enabled: false, username: "" /* needs WAKATIME_API_KEY secret */ },
  huggingface:  { enabled: false, username: "" },
  stackoverflow:{ enabled: false, userId: "" },

  // Render manual JSON files (src/data/manual/*.json) through the same components
  manual:       { enabled: true },

  // Failure-tracking loop (§7)
  issueOnFailure: { enabled: true, threshold: 2, staleAfterHours: 24 },
} as const;
```

An adapter runs only if `enabled === true` **and** its required handle/field is non-empty. Blank handle = silently skipped. The template ships everything `false`/blank except example placeholders in docs.

---

## 7. Failure tracking — auto GitHub issues

Adapter failures are tracked **out of band** via GitHub issues on the repo running the sync, using the free Actions `GITHUB_TOKEN`. Issues are opened by `github-actions[bot]`, so this never touches the human push-identity rule.

**Lifecycle (deduped, self-closing):**
- **One stable issue per adapter** — label `source-sync-failure`, title `Source sync failed: <adapter>`.
- **Open threshold:** only after `threshold` (default **2**) consecutive failures, **or** when the last-good cache for that source goes stale beyond `staleAfterHours` (default **24h**). A single transient blip stays quiet.
- **On repeat failure with an issue already open:** add a comment with the new timestamp + error. Never a duplicate issue.
- **On recovery:** auto-close the issue with a "recovered at \<time\>" comment.
- **Issue body:** adapter id, error message, `lastSuccess`, and whether stale cache is being served.

**Forker-safe:** targets `$GITHUB_REPOSITORY`, so forkers get issues in their own repo. Behind `SOURCES.issueOnFailure.enabled`. Requires `issues: write` permission in the sync workflow.

---

## 8. Rendering

- **Activity feed** — a new homepage section + (optionally) an `/activity` page. Reads `sources-cache.json` `items`, renders each as a small card with a source chip, title, relative date, and link. Honest empty state: no items → section does not render. Gated by a `SECTIONS` boolean, consistent with existing section gating.
- **Per-project enrichment** — work frontmatter gets an optional `repo: "owner/name"` field (added to the Zod schema in `content.config.ts`). At build, items with a matching `projectSlug` inject latest release / last-commit date / live star count into that work's card. No match = card renders exactly as today.
- Manual items render through the **same** card components as auto items — a Credly badge card looks native whether hand-entered or (hypothetically) fetched.

---

## 9. Workflow & build integration

**New workflow `.github/workflows/sync-sources.yml`:**
```yaml
on:
  schedule: [{ cron: "0 */6 * * *" }]   # every 6h
  workflow_dispatch:
permissions:
  contents: write        # commit the updated cache
  issues: write          # failure-tracking loop (§7)
jobs:
  sync:
    # runs in template too (template has all sources off → no-op commit avoided)
    steps:
      - checkout
      - setup pnpm + Node 22 (matches deploy.yml)
      - run: node scripts/sync-sources.mjs
        env: { GITHUB_TOKEN: ..., WAKATIME_API_KEY: ${{ secrets.WAKATIME_API_KEY }} }
      - commit src/data/sources-cache.json IF changed (skip empty commits)
      - push  # triggers deploy.yml on push-to-main
```

- Sync commits the cache → push triggers the existing `deploy.yml` → site rebuilds. No second deploy path.
- `WAKATIME_API_KEY` is the **only** secret, optional and owner-only. Absent → WakaTime adapter skipped via its `needs`.
- Local: `node scripts/sync-sources.mjs --dry-run` prints what would change without writing.

---

## 10. Error handling, secrets, testing

**Errors**
- Per-adapter try/catch; per-`fetch` timeout (~10s via `AbortSignal.timeout`).
- Bot-gated sources (YouTube, some Hashnode) retried once with a real `User-Agent` header.
- Total adapter failure → retain last cache entries, flip status to `stale`/`error`, continue. Build stays green.

**Secrets**
- Zero-secret for all adapters except WakaTime (optional `WAKATIME_API_KEY`).
- GitHub adapter uses the workflow's `GITHUB_TOKEN` (1000 req/hr) and falls back to unauthenticated (60/hr) for local runs.
- No secret is ever read at render time or shipped to the browser — all fetching is build-time only.

**Testing**
- Each adapter has a unit test against a **recorded fixture** (committed JSON response) — no live network in CI tests. Asserts: maps fixture → correct `Envelope[]`, and returns `[]` (not throw) on a malformed/empty response.
- Orchestrator tests: merge/dedup/sort correctness; fallback-to-cache on adapter failure; staleness threshold math for the issue loop.
- A lint/type pass (`astro check`) keeps the existing CI green.

---

## 11. File inventory (what gets created in `sora`)

```
scripts/
  sync-sources.mjs              # orchestrator
  lib/
    cache.mjs                   # read/write/merge sources-cache.json
    dedup.mjs                   # stable-id dedup + date sort
    issues.mjs                  # GitHub-issue failure loop (§7)
  adapters/
    github.mjs  pypi.mjs  npm.mjs  rss.mjs  bluesky.mjs  mastodon.mjs
    youtube.mjs  codeforces.mjs  wakatime.mjs  huggingface.mjs  stackoverflow.mjs
  adapters/__fixtures__/        # recorded API responses for tests
  __tests__/                    # adapter + orchestrator tests

src/
  data/sources-cache.json       # generated, committed (template ships an empty skeleton)
  data/manual/                   # hand-curated JSON (Credly, LinkedIn, LeetCode, events…)
    .gitkeep + example.json
  components/
    ActivityFeed.astro
    ActivityCard.astro          # renders an Envelope by kind
  lib/sources.ts                # typed loader: reads cache + manual, exposes to pages

.github/workflows/sync-sources.yml

config.ts                        # + SOURCES block
content.config.ts                # + optional `repo` field on works schema

docs/                            # world-facing: how to enable each source, handle formats,
                                 # the WakaTime secret, manual JSON schema, failure issues
```

---

## 12. Acceptance criteria

1. `node scripts/sync-sources.mjs` with only GitHub enabled produces a valid `sources-cache.json` with real commits/releases.
2. Disabling a source (or blanking its handle) cleanly omits it — no crash, no error.
3. A simulated adapter failure (bad handle) keeps last-cached entries, sets `status: "error"`, and the build still passes.
4. After `threshold` consecutive simulated failures, exactly one issue opens; recovery closes it; no duplicates in between.
5. A work with `repo:` set shows live star/release data; one without renders unchanged.
6. Manual JSON in `src/data/manual/` renders through the same cards as auto data.
7. `astro check && astro build` passes; `pagefind` indexes the new pages.
8. The template builds with all sources off (empty feed section simply doesn't render).
9. No secret other than optional `WAKATIME_API_KEY`; nothing fetched at render time.
```
