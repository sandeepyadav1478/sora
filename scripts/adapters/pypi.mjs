import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";

export const id = "pypi";
export const needs = []; // zero-secret: the public PyPI JSON API

/** PyPI JSON endpoint for a project's latest release metadata. */
export function PYPI_URL(name) {
  return `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
}

/** Pure transform: a PyPI /pypi/<name>/json response -> Envelope[]. No network.
 *  Emits exactly one `package` envelope for the current release (info.version).
 *  GOTCHA: releases{} keys are lexicographic — we always use info.version, never a
 *  sorted key. Files live in the top-level urls[]; if that's empty there is no upload
 *  time to date the release, so we skip rather than throw in makeEnvelope. */
export function normalizePackage(raw, cfg) {
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

  const env = makeEnvelope({
    id: stableId("pypi", "package", `${name}@${version}`),
    source: "pypi",
    kind: "package",
    title: `${name} ${version}`,
    url,
    date,
    // OMIT downloads (API reports -1). Keep payload minimal + stable.
    payload: { registry: "pypi", version },
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
    const raw = await fetchJson(PYPI_URL(cfg.handle));
    return normalizePackage(raw, cfg);
  } catch {
    return [];
  }
}

// Contract alias: exported as `fetch` too (fetch_ avoids shadowing global fetch).
export { fetch_ as fetch };
