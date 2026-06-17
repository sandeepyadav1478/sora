# Plan 4a: LeetCode Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `leetcode` source adapter to the sora template that fetches a user's stats via GraphQL and emits a single self-overwriting `rating` envelope, following the exact WakaTime pattern.

**Architecture:** One adapter file (`scripts/adapters/leetcode.mjs`) with a pure `normalizeStats(raw, cfg)` transform and a `fetch_(cfg)` entry point. No auth, no secrets — LeetCode GraphQL is public. Registered in `sync-sources.mjs` and `config.sources.mjs` (ships `enabled: false`). Stale `// Plan 3 adds:` comment removed from `config.sources.mjs`.

**Tech Stack:** Node 22 ESM, LeetCode public GraphQL (`https://leetcode.com/graphql`), `fetchJson` from `scripts/lib/http.mjs`, `makeEnvelope`/`stableId` from `scripts/lib/envelope.mjs`.

---

### Task 1: Fixture + adapter + tests

**Files:**
- Create: `scripts/adapters/__fixtures__/leetcode.json`
- Create: `scripts/adapters/leetcode.mjs`
- Create: `scripts/__tests__/leetcode.test.mjs`

- [ ] **Step 1: Create the fixture**

Create `scripts/adapters/__fixtures__/leetcode.json` with this content (represents a real API response):

```json
{
  "data": {
    "matchedUser": {
      "submitStats": {
        "acSubmissionNum": [
          { "difficulty": "All",    "count": 61 },
          { "difficulty": "Easy",   "count": 48 },
          { "difficulty": "Medium", "count": 13 },
          { "difficulty": "Hard",   "count": 0  }
        ]
      },
      "profile": {
        "ranking": 2215747
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/__tests__/leetcode.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeStats } from "../adapters/leetcode.mjs";
import { fetch_ as leetcodeFetch } from "../adapters/leetcode.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/leetcode.json", import.meta.url), "utf8")
);

const cfg = {
  enabled: true,
  handle: "sandeepyadav1478",
};

const GEN = "2026-06-17T02:00:00.000Z";

test("normalizeStats produces exactly one self-overwriting rating item", () => {
  const out = normalizeStats(fixture, cfg, GEN);
  assert.equal(out.length, 1, "must be SINGLE item — date-less id self-overwrites");
});

test("normalizeStats: envelope core fields are correct", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  assert.equal(item.source, "leetcode");
  assert.equal(item.kind, "rating");
  assert.equal(item.title, "LeetCode: 61 solved (rank #2,215,747)");
  assert.equal(item.url, "https://leetcode.com/sandeepyadav1478/");
  assert.equal(item.date, GEN);
});

test("normalizeStats: id is the stable date-less dedup key", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  assert.equal(item.id, "leetcode:rating:sandeepyadav1478");
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(item.id), "id must contain no date");
});

test("normalizeStats: id-kind invariant — id.split(':')[1] === kind", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  assert.equal(item.id.split(":")[1], item.kind);
  assert.equal(item.kind, "rating");
});

test("normalizeStats: payload shape is correct", () => {
  const [item] = normalizeStats(fixture, cfg, GEN);
  assert.equal(item.payload.platform, "leetcode");
  assert.deepEqual(item.payload.solved, { all: 61, easy: 48, medium: 13, hard: 0 });
  assert.equal(item.payload.ranking, 2215747);
});

test("normalizeStats: returns [] when matchedUser is null (non-existent handle)", () => {
  const notFound = { data: { matchedUser: null } };
  assert.deepEqual(normalizeStats(notFound, cfg, GEN), []);
});

test("normalizeStats: returns [] on garbage / empty input (never throws)", () => {
  assert.deepEqual(normalizeStats(null, cfg, GEN), []);
  assert.deepEqual(normalizeStats({}, cfg, GEN), []);
  assert.deepEqual(normalizeStats("nope", cfg, GEN), []);
});

test("fetch_ returns [] when handle is missing (graceful, no network, no throw)", async () => {
  const out = await leetcodeFetch({ enabled: true, handle: "" });
  assert.deepEqual(out, []);
});
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
node --test 'scripts/__tests__/leetcode.test.mjs'
```

Expected: FAIL — `normalizeStats` not exported yet.

- [ ] **Step 4: Implement the adapter**

Create `scripts/adapters/leetcode.mjs`:

