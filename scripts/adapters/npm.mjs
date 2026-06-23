import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";

export const id = "npm";
export const needs = []; // zero-secret, public registry

/**
 * PURE transform. raw = { registry, downloads } where:
 *   registry  = full https://registry.npmjs.org/<pkg> document
 *   downloads = https://api.npmjs.org/downloads/point/last-month/<pkg>
 *               -> { downloads: <int>, ... } on success, or { error } / undefined
 * Emits ONE package envelope for dist-tags.latest.
 */
export function normalizeNpm(raw, cfg = {}) {
  const reg = raw && raw.registry;
  if (!reg || typeof reg !== "object") return [];

  const distTags = reg["dist-tags"];
  const latest = distTags && distTags.latest;
  if (!latest) return [];

  const versions = reg.versions || {};
  const verObj = versions[latest];
  const name = (verObj && verObj.name) || reg.name;
  if (!name) return [];

  // date = time[version]; skip the created/modified pseudo-entries entirely
  const time = reg.time || {};
  const date = time[latest];
  if (!date) return []; // no real publish timestamp -> nothing to emit

  // optional downloads — separate host may return { error }; guard it
  const dl = raw.downloads;
  const downloads =
    dl && typeof dl.downloads === "number" ? dl.downloads : undefined;

  // Skip packages with < 10 monthly downloads — no meaningful traction yet
  if (typeof downloads === "number" && downloads < 10) return [];

  const payload = { registry: "npm", version: latest };
  if (downloads !== undefined) payload.downloads = downloads;

  const env = makeEnvelope({
    id: stableId("npm", "package", `${name}@${latest}`),
    source: "npm",
    kind: "package",
    title: `${name} ${latest}`,
    url: `https://www.npmjs.com/package/${name}/v/${latest}`,
    date,
    payload,
  });

  // single envelope, but keep the cap/sort discipline uniform with other adapters
  return [env].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, cfg.maxPackages ?? 50);
}

export async function fetch_(cfg = {}) {
  try {
    const pkgs = Array.isArray(cfg.packages) ? cfg.packages : [];
    const out = [];
    for (const name of pkgs) {
      try {
        const enc = encodeURIComponent(name);
        const registry = await fetchJson(`https://registry.npmjs.org/${enc}`);
        // best-effort downloads on the SEPARATE host; never let it break the package
        let downloads;
        try {
          downloads = await fetchJson(
            `https://api.npmjs.org/downloads/point/last-month/${enc}`
          );
        } catch {
          downloads = undefined;
        }
        out.push(...normalizeNpm({ registry, downloads }, cfg));
      } catch {
        // skip this package — don't let one 404 kill all results
        continue;
      }
    }
    return out
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, cfg.maxPackages ?? 50);
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
