# Plan 2 — Source Adapters Design

**Status:** design (awaiting user review)
**Date:** 2026-06-11
**Predecessor:** Plan 1 (content-aggregator spine + GitHub adapter, merged as PR #1, commit `90115bd`)
**Relates to:** `docs/superpowers/specs/2026-06-11-content-aggregator-design.md` (the parent design; §4 adapter contract, §5 envelope, §2.5 secrets)

---

## 1. Purpose

Plan 1 built the aggregator **spine** (orchestrator, envelope, cache, dedup, leak-guard) and **one** adapter (GitHub). Plan 2 adds the remaining **10 source adapters** so the activity feed can draw from the full breadth of a developer's public footprint: package registries, blogs, social, video, and coding-stats platforms.

Every adapter in this plan was **researched against its real, live API** before design — not against documentation. This is the load-bearing lesson from Plan 1, where GitHub's *documented* PushEvent schema showed a `commits[]` array that the *live* `/events/public` endpoint omitted, silently emptying the feed. The research (10 parallel live probes + synthesis + adversarial critique, 2026-06-11) is the factual basis for everything below.

### Headline research findings

1. **No new `kind`s and no `envelope.mjs` code change are required.** All 10 sources map onto the existing 7 kinds (`commit`, `release`, `post`, `video`, `package`, `rating`, `badge`).
2. **`envelope.mjs` does not validate payload shape** — payload is stored as a free-form `{}` ([envelope.mjs:22](../../../scripts/lib/envelope.mjs#L22)). Therefore every "payload refinement" below is a **spec/documentation convention**, not a code edit. This dramatically lowers Plan 2's risk.
3. **9 of 10 adapters are zero-secret public reads** (`needs = []`). Only **WakaTime** needs a secret — it is the codebase's first secret-bearing adapter.
4. **Two recurring correctness traps** must be centralized: (a) **unix-seconds dates** (Codeforces, StackOverflow) where the missing `*1000` yields a silent *1970* date that still passes `Date.parse()`; (b) **6 sources have no native title** and several **no url field**, while `makeEnvelope` throws on any falsy title/url ([envelope.mjs:13](../../../scripts/lib/envelope.mjs#L13)).

### Non-goals (out of scope for Plan 2)

- Plan 3 features: the sync workflow (cron/push), the auto-issue failure loop, the manual-JSON layer.
- Per-project enrichment / attaching activity to specific `works` entries.
- Download-count accuracy for PyPI (the JSON API returns `-1` — real counts need a separate service; omitted).
- Rich UI redesign — adapters feed the existing `ActivityFeed`/`ActivityCard` rendering from Plan 1.

---

## 2. Directional rule (unchanged from Plan 1)

All adapter machinery is built in **sora** (the template) FIRST, config-driven, every source **OFF by default** with example/blank handles. The clone inherits via `sync-upstream.yml`. Real handles + the WakaTime secret live **only in the clone** (handles in its `config.sources.mjs`, the secret as a GitHub Actions encrypted secret). **Features flow down; content stays in the clone.**

---

## 3. Load-bearing invariants (the 4 must-fixes from the critique)

These were surfaced by the adversarial review of the research and **verified against the live Plan 1 code**. They govern every adapter and must be stated in the plan and enforced by tests.

### 3.1 `mergeSources` REPLACES per-source items (it does not accumulate)

Verified in [cache.mjs:41](../../../scripts/lib/cache.mjs#L41): on a successful fetch, `bySource.set(r.source, r.items)` — a sync **replaces** all of that source's items with the current fetch. There is **no cross-sync history accumulation.** Consequences every adapter must respect:

- Each `fetch()` returns the **complete current state** for that source.
- Per-adapter caps/slices bound a **single fetch's** volume, not a cumulative total.
- A **date-windowed or rolling dedup key produces no history** — it only churns the id. (This is the WakaTime trap, §6.10.)
- On failure, prior items are retained and status flips to `error` ([cache.mjs:48-57](../../../scripts/lib/cache.mjs#L48-L57)).

### 3.2 `source` is a 6th REQUIRED field that throws

`makeEnvelope` requires `id, source, kind, title, url, date` and throws on any falsy value ([envelope.mjs:13](../../../scripts/lib/envelope.mjs#L13)). An adapter that forgets `source:` gets the throw caught by its own try/catch and **silently returns `[]`** — total source loss with only a console warn. Every adapter's `makeEnvelope` call **must** pass `source: "<id>"` explicitly. (The per-adapter mappings below all include it.)

### 3.3 The `kind` segment of `stableId` MUST equal `envelope.kind`

`stableId(source, kind, key)` bakes kind into the id string ([envelope.mjs:29](../../../scripts/lib/envelope.mjs#L29)). If an adapter builds the id with one kind (`pypi:release:…`) but sets `envelope.kind` to another (`package`), dedup breaks silently (two different id strings for the same item). **Hard rule:** for every adapter, `id.split(":")[1] === envelope.kind`. A shared test asserts this invariant across all emitted envelopes.

### 3.4 WakaTime is the first secret — wiring, not guard code

The existing spine already covers it: [sync-sources.mjs:25-26,50](../../../scripts/sync-sources.mjs) gathers the union of every adapter's `needs`, snapshots those env values via `collectSecrets`, and runs `assertNoSecrets(serializedCache, secrets)` before writing. WakaTime just declares `needs = ["WAKATIME_API_KEY"]` and the wiring works with **no `redact.mjs` change**. Precise scope of the guard: it matches the **verbatim** key (case-sensitive substring, `MIN_SECRET_LEN=6`). The base64-encoded form on the wire is *not* matched — but WakaTime responses never echo the key, so the practical leak risk is nil; the guard is defense-in-depth, not the primary control. The primary control is: the key is read, used in one `Authorization: Basic` header, and discarded — never placed in an envelope.

---

## 4. Shared utilities (built FIRST — they unblock the adapters)

DRY across 10 adapters. Each is a small ESM file in `scripts/lib/` with its own `node:test` unit tests (matching the existing `test:sync` convention).

| File | Used by | Responsibility |
|------|---------|----------------|
| `scripts/lib/http.mjs` | all 10 | `fetchJson(url, {headers?, timeoutMs=10000})` and `fetchText(url, …)`: wrap `fetch` with the `sora-portfolio-aggregator` User-Agent, `AbortSignal.timeout`, throw on non-200. Extracted from the inline logic in [github.mjs:91-95](../../../scripts/adapters/github.mjs#L91-L95). **Kept minimal** — UA + timeout + throw + optional headers passthrough (for WakaTime's `Authorization`). No ETag/caching machinery (gold-plating at build-time volume). |
| `scripts/lib/parseFeed.mjs` | rss, youtube | **Zero-dependency** XML parser (per user decision). Detects RSS (`<item>`) vs Atom (`<entry>`); extracts title / link / date / excerpt / guid; resolves Atom `<link rel="alternate" type="text/html">` over `rel="self"`; supports namespaced nodes (`yt:videoId`, `media:group > media:thumbnail@url`, `media:community` views). Returns `{feedTitle, items: [...]}`. No XML parser is currently installed (`@astrojs/rss` is output-only). |
| `scripts/lib/text.mjs` | 8 sources | `stripHtml(s)` (tags → **space**, then collapse whitespace — never concatenate words), `decodeEntities(s)` (named + numeric), `stripCdata(s)`, `truncate(s, n)`, `synthTitle(text, fallback)` (first sentence / ~80 chars, **never empty** — guards the `makeEnvelope` throw). |
| `scripts/lib/datetime.mjs` | codeforces, stackoverflow, rss, wakatime | `toIso(epochSeconds)` = `new Date(epochSeconds * 1000).toISOString()`; `safeIso(str)` returns ISO or `null` when `Number.isNaN(Date.parse(str))`. Kills the unix-seconds×1000 silent-1970 bug class. |

**Convention (not a file):** per-adapter cap = sort by `Date.parse(date)` desc, then `slice(0, cfg.maxX)`, mirroring [github.mjs:77-82](../../../scripts/adapters/github.mjs#L77-L82). The spine's `dedupAndSort` does the final global sort.

---

## 5. Payload conventions (spec-level documentation only — no code change)

Because payload is unenforced, these are **conventions** the adapters follow and that a future UI/TS-type layer should mirror. Only two are "must"; the rest are nice-to-have and may be added when a consumer needs them.

**MUST (additive, optional fields):**
- `rating` payload gains optional coding-stats fields for WakaTime: `{ platform, rating?, rank?, solved?, totalSeconds?, humanReadableTotal?, range?, dailyAverage?, languages? }`. *Provisional* — WakaTime's shape is DOCUMENTED-NOT-PROBED (§6.10); field names are verified on the first authed run.
- `badge` payload gains optional social-proof fields for HuggingFace: `{ issuer, image?, earnedAt?, downloads?, likes?, label?, kindOf? }`.

**NICE-TO-HAVE (deferred unless a consumer needs it):** `post.author?`, `rating.delta?`/`oldRating?`. ETag/conditional-request caching is explicitly **not built** (negligible benefit at build-time volume).

---

## 6. Per-adapter specifications

Every adapter follows the §4 contract of the parent design: one ESM file exporting `id`, `needs`, `async fetch(cfg)` (wraps everything in try/catch, returns `[]` on error). Each `makeEnvelope` call passes all 6 required fields including `source`. Final kind assignment:

| Source | Kind | Secret | Contract change |
|--------|------|--------|-----------------|
| pypi | `package` | none | none |
| npm | `package` | none | none |
| rss | `post` | none | none |
| youtube | `video` | none | none |
| codeforces | `rating` | none | none |
| stackoverflow | `post` | none | none |
| bluesky | `post` | none | none |
| mastodon | `post` | none | none |
| huggingface | `badge` | none | additive badge fields |
| wakatime | `rating` | **WAKATIME_API_KEY** | additive rating fields |

### 6.1 pypi → `package`
- **Endpoint:** `https://pypi.org/pypi/{package}/json` (zero-auth, CDN-cached).
- **id / dedup key:** `pypi:package:{name}@{version}` — immutable (PyPI forbids re-uploading a version). **kind segment = `package`** (§3.3).
- **title:** `` `${info.name} ${info.version}` ``. **url:** `info.release_url` (fallback `info.package_url`). **date:** `min(upload_time_iso_8601)` over `urls[]` — already ISO-Z, no conversion.
- **payload:** `{ registry: "pypi", version: info.version }`. **Omit `downloads`** — the API returns `-1` for all (verified across 163 releases).
- **Gotchas:** `releases{}` keys are **lexicographically** ordered — never take the last key as latest; use `info.version`. Some versions map to `[]` files — guard before reading `upload_time`. Use `upload_time_iso_8601` (UTC-Z), never the naive `upload_time`. 404 for unknown package → treat non-200 as `[]`.

### 6.2 npm → `package`
- **Endpoints:** `https://registry.npmjs.org/{package}` (metadata) + optionally `https://api.npmjs.org/downloads/point/last-month/{package}` (counts; can return `{error}` — guard).
- **id / dedup key:** `npm:package:{name}@{version}`. **title:** `` `${name} ${version}` ``. **url:** `` `https://www.npmjs.com/package/${name}/v/${version}` `` (constructed — no url in response). **date:** `time[version]` (ISO).
- **payload:** `{ registry: "npm", version, downloads? }` (downloads only if the second call succeeds).
- **Gotchas:** `dist-tags.latest` for the current version. `time{}` includes `created`/`modified` pseudo-entries — skip them. Two-host pattern; the downloads host is separate and may fail independently.

### 6.3 rss → `post`
- **Endpoint:** a public RSS/Atom feed URL (config-supplied). Uses `parseFeed.mjs`.
- **id / dedup key:** `rss:post:{guid||link}` (prefer `<guid>`/Atom `<id>`; fall back to `link`).
- **title:** `<item><title>` (or `synthTitle(excerpt)` if absent). **url:** `<link>` (Atom: `rel="alternate"`). **date:** `pubDate`/`updated`/`published` via `safeIso` — **guard NaN** before `makeEnvelope`.
- **payload:** `{ feed: feedTitle, excerpt?, tags? }`.
- **Gotchas:** must handle **both** RSS and Atom. CDATA + entity decoding. Config shape: single feed URL vs `feeds[]` array — **default: accept an array `feeds[]`**, loop per feed (user reviews in spec). Hand-rolled parser is brittle for exotic feeds (accepted trade-off, zero-dep rule).

### 6.4 youtube → `video`
- **Endpoint:** `https://www.youtube.com/feeds/videos.xml?channel_id={UC…}` (RSS, **zero API key** — the Data API would need a key + quota). Uses `parseFeed.mjs`.
- **id / dedup key:** `youtube:video:{yt:videoId}`. **title:** `<title>`. **url:** `<link rel="alternate">`. **date:** `<published>` (ISO).
- **payload:** `{ channel, thumbnail?, views? }` (thumbnail from `media:group > media:thumbnail@url`; views from `media:community`).
- **Gotchas:** **config must supply the `UC…` channel_id directly** (not an `@handle` — handle→id scraping is fragile and the first `channelId` regex match can be a *recommended* channel). Document this in `SOURCES.youtube.channelId`.

### 6.5 codeforces → `rating`
- **Endpoints:** `https://codeforces.com/api/user.rating?handle={h}` (history) + optionally `user.info?handles={h}` (current rank title).
- **id / dedup key:** `codeforces:rating:{contestId}`. **title:** synthesized, e.g. `` `${contestName}: ${oldRating}→${newRating}` ``. **url:** `` `https://codeforces.com/contest/${contestId}` `` (constructed). **date:** `toIso(ratingUpdateTimeSeconds)` — **unix seconds**.
- **payload:** `{ platform: "codeforces", rating: newRating, rank }` (+ optional `delta`/`oldRating`).
- **Gotchas:** response is `{status, result}` — check `status === "OK"`. 303 entries for an active user → **cap via `cfg.maxRatings`**. Unix-seconds date.

### 6.6 stackoverflow → `post`
- **Endpoints:** `https://api.stackexchange.com/2.3/users/{id}/answers?site=stackoverflow&order=desc&sort=activity` + **batched** `https://api.stackexchange.com/2.3/questions/{ids}?site=stackoverflow&filter=…` to get **real question titles** (per user decision).
- **id / dedup key:** `stackoverflow:post:{answer_id}`. **title:** `` `Answer to: ${question.title}` `` (real title from the batched call; `synthTitle`/`#question_id` only as fallback for deleted questions). **url:** `` `https://stackoverflow.com/a/${answer_id}` `` (constructed). **date:** `toIso(creation_date)` — **unix seconds**.
- **payload:** `{ feed: "stackoverflow", excerpt? }` (+ `score`, `is_accepted` optional).
- **Gotchas:** response is **gzipped** — `fetch`/`http.mjs` handle it; raw clients need `--compressed`. Has `quota_remaining` + `backoff` (300/day no-auth — the one extra batched call is well within it). Items are wrapped in `items[]`. Unix-seconds date.

### 6.7 bluesky → `post`
- **Endpoint:** `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor={handle}` (the **public AppView** — zero auth for public posts).
- **id / dedup key:** `bluesky:post:{post.uri}` (the `at://…` URI embeds the permanent DID — stable across handle renames).
- **title:** `synthTitle(post.record.text, "Post on Bluesky")` (media-only posts have empty text). **url:** `` `https://bsky.app/profile/${handle}/post/${rkey}` `` (constructed from handle + rkey). **date:** `post.indexedAt` (ISO).
- **payload:** `{ feed: "bluesky", excerpt? }`.
- **Curation (user decision):** **drop reposts and replies** — keep originals only. Filter on the feed item's `reason` (repost) and `post.record.reply` (reply) before emitting.
- **Gotchas:** handle in the URL is human-friendly but non-permanent; because of replace-semantics (§3.1) a rename retroactively regenerates all URLs on the next sync — acceptable, not a bug. Dedup stays stable via the DID-bearing URI.

### 6.8 mastodon → `post`
- **Endpoints:** `https://{instance}/api/v1/accounts/lookup?acct={user}` (handle → id) then `https://{instance}/api/v1/accounts/{id}/statuses` (zero auth for public accounts).
- **id / dedup key:** `mastodon:post:{status.id}` (the **effective** status when unwrapping a boost — see curation). **title:** `synthTitle(stripHtml(status.content), "Post on Mastodon")`. **url:** `status.url` (**not** `status.uri`). **date:** `status.created_at` (ISO).
- **payload:** `{ feed: "mastodon", excerpt? }`.
- **Curation (user decision):** **drop boosts and replies** — keep originals. A boost has `status.reblog !== null`; a reply has `status.in_reply_to_id !== null`. Drop both.
- **Gotchas:** content is **HTML** — `stripHtml` (tags→space). 2-call flow (lookup→statuses). Config supplies `instance` + `user`.

### 6.9 huggingface → `badge`
- **Endpoints:** `https://huggingface.co/api/models?author={a}` + `https://huggingface.co/api/datasets?author={a}` (zero auth for public).
- **id / dedup key:** `huggingface:badge:{id}` (the model/dataset `id`, e.g. `google/flan-t5`). **title:** the model id. **url:** `` `https://huggingface.co/${id}` `` (constructed). **date:** `createdAt` (ISO; `lastModified` as alt).
- **payload (additive badge fields):** `{ issuer: "huggingface", downloads, likes, label: pipeline_tag || library_name, kindOf: "model" | "dataset" }`.
- **Framing (user decision):** **badge / social-proof** — not `package` (lean HF models lack a meaningful version, and badge keeps the likes/downloads social angle). Card reads e.g. `🏅 google/flan-t5 · 2.1M downloads · ❤ 540 · text2text-generation`.
- **Gotchas:** trim the large `tags[]` array. `downloads` can be `0` — UI must render `0`/absent gracefully (not "-1"). Two artifact types (models + datasets) merged.

### 6.10 wakatime → `rating` (BUILT LAST — the only secret)
- **Endpoint:** `https://wakatime.com/api/v1/users/current/stats/last_7_days` — **requires the owner's API key** (verified HTTP 401 without it and with a bogus key; the only public endpoint is the global leaderboard, unrelated to personal stats). **DOCUMENTED-NOT-PROBED.**
- **Auth:** `needs = ["WAKATIME_API_KEY"]`. Read `process.env.WAKATIME_API_KEY`; **if absent, return `[]`** (graceful no-op, never throws). Encode `base64(key + ":")` into `Authorization: Basic`. Key used transiently, never placed in an envelope.
- **id / dedup key:** `wakatime:rating:{range}` e.g. `wakatime:rating:last_7_days` — a **single self-overwriting** item. **No date in the key** (§3.1: replace-semantics means a date-windowed key yields no history, only churn — this corrects the research's first-draft error).
- **title:** synthesized, e.g. `` `${data.human_readable_total} coding this week` ``. **url:** the WakaTime profile URL (constructed/configured). **date:** `data.range.end_date` or `generatedAt` via `safeIso`.
- **payload (additive, PROVISIONAL):** `{ platform: "wakatime", totalSeconds, humanReadableTotal, range: "last_7_days", dailyAverage?, languages? }`.
- **Gotchas:** shape is **provisional until the first real authed run** — verify field names then (the Plan-1 trap). Document the exact key flow (Actions secret → step env → Basic header → discarded). Workflow wiring (`env: WAKATIME_API_KEY: ${{ secrets.WAKATIME_API_KEY }}`) is added in Plan 3's workflow but the adapter is built and unit-tested (against a documented-shape fixture) here.

---

## 7. Configuration additions (`SOURCES` in `config.sources.mjs`)

All new sources ship **OFF** with blank/example handles (template-safety §2). Per-source cap keys mirror `github.maxCommits: 25`. Proposed shape (user reviews/adjusts in spec review):

```js
export const SOURCES = {
  github: { enabled: false, handle: "", maxCommits: 25 },          // Plan 1
  pypi:   { enabled: false, packages: [], maxItems: 25 },           // list of package names
  npm:    { enabled: false, packages: [], maxItems: 25 },
  rss:    { enabled: false, feeds: [], maxItems: 25 },              // array of feed URLs
  youtube:{ enabled: false, channelId: "", maxItems: 15 },          // UC… id, NOT @handle
  codeforces:    { enabled: false, handle: "", maxRatings: 15 },
  stackoverflow: { enabled: false, userId: "", maxItems: 20 },
  bluesky:  { enabled: false, handle: "", maxItems: 20 },           // originals only
  mastodon: { enabled: false, instance: "", user: "", maxItems: 20 },
  huggingface: { enabled: false, author: "", maxItems: 20 },
  wakatime: { enabled: false, profileUrl: "" },                     // secret via WAKATIME_API_KEY env, not here
};
```

Each adapter is registered in the `ADAPTERS` map in [sync-sources.mjs](../../../scripts/sync-sources.mjs). Adding a source = one adapter file + one `SOURCES` entry + one `ADAPTERS` line. No orchestrator logic change.

---

## 8. Testing strategy

Mirrors Plan 1: **capture a real fixture, test the pure transform against it offline.** CI never calls live APIs (non-deterministic, rate-limited, would flake).

- **Per adapter:** during development, hit the real API → freeze the actual response as `scripts/adapters/__fixtures__/{source}.json` (or `.xml`) → unit-test the pure `normalize`/transform against the fixture. The fixture *is* real captured data; correctness comes from the live capture, determinism from the freeze.
- **Shared utils:** each has its own `node:test` suite (`parseFeed` against real RSS + Atom + namespaced fixtures; `text`/`datetime` against edge cases).
- **Invariant test (§3.3):** assert `id.split(":")[1] === kind` for every envelope every adapter emits.
- **Curation tests (§6.7, §6.8):** fixtures include an original post, a repost/boost, and a reply — assert reposts/replies are dropped.
- **WakaTime:** tested against a documented-shape fixture + a "no key present → returns `[]`" test. Real-shape verification happens on the first authed run.
- All run under the existing `npm run test:sync` (glob `scripts/__tests__/*.test.mjs`).

---

## 9. Build order (lowest-risk / zero-secret first)

0. **Shared utilities** (`http`, `text`, `datetime`, `parseFeed`) — unblock everyone; `parseFeed` gates the XML adapters.
1. **pypi** — simplest JSON, zero contract change, immutable dedup. Proves the full loop (http → register → SOURCES → fixture-test).
2. **npm** — adds the two-host pattern.
3. **rss** — first `parseFeed` consumer; RSS + Atom + NaN-date guard.
4. **youtube** — second `parseFeed` consumer (namespaces); UC-id config note.
5. **codeforces** — first `datetime.toIso` consumer; status-wrap check.
6. **stackoverflow** — `datetime.toIso` + gzip + batched question-title call.
7. **bluesky** — title synth + at:// dedup + repost/reply filter.
8. **mastodon** — 2-call lookup + boost/reply filter + HTML strip.
9. **huggingface** — first (additive) payload convention; models + datasets.
10. **wakatime** — LAST. Only secret; provisional shape; graceful `[]` when key absent — so a missing key never blocks the other 9.

---

## 10. Risks & open questions for the human

1. **WakaTime shape is provisional** (DOCUMENTED-NOT-PROBED — 401 without the key). Field names verified on first authed run. Until then, treat as provisional.
2. **Hand-rolled `parseFeed` is brittle** for exotic/malformed feeds. Accepted per the zero-dep rule; the template's example feeds are well-formed. A forker pointing `rss` at an arbitrary feed could hit edge cases.
3. **Config-shape defaults** (§7) — `rss.feeds[]` array, `youtube.channelId` as UC-id, per-source `maxItems` defaults — are my proposed defaults. Adjust in this spec review.
4. **PyPI downloads unavailable** (always `-1`) — omitted. If real counts ever matter, they need pypistats.org or BigQuery (separate, out of scope, possibly not zero-config).
5. **WakaTime workflow wiring** (`env:` step secret) technically belongs to Plan 3's `sync-sources.yml`; the adapter is built+tested here but only runs live once the workflow passes the secret. Flagging so the cron/workflow plan picks it up.
