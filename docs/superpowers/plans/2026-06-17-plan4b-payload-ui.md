# Plan 4b: Payload Icons + Hover Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface all adapter payload fields on ActivityCard via per-kind stat badges and CSS tooltips, with every field individually opt-in through a new `ACTIVITY_DISPLAY` config block in `src/config.ts`.

**Architecture:** `ACTIVITY_DISPLAY` is added to `src/config.ts` (all `false`, template-safe); `ActivityCard.astro` imports it and renders badges/tooltips gated on each flag; 5 new Tabler SVG icons added to `src/assets/icons/`. No JS, no new deps, pure CSS tooltip via `data-tip` + `::after`.

**Tech Stack:** Astro v5, TypeScript, CSS custom properties, Tabler Icons SVG format.

---

### Task 1: New icons

**Files:**
- Create: `src/assets/icons/IconDownload.svg`
- Create: `src/assets/icons/IconHeart.svg`
- Create: `src/assets/icons/IconClock.svg`
- Create: `src/assets/icons/IconCode.svg`
- Create: `src/assets/icons/IconTrophy.svg`

All icons use the same format as the existing ones: single-line SVG, `stroke="currentColor"`, `width="24" height="24"`, `fill="none"`, Tabler outline class.

- [ ] **Step 1: Create `src/assets/icons/IconDownload.svg`**

```svg
<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-download"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>
```

- [ ] **Step 2: Create `src/assets/icons/IconHeart.svg`**

```svg
<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-heart"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" /></svg>
```

- [ ] **Step 3: Create `src/assets/icons/IconClock.svg`**

```svg
<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-clock"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 7v5l3 3" /></svg>
```

- [ ] **Step 4: Create `src/assets/icons/IconCode.svg`**

```svg
<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-code"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 8l-4 4l4 4" /><path d="M17 8l4 4l-4 4" /><path d="M14 4l-4 16" /></svg>
```

- [ ] **Step 5: Create `src/assets/icons/IconTrophy.svg`**

```svg
<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-trophy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 21l8 0" /><path d="M12 17l0 4" /><path d="M7 4l10 0" /><path d="M17 4v8a5 5 0 0 1 -10 0v-8" /><path d="M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /></svg>
```

- [ ] **Step 6: Run build to confirm new icons don't break anything**

```bash
pnpm run build 2>&1 | tail -5
```

Expected: build succeeds (icons are static assets — no compilation).

- [ ] **Step 7: Commit**

```bash
git add src/assets/icons/IconDownload.svg src/assets/icons/IconHeart.svg src/assets/icons/IconClock.svg src/assets/icons/IconCode.svg src/assets/icons/IconTrophy.svg
git commit -m "feat(ui): add Tabler icons for payload badges (download, heart, clock, code, trophy)"
```

---

### Task 2: `ACTIVITY_DISPLAY` config block

**Files:**
- Modify: `src/config.ts` (insert after line 151, after the `} as const;` closing the `SECTIONS` block)

- [ ] **Step 1: Insert `ACTIVITY_DISPLAY` after the SECTIONS block**

In `src/config.ts`, after the closing `} as const;` of `SECTIONS` (around line 151) and before the `// BOARD` separator, insert:

```ts
// ============================================================================
// ACTIVITY_DISPLAY — Controls which payload fields appear as badges/tooltips
// on ActivityCard items. Each field is opt-in. Template ships all false.
// ============================================================================
export const ACTIVITY_DISPLAY = {
  // commit
  commit_branch:     false, // ⎇ branch name badge
  commit_tooltip:    false, // hover: commit message

  // release
  release_version:   false, // 🏷 version tag badge
  release_tooltip:   false, // hover: repo name

  // package (npm + pypi)
  package_version:   false, // 📦 version badge
  package_downloads: false, // ⬇ download count badge (omitted if absent)
  package_tooltip:   false, // hover: registry name (npm / pypi)

  // post (rss, bluesky, mastodon, stackoverflow)
  post_feed:         false, // 📰 feed/platform name badge
  post_tooltip:      false, // hover: excerpt (first 120 chars)

  // video (youtube)
  video_views:       false, // ▶ view count badge (omitted if 0)
  video_tooltip:     false, // hover: channel name

  // rating — codeforces
  cf_rating:         false, // ★ rating badge
  cf_rank:           false, // # rank badge
  cf_tooltip:        false, // hover: Contest #<id>

  // rating — wakatime
  waka_time:         false, // ⏱ total coding time badge
  waka_avg:          false, // avg/day badge (omitted if absent)
  waka_tooltip:      false, // hover: top languages

  // rating — leetcode
  lc_solved:         false, // ✓ solved count badge
  lc_rank:           false, // # global rank badge (formatted)
  lc_tooltip:        false, // hover: Easy X · Medium Y · Hard Z

  // badge — huggingface
  hf_downloads:      false, // ⬇ download count badge
  hf_likes:          false, // ♥ likes badge (omitted if 0)
  hf_tooltip:        false, // hover: label + top 3 tags
} as const;
```

