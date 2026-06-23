import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";
import { safeIso } from "../lib/datetime.mjs";

export const id = "wakatime";
export const needs = ["WAKATIME_API_KEY"]; // secret: WakaTime stats are owner-only (401 without key)

const STATS_URL = (range) =>
  `https://wakatime.com/api/v1/users/current/stats/${encodeURIComponent(range || "last_7_days")}`;

const PUBLIC_STATS_URL = (handle) =>
  `https://wakatime.com/api/v1/users/${encodeURIComponent(handle)}/stats`;

const ALL_TIME_URL = "https://wakatime.com/api/v1/users/current/all_time_since_today";

/** Pure transform: WakaTime stats response -> Envelope[]. No network.
 * Produces a SINGLE self-overwriting `rating` item: the dedup id has NO date
 * (id = wakatime:rating:<range>), so mergeSources REPLACES it each run instead of churning.
 * payload.* fields are PROVISIONAL until confirmed against a real authed response. */
export function normalizeStats(raw, cfg) {
  if (!raw || typeof raw !== "object") return [];
  const d = raw.data;
  if (!d || typeof d !== "object") return [];

  // Skip if less than 1 hour tracked — not worth showing
  if (typeof d.total_seconds === "number" && d.total_seconds < 3600) return [];

  const range = (cfg && cfg.range) || d.range || "last_7_days";
  const human = d.human_readable_total || "some";
  // Prefer the precise full-ISO top-level `end`; fall back to date-only `data.end_date`;
  // finally fall back to the run's generatedAt so makeEnvelope never throws on a missing date.
  const date =
    safeIso(raw.end) ||
    safeIso(d.end_date) ||
    (cfg && cfg.generatedAt) ||
    new Date().toISOString();

  // All languages with percent > 0, not just top 5
  const languages = Array.isArray(d.languages)
    ? d.languages
        .filter((l) => l && l.name && (typeof l.percent !== "number" || l.percent > 0))
        .map((l) => l.name)
    : undefined;

  const payload = {
    platform: "wakatime",
    totalSeconds: typeof d.total_seconds === "number" ? d.total_seconds : undefined,
    humanReadableTotal: d.human_readable_total || undefined,
    range,
  };
  if (typeof d.daily_average === "number") payload.dailyAverage = d.daily_average;
  if (languages && languages.length) payload.languages = languages;

  // best_day
  if (d.best_day && typeof d.best_day === "object") {
    const bd = d.best_day;
    if (bd.date || bd.text || typeof bd.total_seconds === "number") {
      payload.bestDay = {
        date: bd.date || undefined,
        text: bd.text || undefined,
        totalSeconds: typeof bd.total_seconds === "number" ? bd.total_seconds : undefined,
      };
    }
  }

  // editors (range-specific, top 3)
  if (Array.isArray(d.editors) && d.editors.length > 0) {
    const editors = d.editors
      .filter((e) => e && e.name && typeof e.percent === "number" && e.percent > 0)
      .slice(0, 3)
      .map((e) => ({ name: e.name, percent: e.percent }));
    if (editors.length) payload.editors = editors;
  }

  // categories
  if (Array.isArray(d.categories) && d.categories.length > 0) {
    const categories = d.categories
      .filter((c) => c && c.name && typeof c.percent === "number" && c.percent > 0)
      .map((c) => ({ name: c.name, percent: c.percent }));
    if (categories.length) payload.categories = categories;
  }

  return [
    makeEnvelope({
      id: stableId("wakatime", "rating", range), // NO date in key — single self-overwriting item
      source: "wakatime", // explicit per must-fix §3.2
      kind: "rating",
      title: `${human} coding this week`,
      url: (cfg && cfg.profileUrl) || "https://wakatime.com",
      date,
      payload,
    }),
  ];
}

/** Pure transform: WakaTime public stats response -> Envelope[]. No network.
 * Produces a SINGLE self-overwriting `rating` item for all-time public stats.
 * Requires cfg.handle (the WakaTime username). No auth needed.
 */
