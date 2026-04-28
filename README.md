<p align="center">
  <img src="public/favicon.svg" width="60" alt="Sora logo" />
</p>

<h1 align="center">Sora</h1>

<p align="center">
  <strong>A clean, open-source portfolio template to showcase your life's work.</strong><br/>
  Built with Astro v5 &middot; Tailwind CSS v4 &middot; TypeScript &middot; Zero JS frameworks
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Astro-v5-FF5D01?style=flat-square&logo=astro&logoColor=white" alt="Astro" />
  <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/TypeScript-strict-007ACC?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/github/license/sandeepyadav1478/sora?style=flat-square" alt="License" />
</p>

<br/>

> **Not a resume. A showcase.**
>
> A single-page board where you can drop any type of work — open-source contributions,
> projects, writing, talks, certifications, conferences, hackathons — anything you've done.
> Click any item for details in a rich modal popup.

<br/>

---

<br/>

## Quick Start

```bash
# 1. Clone
git clone https://github.com/sandeepyadav1478/sora.git my-portfolio
cd my-portfolio && pnpm install

# 2. Edit one file — all personal data lives here
open src/config.ts

# 3. Add your works as markdown files
ls src/data/works/   # delete samples, add yours

# 4. Deploy
git push   # GitHub Actions auto-deploys
```

Drop your photo at `public/profile-photo.jpg` and you're live.

<br/>

## Documentation

**Full interactive docs with live visual demos →** see the `/docs` page on your dev server:

```bash
pnpm run dev
# Open http://localhost:4321/docs
```

The docs page shows:
- All 4 board layouts with visual previews
- All 13 card styles rendered live
- All 7 tech stack display styles
- Work type badges with color demos
- Modal feature reference
- Complete frontmatter field table
- Theming guide with color swatches
- File structure & deployment steps

> The `/docs` page only exists while `isTemplate: true` in config. Set it to `false` when you're done customizing and it disappears from your production site.

<br/>

## Features

- **Board-first layout** — 4 layouts: two-tier, flat, grid, timeline
- **Modal UX** — click any item for rich detail view with galleries, timelines, metrics
- **13 card styles** — glass, neon, holographic, neumorphic, spotlight, noise, terminal, newspaper, gradient, elevated, outlined, accent-bar, default
- **9 work types** — OSS, project, writing, talk, cert, experience, conference, hackathon, meetup
- **Filter tabs** — browse by type
- **Dark/light mode** — system preference detection + toggle
- **Search** — Pagefind (static, no server)
- **SEO** — dynamic OG images, structured data, sitemap, RSS
- **Single config file** — all personal data in one place
- **Semantic CSS** — retheme by editing one CSS file
- **Optional sections** — experience, skills, contact, about, booking page

<br/>

## What You Edit

| File | Purpose |
|---|---|
| `src/config.ts` | All personal data & settings |
| `src/data/works/*.md` | Your work items (markdown) |
| `public/` | Profile photo, favicon, images |
| `src/styles/global.css` | Visual customization (optional) |

<br/>

## Commands

```bash
pnpm run dev       # dev server at localhost:4321
pnpm run build     # production build
pnpm run preview   # preview build locally
```

<br/>

## Deploy

Push to GitHub. The included workflow auto-deploys to GitHub Pages.

1. Name repo `<username>.github.io`
2. Settings → Pages → Source: **GitHub Actions**
3. Push to `main` — done

Also works with Vercel, Netlify, Cloudflare Pages (build: `pnpm run build`, output: `dist`).

<br/>

## Credits

Built on [AstroPaper](https://github.com/satnaing/astro-paper) by [Sat Naing](https://satnaing.dev).

## License

MIT
