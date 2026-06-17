# Plan 4b: Payload Icons + Hover Detail Design

## Goal

Surface the rich payload data already stored in every `ActivityItem` envelope — using inline stat badges (always visible) and CSS tooltips (on hover) — with every field opt-in via a new `ACTIVITY_DISPLAY` config block. Forkers toggle individual fields without editing any component code.

## Architecture

Two files change: `src/config.ts` gets a new `ACTIVITY_DISPLAY` export; `src/components/ActivityCard.astro` reads it and renders badges/tooltips accordingly. A handful of new Tabler SVG icons added to `src/assets/icons/`. No adapter changes, no new libraries, no JS.

**Two-layer pattern:**
1. **Stat badges** — 1–3 tiny `icon + value` chips rendered inline in the card row for the most important payload numbers. Same visual weight as the existing `activity-kind` label. Each badge is individually toggled by `ACTIVITY_DISPLAY`.
2. **CSS tooltip** — `data-tip` attribute on the card anchor; `::after` pseudo-element reads it via `content: attr(data-tip)`. Pure CSS, no JS, works on a static Astro build. Degrades gracefully on mobile (no hover = tooltips never shown; badges still visible). Tooltip for a kind is omitted entirely when its display flag is off.

## `ACTIVITY_DISPLAY` Config Block

Added to `src/config.ts` in the same style as `SECTIONS`. The template ships everything `false` (consistent with the "all sources off" template rule). Forkers flip individual fields to `true`.

```ts
// ACTIVITY_DISPLAY — Controls which payload fields appear as badges/tooltips
// on ActivityCard items. Each field is opt-in. Template ships all false.
// ============================================================================
export const ACTIVITY_DISPLAY = {
  // commit
  commit_branch:    false, // ⎇ branch name badge
  commit_tooltip:   false, // hover: commit message

  // release
  release_version:  false, // 🏷 version tag badge
  release_tooltip:  false, // hover: repo name

  // package (npm + pypi)
  package_version:  false, // 📦 version badge
  package_downloads:false, // ⬇ download count badge (omitted if absent)
  package_tooltip:  false, // hover: registry name (npm / pypi)

  // post (rss, bluesky, mastodon, stackoverflow)
  post_feed:        false, // 📰 feed/platform name badge
  post_tooltip:     false, // hover: excerpt (first 120 chars)

  // video (youtube)
  video_views:      false, // ▶ view count badge (omitted if 0)
  video_tooltip:    false, // hover: channel name

  // rating — codeforces
  cf_rating:        false, // ★ rating badge
  cf_rank:          false, // # rank badge
  cf_tooltip:       false, // hover: Contest #<id>

  // rating — wakatime
  waka_time:        false, // ⏱ total coding time badge
  waka_avg:         false, // avg/day badge (omitted if absent)
  waka_tooltip:     false, // hover: top languages

  // rating — leetcode
  lc_solved:        false, // ✓ solved count badge
  lc_rank:          false, // # global rank badge (formatted)
  lc_tooltip:       false, // hover: Easy X · Medium Y · Hard Z

  // badge — huggingface
  hf_downloads:     false, // ⬇ download count badge
  hf_likes:         false, // ♥ likes badge (omitted if 0)
  hf_tooltip:       false, // hover: label + top 3 tags
} as const;
```

`ActivityCard.astro` imports `ACTIVITY_DISPLAY` and gates every badge/tooltip on its flag. A badge for a field that is `false` is simply not rendered — no DOM node, no empty space.

## Per-Kind Payload Mapping

### `commit`
- **Badge** (`commit_branch`): `⎇ payload.branch` in monospace
- **Tooltip** (`commit_tooltip`): `payload.message` truncated to 120 chars
- **All payload fields fetched:** `branch`, `sha`, `repo`, `message`

### `release`
- **Badge** (`release_version`): `🏷 payload.version`
- **Tooltip** (`release_tooltip`): `payload.repo`
- **All payload fields fetched:** `repo`, `version`

### `package` (npm + pypi)
- **Badge** (`package_version`): `📦 payload.version`
- **Badge** (`package_downloads`): `⬇ fmt(payload.downloads)` — omitted if field absent
- **Tooltip** (`package_tooltip`): `payload.registry` (`npm` or `pypi`)
- **All payload fields fetched:** `registry`, `version`, `downloads`

### `post` (RSS, Bluesky, Mastodon, StackOverflow)
- **Badge** (`post_feed`): `📰 payload.feed`
- **Tooltip** (`post_tooltip`): `payload.excerpt` first 120 chars — omitted if absent
- **All payload fields fetched:** `feed`, `excerpt`, `tags`

