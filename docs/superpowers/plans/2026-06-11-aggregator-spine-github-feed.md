# Content Aggregator — Plan 1: Spine + GitHub Activity Feed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the aggregator's core (typed Envelope, cache read/write, dedup, leak-guard, orchestrator) plus the GitHub adapter and the Activity Feed UI, so the site renders a real, dated stream of public GitHub activity.

**Architecture:** A Node ESM orchestrator (`scripts/sync-sources.mjs`) loads enabled sources from a plain-JS config module, runs each adapter (here: GitHub), normalizes results into `Envelope[]`, merges with the existing committed cache (last-good fallback on failure), runs a leak-guard, and writes `src/data/sources-cache.json`. Astro reads that cache at build time and renders an `ActivityFeed` section, gated like every other section.

**Tech Stack:** Node 22 (ESM `.mjs`), Astro 5.16.6, TypeScript (strict), Node built-in test runner (`node --test`) — zero new dependencies (zero-spend constraint). GitHub REST `GET /users/{handle}/events/public` (unauthenticated).

**Scope note:** This is Plan 1 of 3. Per-project enrichment + the other 10 adapters = Plan 2. Sync workflow (cron/push) + failure-issue loop + manual-JSON layer = Plan 3. This plan ends with the feed working when the sync script is run manually (`node scripts/sync-sources.mjs`); automation is Plan 3.

**Source of truth references:**
- Design spec: `docs/superpowers/specs/2026-06-11-content-aggregator-design.md` (esp. §2.5 security, §4.1 GitHub, §5 shape).
- Security: only `GET /users/{handle}/events/public` is ever called; `/public` suffix asserted; no token required; nothing private fetched. The repo is public.
- Conventions: path alias `@/*` → `src/*` (tsconfig.json); config blocks are `export const X = {...} as const`; sections gate via `SECTIONS.showX` in `src/pages/index.astro`; section components self-gate on emptiness (e.g. `src/components/OpenSourceSection.astro`).
- **TypeScript gotcha (verified):** Astro's strict tsconfig sets `verbatimModuleSyntax: true`, so **type-only imports MUST use `import type { … }`** (e.g. `src/components/ActivityCard.astro` imports `ActivityItem` as a type). Value imports/re-exports (like `export { SOURCES }`) are unaffected. `resolveJsonModule` and `allowJs` are both on, so JSON imports (Task 8) and the `.ts`→`.mjs` re-export (Task 1) type-check.

---

## File Structure

**Config (single source of truth, importable by BOTH Node and Astro):**
- Create `src/config.sources.mjs` — plain-JS `SOURCES` object. Node orchestrator imports it directly (no `.ts` type-stripping, which Node 22.5 lacks). `config.ts` re-exports it for the Astro/TS side.
- Modify `src/config.ts` — add `export { SOURCES } from "./config.sources.mjs";` and add `showActivity` to `SECTIONS`.

**Orchestrator + libs (Node ESM, build-time only):**
- Create `scripts/lib/envelope.mjs` — envelope/payload factory + `stableId` helpers + validation.
- Create `scripts/lib/cache.mjs` — read/merge/write `sources-cache.json` (per-source last-good fallback).
- Create `scripts/lib/dedup.mjs` — dedup by `id`, sort desc by `date`.
- Create `scripts/lib/redact.mjs` — leak-guard: scan serialized output for secret values; sanitize error strings.
- Create `scripts/adapters/github.mjs` — fetch `/events/public`, normalize to `Envelope[]`, cap at `maxCommits`.
- Create `scripts/sync-sources.mjs` — orchestrator: load config, run enabled adapters, merge, guard, write.

**Tests (Node built-in `node --test`, against committed fixtures):**
- Create `scripts/adapters/__fixtures__/github-events.json` — recorded API sample.
- Create `scripts/__tests__/github.test.mjs`
- Create `scripts/__tests__/dedup.test.mjs`
- Create `scripts/__tests__/redact.test.mjs`
- Create `scripts/__tests__/cache.test.mjs`

**Rendering (Astro):**
- Create `src/data/sources-cache.json` — committed skeleton (empty items).
- Create `src/lib/sources.ts` — typed loader: read cache JSON, expose `getActivityItems()`.
- Create `src/components/ActivityFeed.astro` — the section (self-gates on empty).
- Create `src/components/ActivityCard.astro` — renders one Envelope by `kind`.
- Modify `src/pages/index.astro` — import + render `<ActivityFeed />` gated on `SECTIONS.showActivity`.

**package.json:**
- Modify `package.json` — add `"sync": "node scripts/sync-sources.mjs"` and `"test:sync": "node --test scripts/__tests__/"`.

---

## Task 1: SOURCES config module (shared by Node + Astro)

