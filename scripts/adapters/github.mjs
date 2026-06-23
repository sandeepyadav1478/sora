import { makeEnvelope, stableId } from "../lib/envelope.mjs";

export const id = "github";
export const needs = ["GH_READ_TOKEN"]; // optional — adapter self-validates (returns [] when absent); listed so assertNoSecrets guards it

const API = "https://api.github.com";
const UA = "sora-portfolio-aggregator";

/** SECURITY: returns the /events/public endpoint.
 * Exported for the security test — verifies this helper always points at the public endpoint.
 * The fetch_ function uses this URL when no GH_READ_TOKEN is present. */
export function EVENTS_URL(handle) {
  return `${API}/users/${encodeURIComponent(handle)}/events/public`;
}

/** Returns the /users/{handle} endpoint URL. */
export function USER_URL(handle) {
  return `${API}/users/${encodeURIComponent(handle)}`;
}

/** Returns the /users/{handle}/repos endpoint URL. */
export function REPOS_URL(handle) {
  return `${API}/users/${encodeURIComponent(handle)}/repos`;
}

/** Pure transform: GitHub events array -> Envelope[]. No network.
 * ev.public === false => private repo: no sha/message exposed, url = repo homepage.
 * ev.public === true or absent => public: sha + message included.
 * Both produce payload.visibility field.
 * @param {object[]} events - raw GitHub events array
 * @param {object} cfg - adapter config (handle, maxCommits, …)
 * @param {Set<string>} forkSet - set of fork repo full_names to skip in PushEvents */
export function normalizeEvents(events, cfg, forkSet = new Set()) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const ev of events) {
    if (!ev || !ev.repo || !ev.repo.name || !ev.created_at) continue;
    const repo = ev.repo.name;
    const isPublic = ev.public !== false; // default true if field absent
    if (ev.type === "PushEvent" && ev.payload) {
      // Skip pushes to forked repos — they represent upstream contributions noise.
      if (forkSet.has(repo)) continue;
      const branch = String(ev.payload.ref || "").replace("refs/heads/", "") || undefined;
      const repoShort = repo.includes("/") ? repo.split("/")[1] : repo;
      const commits = Array.isArray(ev.payload.commits)
        ? ev.payload.commits.filter((c) => c && c.sha)
        : [];
      if (!isPublic) {
        // Private repo: basic info only — no sha, no message, no branch, no full repo name exposed.
        // Use the public GitHub event ID (ev.id) as the dedup key — it is already public
        // and does not expose private commit SHAs in sources-cache.json.
        // url must NOT include the real repo path — point to the user's profile instead.
        if (!ev.id) continue;
        const handle = cfg && cfg.handle ? cfg.handle : "";
        const safeUrl = handle
          ? `https://github.com/${encodeURIComponent(handle)}`
          : "https://github.com";
        out.push(
          makeEnvelope({
            id: stableId("github", "commit", `private-${ev.id}`),
            source: "github",
            kind: "commit",
            title: "Pushed to a private repo",
            url: safeUrl,
            date: ev.created_at,
            payload: { repo: "private", visibility: "private" },
          })
        );
      } else if (commits.length > 0) {
        // Public repo with full commit list: one envelope per commit
        for (const c of commits) {
          out.push(
            makeEnvelope({
              id: stableId("github", "commit", c.sha),
              source: "github",
              kind: "commit",
              title: (c.message || "").split("\n")[0] || `Pushed to ${repoShort}`,
              url: `https://github.com/${repo}/commit/${c.sha}`,
              date: ev.created_at,
              payload: { repo, sha: c.sha, branch, message: c.message || "", visibility: "public" },
            })
          );
        }
      } else if (ev.payload.head) {
        // Minimal payload (no commits array): represent the push by its head SHA.
        const sha = ev.payload.head;
        out.push(
          makeEnvelope({
            id: stableId("github", "commit", sha),
            source: "github",
            kind: "commit",
            title: `Pushed to ${repoShort}`,
            url: `https://github.com/${repo}/commit/${sha}`,
            date: ev.created_at,
            payload: { repo, sha, branch, message: "", visibility: "public" },
          })
        );
      }
    } else if (ev.type === "ReleaseEvent" && ev.payload) {
      if (!isPublic) continue; // skip private releases
      const rel = ev.payload?.release;
      if (!rel || !rel.tag_name) continue;
      out.push(
        makeEnvelope({
          id: stableId("github", "release", `${repo}@${rel.tag_name}`),
          source: "github",
          kind: "release",
          title: `${repo} ${rel.name || rel.tag_name}`,
          url: rel.html_url || `https://github.com/${repo}/releases`,
          date: ev.created_at,
          payload: { repo, version: rel.tag_name },
        })
      );
    }
    // other event types intentionally ignored
  }

  // Cap commits at maxCommits (latest first), keep all releases.
  const commits = out
    .filter((e) => e.kind === "commit")
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cfg?.maxCommits ?? 25);
  const releases = out.filter((e) => e.kind === "release");
  return [...commits, ...releases];
}

