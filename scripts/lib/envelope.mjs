// Envelope: the thin, source-agnostic shape every item shares (spec §5).
// Depth lives in `payload`, discriminated by `kind`.

/** Allowed item kinds. */
export const KINDS = ["commit", "release", "post", "video", "package", "rating", "badge"];

/**
 * Build a validated envelope. Throws if a required field is missing —
 * adapters must produce complete envelopes (they catch their own errors and return []).
 * @returns {object} envelope
 */
export function makeEnvelope({ id, source, kind, title, url, date, projectSlug, payload }) {
  if (!id || !source || !kind || !title || !url || !date) {
    throw new Error(`makeEnvelope: missing required field in ${JSON.stringify({ id, source, kind, title, url, date })}`);
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