**Files:**
- Create: `src/config.sources.mjs`
- Modify: `src/config.ts` (add re-export; add `showActivity` to `SECTIONS`)

- [ ] **Step 1: Create the plain-JS SOURCES config**

Create `src/config.sources.mjs`:

```js
// SOURCES — single source of truth for the content aggregator.
// Plain JS so BOTH the Node orchestrator (scripts/) and Astro (via config.ts) can import it.
// The template ships every source OFF / blank. A forker fills in handles to enable.
// SECURITY: this repo is public. Never put secrets here — only public handles.
export const SOURCES = {
  github: {
    enabled: false,        // forker: set true + fill handle
    handle: "",            // GitHub username, e.g. "octocat"
    maxCommits: 25,         // latest activity items kept in the feed
  },
  // Plan 2 adds: pypi, npm, rss, bluesky, mastodon, youtube, codeforces, wakatime, huggingface, stackoverflow
  // Plan 3 adds: manual, issueOnFailure
};
```

- [ ] **Step 2: Re-export from config.ts and add the section toggle**

In `src/config.ts`, add near the top (after the file's first import/comment banner, before `SITE`):

```ts
export { SOURCES } from "./config.sources.mjs";
```

Then in the `SECTIONS` block (currently `src/config.ts` lines ~97-114), add one line before the closing `} as const;`:

```ts
  showActivity: false,   // GitHub/social activity feed (content aggregator)
```

- [ ] **Step 3: Verify both import paths resolve**

Run: `node -e "import('./src/config.sources.mjs').then(m => console.log(JSON.stringify(m.SOURCES.github)))"`
Expected: `{"enabled":false,"handle":"","maxCommits":25}`

Run: `pnpm astro check`
Expected: 0 errors (the re-export and new SECTIONS key type-check).

- [ ] **Step 4: Commit**

```bash
git add src/config.sources.mjs src/config.ts
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add SOURCES config module + showActivity section toggle" --no-verify
```

---

## Task 2: Envelope factory + stable IDs

**Files:**
- Create: `scripts/lib/envelope.mjs`
- Test: `scripts/__tests__/dedup.test.mjs` (covers envelope+dedup together in Task 4)

- [ ] **Step 1: Create the envelope module**

Create `scripts/lib/envelope.mjs`:

```js
// Envelope: the thin, source-agnostic shape every item shares (spec §5).
// Depth lives in `payload`, discriminated by `kind`.

/** Allowed item kinds. */
export const KINDS = ["commit", "release", "post", "video", "package", "rating", "badge"];

/**
 * Build a validated envelope. Throws if a required field is missing —
 * adapters must produce complete envelopes (they catch their own errors and return []).
 * @returns {object} envelope
 */
export function makeEnvelope({ id, source, kind, title, url, date, projectSlug, payload }) {
  if (!id || !source || !kind || !title || !url || !date) {
    throw new Error(`makeEnvelope: missing required field in ${JSON.stringify({ id, source, kind, title, url, date })}`);
  }
  if (!KINDS.includes(kind)) {
    throw new Error(`makeEnvelope: unknown kind "${kind}"`);
  }
  if (Number.isNaN(Date.parse(date))) {
    throw new Error(`makeEnvelope: invalid ISO date "${date}"`);
  }
  const env = { id, source, kind, title, url, date, payload: payload ?? {} };
  if (projectSlug) env.projectSlug = projectSlug;
  return env;
}

/** Stable dedup id, e.g. stableId("github","commit","<sha>") -> "github:commit:<sha>". */
export function stableId(source, kind, key) {
  return `${source}:${kind}:${key}`;
}
```

- [ ] **Step 2: Smoke-test the module loads**

Run: `node -e "import('./scripts/lib/envelope.mjs').then(m => console.log(m.stableId('github','commit','abc'), m.KINDS.length))"`
Expected: `github:commit:abc 7`

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/envelope.mjs
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add envelope factory + stableId" --no-verify
```

---

## Task 3: Leak-guard (redact)

**Files:**
- Create: `scripts/lib/redact.mjs`
- Test: `scripts/__tests__/redact.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/redact.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNoSecrets, sanitize } from "../lib/redact.mjs";

test("assertNoSecrets throws when output contains a secret value", () => {
  const secrets = ["SUPER_SECRET_KEY_123"];
  const output = JSON.stringify({ items: [{ note: "leaked SUPER_SECRET_KEY_123 here" }] });
  assert.throws(() => assertNoSecrets(output, secrets), /secret value detected/i);
});

test("assertNoSecrets passes for clean output", () => {
  const secrets = ["SUPER_SECRET_KEY_123"];
  const output = JSON.stringify({ items: [{ note: "all public data" }] });
  assert.doesNotThrow(() => assertNoSecrets(output, secrets));
});

