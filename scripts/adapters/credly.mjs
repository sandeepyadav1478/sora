import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";
import { safeIso } from "../lib/datetime.mjs";

export const id = "credly";
export const needs = []; // zero-secret: Credly public badges.json requires no auth

export function normalizeCredy(raw, cfg = {}) {
  // Accept bare array OR { data: [...] } wrapper
  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : null;
  if (!items) return [];

  const out = [];
  for (const item of items) {
    if (!item || item.state !== "accepted") continue;

    const bt = item.badge_template;
    if (!bt) continue;

    const title = bt.name && bt.name.trim();
    if (!title) continue;

    const url = item.public_url;
    if (!url || (!url.startsWith("https://") && !url.startsWith("http://"))) continue;

    const date = safeIso(item.issued_at);
    if (!date) continue;

    // Expiry: compute whether this badge has lapsed
    let expired = false;
    if (item.expires_at_date) {
      const exp = Date.parse(item.expires_at_date);
      if (!isNaN(exp) && exp < Date.now()) expired = true;
    }

    if (cfg.includeExpired === false && expired) continue;

    const key = item.id != null ? String(item.id) : url;

    out.push(
      makeEnvelope({
        id: stableId("credly", "badge", key),
        source: "credly",
        kind: "badge",
        title,
        url,
        date,
        payload: {
          issuer: bt.issuer?.name ?? "",
          imageUrl: bt.image_url ?? null,
          description: bt.description ?? "",
          expired,
          expiresAt: item.expires_at_date ?? null,
        },
      })
    );
  }

  return out
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cfg.maxBadges ?? 50);
}

export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const url = `https://www.credly.com/users/${encodeURIComponent(cfg.handle)}/badges.json`;
    const raw = await fetchJson(url);
    return normalizeCredy(raw, cfg);
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
