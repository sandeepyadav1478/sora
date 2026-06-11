const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

export function decodeEntities(s = "") {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => (name in NAMED ? NAMED[name] : m));
}

export function stripCdata(s = "") {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Tags -> SPACE (never concatenate words), then collapse whitespace. */
export function stripHtml(s = "") {
  return decodeEntities(stripCdata(s).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export function truncate(s = "", n = 80) {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

/** First sentence / ~80 chars. NEVER returns empty — falls back so makeEnvelope's title check passes. */
export function synthTitle(text, fallback) {
  const clean = stripHtml(String(text || "")).trim();
  if (!clean) return fallback;
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0];
  return truncate(firstSentence || clean, 80);
}
