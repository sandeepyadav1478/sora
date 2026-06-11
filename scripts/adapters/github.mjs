import { makeEnvelope, stableId } from "../lib/envelope.mjs";

export const id = "github";
export const needs = []; // zero-secret: unauthenticated /events/public

const API = "https://api.github.com";
const UA = "sora-portfolio-aggregator";

/** SECURITY: only ever the /events/public endpoint. Never the unsuffixed /events. */
export function EVENTS_URL(handle) {
  return `${API}/users/${encodeURIComponent(handle)}/events/public`;
}

/** Pure transform: GitHub events array -> Envelope[]. No network. */
export function normalizeEvents(events, cfg) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const ev of events) {
    if (!ev || !ev.repo || !ev.created_at) continue;
    const repo = ev.repo.name;
    if (ev.type === "PushEvent" && ev.payload && Array.isArray(ev.payload.commits)) {
      const branch = String(ev.payload.ref || "").replace("refs/heads/", "") || undefined;
      for (const c of ev.payload.commits) {
        if (!c || !c.sha) continue;
        out.push(
          makeEnvelope({
            id: stableId("github", "commit", c.sha),
            source: "github",
            kind: "commit",
            title: (c.message || "").split("\n")[0] || "commit",
            url: `https://github.com/${repo}/commit/${c.sha}`,
            date: ev.created_at,
            payload: { repo, sha: c.sha, branch, message: c.message || "" },
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

/** Adapter entry point: fetch + normalize. Returns [] on any error (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const url = EVENTS_URL(cfg.handle);
    if (!url.endsWith("/events/public")) throw new Error("refusing non-public events endpoint");
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GitHub events HTTP ${res.status}`);
    const events = await res.json();
    return normalizeEvents(events, cfg);
  } catch {
    return [];
  }
}

// Exported under the contract name `fetch` too (alias; `fetch_` avoids shadowing global fetch internally).
export { fetch_ as fetch };
