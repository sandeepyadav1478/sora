import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";

export const id = "pypi";
export const needs = []; // zero-secret: the public PyPI JSON API

/** PyPI JSON endpoint for a project's latest release metadata. */
export function PYPI_URL(name) {
  return `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
}

/** PyPI Stats endpoint for recent download counts. */
export function PYPISTATS_RECENT_URL(pkg) {
  return `https://pypistats.org/api/packages/${encodeURIComponent(pkg)}/recent`;
}

/** PyPI Stats endpoint for overall daily downloads (last 180 days). */
export function PYPISTATS_OVERALL_URL(pkg) {
  return `https://pypistats.org/api/packages/${encodeURIComponent(pkg)}/overall?mirrors=false`;
}

/** PyPI Stats endpoint for downloads broken down by Python minor version. */
export function PYPISTATS_PYTHON_URL(pkg) {
  return `https://pypistats.org/api/packages/${encodeURIComponent(pkg)}/python_minor`;
}

/** PyPI Stats endpoint for downloads broken down by OS/system. */
export function PYPISTATS_SYSTEM_URL(pkg) {
  return `https://pypistats.org/api/packages/${encodeURIComponent(pkg)}/system`;
}

// Keep the old name as an alias for backward compatibility with existing tests.
export const PYPISTATS_URL = PYPISTATS_RECENT_URL;

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

/** Pure transform: a PyPI /pypi/<name>/json response + optional pypistats responses
 *  -> Envelope[]. No network.
 *  Emits exactly one `package` envelope for the current release (info.version).
 *  Skips packages with < 10 monthly downloads when stats are available.
 *  GOTCHA: releases{} keys are lexicographic — we always use info.version, never a
 *  sorted key. Files live in the top-level urls[]; if that's empty there is no upload
 *  time to date the release, so we skip rather than throw in makeEnvelope. */
