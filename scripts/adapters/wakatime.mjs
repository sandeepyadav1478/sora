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

const DURATIONS_URL = (date) =>
  `https://wakatime.com/api/v1/users/current/durations?date=${encodeURIComponent(date)}`;

const SUMMARIES_URL = (start, end) =>
  `https://wakatime.com/api/v1/users/current/summaries?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

const PROJECTS_URL = "https://wakatime.com/api/v1/users/current/projects";

const LEADERS_URL = "https://wakatime.com/api/v1/leaders";

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
    status: d.status || undefined,
    percentCalculated: typeof d.percent_calculated === 'number' ? d.percent_calculated : undefined,
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

// ---------------------------------------------------------------------------
// Agent name normalisation
// ---------------------------------------------------------------------------

/**
 * Map a raw WakaTime AI-agent key to a canonical bucket name.
 * Returns null for keys that don't match any known bucket (they are omitted).
 */
export function normalizeAgentName(raw) {
  if (!raw || typeof raw !== "string") return null;
  const lower = raw.toLowerCase();
  if (lower.includes("claude") || lower.includes("sonnet") || lower.includes("opus") ||
      lower.includes("haiku") || lower.includes("cursor")) return "Claude";
  if (lower.includes("copilot") || lower.includes("github")) return "Copilot";
  if (lower.includes("gpt") || lower.includes("openai")) return "GPT";
  return null;
}

/**
 * Accumulate a numeric field across agent objects into a canonical-keyed record.
 * agentObjects: array of objects where the key is the raw agent name and value is a number.
 */
function accumulateAgentField(agentObjects) {
  const out = {};
  for (const obj of agentObjects) {
    if (!obj || typeof obj !== "object") continue;
    for (const [rawName, value] of Object.entries(obj)) {
      if (typeof value !== "number" || value <= 0) continue;
      const canonical = normalizeAgentName(rawName);
      if (!canonical) continue;
      out[canonical] = (out[canonical] || 0) + value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Endpoint 1: /users/current/durations  (last 7 days → one ai-agents envelope)
// ---------------------------------------------------------------------------

/**
 * Pure transform: array of daily durations API responses -> Envelope[].
 * @param {Array} dailyRaws - array of raw response objects, one per day.
 * @param {object} cfg
 */
export function normalizeDurations(dailyRaws, cfg) {
  if (!Array.isArray(dailyRaws) || dailyRaws.length === 0) return [];

  let totalAiLines = 0;
  let totalHumanLines = 0;
  let totalAiSessions = 0;
  let totalPromptEvents = 0;
  let totalAiInputTokens = 0;
  let totalAiOutputTokens = 0;
  const agentLineChangesRaw = [];
  const agentCostsRaw = [];

  for (const raw of dailyRaws) {
    if (!raw || typeof raw !== "object") continue;
    const items = Array.isArray(raw.data) ? raw.data : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      if (typeof item.ai_additions === "number") totalAiLines += item.ai_additions;
      if (typeof item.ai_deletions === "number") totalAiLines += item.ai_deletions;
      if (typeof item.human_additions === "number") totalHumanLines += item.human_additions;
      if (typeof item.human_deletions === "number") totalHumanLines += item.human_deletions;
      if (typeof item.ai_sessions === "number") totalAiSessions += item.ai_sessions;
      if (typeof item.ai_prompt_events_total === "number") totalPromptEvents += item.ai_prompt_events_total;
      if (typeof item.ai_input_tokens === "number") totalAiInputTokens += item.ai_input_tokens;
      if (typeof item.ai_output_tokens === "number") totalAiOutputTokens += item.ai_output_tokens;
      if (item.ai_agent_line_changes && typeof item.ai_agent_line_changes === "object") {
        agentLineChangesRaw.push(item.ai_agent_line_changes);
      }
      if (item.ai_agent_costs && typeof item.ai_agent_costs === "object") {
        agentCostsRaw.push(item.ai_agent_costs);
      }
    }
  }

  // Only emit when there is actual AI activity
  if (totalAiLines <= 0) return [];

  const agentLineChanges = accumulateAgentField(agentLineChangesRaw);
  const agentCosts = accumulateAgentField(agentCostsRaw);

  // Filter: only agents with > 0
  const filteredLineChanges = Object.fromEntries(
    Object.entries(agentLineChanges).filter(([, v]) => v > 0)
  );
  const filteredCosts = Object.fromEntries(
    Object.entries(agentCosts).filter(([, v]) => v > 0)
  );

  const totalLines = totalAiLines + totalHumanLines;
  const aiLinePercent = totalLines > 0
    ? Math.round((totalAiLines / totalLines) * 100)
    : 0;

  const profileUrl = (cfg && cfg.profileUrl) || "https://wakatime.com";
  const date = (cfg && cfg.generatedAt) || new Date().toISOString();

  const payload = {
    platform: "wakatime",
    subkind: "ai-agents",
    agentLineChanges: filteredLineChanges,
    agentCosts: filteredCosts,
    totalAiLines,
    totalHumanLines,
    aiLinePercent,
    totalAiSessions,
    totalPromptEvents,
    totalAiTokens: totalAiInputTokens + totalAiOutputTokens,
  };

  return [
    makeEnvelope({
      id: stableId("wakatime", "rating", "ai-agents-7d"),
      source: "wakatime",
      kind: "rating",
      title: `${totalAiLines} AI-written lines in last 7 days (${aiLinePercent}%)`,
      url: profileUrl,
      date,
      payload,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Endpoint 2: /users/current/summaries  (last 30 days → one summaries envelope)
// ---------------------------------------------------------------------------

/**
 * Pure transform: WakaTime summaries API response -> Envelope[].
 * @param {object} raw - raw API response
 * @param {object} cfg
 */
export function normalizeSummaries(raw, cfg) {
  if (!raw || typeof raw !== "object") return [];
  const data = Array.isArray(raw.data) ? raw.data : [];
  if (data.length === 0) return [];

  const days = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const dateStr = (entry.range && entry.range.date) || entry.date || null;
    if (!dateStr) continue;
    const gt = entry.grand_total || {};
    const totalSeconds = typeof gt.total_seconds === "number" ? gt.total_seconds : 0;
    const aiSeconds = typeof gt.ai_coding_seconds === "number" ? gt.ai_coding_seconds : 0;
    const humanSeconds = totalSeconds - aiSeconds;
    const aiPercent = totalSeconds > 0 ? Math.round((aiSeconds / totalSeconds) * 100) : 0;
    days.push({ date: dateStr, totalSeconds, aiSeconds, humanSeconds, aiPercent });
  }

  const daysWithData = days.filter((d) => d.totalSeconds > 0).length;
  if (daysWithData < 3) return [];

  const nonZeroDays = days.filter((d) => d.totalSeconds > 0);
  const avgAiPercent = nonZeroDays.length > 0
    ? Math.round(nonZeroDays.reduce((sum, d) => sum + d.aiPercent, 0) / nonZeroDays.length)
    : 0;

  const profileUrl = (cfg && cfg.profileUrl) || "https://wakatime.com";
  const date = (cfg && cfg.generatedAt) || new Date().toISOString();

  const payload = {
    platform: "wakatime",
    subkind: "summaries",
    days,
    avgAiPercent,
    daysWithData,
  };

  return [
    makeEnvelope({
      id: stableId("wakatime", "rating", "summaries-30d"),
      source: "wakatime",
      kind: "rating",
      title: `WakaTime coding summaries — last 30 days`,
      url: profileUrl,
      date,
      payload,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Endpoint 3: /users/current/projects
// ---------------------------------------------------------------------------

/**
 * Pure transform: WakaTime projects API response -> Envelope[].
 * @param {object} raw - raw API response
 * @param {object} cfg
 */
export function normalizeProjects(raw, cfg) {
  if (!raw || typeof raw !== "object") return [];
  const data = Array.isArray(raw.data) ? raw.data : [];
  if (data.length === 0) return [];

  const projects = data
    .filter((p) => p && typeof p === "object" && p.name)
    .slice(0, 20)
    .map((p) => ({
      name: p.name,
      lastHeartbeatAt: p.last_heartbeat_at || p.lastHeartbeatAt || undefined,
    }));

  if (projects.length === 0) return [];

  const profileUrl = (cfg && cfg.profileUrl) || "https://wakatime.com";
  const date = (cfg && cfg.generatedAt) || new Date().toISOString();

  const payload = {
    platform: "wakatime",
    subkind: "projects",
    projects,
  };

  return [
    makeEnvelope({
      id: stableId("wakatime", "rating", "projects"),
      source: "wakatime",
      kind: "rating",
      title: `WakaTime projects (${projects.length} tracked)`,
      url: profileUrl,
      date,
      payload,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Endpoint 4: /api/v1/leaders (public leaderboard, auth optional)
// ---------------------------------------------------------------------------

/**
 * Pure transform: WakaTime leaders API response -> Envelope[].
 * Only emits when current_user is present in the response (requires auth).
 * @param {object} raw - raw API response
 * @param {object} cfg
 */
export function normalizeLeaderboard(raw, cfg) {
  if (!raw || typeof raw !== "object") return [];
  const currentUser = raw.current_user;
  if (!currentUser || typeof currentUser !== "object") return [];

  const rank = typeof currentUser.rank === "number" ? currentUser.rank : null;
  if (!rank) return [];

  const languages = (currentUser.running_total && Array.isArray(currentUser.running_total.languages))
    ? currentUser.running_total.languages
        .filter((l) => l && l.name)
        .map((l) => ({ name: l.name, totalSeconds: l.total_seconds || 0 }))
    : [];

  const rangeLabel = (raw.range && (raw.range.slug || raw.range.name)) || "last_7_days";

  const profileUrl = (cfg && cfg.profileUrl) || "https://wakatime.com";
  const date = (cfg && cfg.generatedAt) || new Date().toISOString();

  const rt = currentUser.running_total || {};

  const payload = {
    platform: "wakatime",
    subkind: "leaderboard",
    rank,
    rangeLabel,
    languages,
    aiLineChangesTotal: typeof rt.ai_line_changes_total === 'number' ? rt.ai_line_changes_total : undefined,
    aiAgentLineChanges: rt.ai_agent_line_changes && typeof rt.ai_agent_line_changes === 'object' ? rt.ai_agent_line_changes : undefined,
  };

  return [
    makeEnvelope({
      id: stableId("wakatime", "rating", "leaderboard"),
      source: "wakatime",
      kind: "rating",
      title: `WakaTime leaderboard rank #${rank}`,
      url: profileUrl,
      date,
      payload,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Return an array of YYYY-MM-DD strings for the last N days (not including today). */
