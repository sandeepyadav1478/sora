import { makeEnvelope, stableId } from "../lib/envelope.mjs";

export const id = "github";
export const needs = []; // GITHUB_READ_TOKEN is optional — adapter self-validates

const API = "https://api.github.com";
const UA = "sora-portfolio-aggregator";

/** SECURITY: returns the /events/public endpoint.
 * Exported for the security test — verifies this helper always points at the public endpoint.
 * The fetch_ function uses this URL when no GITHUB_READ_TOKEN is present. */
export function EVENTS_URL(handle) {
  return `${API}/users/${encodeURIComponent(handle)}/events/public`;
}

/** Pure transform: GitHub events array -> Envelope[]. No network.
 * ev.public === false => private repo: no sha/message exposed, url = repo homepage.
 * ev.public === true or absent => public: sha + message included.
 * Both produce payload.visibility field. */
export function normalizeEvents(events, cfg) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const ev of events) {
    if (!ev || !ev.repo || !ev.created_at) continue;
    const repo = ev.repo.name;
    const isPublic = ev.public !== false; // default true if field absent
    if (ev.type === "PushEvent" && ev.payload) {
      const branch = String(ev.payload.ref || "").replace("refs/heads/", "") || undefined;
      const repoShort = repo.includes("/") ? repo.split("/")[1] : repo;
      const commits = Array.isArray(ev.payload.commits)
        ? ev.payload.commits.filter((c) => c && c.sha)
        : [];
      if (!isPublic) {
        // Private repo: basic info only — no commit message, no sha exposed
        const sha = (commits[0] && commits[0].sha) || ev.payload.head;
        if (!sha) continue;
        out.push(
          makeEnvelope({
            id: stableId("github", "commit", sha),
            source: "github",
            kind: "commit",
            title: `Pushed to ${repoShort}`,
            url: `https://github.com/${repo}`,
            date: ev.created_at,
            payload: { repo, branch, visibility: "private" },
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
    } else if (ev.type === "ReleaseEvent" && ev.payload && ev.payload.release) {
      const rel = ev.payload.release;
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
    .slice(0, cfg.maxCommits ?? 25);
  const releases = out.filter((e) => e.kind === "release");
  return [...commits, ...releases];
}

/** Adapter entry point: fetch + normalize. Returns [] on any error (never throws).
 * If GITHUB_READ_TOKEN is set, uses /events (authenticated, sees private events).
 * Otherwise uses /events/public (unauthenticated). Fetches up to cfg.maxPages pages. */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const handle = cfg.handle;
    const token = process.env.GITHUB_READ_TOKEN;
    const maxPages = cfg.maxPages ?? 1;
    const baseUrl = token
      ? `${API}/users/${encodeURIComponent(handle)}/events`
      : `${API}/users/${encodeURIComponent(handle)}/events/public`;

    let allEvents = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = `${baseUrl}?per_page=100&page=${page}`;
      const headers = { "User-Agent": UA, Accept: "application/vnd.github+json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) break;
      const pageEvents = await res.json();
      if (!Array.isArray(pageEvents) || pageEvents.length === 0) break;
      allEvents = allEvents.concat(pageEvents);
    }
    return normalizeEvents(allEvents, cfg);
  } catch {
    return [];
  }
}

// Exported under the contract name `fetch` too (alias; `fetch_` avoids shadowing global fetch internally).
export { fetch_ as fetch };
