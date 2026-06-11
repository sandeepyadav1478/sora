// SOURCES — single source of truth for the content aggregator.
// Plain JS so BOTH the Node orchestrator (scripts/) and Astro (via config.ts) can import it.
// The template ships every source OFF / blank. A forker fills in handles to enable.
// SECURITY: this repo is public. Never put secrets here — only public handles.
export const SOURCES = {
  github: {
    enabled: false, // forker: set true + fill handle
    handle: "", // GitHub username, e.g. "octocat"
    maxCommits: 25, // latest activity items kept in the feed
  },
  pypi: {
    enabled: false, // forker: set true + fill handle
    handle: "", // PyPI project name, e.g. "requests"
    maxPackages: 25, // releases kept (this adapter emits the latest release)
  },
  // Plan 2 adds: npm, rss, bluesky, mastodon, youtube, codeforces, wakatime, huggingface, stackoverflow
  // Plan 3 adds: manual, issueOnFailure
};
