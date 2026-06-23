// Envelope: the thin, source-agnostic shape every item shares (spec §5).
// Depth lives in `payload`, discriminated by `kind`.

/** Allowed item kinds. */
export const KINDS = [
  "commit",   // git push / commit activity
  "release",  // tagged release
  "post",     // blog post / social post
  "video",    // youtube video
  "package",  // published package (npm, pypi)
  "rating",   // score / stat snapshot (wakatime, leetcode, codeforces, stackoverflow)
  "badge",    // credential / certification (credly, huggingface)
  "repo",     // repository snapshot (github stars, topics, language)
  "profile",  // user profile snapshot (github, huggingface)
];

/**
 * Build a validated envelope. Throws if a required field is missing —
 * adapters must produce complete envelopes (they catch their own errors and return []).
 * @returns {object} envelope
 */
export function makeEnvelope({ id, source, kind, title, url, date, projectSlug, payload }) {
  if (!id || !source || !kind || !title || !url || !date) {
    throw new Error(`makeEnvelope: missing required field in ${JSON.stringify({ id, source, kind, title, url, date })}`);
  }
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    throw new Error(`makeEnvelope: unsafe url scheme "${url.slice(0, 30)}"`);
  }
  if (!KINDS.includes(kind)) {
    throw new Error(`makeEnvelope: unknown kind "${kind}"`);
  }
  if (Number.isNaN(Date.parse(date))) {
    throw new Error(`makeEnvelope: invalid ISO date "${date}"`);
  }
  const env = { id, source, kind, title, url, date, payload: payload ?? {} };
  if (projectSlug) env.projectSlug = projectSlug;
  return env;
}

/** Stable dedup id, e.g. stableId("github","commit","<sha>") -> "github:commit:<sha>". */
export function stableId(source, kind, key) {
  return `${source}:${kind}:${key}`;
}
