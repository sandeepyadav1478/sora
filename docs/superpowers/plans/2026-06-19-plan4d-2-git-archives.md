# Plan 4d-2: Git Archives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `githubRepo` optional field to the `works` content schema so forkers can attach a canonical repo handle to archived work entries, enabling the auto-unarchive alert system (Plan 4d-3). Add a template example entry with `draft: true`.

**Architecture:** One schema change in `src/content.config.ts` (additive only — existing works are unaffected). One new example `.md` file in `src/data/works/` with `draft: true` to teach the pattern without rendering on the live site.

**Tech Stack:** Astro v5 content collections, Zod schema, TypeScript.

## Global Constraints

- **Additive only** — no existing works files or schema fields are modified
- **`draft: true`** on the example file — must not render on the live site
- **No Co-Authored-By** in commits
- **Both repos** — template (`/Users/sandeep.yadav/tmp/sora`) and personal site (`/Users/sandeep.yadav/tmp/personal-site`) get this change

---

### Task 1: Add `githubRepo` to works schema + example entry

**Files:**
- Modify: `src/content.config.ts`
- Create: `src/data/works/example-archived-repo.md`

**Interfaces:**
- Produces: `works.data.githubRepo?: string` — consumed by Plan 4d-3's `parseWorks.mjs`

- [ ] **Step 1: Add `githubRepo` field to the works schema in `src/content.config.ts`**

Find the works schema in `src/content.config.ts`. The schema has many fields; add `githubRepo` after the `status` field:

```ts
      status: z.enum(["active", "maintained", "archived", "in-production"]).optional(),
      githubRepo: z.string().optional(),
      // e.g. "sandeepyadav1478/sqloutbox" — used by the unarchive-alert system (Plan 4d-3)
```

- [ ] **Step 2: Run build to confirm TypeScript accepts the new field**

```bash
pnpm run build 2>&1 | grep -c "error TS"
```

Expected: `0`

- [ ] **Step 3: Create the template example file**

Create `src/data/works/example-archived-repo.md`:

```md
---
title: "example-archived-repo"
type: oss
status: archived
draft: true
pubDatetime: 2023-01-01T00:00:00Z
description: "Example archived repo entry. Replace with your own project details."
tags: [example]
tech: []
githubRepo: "your-username/your-repo"
links:
  - label: "GitHub"
    url: "https://github.com/your-username/your-repo"
---
This is a placeholder for an archived repo. Create one file per important GitHub repo you've stopped pushing to.

Set `githubRepo` to your repo's `owner/repo` handle to enable automatic unarchive alerts — when the sync detects new pushes to this repo, it will open a GitHub Issue reminding you to promote it back to active.
```

- [ ] **Step 4: Confirm example entry does not appear in the built site**

```bash
pnpm run build 2>&1 | grep "example-archived" || echo "not rendered — correct"
```

Expected: `not rendered — correct` (draft: true filters it out).

- [ ] **Step 5: Run full test suite**

```bash
node --test 'scripts/__tests__/*.test.mjs'
```

Expected: all existing tests pass (no new tests — schema changes don't need Node tests; Astro type-checks them).

- [ ] **Step 6: Commit**

```bash
git add src/content.config.ts src/data/works/example-archived-repo.md
git commit -m "feat(schema): add githubRepo field to works collection for archive tracking"
```

---

### Task 2: Apply to personal site

**Files (personal-site):**
- Modify: `src/content.config.ts`
- Create: `src/data/works/sqloutbox-archived.md` (real archived repo entry for your site)

- [ ] **Step 1: Apply the same schema change to personal-site**

```bash
# Copy updated content.config.ts from template — but personal-site has custom content types,
# so patch manually instead of copying.
```

In `/Users/sandeep.yadav/tmp/personal-site/src/content.config.ts`, add after the `status` field:

```ts
      githubRepo: z.string().optional(),
```

- [ ] **Step 2: Create a real archived repo entry for personal site**

Create `/Users/sandeep.yadav/tmp/personal-site/src/data/works/sqloutbox-archived.md`:

```md
---
title: "sqloutbox"
type: oss
status: archived
pubDatetime: 2024-03-01T00:00:00Z
description: "Transactional outbox pattern for SQLAlchemy — reliable event publishing from relational databases without distributed transactions."
tags: [python, sqlalchemy, outbox, messaging, open-source]
tech: [Python, SQLAlchemy, PostgreSQL, PyPI]
githubRepo: "sandeepyadav1478/sqloutbox"
links:
  - label: "GitHub"
    url: "https://github.com/sandeepyadav1478/sqloutbox"
  - label: "PyPI"
    url: "https://pypi.org/project/sqloutbox/"
---
Built to solve reliable event publishing from SQLAlchemy-based applications using the transactional outbox pattern — ensuring events are never lost even when the message broker is temporarily unavailable.
```

- [ ] **Step 3: Run build in personal-site**

```bash
cd /Users/sandeep.yadav/tmp/personal-site && pnpm run build 2>&1 | grep -c "error TS"
```

Expected: `0`

- [ ] **Step 4: Commit personal-site changes**

```bash
cd /Users/sandeep.yadav/tmp/personal-site
git add src/content.config.ts src/data/works/sqloutbox-archived.md
git commit -m "feat(content): add githubRepo schema field + sqloutbox archived repo entry"
```

- [ ] **Step 5: Push both repos**

```bash
git -C /Users/sandeep.yadav/tmp/sora push origin main
git -C /Users/sandeep.yadav/tmp/personal-site push origin main
```