function lastNDates(n) {
  const dates = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
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

      // Run all auth-gated fetches in parallel. Each sub-array may be empty on error.
      const [
        statsEnvelopes,
        allTimeEnvelopes,
        durationsEnvelopes,
        summariesEnvelopes,
        projectsEnvelopes,
        leaderboardEnvelopes,
      ] = await Promise.all([
        // --- Range stats ---
        (async () => {
          try {
            const range = cfg.range || "last_7_days";
            const raw = await fetchJson(STATS_URL(range), {
              headers: authHeaders,
              timeoutMs: 10_000,
            });
            return normalizeStats(raw, { ...cfg, range });
          } catch { return []; }
        })(),

        // --- All-time stats ---
        (async () => {
          try {
            const raw = await fetchJson(ALL_TIME_URL, {
              headers: authHeaders,
              timeoutMs: 10_000,
            });
            return normalizeAllTime(raw, cfg);
          } catch { return []; }
        })(),

        // --- Durations: last 7 days in parallel ---
        (async () => {
          try {
            const dates = lastNDates(7);
            const dailyRaws = await Promise.all(
              dates.map((date) =>
                fetchJson(DURATIONS_URL(date), {
                  headers: authHeaders,
                  timeoutMs: 10_000,
                }).catch(() => null)
              )
            );
            return normalizeDurations(dailyRaws.filter(Boolean), cfg);
          } catch { return []; }
        })(),

        // --- Summaries: last 30 days ---
        (async () => {
          try {
            const dates = lastNDates(30);
            const start = dates[dates.length - 1]; // oldest
            const end = dates[0]; // most recent
            const raw = await fetchJson(SUMMARIES_URL(start, end), {
              headers: authHeaders,
              timeoutMs: 10_000,
            });
            return normalizeSummaries(raw, cfg);
          } catch { return []; }
        })(),

        // --- Projects ---
        (async () => {
          try {
            const raw = await fetchJson(PROJECTS_URL, {
              headers: authHeaders,
              timeoutMs: 10_000,
            });
            return normalizeProjects(raw, cfg);
          } catch { return []; }
        })(),

        // --- Leaderboard (with auth header to get current_user) ---
        (async () => {
          try {
            const raw = await fetchJson(LEADERS_URL, {
              headers: authHeaders,
              timeoutMs: 10_000,
            });
            return normalizeLeaderboard(raw, cfg);
          } catch { return []; }
        })(),
      ]);

      results.push(
        ...statsEnvelopes,
        ...allTimeEnvelopes,
        ...durationsEnvelopes,
        ...summariesEnvelopes,
        ...projectsEnvelopes,
        ...leaderboardEnvelopes,
      );
    }

    return results;
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
