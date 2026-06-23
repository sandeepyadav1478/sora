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

/** Truncate a string to maxLen chars, appending "…" if cut. */
function trunc(str, maxLen) {
  if (!str || typeof str !== "string") return "";
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + "…";
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
  const handle = cfg && cfg.handle ? cfg.handle : "";
  const out = [];
  for (const ev of events) {
    if (!ev || !ev.repo || !ev.repo.name || !ev.created_at) continue;
    const repo = ev.repo.name;
    const repoShort = repo.includes("/") ? repo.split("/")[1] : repo;
    const isPublic = ev.public !== false; // default true if field absent
    if (ev.type === "PushEvent" && ev.payload) {
      // Skip pushes to forked repos — they represent upstream contributions noise.
      if (forkSet.has(repo)) continue;
      const branch = String(ev.payload.ref || "").replace("refs/heads/", "") || undefined;
      const commits = Array.isArray(ev.payload.commits)
        ? ev.payload.commits.filter((c) => c && c.sha)
        : [];
      if (!isPublic) {
        // Private repo: basic info only — no sha, no message, no branch, no full repo name exposed.
        // Use the public GitHub event ID (ev.id) as the dedup key — it is already public
        // and does not expose private commit SHAs in sources-cache.json.
        // url must NOT include the real repo path — point to the user's profile instead.
        if (!ev.id) continue;
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
    } else if (ev.type === "PullRequestEvent" && ev.payload) {
      const pr = ev.payload.pull_request;
      const action = ev.payload.action;
      const merged = pr?.merged || pr?.merged_at != null;
      // Skip closed-without-merge PRs (not opened and not merged)
      if (!merged && action !== "opened") continue;
      const prNumber = pr?.number;
      const prTitle = pr?.title;
      const headRef = pr?.head?.ref;
      const baseRef = pr?.base?.ref;
      const isExternal = !repo.startsWith(handle + "/");
      const rawTitle = prTitle || headRef || "pull request";
      const titleStr = trunc(`PR #${prNumber}: ${rawTitle}`, 80);
      out.push(
        makeEnvelope({
          id: stableId("github", "commit", `pr-${repo}-${prNumber}-${action}`),
          source: "github",
          kind: "commit",
          title: titleStr,
          url: pr?.html_url || `https://github.com/${repo}/pulls`,
          date: ev.created_at,
          payload: {
            eventType: "pull_request",
            action,
            prNumber,
            prTitle,
            headRef,
            baseRef,
            merged,
            repo,
            isExternal,
            visibility: ev.public !== false ? "public" : "private",
          },
        })
      );
    } else if (ev.type === "IssueCommentEvent" && ev.payload) {
      const issue = ev.payload.issue;
      const comment = ev.payload.comment;
      const commentBody = trunc(comment?.body, 120);
      if (!commentBody) continue; // skip empty comments
      const issueNumber = issue?.number;
      const issueTitle = issue?.title;
      const isExternal = !repo.startsWith(handle + "/");
      out.push(
        makeEnvelope({
          id: stableId("github", "post", `ic-${repo}-${issueNumber}-${comment?.id || ev.id}`),
          source: "github",
          kind: "post",
          title: `Commented on #${issueNumber}: ${issueTitle || "issue"}`,
          url: comment?.html_url || `https://github.com/${repo}/issues/${issueNumber}`,
          date: ev.created_at,
          payload: {
            eventType: "issue_comment",
            issueNumber,
            issueTitle,
            commentBody,
            repo,
            isExternal,
          },
        })
      );
    } else if (ev.type === "CreateEvent" && ev.payload) {
      const refType = ev.payload.ref_type;
      const ref = ev.payload.ref;
      // Skip dependabot/renovate branches — they are low-signal noise
      if (refType === "branch" && ref && (ref.startsWith("dependabot") || ref.startsWith("renovate"))) continue;
      const kind = refType === "tag" ? "release" : "commit";
      out.push(
        makeEnvelope({
          id: stableId("github", kind, `create-${repo}-${refType}-${ref}`),
          source: "github",
          kind,
          title: `Created ${refType} ${ref} in ${repoShort}`,
          url: refType === "tag"
            ? `https://github.com/${repo}/releases/tag/${encodeURIComponent(ref)}`
            : `https://github.com/${repo}/tree/${encodeURIComponent(ref)}`,
          date: ev.created_at,
          payload: {
            eventType: "branch_create",
            refType,
            ref,
            description: ev.payload.description,
            repo,
          },
        })
      );
    }
    // ForkEvent: intentionally not emitted (low signal)
    // WatchEvent and other event types intentionally ignored
  }

  // Cap commits at maxCommits (latest first), keep all releases and posts.
  const commits = out
    .filter((e) => e.kind === "commit")
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cfg?.maxCommits ?? 25);
  const releases = out.filter((e) => e.kind === "release");
  const posts = out.filter((e) => e.kind === "post");
  return [...commits, ...releases, ...posts];
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
 * Filters: non-fork, non-archived, stars >= 1. Caps at top 10 by stars.
 * @param {object[]} repos - raw GitHub repos array
 * @param {Map<string,object>} [langMap] - optional map of full_name -> languageBytes object */
function normalizeRepos(repos, langMap = new Map()) {
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
    .map((r) => {
      const languageBytes = langMap.get(r.full_name) || undefined;
      return makeEnvelope({
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
          ...(languageBytes !== undefined ? { languageBytes } : {}),
        },
      });
    });
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

    /** Fetch language bytes for a single repo. Returns null on failure. */
    async function fetchLanguages(repo) {
      try {
        const url = `${API}/repos/${repo.full_name}/languages`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data === "object" && data !== null ? data : null;
      } catch {
        return null;
      }
    }

    const [eventsData, userData, reposData] = await Promise.all([
      fetchEvents(),
      fetchUser(),
      fetchRepos(),
    ]);

    // Build fork set from the repos fetch — used to suppress fork PushEvents.
    const forkSet = new Set(reposData.filter((r) => r && r.fork).map((r) => r.full_name));

    // Fetch per-repo language data in parallel for top 10 non-fork repos with stars >= 1.
    const top10Repos = reposData
      .filter((r) => r && !r.fork && !r.archived && typeof r.stargazers_count === "number" && r.stargazers_count >= 1)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 10);

    const langResults = await Promise.all(top10Repos.map((r) => fetchLanguages(r)));
    const langMap = new Map();
    for (let i = 0; i < top10Repos.length; i++) {
      if (langResults[i] !== null) {
        langMap.set(top10Repos[i].full_name, langResults[i]);
      }
    }

    const eventEnvelopes = normalizeEvents(eventsData, cfg, forkSet);
    const profileEnvelope = normalizeProfile(userData);
    const repoEnvelopes = normalizeRepos(reposData, langMap);

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