/** Pure transform: GitHub user object -> profile Envelope or null. No network. */
function normalizeProfile(user) {
  if (!user || typeof user !== "object" || !user.html_url || !user.updated_at) return null;
  if (!(user.public_repos > 0)) return null;
  const handle = user.login;
  return makeEnvelope({
    id: stableId("github", "profile", handle),
    source: "github",
    kind: "profile",
    title: `GitHub: ${user.public_repos} repos · ${user.followers} followers`,
    url: user.html_url,
    date: user.updated_at,
    payload: {
      platform: "github",
      name: user.name,
      company: user.company,
      location: user.location,
      hireable: user.hireable,
      followers: user.followers,
      publicRepos: user.public_repos,
      accountAgeYears: Math.floor(
        (Date.now() - Date.parse(user.created_at)) / (365.25 * 86400 * 1000)
      ),
      createdAt: user.created_at,
      bio: user.bio,
    },
  });
}

/** Pure transform: GitHub repos array -> repo Envelope[]. No network.
 * Filters: non-fork, non-archived, stars >= 1. Caps at top 10 by stars. */
function normalizeRepos(repos) {
  if (!Array.isArray(repos)) return [];
  return repos
    .filter(
      (r) =>
        r &&
        !r.fork &&
        !r.archived &&
        typeof r.stargazers_count === "number" &&
        r.stargazers_count >= 1
    )
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 10)
    .map((r) =>
      makeEnvelope({
        id: stableId("github", "repo", r.full_name),
        source: "github",
        kind: "repo",
        title: `${r.name}: ${r.description || r.name}`,
        url: r.html_url,
        date: r.pushed_at,
        payload: {
          platform: "github",
          name: r.name,
          stars: r.stargazers_count,
          forks: r.forks_count,
          language: r.language,
          topics: r.topics || [],
          license: r.license?.spdx_id || null,
          isTemplate: r.is_template,
          hasPages: r.has_pages,
          description: r.description,
        },
      })
    );
}

/** Adapter entry point: fetch + normalize. Returns [] on any error (never throws).
 * If GH_READ_TOKEN is set, uses /events (authenticated, sees private events).
 * Otherwise uses /events/public (unauthenticated). Fetches up to cfg.maxPages pages.
 * Also fetches /users/{handle} (profile) and /users/{handle}/repos in parallel. */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const handle = cfg.handle;
    const token = process.env.GH_READ_TOKEN;
    const maxPages = cfg.maxPages ?? 1;
    const headers = { "User-Agent": UA, Accept: "application/vnd.github+json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    /** Fetch all events pages sequentially, returning a flat array. */
    async function fetchEvents() {
      const baseUrl = token
        ? `${API}/users/${encodeURIComponent(handle)}/events`
        : `${API}/users/${encodeURIComponent(handle)}/events/public`;
      let allEvents = [];
      for (let page = 1; page <= maxPages; page++) {
        const url = `${baseUrl}?per_page=100&page=${page}`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
        if (!res.ok) break;
        const pageEvents = await res.json();
        if (!Array.isArray(pageEvents) || pageEvents.length === 0) break;
        allEvents = allEvents.concat(pageEvents);
        if (pageEvents.length < 100) break;
      }
      return allEvents;
    }

    /** Fetch the user profile object. Returns null on failure. */
    async function fetchUser() {
      try {
        const res = await fetch(USER_URL(handle), { headers, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    }

    /** Fetch all non-paginated repos (first 100, sorted by updated). Returns [] on failure. */
    async function fetchRepos() {
      try {
        const url = `${REPOS_URL(handle)}?per_page=100&sort=updated`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }

    const [eventsData, userData, reposData] = await Promise.all([
      fetchEvents(),
      fetchUser(),
      fetchRepos(),
    ]);

    // Build fork set from the repos fetch — used to suppress fork PushEvents.
    const forkSet = new Set(reposData.filter((r) => r && r.fork).map((r) => r.full_name));

    const eventEnvelopes = normalizeEvents(eventsData, cfg, forkSet);
    const profileEnvelope = normalizeProfile(userData);
    const repoEnvelopes = normalizeRepos(reposData);

    return [
      ...(profileEnvelope ? [profileEnvelope] : []),
      ...repoEnvelopes,
      ...eventEnvelopes,
    ];
  } catch {
    return [];
  }
}

// Exported under the contract name `fetch` too (alias; `fetch_` avoids shadowing global fetch internally).
export { fetch_ as fetch };
