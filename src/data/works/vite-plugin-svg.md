---
title: "vite-plugin-svg-sprite — Vite Plugin"
type: oss
pubDatetime: 2024-09-05T00:00:00Z
description: "A Vite plugin that generates optimized SVG sprites from icon files. 800+ weekly downloads on npm."
tags: [vite, svg, plugin, open-source, typescript]
links:
  - label: "npm"
    url: "https://npmjs.com"
  - label: "Source Code"
    url: "https://github.com/johndoe/vite-plugin-svg-sprite"
image: "https://vitejs.dev/logo-with-shadow.png"
---

Built and maintain a Vite plugin that automatically generates SVG sprites from individual icon files at build time.

## Why I Built This

Existing SVG solutions for Vite either inlined every SVG (bloating the bundle) or required manual sprite creation. This plugin automates the entire workflow.

## How It Works

1. Drop SVG files in a designated folder
2. Plugin generates an optimized sprite sheet at build time
3. Use icons via `<use href="#icon-name" />`
4. Tree-shaking removes unused icons

```typescript
// vite.config.ts
import svgSprite from "vite-plugin-svg-sprite";

export default {
  plugins: [
    svgSprite({ iconDir: "src/icons" }),
  ],
};
```

## Traction

- 800+ weekly downloads on npm
- 45 GitHub stars
- Used by 3 component libraries
- Zero open bugs