### `video` (YouTube)
- **Badge** (`video_views`): `▶ fmt(payload.views)` — omitted if 0 or absent
- **Tooltip** (`video_tooltip`): `payload.channel`
- **All payload fields fetched:** `channel`, `thumbnail`, `views`

### `rating` — Codeforces (`payload.platform === "codeforces"`)
- **Badge** (`cf_rating`): `★ payload.rating`
- **Badge** (`cf_rank`): `# payload.rank`
- **Tooltip** (`cf_tooltip`): `Contest #${payload.contestId}`
- **All payload fields fetched:** `platform`, `contestId`, `rating`, `rank`

### `rating` — WakaTime (`payload.platform === "wakatime"`)
- **Badge** (`waka_time`): `⏱ payload.humanReadableTotal`
- **Badge** (`waka_avg`): daily avg formatted as `Xh Ym avg/day` — omitted if absent
- **Tooltip** (`waka_tooltip`): `payload.languages` joined with ` · ` — omitted if empty
- **All payload fields fetched:** `platform`, `totalSeconds`, `humanReadableTotal`, `dailyAverage`, `languages`, `range`

### `rating` — LeetCode (`payload.platform === "leetcode"`)
- **Badge** (`lc_solved`): `✓ payload.solved.all solved`
- **Badge** (`lc_rank`): `# fmt(payload.ranking)`
- **Tooltip** (`lc_tooltip`): `Easy ${easy} · Medium ${medium} · Hard ${hard}`
- **All payload fields fetched:** `platform`, `solved` (`all/easy/medium/hard`), `ranking`
- **Note:** Plan 4a adapter must include `platform: "leetcode"` in payload.

### `badge` — HuggingFace (`payload.issuer === "huggingface"`)
- **Badge** (`hf_downloads`): `⬇ fmt(payload.downloads)`
- **Badge** (`hf_likes`): `♥ payload.likes` — omitted if 0
- **Tooltip** (`hf_tooltip`): `payload.label` + top 3 `payload.tags` joined with ` · `
- **All payload fields fetched:** `issuer`, `downloads`, `likes`, `label`, `kindOf`, `tags`

## Number Formatting

```ts
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
```

## New Icons Required

5 new Tabler SVG files added to `src/assets/icons/` (same format: `stroke="currentColor"`, 24×24, no fill):

| File | Tabler icon | Used for |
|---|---|---|
| `IconDownload.svg` | `tabler-download` | downloads (package, huggingface) |
| `IconHeart.svg` | `tabler-heart` | likes (huggingface) |
| `IconClock.svg` | `tabler-clock` | coding time (wakatime) |
| `IconCode.svg` | `tabler-code` | language list (wakatime tooltip) |
| `IconTrophy.svg` | `tabler-trophy` | rating/rank (codeforces) |

Commit/branch, release tag, package, post, video, solved count, rank — use Unicode glyphs inline (⎇ 🏷 📦 📰 ▶ ✓ #). SVGs reserved for the 5 icons used as small inline images.

## CSS Tooltip

```css
.activity-card { position: relative; }

.activity-card[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--card, #fff);
  border: 1px solid var(--border, rgba(127,127,127,0.2));
  border-radius: 0.4rem;
  padding: 0.4rem 0.6rem;
  font-size: 0.7rem;
  white-space: pre-wrap;
  max-width: 260px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 10;
}

.activity-card:hover[data-tip]::after { opacity: 1; }
```

## Stat Badge Style

```css
.activity-stat {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.7rem;
  opacity: 0.75;
  flex-shrink: 0;
  white-space: nowrap;
}
.activity-stat img {
  width: 12px;
  height: 12px;
  opacity: 0.7;
}
```

## Files Changed

| File | Change |
|---|---|
| `src/config.ts` | Add `ACTIVITY_DISPLAY` export block (all `false`) |
| `src/components/ActivityCard.astro` | Import `ACTIVITY_DISPLAY`; render badges + tooltips gated on flags |
| `src/assets/icons/IconDownload.svg` | New Tabler icon |
| `src/assets/icons/IconHeart.svg` | New Tabler icon |
| `src/assets/icons/IconClock.svg` | New Tabler icon |
| `src/assets/icons/IconCode.svg` | New Tabler icon |
| `src/assets/icons/IconTrophy.svg` | New Tabler icon |

## Template Safety

- `ACTIVITY_DISPLAY` ships all `false` — no badges or tooltips visible by default
- No payload data is shown unless the forker explicitly opts in per field
- No new secrets, no new adapters, no changes to cache shape

## Out of Scope

- Mobile tap-to-show tooltip (JS-free static site)
- Per-item override (config is global, not per-source)
- Any change outside `config.ts`, `ActivityCard.astro`, and the 5 icon files
