# Plan 4d-2: Git Archives Design

## Goal

Let forkers showcase important GitHub repos they've stopped actively pushing to — displayed on `/archives/` (timeline view) and on the main works board (with "Archived" badge). A new optional `githubRepo` field on `works` entries bridges to the auto-unarchive alert in Plan 4d-3.

## Architecture

No new pages, no new collections, no new Astro routes. Uses the existing `works` content collection and the existing `/archives/` page.

An archived repo = a `.md` file in `src/data/works/` with:
- `type: "oss"` (or `"project"`)
- `status: "archived"`
- `githubRepo: "owner/repo"` (new optional field — the canonical repo handle)

The `githubRepo` field is the only schema change. Everything else (archives page, works board, filtering) already works.

## Schema Change

Add one optional field to the `works` collection in `src/content.config.ts`:

```ts
githubRepo: z.string().optional(),
// e.g. "sandeepyadav1478/sqloutbox" — used by the unarchive-alert system
```

No other schema changes. `status: "archived"` already exists.

## Work Entry Shape

A forker creates one `.md` file per archived repo in `src/data/works/`:

```md
---
title: "sqloutbox"
type: oss
status: archived
pubDatetime: 2024-03-01T00:00:00Z
description: "Transactional outbox pattern for SQLAlchemy — reliable event publishing from relational databases."
tags: [python, sqlalchemy, outbox, messaging]
tech: [Python, SQLAlchemy, PostgreSQL]
githubRepo: "sandeepyadav1478/sqloutbox"
links:
  - label: "GitHub"
    url: "https://github.com/sandeepyadav1478/sqloutbox"
  - label: "PyPI"
    url: "https://pypi.org/project/sqloutbox/"
---
Brief description of what this project does and why it mattered.
```

The `pubDatetime` controls where it appears in the `/archives/` timeline. Use the approximate date the project was last meaningfully worked on.

## Display Behaviour

### Works board (homepage)

- Archived repos **show on the board** alongside active works — `workFilter` does not filter by `status`
- The existing `statusLabelMap` in `archives.astro` already maps `"archived"` → `{ label: "Archived", cls: "status-archived" }`
- Work card components already render the status badge — no component changes needed

### `/archives/` page

- Archived repos appear in the timeline grouped by year/month (by `pubDatetime`)
- Visually distinguished by the existing `status-archived` CSS class
- No page changes needed

## Template Additions

Add one example archived repo entry to the template's `src/data/works/` as a demonstration — using placeholder data, clearly marked as an example. This teaches forkers how to use the feature.

```md
---
title: "example-archived-repo"
type: oss
status: archived
draft: true
pubDatetime: 2023-01-01T00:00:00Z
description: "Example archived repo entry. Replace with your own."
tags: [example]
githubRepo: "your-username/your-repo"
links:
  - label: "GitHub"
    url: "https://github.com/your-username/your-repo"
---
This is a placeholder. Create one entry per important repo you've stopped pushing to.
Set githubRepo to enable automatic unarchive alerts (Plan 4d-3).
```

The `draft: true` flag ensures it doesn't render on the actual site until the forker fills in real data.

## Files Changed

| File | Change |
|---|---|
| `src/content.config.ts` | Add `githubRepo: z.string().optional()` to works schema |
| `src/data/works/example-archived-repo.md` | New template example (draft: true) |

## Out of Scope

- Any changes to `/archives/` page rendering
- Any changes to works board filtering (archived stays visible)
- Unarchive alert logic (Plan 4d-3)
- UI for the `githubRepo` field itself — it's metadata only, not rendered