export function normalizePublicStats(raw, cfg) {
  if (!raw || typeof raw !== "object") return [];
  const d = raw.data;
  if (!d || typeof d !== "object") return [];

  // Must have at least one category with percent > 0
  const categories = Array.isArray(d.categories)
    ? d.categories
        .filter((c) => c && c.name && typeof c.percent === "number" && c.percent > 0)
        .map((c) => ({ name: c.name, percent: c.percent }))
    : [];

  if (categories.length === 0) return [];

  // editors: top 5 filtered to percent > 0.5
  const editors = Array.isArray(d.editors)
    ? d.editors
        .filter((e) => e && e.name && typeof e.percent === "number" && e.percent > 0.5)
        .slice(0, 5)
        .map((e) => ({ name: e.name, percent: e.percent }))
    : [];

  // languages: filtered to percent >= 0.5
  const languages = Array.isArray(d.languages)
    ? d.languages
        .filter((l) => l && l.name && typeof l.percent === "number" && l.percent >= 0.5)
        .map((l) => ({ name: l.name, percent: l.percent }))
    : [];

  // os: filtered to percent > 1
  const os = Array.isArray(d.operating_systems)
    ? d.operating_systems
        .filter((o) => o && o.name && typeof o.percent === "number" && o.percent > 1)
        .map((o) => ({ name: o.name, percent: o.percent }))
    : [];

  // aiCodingPercent: the "AI Coding" category percent
  const aiCategory = categories.find(
    (c) => c.name && c.name.toLowerCase() === "ai coding"
  );
  const aiCodingPercent = aiCategory ? aiCategory.percent : 0;

  const handle = (cfg && cfg.handle) || "unknown";
  const profileUrl = (cfg && cfg.profileUrl) || `https://wakatime.com/@${handle}`;
  const date = (cfg && cfg.generatedAt) || new Date().toISOString();

  const payload = {
    platform: "wakatime",
    subkind: "public",
    categories,
    editors,
    languages,
    os,
    aiCodingPercent,
  };

  return [
    makeEnvelope({
      id: stableId("wakatime", "rating", "public-alltime"),
      source: "wakatime",
      kind: "rating",
      title: `WakaTime all-time stats for @${handle}`,
      url: profileUrl,
      date,
      payload,
    }),
  ];
}

/** Pure transform: WakaTime all-time-since-today response -> Envelope[]. No network. */
function normalizeAllTime(raw, cfg) {
  if (!raw || typeof raw !== "object") return [];
  const d = raw.data;
  if (!d || typeof d !== "object") return [];

  // Only emit if 100+ hours total (360000 seconds)
  if (typeof d.total_seconds !== "number" || d.total_seconds < 360000) return [];

  const handle = (cfg && cfg.handle) || "unknown";
  const profileUrl = (cfg && cfg.profileUrl) || `https://wakatime.com/@${handle}`;
  const date = (cfg && cfg.generatedAt) || new Date().toISOString();

  const payload = {
    platform: "wakatime",
    subkind: "alltime",
    text: d.text || undefined,
    totalSeconds: d.total_seconds,
    startDate: (d.range && d.range.start_date) || undefined,
  };

  return [
    makeEnvelope({
      id: stableId("wakatime", "rating", "all_time"),
      source: "wakatime",
      kind: "rating",
      title: d.text ? `${d.text} coded all time` : `WakaTime all-time stats`,
      url: profileUrl,
      date,
      payload,
    }),
  ];
}

/** Adapter entry point: read secret from env, fetch + normalize. Returns [] on ANY error or missing key (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.enabled) return [];

    const key = process.env.WAKATIME_API_KEY;
    const handle = cfg.handle;
    const results = [];

    // --- Public stats fetch (no auth, requires handle) ---
    if (handle) {
      try {
        const publicRaw = await fetchJson(PUBLIC_STATS_URL(handle), {
          timeoutMs: 10_000,
        });
        results.push(...normalizePublicStats(publicRaw, cfg));
      } catch {
        // public endpoint failure is non-fatal
      }
    }

    // Auth-required fetches — skip entirely when no key
    if (key) {
      const auth = Buffer.from(`${key}:`).toString("base64");
      const authHeaders = { Authorization: `Basic ${auth}` };

      // --- Range stats fetch ---
      const range = cfg.range || "last_7_days";
      try {
        const raw = await fetchJson(STATS_URL(range), {
          headers: authHeaders,
          timeoutMs: 10_000,
        });
        results.push(...normalizeStats(raw, { ...cfg, range }));
      } catch {
        // range stats failure is non-fatal
      }

      // --- All-time stats fetch ---
      try {
        const allTimeRaw = await fetchJson(ALL_TIME_URL, {
          headers: authHeaders,
          timeoutMs: 10_000,
        });
        results.push(...normalizeAllTime(allTimeRaw, cfg));
      } catch {
        // all-time fetch failure is non-fatal
      }
    }

    return results;
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
