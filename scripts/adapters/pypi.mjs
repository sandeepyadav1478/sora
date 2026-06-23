import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";

export const id = "pypi";
export const needs = []; // zero-secret: the public PyPI JSON API

/** PyPI JSON endpoint for a project's latest release metadata. */
export function PYPI_URL(name) {
  return `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
}

/** PyPI Stats endpoint for recent download counts. */
export function PYPISTATS_URL(pkg) {
  return `https://pypistats.org/api/packages/${encodeURIComponent(pkg)}/recent`;
}

/** Extract a classifier value from classifiers array.
 *  e.g. "Development Status :: 4 - Beta" -> "Beta"
 *       "Topic :: System :: Distributed Computing" -> "Distributed Computing" */
function extractClassifier(classifiers, prefix) {
  if (!Array.isArray(classifiers)) return undefined;
  const match = classifiers.find((c) => typeof c === "string" && c.startsWith(prefix + " :: "));
  if (!match) return undefined;
  const rest = match.slice(prefix.length + 4); // strip "prefix :: "
  // For dev status: "4 - Beta" -> "Beta"
  const dashIdx = rest.indexOf(" - ");
  return dashIdx >= 0 ? rest.slice(dashIdx + 3).trim() : rest.trim();
}

/** Pure transform: a PyPI /pypi/<name>/json response + optional pypistats recent response
 *  -> Envelope[]. No network.
 *  Emits exactly one `package` envelope for the current release (info.version).
 *  Skips packages with < 10 monthly downloads when stats are available.
 *  GOTCHA: releases{} keys are lexicographic — we always use info.version, never a
 *  sorted key. Files live in the top-level urls[]; if that's empty there is no upload
 *  time to date the release, so we skip rather than throw in makeEnvelope. */
export function normalizePackage(raw, cfg, statsRaw) {
  if (!raw || typeof raw !== "object") return [];
  const info = raw.info;
  if (!info || typeof info !== "object") return [];

  const name = info.name;
  const version = info.version;
  if (!name || !version) return [];

  // Files for the current release are the top-level urls[] (not releases[version]).
  const files = Array.isArray(raw.urls) ? raw.urls : [];
  const times = files
    .map((f) => f && f.upload_time_iso_8601)
    .filter((t) => typeof t === "string" && t.length > 0);
  if (times.length === 0) return []; // empty release: nothing to date it by

  // date = earliest upload across this release's files (ISO-8601 sorts lexically).
  const date = times.slice().sort()[0];

  // url: prefer the version-specific release_url, fall back to the project page.
  const url = info.release_url || info.package_url;
  if (!url) return [];

  // --- download stats from pypistats ---
  const statsData = statsRaw && statsRaw.data;
  const monthlyDownloads =
    statsData && typeof statsData.last_month === "number" ? statsData.last_month : null;
  const weeklyDownloads =
    statsData && typeof statsData.last_week === "number" ? statsData.last_week : null;

  // Filter: skip packages with very low usage when we have real data.
  if (monthlyDownloads !== null && monthlyDownloads < 10) return [];

  // --- enrich from info fields ---
  const license = info.license || null;

  const rawKeywords =
    typeof info.keywords === "string" && info.keywords.trim().length > 0
      ? info.keywords
          .split(/[,\s]+/)
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

  const requiresPython = info.requires_python || null;

  const releases = raw.releases && typeof raw.releases === "object" ? raw.releases : {};
  const releaseCount = Object.keys(releases).length;

  const classifiers = Array.isArray(info.classifiers) ? info.classifiers : [];

  const topicCategory = (() => {
    if (!classifiers.length) return undefined;
    const topicEntry = classifiers.find(
      (c) => typeof c === "string" && c.startsWith("Topic :: ")
    );
    if (!topicEntry) return undefined;
    // Strip leading "Topic :: " (9 chars) to get the full path, then take last segment.
    const path = topicEntry.slice(9);
    const parts = path.split(" :: ");
    return parts[parts.length - 1].trim();
  })();

  const isTyped = classifiers.some(
    (c) => typeof c === "string" && c === "Typing :: Typed"
  );

  const devStatus = extractClassifier(classifiers, "Development Status");

  // Build payload
  const payload = { registry: "pypi", version };

  if (monthlyDownloads !== null) payload.monthlyDownloads = monthlyDownloads;
  if (weeklyDownloads !== null) payload.weeklyDownloads = weeklyDownloads;
  if (license) payload.license = license;
  if (rawKeywords.length > 0) payload.keywords = rawKeywords;
  if (requiresPython) payload.requiresPython = requiresPython;
  if (releaseCount > 0) payload.releaseCount = releaseCount;
  if (topicCategory) payload.topicCategory = topicCategory;
  payload.isTyped = isTyped;
  if (devStatus) payload.devStatus = devStatus;

  // Build title — include download stats when available.
  const title =
    monthlyDownloads !== null
      ? `${name} ${version} · ${monthlyDownloads} downloads/mo`
      : `${name} ${version}`;

  const env = makeEnvelope({
    id: stableId("pypi", "package", `${name}@${version}`),
    source: "pypi",
    kind: "package",
    title,
    url,
    date,
    payload,
  });

  // One item per fetch; cap is trivially satisfied but kept for contract symmetry.
  return [env]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cfg && cfg.maxPackages ? cfg.maxPackages : 25);
}

/** Adapter entry point: fetch + normalize. Returns [] on any error (never throws).
 *  404 (unknown package) -> fetchJson throws -> caught here -> []. */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const [pypiRaw, statsRaw] = await Promise.all([
      fetchJson(PYPI_URL(cfg.handle)),
      fetchJson(PYPISTATS_URL(cfg.handle)).catch(() => null),
    ]);
    return normalizePackage(pypiRaw, cfg, statsRaw);
  } catch {
    return [];
  }
}

// Contract alias: exported as `fetch` too (fetch_ avoids shadowing global fetch).
export { fetch_ as fetch };
