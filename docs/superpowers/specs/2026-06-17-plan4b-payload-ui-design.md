# Plan 4b: Payload Icons + Hover Detail Design

## Goal

Surface the rich payload data already stored in every `ActivityItem` envelope — using inline stat badges (always visible) and CSS tooltips (on hover) — without adding JavaScript, new dependencies, or changing the data model.

## Architecture

One component change only: `src/components/ActivityCard.astro`. A handful of new Tabler SVG icons added to `src/assets/icons/`. No adapter changes, no config changes, no new libraries.

**Two-layer pattern:**
1. **Stat badges** — 1–3 tiny `icon + value` chips rendered inline in the card row for the most important payload numbers. Same visual weight as the existing `activity-kind` label.
2. **CSS tooltip** — `data-tip` attribute on the card anchor; `::after` pseudo-element reads it via `content: attr(data-tip)`. Pure CSS, no JS, works on a static Astro build. Degrades gracefully on mobile (no hover = tooltips never shown; badges still visible).

## Per-Kind Payload Mapping

### `commit`
- **Badges:** branch name (monospace, ⎇ icon)
- **Tooltip:** commit message (from `payload.message`, truncated to 120 chars)
- **Source:** `payload.branch`, `payload.message`

### `release`
- **Badges:** version tag (🏷 icon + `payload.version`)
- **Tooltip:** `payload.repo`
- **Source:** `payload.version`, `payload.repo`

### `package` (npm + pypi)
- **Badges:** version (`📦 payload.version`), downloads (`⬇ payload.downloads` formatted — omitted if absent)
- **Tooltip:** registry name (`npm` or `pypi` from `payload.registry`)
- **Source:** `payload.version`, `payload.downloads`, `payload.registry`

### `post` (RSS, Bluesky, Mastodon, StackOverflow)
- **Badges:** feed/platform name (`📰 payload.feed`)
- **Tooltip:** excerpt (from `payload.excerpt`, first 120 chars — omitted if absent)
- **Source:** `payload.feed`, `payload.excerpt`

### `video` (YouTube)
- **Badges:** view count (`▶ payload.views` formatted — omitted if absent or 0)
- **Tooltip:** `payload.channel`
- **Source:** `payload.views`, `payload.channel`

### `rating` — Codeforces (`payload.platform === "codeforces"`)
- **Badges:** rating (`★ payload.rating`), rank (`# payload.rank`)
- **Tooltip:** contest id label: `Contest #<contestId>`
- **Source:** `payload.rating`, `payload.rank`, `payload.contestId`

### `rating` — WakaTime (`payload.platform === "wakatime"`)
- **Badges:** total time (`⏱ payload.humanReadableTotal`), daily avg (`payload.dailyAverage` formatted as `Xh Ym avg/day` — omitted if absent)
- **Tooltip:** top languages — `payload.languages` joined with ` · ` (omitted if absent/empty)
- **Source:** `payload.humanReadableTotal`, `payload.dailyAverage`, `payload.languages`

### `rating` — LeetCode (`payload.platform === "leetcode"`)
- **Badges:** solved count (`✓ payload.solved.all solved`), rank (`# payload.ranking` formatted)
- **Tooltip:** `Easy ${easy} · Medium ${medium} · Hard ${hard}`
- **Source:** `payload.solved`, `payload.ranking`
- **Note:** Plan 4a (LeetCode adapter) must include `platform: "leetcode"` in payload — same as codeforces/wakatime use `platform` to disambiguate within the `rating` kind.

### `badge` — HuggingFace (`payload.issuer === "huggingface"`)
- **Badges:** downloads (`⬇ payload.downloads` formatted), likes (`♥ payload.likes` if > 0)
- **Tooltip:** label + top 3 tags from `payload.tags` joined with ` · `
- **Source:** `payload.downloads`, `payload.likes`, `payload.label`, `payload.tags`

## Number Formatting

Large numbers formatted as `1.2k` / `3.4M` for readability. A small local `fmt(n)` function in the component:
```js
function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
```

## New Icons Required

5 new Tabler SVG files added to `src/assets/icons/` (same format: `stroke="currentColor"`, 24×24, no fill):

| File | Tabler icon | Used for |
|---|---|---|
| `IconDownload.svg` | `tabler-download` | downloads (package, badge) |
| `IconHeart.svg` | `tabler-heart` | likes (huggingface badge) |
| `IconClock.svg` | `tabler-clock` | coding time (wakatime) |
| `IconCode.svg` | `tabler-code` | language list (wakatime tooltip label) |
| `IconTrophy.svg` | `tabler-trophy` | rating/rank (codeforces) |

Commit/branch, release tag, package, post, video, solved count, rank — use Unicode glyphs inline (⎇ 🏷 📦 📰 ▶ ✓ #) rather than SVGs to keep the component concise. SVGs reserved for the 5 icons used as `<img>`-style inline elements.

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

.activity-card:hover[data-tip]::after {
  opacity: 1;
}
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
| `src/components/ActivityCard.astro` | Add per-kind stat badges + `data-tip` tooltip logic |
| `src/assets/icons/IconDownload.svg` | New icon |
| `src/assets/icons/IconHeart.svg` | New icon |
| `src/assets/icons/IconClock.svg` | New icon |
| `src/assets/icons/IconCode.svg` | New icon |
| `src/assets/icons/IconTrophy.svg` | New icon |

## Out of Scope

- Mobile tap-to-show tooltip (JS-free static site)
- Payload fields not listed above
- Any change outside ActivityCard.astro
