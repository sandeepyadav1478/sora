# Sora — Requirements & Optional Dependencies

## Core (required)

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22+ | https://nodejs.org |
| pnpm | 10.11.1 | `npm install -g pnpm` |

## GitHub Actions Secrets

Set these in your repo → Settings → Secrets → Actions:

| Secret | Required | Purpose |
|--------|----------|---------|
| `WAKATIME_API_KEY` | Optional | WakaTime coding stats (auth endpoint) |
| `GH_READ_TOKEN` | Optional | GitHub private repo events |

Both are opt-in — the sync still runs without them, just skips those data sources.

## Optional: LinkedIn MCP Server

Used to fetch LinkedIn profile data locally via `npm run fetch:linkedin`.

**Requires:**
- [uv](https://docs.astral.sh/uv/) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- A LinkedIn account

**One-time setup:**
```bash
uvx mcp-server-linkedin@latest --login
```
This opens a browser window — log in to LinkedIn. Session saved to `~/.linkedin-mcp/`.

**Fetch fresh data:**
```bash
npm run fetch:linkedin
git add src/data/linkedin-cache.json
git commit -m "chore: refresh linkedin data"
git push
```

The `linkedin-cache.json` file is committed to your personal repo (it's your public profile data).
The session cookies stay on your local machine only — never committed.

**Re-auth:** Not needed as long as LinkedIn is open in your browser.
The `--auto-import` flag silently reuses your active Chrome/Brave/Arc session.
If session expires: `uvx mcp-server-linkedin@latest --login` (one-time).

## Scripts Reference

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start local dev server |
| `pnpm build` | Build for production |
| `pnpm test:sync` | Run adapter tests |
| `pnpm sync:sources` | Fetch all source data manually |
| `pnpm fetch:linkedin` | Fetch LinkedIn profile data (requires uv + login) |
| `pnpm format` | Auto-format all files |
| `pnpm lint` | Run ESLint |