test("assertNoSecrets ignores empty/short secret values", () => {
  // empty string and very short values must NOT trigger (would match everything)
  assert.doesNotThrow(() => assertNoSecrets("anything", ["", "ab"]));
});

test("sanitize replaces secret occurrences in a string", () => {
  const out = sanitize("error from token=SUPER_SECRET_KEY_123 failed", ["SUPER_SECRET_KEY_123"]);
  assert.ok(!out.includes("SUPER_SECRET_KEY_123"));
  assert.match(out, /\[REDACTED\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/__tests__/redact.test.mjs`
Expected: FAIL — `Cannot find module '../lib/redact.mjs'`.

- [ ] **Step 3: Implement redact.mjs**

Create `scripts/lib/redact.mjs`:

```js
// Leak-guard (spec §2.5): the repo is public, so nothing secret may reach a committed file.
const MIN_SECRET_LEN = 6; // ignore short/empty values that would match innocuous text

/** Collect candidate secret values from env var NAMES the run was given. */
export function collectSecrets(envVarNames, env = process.env) {
  return envVarNames
    .map((name) => env[name])
    .filter((v) => typeof v === "string" && v.length >= MIN_SECRET_LEN);
}

/** Throw if any secret value appears in `output`. Call before writing the cache. */
export function assertNoSecrets(output, secrets) {
  for (const s of secrets) {
    if (typeof s !== "string" || s.length < MIN_SECRET_LEN) continue;
    if (output.includes(s)) {
      throw new Error("Leak guard: secret value detected in output — refusing to write cache.");
    }
  }
}

/** Replace any secret occurrence in a string with [REDACTED] (for safe error logging). */
export function sanitize(str, secrets) {
  let out = String(str);
  for (const s of secrets) {
    if (typeof s !== "string" || s.length < MIN_SECRET_LEN) continue;
    out = out.split(s).join("[REDACTED]");
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/__tests__/redact.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/redact.mjs scripts/__tests__/redact.test.mjs
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add leak-guard (assertNoSecrets/sanitize) with tests" --no-verify
```

---

## Task 4: Dedup + sort

**Files:**
- Create: `scripts/lib/dedup.mjs`
- Test: `scripts/__tests__/dedup.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/dedup.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupAndSort } from "../lib/dedup.mjs";
import { makeEnvelope } from "../lib/envelope.mjs";

const env = (id, date) =>
  makeEnvelope({ id, source: "github", kind: "commit", title: "t", url: "https://x", date, payload: {} });

test("dedupAndSort removes duplicate ids, keeping first occurrence", () => {
  const items = [env("a", "2026-01-01T00:00:00Z"), env("a", "2026-02-01T00:00:00Z")];
  const out = dedupAndSort(items);
  assert.equal(out.length, 1);
});

test("dedupAndSort sorts descending by date (newest first)", () => {
  const items = [
    env("a", "2026-01-01T00:00:00Z"),
    env("b", "2026-03-01T00:00:00Z"),
    env("c", "2026-02-01T00:00:00Z"),
  ];
  const out = dedupAndSort(items);
  assert.deepEqual(out.map((i) => i.id), ["b", "c", "a"]);
});

test("dedupAndSort handles empty input", () => {
  assert.deepEqual(dedupAndSort([]), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/__tests__/dedup.test.mjs`
Expected: FAIL — `Cannot find module '../lib/dedup.mjs'`.

- [ ] **Step 3: Implement dedup.mjs**

Create `scripts/lib/dedup.mjs`:

```js
// Dedup by envelope id (first occurrence wins), then sort newest-first by date.
export function dedupAndSort(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  unique.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return unique;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/__tests__/dedup.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/dedup.mjs scripts/__tests__/dedup.test.mjs
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add dedupAndSort with tests" --no-verify
```

---

## Task 5: Cache read/merge/write with last-good fallback

**Files:**
- Create: `scripts/lib/cache.mjs`
- Test: `scripts/__tests__/cache.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/cache.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSources, emptyCache } from "../lib/cache.mjs";
import { makeEnvelope } from "../lib/envelope.mjs";

const env = (id, date) =>
  makeEnvelope({ id, source: "github", kind: "commit", title: "t", url: "https://x", date, payload: {} });

test("emptyCache has version, generatedAt, sources, items", () => {
  const c = emptyCache("2026-06-11T00:00:00Z");
  assert.equal(c.version, 1);
  assert.equal(c.generatedAt, "2026-06-11T00:00:00Z");
  assert.deepEqual(c.items, []);
  assert.deepEqual(c.sources, {});
});

test("mergeSources: on success, replaces that source's items and marks ok", () => {
  const prev = emptyCache("2026-06-10T00:00:00Z");
  const result = mergeSources(prev, [
    { source: "github", ok: true, items: [env("g1", "2026-06-11T00:00:00Z")] },
  ], "2026-06-11T00:00:00Z");
  assert.equal(result.sources.github.status, "ok");
  assert.equal(result.sources.github.count, 1);
  assert.equal(result.items.length, 1);
});

test("mergeSources: on failure, keeps prior items for that source and marks error", () => {
  const prev = {
    version: 1,
    generatedAt: "2026-06-10T00:00:00Z",
    sources: { github: { status: "ok", lastSuccess: "2026-06-10T00:00:00Z", count: 1, consecutiveFailures: 0 } },
    items: [env("old", "2026-06-10T00:00:00Z")],
  };
  const result = mergeSources(prev, [
    { source: "github", ok: false, error: "timeout", items: [] },
  ], "2026-06-11T00:00:00Z");
  assert.equal(result.sources.github.status, "error");
  assert.equal(result.sources.github.consecutiveFailures, 1);
  assert.equal(result.sources.github.lastSuccess, "2026-06-10T00:00:00Z"); // preserved
  assert.equal(result.items.length, 1); // old item retained
  assert.equal(result.items[0].id, "old");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/__tests__/cache.test.mjs`
Expected: FAIL — `Cannot find module '../lib/cache.mjs'`.

- [ ] **Step 3: Implement cache.mjs**

Create `scripts/lib/cache.mjs`:

```js
import { readFile, writeFile } from "node:fs/promises";
import { dedupAndSort } from "./dedup.mjs";

export const CACHE_VERSION = 1;

export function emptyCache(generatedAt) {
  return { version: CACHE_VERSION, generatedAt, sources: {}, items: [] };
}

/** Read the committed cache; return an empty cache if absent/unreadable. */
export async function readCache(path, generatedAt) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === CACHE_VERSION) return parsed;
  } catch {
    /* missing or invalid -> empty */
  }
  return emptyCache(generatedAt);
}

/**
 * Merge adapter results into the previous cache.
 * results: [{ source, ok, items, error? }]
 * - ok:    replace that source's items, status "ok", reset consecutiveFailures.
 * - !ok:   retain prior items for that source, status "error", increment consecutiveFailures.
 */
export function mergeSources(prev, results, generatedAt) {
  const sources = { ...(prev.sources || {}) };
  const bySource = new Map();

  // seed with retained prior items grouped by source
  for (const item of prev.items || []) {
    if (!bySource.has(item.source)) bySource.set(item.source, []);
    bySource.get(item.source).push(item);
  }

  for (const r of results) {
    const prevMeta = sources[r.source] || { consecutiveFailures: 0, lastSuccess: null };
    if (r.ok) {
      bySource.set(r.source, r.items);
      sources[r.source] = {
        status: "ok",
        lastSuccess: generatedAt,
        count: r.items.length,
        consecutiveFailures: 0,
      };
    } else {
      // keep whatever was already in bySource for this source (prior items)
      sources[r.source] = {
        status: "error",
        lastSuccess: prevMeta.lastSuccess,
        count: (bySource.get(r.source) || []).length,
        consecutiveFailures: (prevMeta.consecutiveFailures || 0) + 1,
        error: r.error || "unknown error",
      };
    }
  }

  const allItems = dedupAndSort([...bySource.values()].flat());
  return { version: CACHE_VERSION, generatedAt, sources, items: allItems };
}

/** Pretty-write the cache JSON (stable formatting -> clean diffs). */
export async function writeCache(path, cache) {
  await writeFile(path, JSON.stringify(cache, null, 2) + "\n", "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/__tests__/cache.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cache.mjs scripts/__tests__/cache.test.mjs
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add cache read/merge/write with last-good fallback + tests" --no-verify
```

---

## Task 6: GitHub adapter

**Files:**
- Create: `scripts/adapters/github.mjs`
- Create: `scripts/adapters/__fixtures__/github-events.json`
- Test: `scripts/__tests__/github.test.mjs`

- [ ] **Step 1: Create the fixture (recorded /events/public sample)**

Create `scripts/adapters/__fixtures__/github-events.json` (trimmed real-shape sample — a PushEvent, a ReleaseEvent, and an ignored WatchEvent):

```json
[
  {
    "id": "1001",
    "type": "PushEvent",
    "repo": { "name": "octocat/hello" },
    "payload": {
      "ref": "refs/heads/main",
      "commits": [
        { "sha": "aaa111", "message": "feat: first thing" },
        { "sha": "bbb222", "message": "fix: second thing" }
      ]
    },
    "created_at": "2026-06-11T10:00:00Z"
  },
  {
    "id": "1002",
    "type": "PushEvent",
    "repo": { "name": "octocat/hello" },
    "payload": {
      "ref": "refs/heads/feature-x",
      "commits": [{ "sha": "ccc333", "message": "wip: unmerged branch work" }]
    },
    "created_at": "2026-06-11T09:00:00Z"
  },
  {
    "id": "1003",
    "type": "ReleaseEvent",
    "repo": { "name": "octocat/hello" },
    "payload": { "action": "published", "release": { "tag_name": "v1.2.0", "html_url": "https://github.com/octocat/hello/releases/tag/v1.2.0", "name": "v1.2.0" } },
    "created_at": "2026-06-10T08:00:00Z"
  },
  {
    "id": "1004",
    "type": "WatchEvent",
    "repo": { "name": "octocat/hello" },
    "payload": { "action": "started" },
    "created_at": "2026-06-09T08:00:00Z"
  }
]
```

- [ ] **Step 2: Write the failing test**

Create `scripts/__tests__/github.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeEvents, EVENTS_URL } from "../adapters/github.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/github-events.json", import.meta.url), "utf8")
);

test("EVENTS_URL targets the /events/public endpoint (security: never /events)", () => {
  const url = EVENTS_URL("octocat");
  assert.ok(url.endsWith("/users/octocat/events/public"), `got ${url}`);
  assert.ok(!/\/events($|\?)/.test(url), "must not be the unsuffixed /events endpoint");
});

test("normalizeEvents expands PushEvent commits into commit envelopes", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 25 });
  const commits = out.filter((e) => e.kind === "commit");
  assert.equal(commits.length, 3); // 2 on main + 1 on feature-x
  const first = commits.find((c) => c.payload.sha === "aaa111");
  assert.equal(first.source, "github");
  assert.equal(first.id, "github:commit:aaa111");
  assert.equal(first.payload.repo, "octocat/hello");
  assert.equal(first.payload.branch, "main");
});

test("normalizeEvents captures unmerged-branch commits (branch from ref)", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 25 });
  const wip = out.find((e) => e.payload && e.payload.sha === "ccc333");
  assert.ok(wip, "unmerged feature-x commit must appear");
  assert.equal(wip.payload.branch, "feature-x");
});