```js
import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";

export const id = "leetcode";
export const needs = []; // no secrets — GraphQL endpoint is public

const GQL_URL = "https://leetcode.com/graphql";
const QUERY = `{
  matchedUser(username: "%handle%") {
    submitStats { acSubmissionNum { difficulty count } }
    profile { ranking }
  }
}`;

/** Pure transform: LeetCode GraphQL response -> Envelope[]. No network.
 * Single self-overwriting `rating` item; dedup id has no date. */
export function normalizeStats(raw, cfg, generatedAt) {
  try {
    const user = raw?.data?.matchedUser;
    if (!user) return [];
    const nums = user.submitStats?.acSubmissionNum;
    if (!Array.isArray(nums)) return [];

    const byDiff = Object.fromEntries(nums.map((n) => [n.difficulty, n.count]));
    const all    = byDiff["All"]    ?? 0;
    const easy   = byDiff["Easy"]   ?? 0;
    const medium = byDiff["Medium"] ?? 0;
    const hard   = byDiff["Hard"]   ?? 0;
    const ranking = user.profile?.ranking ?? 0;
    const handle  = cfg?.handle ?? "unknown";

    return [
      makeEnvelope({
        id:     stableId("leetcode", "rating", handle),
        source: "leetcode",
        kind:   "rating",
        title:  `LeetCode: ${all} solved (rank #${ranking.toLocaleString("en-US")})`,
        url:    `https://leetcode.com/${handle}/`,
        date:   generatedAt,
        payload: {
          platform: "leetcode",
          solved:   { all, easy, medium, hard },
          ranking,
        },
      }),
    ];
  } catch {
    return [];
  }
}

/** Adapter entry point. Returns [] on any error (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.enabled) return [];
    if (!cfg.handle) return [];
    const body = JSON.stringify({ query: QUERY.replace("%handle%", cfg.handle) });
    const raw  = await fetchJson(GQL_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
      timeoutMs: 10_000,
    });
    return normalizeStats(raw, cfg, new Date().toISOString());
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
```

- [ ] **Step 5: Check that `fetchJson` supports a `body` + `method` option**

```bash
grep -n "method\|body\|opts" /Users/sandeep.yadav/tmp/sora/scripts/lib/http.mjs
```

If `fetchJson` doesn't forward `method`/`body` — it likely passes `opts` straight to `fetch()`, which does. Verify by reading the function. If not, we need to pass them via a workaround — but the standard `fetch` API accepts them natively so it should work fine.

- [ ] **Step 6: Run the tests — confirm 8 pass**

```bash
node --test 'scripts/__tests__/leetcode.test.mjs'
```

Expected: **8 tests passing**.

- [ ] **Step 7: Run full suite — confirm 98 pass**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **98 tests passing** (90 existing + 8 new).

- [ ] **Step 8: Commit**

```bash
git add scripts/adapters/leetcode.mjs scripts/adapters/__fixtures__/leetcode.json scripts/__tests__/leetcode.test.mjs
git commit -m "feat(adapters): add leetcode stats adapter (single self-overwriting rating item)"
```

---

### Task 2: Register adapter + config entry

**Files:**
- Modify: `scripts/sync-sources.mjs`
- Modify: `src/config.sources.mjs`

- [ ] **Step 1: Register in `sync-sources.mjs`**

Add import after line 17 (`import * as wakatime ...`):

```js
import * as leetcode from "./adapters/leetcode.mjs";
```

Update the ADAPTERS object on line 26 to include `leetcode`:

```js
const ADAPTERS = { github, codeforces, pypi, npm, rss, youtube, stackoverflow, bluesky, mastodon, huggingface, wakatime, leetcode };
```

- [ ] **Step 2: Add config entry + remove stale comment in `src/config.sources.mjs`**

Replace the bottom of the file — from `wakatime:` block to the end — with:

```js
  wakatime: {
    enabled: false, // forker: set true; key comes from the WAKATIME_API_KEY env/secret, NOT here
    handle: "", // WakaTime username (display only)
    profileUrl: "", // public profile, e.g. "https://wakatime.com/@yourname" — used as the item url
    range: "last_7_days", // WakaTime stats range; part of the dedup id (wakatime:rating:<range>)
  },
  leetcode: {
    enabled: false, // forker: set true + fill handle
    handle: "", // LeetCode username, e.g. "sandeepyadav1478"
  },
};
```

(This also removes the stale `// Plan 3 adds: manual, issueOnFailure` comment.)

- [ ] **Step 3: Run full test suite**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: **98 tests passing**.

- [ ] **Step 4: Run lint + build**

```bash
pnpm run lint && pnpm run format:check && pnpm run build
```

Expected: all three pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-sources.mjs src/config.sources.mjs
git commit -m "feat(sync): register leetcode adapter; clean up stale config comment"
```
