# Sora

A clean, open-source portfolio template to showcase your work, achievements, and involvements. Built with [Astro](https://astro.build/) and [Tailwind CSS](https://tailwindcss.com/).

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Astro](https://img.shields.io/badge/Astro-FF5D01?style=for-the-badge&logo=astro&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/github/license/sandeepyadav1478/sora?style=for-the-badge)

## What is Sora?

Sora is a single-page board where you can drop any type of work: open-source contributions, projects, writing, talks, certifications, experience — anything you've done. Click any item to see details in a clean modal popup.

**Not a resume. A showcase.**

## Quick Start (3 steps)

### 1. Use this template

Click **"Use this template"** on GitHub, or:

```bash
git clone https://github.com/sandeepyadav1478/sora.git <your-username>.github.io
cd <your-username>.github.io
pnpm install
```

### 2. Edit one file

Open `src/config.ts` and update:

```typescript
export const SITE = {
  website: "https://<your-username>.github.io/",
  author: "Your Name",
  // ...
};

export const PROFILE = {
  name: "Your Name",
  tagline: "Your one-liner.",
  photo: "/profile-photo.jpg",
};
```

Add your photo to `public/profile-photo.jpg`.

### 3. Add your works

Create markdown files in `src/data/works/`:

```markdown
---
title: "My Open Source Contribution"
type: oss
pubDatetime: 2024-03-15T00:00:00Z
description: "What you did, in one line."
tags: [python, open-source]
links:
  - label: "GitHub"
    url: "https://github.com/..."
organization: "Project Name"
---

Full details here. Markdown supported.
```

**Available types:** `oss` | `project` | `writing` | `talk` | `certification` | `experience`

### Deploy

Push to GitHub. The included GitHub Actions workflow auto-deploys to GitHub Pages.

For `<username>.github.io` deployment:
1. Name your repo `<username>.github.io`
2. Go to repo Settings > Pages > Source: **GitHub Actions**
3. Push to `main` — done.

```bash
pnpm run dev      # local dev server at localhost:4321
pnpm run build    # production build
```

## Features

- **Board-first layout** — your works dominate the page, not resume filler
- **Modal UX** — click any item for details, no page navigation
- **Filter tabs** — browse by type (OSS, Projects, Writing, Talks, etc.)
- **Dark/light mode** — system preference detection
- **Search** — powered by Pagefind
- **SEO optimized** — dynamic OG images, sitemap, RSS feed
- **Fully configurable** — single config file for all personal data
- **Optional sections** — About, Experience, Skills, Contact (toggle on/off)
- **Mobile responsive** — works on all screen sizes

## Optional Sections

By default, only the board is shown. Toggle sections in `src/config.ts`:

```typescript
export const SECTIONS = {
  showAbout: true,       // bio section
  showExperience: true,  // career timeline
  showSkills: true,      // skill tags
  showContact: true,     // contact/socials
};
```

Then fill in the corresponding data in the same file.

## Project Structure

```
src/
├── config.ts              <- Edit this (all your data)
├── data/works/            <- Your work items (markdown)
├── components/            <- UI components
├── pages/                 <- Routes
├── layouts/               <- Page layouts
├── styles/                <- Global CSS
└── scripts/               <- Modal + theme JS
```

## Tech Stack

- [Astro](https://astro.build/) v5
- [Tailwind CSS](https://tailwindcss.com/) v4
- [TypeScript](https://www.typescriptlang.org/)
- [Pagefind](https://pagefind.app/) (static search)
- Native HTML `<dialog>` (modal, zero JS frameworks)

## Credits

Built on top of [AstroPaper](https://github.com/satnaing/astro-paper) by [Sat Naing](https://satnaing.dev).

## License

MIT