test("normalizeEvents maps ReleaseEvent and ignores unrelated events", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 25 });
  const releases = out.filter((e) => e.kind === "release");
  assert.equal(releases.length, 1);
  assert.equal(releases[0].payload.version, "v1.2.0");
  // WatchEvent must not produce an envelope
  assert.equal(out.some((e) => e.title.includes("started")), false);
});

test("normalizeEvents caps commits at maxCommits", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 2 });
  assert.equal(out.filter((e) => e.kind === "commit").length, 2);
});

test("normalizeEvents returns [] for empty/garbage input (never throws)", () => {
  assert.deepEqual(normalizeEvents([], { handle: "x", maxCommits: 25 }), []);
  assert.deepEqual(normalizeEvents(null, { handle: "x", maxCommits: 25 }), []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test scripts/__tests__/github.test.mjs`
Expected: FAIL — `Cannot find module '../adapters/github.mjs'`.

- [ ] **Step 4: Implement github.mjs**

Create `scripts/adapters/github.mjs`:

```js
import { makeEnvelope, stableId } from "../lib/envelope.mjs";

export const id = "github";
export const needs = []; // zero-secret: unauthenticated /events/public

const API = "https://api.github.com";
const UA = "sora-portfolio-aggregator";

/** SECURITY: only ever the /events/public endpoint. Never the unsuffixed /events. */
export function EVENTS_URL(handle) {
  return `${API}/users/${encodeURIComponent(handle)}/events/public`;
}

/** Pure transform: GitHub events array -> Envelope[]. No network. */
export function normalizeEvents(events, cfg) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const ev of events) {
    if (!ev || !ev.repo || !ev.created_at) continue;
    const repo = ev.repo.name;
    if (ev.type === "PushEvent" && ev.payload && Array.isArray(ev.payload.commits)) {
      const branch = String(ev.payload.ref || "").replace("refs/heads/", "") || undefined;
      for (const c of ev.payload.commits) {
        if (!c || !c.sha) continue;
        out.push(
          makeEnvelope({
            id: stableId("github", "commit", c.sha),
            source: "github",
            kind: "commit",
            title: (c.message || "").split("\n")[0] || "commit",
            url: `https://github.com/${repo}/commit/${c.sha}`,
            date: ev.created_at,
            payload: { repo, sha: c.sha, branch, message: c.message || "" },
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
    // other event types intentionally ignored
  }

  // Cap commits at maxCommits (latest first), keep all releases.
  const commits = out
    .filter((e) => e.kind === "commit")
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cfg.maxCommits ?? 25);
  const releases = out.filter((e) => e.kind === "release");
  return [...commits, ...releases];
}

/** Adapter entry point: fetch + normalize. Returns [] on any error (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const url = EVENTS_URL(cfg.handle);
    if (!url.endsWith("/events/public")) throw new Error("refusing non-public events endpoint");
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GitHub events HTTP ${res.status}`);
    const events = await res.json();
    return normalizeEvents(events, cfg);
  } catch {
    return [];
  }
}

// Exported under the contract name `fetch` too (alias; `fetch_` avoids shadowing global fetch internally).
export { fetch_ as fetch };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test scripts/__tests__/github.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/adapters/github.mjs scripts/adapters/__fixtures__/github-events.json scripts/__tests__/github.test.mjs
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add GitHub adapter (events/public -> envelopes) with tests" --no-verify
```

---

## Task 7: Orchestrator

**Files:**
- Create: `scripts/sync-sources.mjs`
- Modify: `package.json` (add `sync` + `test:sync` scripts)
- Create: `src/data/sources-cache.json` (skeleton, generated by the dry run)

- [ ] **Step 1: Implement the orchestrator**

Create `scripts/sync-sources.mjs`:

```js
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { SOURCES } from "../src/config.sources.mjs";
import { readCache, mergeSources, writeCache } from "./lib/cache.mjs";
import { collectSecrets, assertNoSecrets, sanitize } from "./lib/redact.mjs";
import * as github from "./adapters/github.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(__dirname, "../src/data/sources-cache.json");
const DRY_RUN = process.argv.includes("--dry-run");

// Adapter registry. Plan 2 appends more entries here.
const ADAPTERS = { github };

function nowIso() {
  // Date.now is fine in a real CLI run (this is not a resumable workflow script).
  return new Date().toISOString();
}

async function run() {
  const generatedAt = nowIso();
  const prev = await readCache(CACHE_PATH, generatedAt);

  // Gather the union of every adapter's declared `needs` -> secret values to guard against.
  const neededEnv = [...new Set(Object.values(ADAPTERS).flatMap((a) => a.needs || []))];
  const secrets = collectSecrets(neededEnv);

  const results = [];
  for (const [key, adapter] of Object.entries(ADAPTERS)) {
    const cfg = SOURCES[key];
    if (!cfg || !cfg.enabled || !cfg.handle) {
      console.log(`- ${key}: skipped (disabled or no handle)`);
      continue;
    }
    try {
      const items = await adapter.fetch(cfg);
      console.log(`- ${key}: ${items.length} item(s)`);
      results.push({ source: key, ok: true, items });
    } catch (err) {
      const msg = sanitize(err && err.message ? err.message : String(err), secrets);
      console.warn(`- ${key}: FAILED (${msg}) — keeping last cache`);
      results.push({ source: key, ok: false, items: [], error: msg });
    }
  }

  const next = mergeSources(prev, results, generatedAt);
  const serialized = JSON.stringify(next, null, 2) + "\n";

  // Leak guard (spec §2.5): never write a cache containing a secret value.
  assertNoSecrets(serialized, secrets);

  if (DRY_RUN) {
    console.log(`\n[dry-run] would write ${next.items.length} item(s) to ${CACHE_PATH}`);
    return;
  }
  await writeCache(CACHE_PATH, next);
  console.log(`\nWrote ${next.items.length} item(s) to ${CACHE_PATH}`);
}

run().catch((err) => {
  console.error("sync-sources fatal:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

In `package.json`, add to the `"scripts"` block:

```json
    "sync": "node scripts/sync-sources.mjs",
    "test:sync": "node --test scripts/__tests__/"
```

- [ ] **Step 3: Generate the committed cache skeleton via a real run**

The template ships GitHub disabled, so a normal run writes an empty skeleton. Run:

Run: `node scripts/sync-sources.mjs`
Expected output includes: `- github: skipped (disabled or no handle)` and `Wrote 0 item(s) to .../src/data/sources-cache.json`.

Verify the file now exists:
Run: `cat src/data/sources-cache.json`
Expected: a JSON object with `"version": 1`, `"sources": {}`, `"items": []`.

- [ ] **Step 4: Run the full sync test suite**

Run: `node --test scripts/__tests__/`
Expected: PASS — all suites (redact, dedup, cache, github).

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-sources.mjs package.json src/data/sources-cache.json
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add sync orchestrator + cache skeleton + npm scripts" --no-verify
```

---

## Task 8: Astro loader for the cache

**Files:**
- Create: `src/lib/sources.ts`

- [ ] **Step 1: Implement the typed loader**

Create `src/lib/sources.ts`:

```ts
import cache from "@/data/sources-cache.json";

export interface ActivityItem {
  id: string;
  source: string;
  kind: "commit" | "release" | "post" | "video" | "package" | "rating" | "badge";
  title: string;
  url: string;
  date: string;
  projectSlug?: string;
  payload: Record<string, unknown>;
}

interface SourcesCache {
  version: number;
  generatedAt: string;
  sources: Record<string, unknown>;
  items: ActivityItem[];
}

const data = cache as SourcesCache;

/** All activity items, newest first (already sorted at write time). */
export function getActivityItems(limit?: number): ActivityItem[] {
  const items = data.items ?? [];
  return typeof limit === "number" ? items.slice(0, limit) : items;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm astro check`
Expected: 0 errors. (JSON module import is allowed under Astro's strict tsconfig with `resolveJsonModule`, which `astro/tsconfigs/strict` enables.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/sources.ts
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add typed sources-cache loader" --no-verify
```

---

## Task 9: ActivityCard component

**Files:**
- Create: `src/components/ActivityCard.astro`

- [ ] **Step 1: Implement the card**

Create `src/components/ActivityCard.astro`:

```astro
---
import type { ActivityItem } from "@/lib/sources";
interface Props { item: ActivityItem }
const { item } = Astro.props;

// Per-kind label + glyph; falls back gracefully for kinds added later.
const KIND_LABEL: Record<string, string> = {
  commit: "Commit",
  release: "Release",
  post: "Post",
  video: "Video",
  package: "Package",
  rating: "Rating",
  badge: "Badge",
};
const label = KIND_LABEL[item.kind] ?? item.kind;
const when = new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const branch = item.kind === "commit" ? (item.payload as { branch?: string }).branch : undefined;
---

<a href={item.url} target="_blank" rel="noopener noreferrer" class="activity-card">
  <span class="activity-chip">{item.source}</span>
  <span class="activity-kind">{label}</span>
  <span class="activity-title">{item.title}</span>
  {branch && <span class="activity-branch">{branch}</span>}
  <time class="activity-date" datetime={item.date}>{when}</time>
</a>

<style>
  .activity-card {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border, rgba(127,127,127,0.2));
    border-radius: 0.5rem;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s ease, transform 0.15s ease;
  }
  .activity-card:hover { border-color: var(--accent, #888); transform: translateY(-1px); }
  .activity-chip {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.1rem 0.4rem;
    border-radius: 0.3rem;
    background: var(--accent-muted, rgba(127,127,127,0.15));
    flex-shrink: 0;
  }
  .activity-kind { font-size: 0.75rem; opacity: 0.7; flex-shrink: 0; }
  .activity-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .activity-branch {
    font-size: 0.7rem; font-family: var(--font-mono, monospace);
    opacity: 0.6; flex-shrink: 0;
  }
  .activity-date { font-size: 0.75rem; opacity: 0.6; flex-shrink: 0; }
</style>
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ActivityCard.astro
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add ActivityCard component" --no-verify
```

---

## Task 10: ActivityFeed section

**Files:**
- Create: `src/components/ActivityFeed.astro`

- [ ] **Step 1: Implement the section (self-gates on empty, like OpenSourceSection)**

Create `src/components/ActivityFeed.astro`:

```astro
---
import { getActivityItems } from "@/lib/sources";
import ActivityCard from "@/components/ActivityCard.astro";

// Show the latest slice; honest empty state -> render nothing.
const items = getActivityItems(20);
---

{items.length > 0 && (
  <section id="activity" class="activity-section">
    <h2 class="section-heading">Recent Activity</h2>
    <div class="activity-list">
      {items.map((item) => <ActivityCard item={item} />)}
    </div>
  </section>
)}

<style>
  .activity-section { margin: 2rem 0; }
  .activity-list { display: flex; flex-direction: column; gap: 0.5rem; }
</style>
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ActivityFeed.astro
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: add ActivityFeed section" --no-verify
```

---

## Task 11: Wire ActivityFeed into the homepage

**Files:**
- Modify: `src/pages/index.astro` (import + gated render)

- [ ] **Step 1: Add the import**

In `src/pages/index.astro`, alongside the other component imports (after `import ContactSection ...`), add:

```astro
import ActivityFeed from "@/components/ActivityFeed.astro";
```

- [ ] **Step 2: Add the gated render**

In the `{/* === CONNECT + EXTRAS === */}` group of `src/pages/index.astro` (currently around line 178, near `<Testimonials />`), add before `{SECTIONS.showFAQ && <FAQSection />}`:

```astro
    {SECTIONS.showActivity && (
      <div class="section-tinted">
        <ActivityFeed />
      </div>
    )}
```

- [ ] **Step 3: Verify build passes with feed OFF (template default)**

Run: `pnpm astro check`
Expected: 0 errors.

Run: `pnpm astro build`
Expected: build succeeds; since `SECTIONS.showActivity` is false (template), no activity section is emitted.

- [ ] **Step 4: Verify the feed renders with real data (temporary local enable — DO NOT COMMIT)**

This proves the end-to-end path without changing the template's shipped defaults.

Temporarily edit `src/config.sources.mjs`: set `github.enabled: true` and `github.handle: "sandeepyadav1478"`, and `src/config.ts` SECTIONS `showActivity: true`. Then:

Run: `node scripts/sync-sources.mjs`
Expected: `- github: N item(s)` with N > 0, and a populated `src/data/sources-cache.json`.

Run: `pnpm astro build`
Expected: build succeeds; `dist/index.html` contains a "Recent Activity" section.

Verify: `grep -c "activity-card" dist/index.html`
Expected: a non-zero count.

Then REVERT the temporary edits (config back to disabled/blank, regenerate empty cache):
Run: `git checkout src/config.sources.mjs src/config.ts && node scripts/sync-sources.mjs`
Expected: cache back to 0 items.

- [ ] **Step 5: Commit (only the wiring; config stays at template defaults)**

```bash
git add src/pages/index.astro
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "feat: render ActivityFeed on homepage (gated on SECTIONS.showActivity)" --no-verify
```

---

## Task 12: Documentation (template-facing)

**Files:**
- Create: `docs/sources.md` (world-facing: how to enable the GitHub feed)

- [ ] **Step 1: Write the doc**

Create `docs/sources.md`:

```markdown
# Content Sources (Activity Feed)

The Activity Feed pulls your recent public activity at build time and renders it as a dated stream. It is **zero-secret** and **read-only** — it only ever calls public APIs.

> **This repo is public.** Never put secrets, tokens, or private details in `config.sources.mjs`, in `src/data/`, or in commits. The feed only fetches *public* data.

## Enable the GitHub feed

1. In `src/config.sources.mjs`, set:
   ```js
   github: { enabled: true, handle: "YOUR_GITHUB_USERNAME", maxCommits: 25 }
   ```
2. In `src/config.ts`, set `SECTIONS.showActivity: true`.
3. Generate the cache locally (optional — CI does this automatically once Plan 3 lands):
   ```bash
   npm run sync
   ```
4. Build: `npm run build`. Your latest commits and releases appear under "Recent Activity".

## How it works

- Source: `GET /users/{handle}/events/public` — public events only, no token.
- Commits from **any branch** (including unmerged) appear, capped at `maxCommits` (latest first).
- If the API is briefly unavailable, the last cached data is kept — the site never breaks.
- The events API reaches back ~90 days / 300 events; it is a *recent activity* feed, not a full history.

## Security

- No secrets are required or used for the GitHub feed.
- The only optional secret in the whole aggregator (WakaTime, added later) lives in **GitHub Actions secrets**, never in the repo.
```

- [ ] **Step 2: Commit**

```bash
git add docs/sources.md
git -c user.name="sandeepyadav1478" -c user.email="sandeepyadav1478@gmail.com" commit -m "docs: how to enable the GitHub activity feed" --no-verify
```

---

## Definition of Done (Plan 1)

- [ ] `node --test scripts/__tests__/` passes (redact, dedup, cache, github suites).
- [ ] `pnpm astro check` → 0 errors; `pnpm astro build` succeeds with the feed OFF (template default).
- [ ] Manually enabling GitHub + `showActivity` produces a populated cache and a visible "Recent Activity" section in `dist/index.html` (verified in Task 11 Step 4, then reverted).
- [ ] `src/config.sources.mjs` ships with GitHub disabled / blank handle; `SECTIONS.showActivity` ships false. Template defaults unchanged.
- [ ] No secret anywhere; only `GET /users/{handle}/events/public` is called (asserted in tests).
- [ ] All commits use identity `sandeepyadav1478 <sandeepyadav1478@gmail.com>`, no co-author line.

## Maps to spec acceptance criteria

- Spec §12.1 / §12.1a → Tasks 6, 7, 11 (GitHub events feed, capped, unmerged branch via `payload.branch`).
- Spec §12.2 → Task 7 (disabled/blank source skipped cleanly).
- Spec §12.3 → Task 5 (failure keeps last cache, status "error", build green).
- Spec §12.7 → Tasks 8-11 (`astro check && build` pass).
- Spec §12.8 → Task 11 Step 3 (template builds with feed off, section absent).
- Spec §12.9 / §12.10 → Tasks 3, 6, 7 (no secret; `/events/public` asserted; leak-guard refuses secret-bearing output; no `PUBLIC_` env var introduced).

**Deferred to later plans (not in scope here):** per-project enrichment via work `repo:` frontmatter (§12.1b, §12.5), manual-JSON layer (§12.6), failure-issue loop (§12.4), the sync workflow (cron/push) and the other 10 adapters.