- [ ] **Step 2: Run build to confirm TypeScript accepts the new export**

```bash
pnpm run build 2>&1 | grep -E "error|warning|Error" | head -10
```

Expected: no TypeScript errors. Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat(config): add ACTIVITY_DISPLAY opt-in flags for payload badges/tooltips"
```

---

### Task 3: Update `ActivityCard.astro`

**Files:**
- Modify: `src/components/ActivityCard.astro`

This is the main task. Replace the entire file with the new version that imports `ACTIVITY_DISPLAY`, computes badges and tooltip per kind, and renders them.

- [ ] **Step 1: Replace `ActivityCard.astro` with the new implementation**

Write `src/components/ActivityCard.astro` with exactly this content:

```astro
---
import type { ActivityItem } from "@/lib/sources";
import { ACTIVITY_DISPLAY } from "@/config";
import IconDownload from "@/assets/icons/IconDownload.svg?raw";
import IconHeart from "@/assets/icons/IconHeart.svg?raw";
import IconClock from "@/assets/icons/IconClock.svg?raw";
import IconTrophy from "@/assets/icons/IconTrophy.svg?raw";

interface Props {
  item: ActivityItem;
}
const { item } = Astro.props;
const p = (item.payload ?? {}) as Record<string, unknown>;

// ── helpers ────────────────────────────────────────────────────────────────
function fmt(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1_000)     return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(v);
}
function trunc(s: unknown, len = 120): string {
  if (typeof s !== "string" || !s) return "";
  return s.length > len ? s.slice(0, len) + "…" : s;
}
function fmtAvg(secs: unknown): string {
  const s = Number(secs);
  if (!Number.isFinite(s) || s <= 0) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m avg/day` : `${m}m avg/day`;
}

// ── per-kind badge + tooltip computation ───────────────────────────────────
type Badge = { icon?: string; glyph?: string; text: string };
const badges: Badge[] = [];
let tip = "";

const kind = item.kind;
const platform = typeof p.platform === "string" ? p.platform : "";

if (kind === "commit") {
  const branch = typeof p.branch === "string" ? p.branch : "";
  if (ACTIVITY_DISPLAY.commit_branch && branch)
    badges.push({ glyph: "⎇", text: branch });
  if (ACTIVITY_DISPLAY.commit_tooltip)
    tip = trunc(p.message);
}

if (kind === "release") {
  const ver = typeof p.version === "string" ? p.version : "";
  if (ACTIVITY_DISPLAY.release_version && ver)
    badges.push({ glyph: "🏷", text: ver });
  if (ACTIVITY_DISPLAY.release_tooltip && typeof p.repo === "string")
    tip = p.repo;
}

if (kind === "package") {
  const ver = typeof p.version === "string" ? p.version : "";
  if (ACTIVITY_DISPLAY.package_version && ver)
    badges.push({ glyph: "📦", text: ver });
  const dl = fmt(p.downloads);
  if (ACTIVITY_DISPLAY.package_downloads && dl)
    badges.push({ icon: "download", text: dl });
  if (ACTIVITY_DISPLAY.package_tooltip && typeof p.registry === "string")
    tip = p.registry;
}

if (kind === "post") {
  const feed = typeof p.feed === "string" ? p.feed : "";
  if (ACTIVITY_DISPLAY.post_feed && feed)
    badges.push({ glyph: "📰", text: feed });
  if (ACTIVITY_DISPLAY.post_tooltip)
    tip = trunc(p.excerpt);
}

if (kind === "video") {
  const views = fmt(p.views);
  if (ACTIVITY_DISPLAY.video_views && views && views !== "0")
    badges.push({ glyph: "▶", text: views });
  if (ACTIVITY_DISPLAY.video_tooltip && typeof p.channel === "string")
    tip = p.channel;
}

if (kind === "rating" && platform === "codeforces") {
  if (ACTIVITY_DISPLAY.cf_rating && typeof p.rating === "number")
    badges.push({ icon: "trophy", text: String(p.rating) });
  if (ACTIVITY_DISPLAY.cf_rank && typeof p.rank === "number")
    badges.push({ glyph: "#", text: String(p.rank) });
  if (ACTIVITY_DISPLAY.cf_tooltip && typeof p.contestId === "number")
    tip = `Contest #${p.contestId}`;
}

if (kind === "rating" && platform === "wakatime") {
  const human = typeof p.humanReadableTotal === "string" ? p.humanReadableTotal : "";
  if (ACTIVITY_DISPLAY.waka_time && human)
    badges.push({ icon: "clock", text: human });
  const avg = fmtAvg(p.dailyAverage);
  if (ACTIVITY_DISPLAY.waka_avg && avg)
    badges.push({ glyph: "~", text: avg });
  if (ACTIVITY_DISPLAY.waka_tooltip && Array.isArray(p.languages) && p.languages.length)
    tip = (p.languages as string[]).join(" · ");
}

