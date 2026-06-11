/** Unix SECONDS -> ISO. (Codeforces, StackOverflow return seconds; the missing *1000 silently yields a 1970 date.) */
export function toIso(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString();
}

/** Parse a date string -> ISO, or null if unparseable (guard before makeEnvelope, which throws on bad dates). */
export function safeIso(str) {
  if (!str) return null;
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