export function normalizePackage(raw, cfg, statsRaw, overallRaw, pythonRaw, systemRaw) {
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

  // --- download stats from pypistats /recent ---
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

  // --- overall download time series (pypistats /overall?mirrors=false) ---
  if (overallRaw && Array.isArray(overallRaw.data) && overallRaw.data.length > 0) {
    // Filter to category "without_mirrors" and valid date+downloads entries.
    const seriesRows = overallRaw.data.filter(
      (row) =>
        row &&
        typeof row.date === "string" &&
        typeof row.downloads === "number" &&
        row.category === "without_mirrors"
    );

    if (seriesRows.length > 0) {
      // Sort descending by date and cap at 90 entries.
      const sorted = seriesRows
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 90);

      payload.downloadSeries = sorted.map((r) => ({ date: r.date, downloads: r.downloads }));

      // totalDownloads: sum of all downloads in the capped series.
      payload.totalDownloads = payload.downloadSeries.reduce(
        (sum, r) => sum + r.downloads,
        0
      );

      // peakDay: entry with highest downloads.
      const peak = payload.downloadSeries.reduce(
        (best, r) => (r.downloads > best.downloads ? r : best),
        payload.downloadSeries[0]
      );
      payload.peakDay = { date: peak.date, downloads: peak.downloads };

      // trend7d: avg last 7 vs prev 7 days (most recent first due to desc sort).
      const last7 = payload.downloadSeries.slice(0, 7);
      const prev7 = payload.downloadSeries.slice(7, 14);
      if (last7.length > 0) {
        const avg7 = last7.reduce((s, r) => s + r.downloads, 0) / last7.length;
        const avgPrev7 =
          prev7.length > 0
            ? prev7.reduce((s, r) => s + r.downloads, 0) / prev7.length
            : 0;
        payload.trend7d = { avg7d: avg7, avgPrev7d: avgPrev7 };
      }
    }
  }

  // --- python version breakdown (pypistats /python_minor) ---
  if (pythonRaw && Array.isArray(pythonRaw.data) && pythonRaw.data.length > 0) {
    // Aggregate downloads by python version (category), summing all dates.
    const versionMap = new Map();
    for (const row of pythonRaw.data) {
      if (
        row &&
        typeof row.category === "string" &&
        typeof row.downloads === "number"
      ) {
        versionMap.set(row.category, (versionMap.get(row.category) || 0) + row.downloads);
      }
    }
    if (versionMap.size > 0) {
      payload.pythonVersions = Array.from(versionMap.entries())
        .map(([version, downloads]) => ({ version, downloads }))
        .sort((a, b) => b.downloads - a.downloads);
    }
  }

  // --- OS/system breakdown (pypistats /system) ---
  if (systemRaw && Array.isArray(systemRaw.data) && systemRaw.data.length > 0) {
    // Aggregate downloads by OS (category), summing all dates. Exclude "null" category.
    const osMap = new Map();
    for (const row of systemRaw.data) {
      if (
        row &&
        typeof row.category === "string" &&
        row.category !== "null" &&
        typeof row.downloads === "number"
      ) {
        osMap.set(row.category, (osMap.get(row.category) || 0) + row.downloads);
      }
    }
    if (osMap.size > 0) {
      payload.osByDownloads = Array.from(osMap.entries())
        .map(([os, downloads]) => ({ os, downloads }))
        .sort((a, b) => b.downloads - a.downloads);
    }
  }

  // --- extra fields from pypi.org JSON ---

  // releaseHistory: all versions with their earliest upload date and size.
  if (releaseCount > 0) {
    const historyEntries = [];
    for (const [ver, fileList] of Object.entries(releases)) {
      if (!Array.isArray(fileList) || fileList.length === 0) continue;
      const uploadTimes = fileList
        .map((f) => f && f.upload_time_iso_8601)
        .filter((t) => typeof t === "string" && t.length > 0);
      if (uploadTimes.length === 0) continue;
      const uploadDate = uploadTimes.slice().sort()[0];
      // size = sum of file sizes for this version.
      const size = fileList.reduce(
        (sum, f) => sum + (f && typeof f.size === "number" ? f.size : 0),
        0
      );
      historyEntries.push({ version: ver, uploadDate, size });
    }
    if (historyEntries.length > 0) {
      historyEntries.sort((a, b) => (a.uploadDate < b.uploadDate ? 1 : a.uploadDate > b.uploadDate ? -1 : 0));
      payload.releaseHistory = historyEntries;
    }
  }

  // allClassifiers: full list of classifiers.
  if (classifiers.length > 0) {
    payload.allClassifiers = classifiers;
  }

  // requiresDist: dependency list from info.requires_dist.
  if (Array.isArray(info.requires_dist) && info.requires_dist.length > 0) {
    payload.requiresDist = info.requires_dist;
  }

  // vulnerabilities: count from top-level vulnerabilities array (0 = no known CVEs).
  const vulns = Array.isArray(raw.vulnerabilities) ? raw.vulnerabilities : [];
  payload.vulnerabilities = vulns.length;

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
    const name = cfg.handle;
    const [pypiRaw, statsRaw, overallRaw, pythonRaw, systemRaw] = await Promise.all([
      fetchJson(PYPI_URL(name)),
      fetchJson(PYPISTATS_RECENT_URL(name)).catch(() => null),
      fetchJson(PYPISTATS_OVERALL_URL(name)).catch(() => null),
      fetchJson(PYPISTATS_PYTHON_URL(name)).catch(() => null),
      fetchJson(PYPISTATS_SYSTEM_URL(name)).catch(() => null),
    ]);
    return normalizePackage(pypiRaw, cfg, statsRaw, overallRaw, pythonRaw, systemRaw);
  } catch {
    return [];
  }
}

// Contract alias: exported as `fetch` too (fetch_ avoids shadowing global fetch).
export { fetch_ as fetch };