if (kind === "rating" && platform === "leetcode") {
  const solved = (p.solved as Record<string, number> | undefined);
  if (ACTIVITY_DISPLAY.lc_solved && solved && typeof solved.all === "number")
    badges.push({ glyph: "✓", text: `${solved.all} solved` });
  const rank = fmt(p.ranking);
  if (ACTIVITY_DISPLAY.lc_rank && rank)
    badges.push({ glyph: "#", text: rank });
  if (ACTIVITY_DISPLAY.lc_tooltip && solved)
    tip = `Easy ${solved.easy ?? 0} · Medium ${solved.medium ?? 0} · Hard ${solved.hard ?? 0}`;
}

if (kind === "badge" && platform === "huggingface") {
  const dl = fmt(p.downloads);
  if (ACTIVITY_DISPLAY.hf_downloads && dl)
    badges.push({ icon: "download", text: dl });
  const likes = Number(p.likes);
  if (ACTIVITY_DISPLAY.hf_likes && Number.isFinite(likes) && likes > 0)
    badges.push({ icon: "heart", text: String(likes) });
  if (ACTIVITY_DISPLAY.hf_tooltip) {
    const label = typeof p.label === "string" ? p.label : "";
    const tags  = Array.isArray(p.tags) ? (p.tags as string[]).slice(0, 3).join(" · ") : "";
    tip = [label, tags].filter(Boolean).join(" · ");
  }
}

// ── label + date ────────────────────────────────────────────────────────────
const KIND_LABEL: Record<string, string> = {
  commit: "Commit", release: "Release", post: "Post",
  video: "Video", package: "Package", rating: "Rating", badge: "Badge",
};
const label = KIND_LABEL[item.kind] ?? item.kind;
const when = new Date(item.date).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric",
});

// Icon map: key -> raw SVG string
const ICONS: Record<string, string> = {
  download: IconDownload,
  heart:    IconHeart,
  clock:    IconClock,
  trophy:   IconTrophy,
};
---

<a
  href={item.url}
  target="_blank"
  rel="noopener noreferrer"
  class="activity-card"
  data-tip={tip || undefined}
>
  <span class="activity-chip">{item.source}</span>
  <span class="activity-kind">{label}</span>
  <span class="activity-title">{item.title}</span>
  {badges.map((b) => (
    <span class="activity-stat">
      {b.icon && <span class="stat-icon" set:html={ICONS[b.icon]} />}
      {b.glyph && <span class="stat-glyph">{b.glyph}</span>}
      <span>{b.text}</span>
    </span>
  ))}
  <time class="activity-date" datetime={item.date}>{when}</time>
</a>

<style>
  .activity-card {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border, rgba(127, 127, 127, 0.2));
    border-radius: 0.5rem;
    text-decoration: none;
    color: inherit;
    position: relative;
    transition:
      border-color 0.15s ease,
      transform 0.15s ease;
  }
  .activity-card:hover {
    border-color: var(--accent, #888);
    transform: translateY(-1px);
  }

  /* CSS tooltip */
  .activity-card[data-tip]::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--card, #fff);
    border: 1px solid var(--border, rgba(127, 127, 127, 0.2));
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

  .activity-chip {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.1rem 0.4rem;
    border-radius: 0.3rem;
    background: var(--accent-muted, rgba(127, 127, 127, 0.15));
    flex-shrink: 0;
  }
  .activity-kind {
    font-size: 0.75rem;
    opacity: 0.7;
    flex-shrink: 0;
  }
  .activity-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* stat badges */
  .activity-stat {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.7rem;
    opacity: 0.75;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .stat-icon :global(svg) {
    width: 12px;
    height: 12px;
    opacity: 0.7;
    vertical-align: middle;
  }
  .stat-glyph {
    font-size: 0.65rem;
  }

  .activity-date {
    font-size: 0.75rem;
    opacity: 0.6;
    flex-shrink: 0;
  }
</style>
```

- [ ] **Step 2: Run build — confirm it compiles cleanly**

```bash
pnpm run build 2>&1 | grep -E "error|Error" | head -10
```

Expected: no errors. If Astro complains about `?raw` SVG imports, check that the Vite config in `astro.config.mjs` doesn't block them — the default Astro/Vite setup supports `?raw` for strings.

- [ ] **Step 3: Run lint + format check**

```bash
pnpm run lint && pnpm run format:check
```

Expected: both pass.

- [ ] **Step 4: Run full test suite to confirm no regressions**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: all tests pass (ActivityCard.astro has no Node tests — this just confirms no adapter code was accidentally touched).

- [ ] **Step 5: Smoke-test with all flags on**

Temporarily edit `src/config.ts` — set all `ACTIVITY_DISPLAY` flags to `true`, then run `pnpm dev` and open the browser. With an empty cache the activity feed is empty, but we can confirm the build doesn't crash. Then revert all flags back to `false`.

```bash
# After manual smoke test, revert:
git checkout src/config.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ActivityCard.astro
git commit -m "feat(ui): add per-kind payload badges + CSS tooltips to ActivityCard"
```
