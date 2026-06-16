import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";
import { safeIso } from "../lib/datetime.mjs";

export const id = "wakatime";
export const needs = ["WAKATIME_API_KEY"]; // secret: WakaTime stats are owner-only (401 without key)

const STATS_URL = (range) =>
  `https://wakatime.com/api/v1/users/current/stats/${encodeURIComponent(range || "last_7_days")}`;

/** Pure transform: WakaTime stats response -> Envelope[]. No network.
 * Produces a SINGLE self-overwriting `rating` item: the dedup id has NO date
 * (id = wakatime:rating:<range>), so mergeSources REPLACES it each run instead of churning.
 * payload.* fields are PROVISIONAL until confirmed against a real authed response. */
export function normalizeStats(raw, cfg) {
  if (!raw || typeof raw !== "object") return [];
  const d = raw.data;
  if (!d || typeof d !== "object") return [];

  const range = (cfg && cfg.range) || d.range || "last_7_days";
  const human = d.human_readable_total || "some";
  // Prefer the precise full-ISO top-level `end`; fall back to date-only `data.end_date`;
  // finally fall back to the run's generatedAt so makeEnvelope never throws on a missing date.
  const date =
    safeIso(raw.end) ||
    safeIso(d.end_date) ||
    (cfg && cfg.generatedAt) ||
    new Date().toISOString();

  const languages = Array.isArray(d.languages)
    ? d.languages
        .filter((l) => l && l.name)
        .slice(0, 5)
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

/** Adapter entry point: read secret from env, fetch + normalize. Returns [] on ANY error or missing key (never throws). */
export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.enabled) return [];
    const key = process.env.WAKATIME_API_KEY;
    if (!key) return []; // graceful: no secret -> no items, no network, no throw
    const range = (cfg && cfg.range) || "last_7_days";
    // WakaTime uses HTTP Basic: base64(api_key + ":") in the Authorization header.
    const auth = Buffer.from(`${key}:`).toString("base64");
    const raw = await fetchJson(STATS_URL(range), {
      headers: { Authorization: `Basic ${auth}` },
      timeoutMs: 10_000,
    });
    return normalizeStats(raw, { ...cfg, range });
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
