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
  codeforces: {
    enabled: false, // forker: set true + fill handle
    handle: "", // Codeforces handle, e.g. "tourist"
    maxRatings: 50, // latest rating changes kept (active users have ~300+)
  },
  pypi: {
    enabled: false, // forker: set true + fill handle
    handle: "", // PyPI project name, e.g. "requests"
    maxPackages: 25, // releases kept (this adapter emits the latest release)
  },
  npm: {
    enabled: false, // forker: set true + add package names
    packages: [], // e.g. ["your-package"] — npm package names you publish
    maxPackages: 25, // latest releases kept
  },
  rss: {
    enabled: false, // forker: set true + add at least one feed URL
    feeds: [], // e.g. ["https://overreacted.io/rss.xml", "https://blog.rust-lang.org/feed.xml"]
    maxPosts: 50, // newest posts kept across ALL feeds combined
  },
  youtube: {
    enabled: false, // forker: set true + fill handle
    handle: "", // YouTube CHANNEL id, must start with "UC…" (NOT an @handle). Find it via the channel page source / a UC-id lookup.
    maxVideos: 15, // latest videos kept in the feed
  },
  stackoverflow: {
    enabled: false, // forker: set true + fill handle
    handle: "", // Stack Overflow NUMERIC user id, e.g. "22656" (from your profile URL /users/<id>/...)
    maxPosts: 25, // latest answers kept in the feed
  },
  bluesky: {
    enabled: false, // forker: set true + fill handle
    handle: "", // Bluesky handle or DID, e.g. "bsky.app" (no @)
    maxPosts: 25, // latest original posts kept (reposts + replies excluded)
  },
  // Plan 2 adds: mastodon, wakatime, huggingface
  // Plan 3 adds: manual, issueOnFailure
};
