# Plan 4a: LeetCode Adapter Design

## Goal

Add a LeetCode source adapter to the sora template that fetches a user's stats (problems solved by difficulty + global ranking) and emits a single self-overwriting `rating` envelope — same pattern as the WakaTime adapter.

## Architecture

One adapter file following the exact WakaTime shape. Single unauthenticated GraphQL query to `https://leetcode.com/graphql`. No secrets, no new dependencies, no new kinds. The adapter registers in `sync-sources.mjs` and ships `enabled: false` in `config.sources.mjs` per template safety rules.

## API

**Endpoint:** `POST https://leetcode.com/graphql`  
**Auth:** None required  
**Query:**
```graphql
{
  matchedUser(username: "<handle>") {
    submitStats {
      acSubmissionNum {
        difficulty
        count
      }
    }
    profile {
      ranking
    }
  }
}
```

**Live response shape (verified):**
```json
{
  "data": {
    "matchedUser": {
      "submitStats": {
        "acSubmissionNum": [
          {"difficulty": "All",    "count": 61},
          {"difficulty": "Easy",   "count": 48},
          {"difficulty": "Medium", "count": 13},
          {"difficulty": "Hard",   "count": 0}
        ]
      },
      "profile": { "ranking": 2215747 }
    }
  }
}
```

`matchedUser` is `null` for a non-existent handle — adapter returns `[]` gracefully.

## Envelope

```js
makeEnvelope({
  id:     stableId("leetcode", "rating", handle),  // date-less — always self-overwrites
  source: "leetcode",
  kind:   "rating",
  title:  `LeetCode: ${solved} solved (rank #${ranking})`,
  url:    `https://leetcode.com/${handle}/`,
  date:   generatedAt,   // timestamp of the sync run
  payload: {
    platform: "leetcode",             // disambiguates rating kind in the UI layer
    solved:  { all: 61, easy: 48, medium: 13, hard: 0 },
    ranking: 2215747,
  },
})
```

`stableId("leetcode", "rating", handle)` produces `"leetcode:rating:<handle>"` — satisfies the id-kind invariant (`id.split(":")[1] === kind`).

`mergeSources` replaces the whole source on every run, so there is always exactly one item per user.

## Config Shape

```js
leetcode: {
  enabled: false,  // forker: set true + fill handle
  handle: "",      // LeetCode username, e.g. "sandeepyadav1478"
}
```

No secrets. Adapter returns `[]` if `handle` is empty (standard self-validation pattern).

## Files Changed

| File | Change |
|---|---|
| `scripts/adapters/leetcode.mjs` | New adapter |
| `scripts/__tests__/leetcode.test.mjs` | Tests |
| `scripts/adapters/__fixtures__/leetcode.json` | Captured live response |
| `scripts/sync-sources.mjs` | Import + register `leetcode` in `ADAPTERS` |
| `src/config.sources.mjs` | Add `leetcode` entry (enabled: false) + remove stale Plan 3 comment |

## Template Safety

- Ships `enabled: false`, blank handle
- No secret needed
- `src/data/sources-cache.json` unchanged (empty)

## Out of Scope

- Contest history feed (nice-to-have, not built now)
- Auth-gated endpoints
