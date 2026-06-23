import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeStats,
  normalizePublicStats,
  normalizeAgentName,
  normalizeDurations,
  normalizeSummaries,
  normalizeProjects,
  normalizeLeaderboard,
} from "../adapters/wakatime.mjs";
import { fetch_ as wakatimeFetch } from "../adapters/wakatime.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/wakatime.json", import.meta.url), "utf8")
);

const cfg = {
  enabled: true,
  handle: "octocat",
  profileUrl: "https://wakatime.com/@octocat",
  range: "last_7_days",
};

test("normalizeStats produces exactly one self-overwriting rating item", () => {
  const out = normalizeStats(fixture, cfg);
  assert.equal(out.length, 1, "must be a SINGLE item (no date in key -> self-overwrites)");
});

test("normalizeStats: envelope core fields are correct", () => {
  const [item] = normalizeStats(fixture, cfg);
  assert.equal(item.source, "wakatime");
  assert.equal(item.kind, "rating");
  assert.equal(item.title, "40 hrs 2 mins coding this week");
  assert.equal(item.url, "https://wakatime.com/@octocat");
  // Prefers the full-ISO top-level `end`; safeIso normalizes to a real ISO string.
  assert.equal(item.date, new Date("2026-06-10T23:59:59Z").toISOString());
});

test("normalizeStats: id is the stable, DATE-LESS dedup key", () => {
  const [item] = normalizeStats(fixture, cfg);
  // id MUST NOT contain the date — mergeSources REPLACES by id, a date-keyed id only churns.
  assert.equal(item.id, "wakatime:rating:last_7_days");
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(item.id), "id must contain no date");
});

test("normalizeStats: id-kind invariant — id.split(':')[1] === kind", () => {
  const [item] = normalizeStats(fixture, cfg);
  assert.equal(item.id.split(":")[1], "rating");
  assert.equal(item.id.split(":")[1], item.kind);
});

test("normalizeStats: payload carries the PROVISIONAL stats shape", () => {
  const [item] = normalizeStats(fixture, cfg);
  assert.equal(item.payload.platform, "wakatime");
  assert.equal(item.payload.totalSeconds, 144123);
  assert.equal(item.payload.humanReadableTotal, "40 hrs 2 mins");
  assert.equal(item.payload.range, "last_7_days");
  assert.equal(item.payload.dailyAverage, 20589);
  assert.deepEqual(
    item.payload.languages,
    ["TypeScript", "Python", "Astro"],
    "top languages by name, trimmed"
  );
});

test("normalizeStats: falls back to generatedAt when no usable end date", () => {
  const noDate = { data: { total_seconds: 7200, human_readable_total: "2 hrs" } };
  const [item] = normalizeStats(noDate, { ...cfg, generatedAt: "2026-06-11T00:00:00.000Z" });
  assert.equal(item.date, "2026-06-11T00:00:00.000Z");
});

test("normalizeStats: returns [] on garbage / empty input (never throws)", () => {
  assert.deepEqual(normalizeStats(null, cfg), []);
  assert.deepEqual(normalizeStats({}, cfg), []);
  assert.deepEqual(normalizeStats({ data: null }, cfg), []);
  assert.deepEqual(normalizeStats("nope", cfg), []);
});

// --- normalizePublicStats tests ---

const publicFixture = {
  data: {
    categories: [
      { name: "Coding", percent: 69.91 },
      { name: "AI Coding", percent: 13.68 },
      { name: "Meeting", percent: 12.25 },
    ],
    editors: [
      { name: "VS Code", percent: 80.65 },
      { name: "Claude Code", percent: 5.5 },
      { name: "PyCharm", percent: 1.47 },
      { name: "Vim", percent: 0.3 },
    ],
    languages: [
      { name: "Python", percent: 60.48 },
      { name: "Terraform", percent: 1.75 },
      { name: "Docker", percent: 1.09 },
      { name: "Bash", percent: 0.98 },
      { name: "YAML", percent: 0.2 },
    ],
    operating_systems: [
      { name: "Mac", percent: 53.19 },
      { name: "Linux", percent: 20.82 },
      { name: "Windows", percent: 13.74 },
      { name: "Unknown", percent: 0.5 },
    ],
  },
};

test("normalizePublicStats: happy path produces one envelope with correct id", () => {
  const out = normalizePublicStats(publicFixture, cfg);
  assert.equal(out.length, 1);
  const [item] = out;
  assert.equal(item.id, "wakatime:rating:public-alltime");
  assert.equal(item.source, "wakatime");
  assert.equal(item.kind, "rating");
  assert.equal(item.payload.subkind, "public");
  assert.equal(item.payload.platform, "wakatime");
});

test("normalizePublicStats: categories are filtered to percent > 0", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  assert.deepEqual(item.payload.categories, [
    { name: "Coding", percent: 69.91 },
    { name: "AI Coding", percent: 13.68 },
    { name: "Meeting", percent: 12.25 },
  ]);
});

test("normalizePublicStats: editors top 5 filtered to percent > 0.5", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  // Vim at 0.3 should be filtered out
  assert.deepEqual(item.payload.editors, [
    { name: "VS Code", percent: 80.65 },
    { name: "Claude Code", percent: 5.5 },
    { name: "PyCharm", percent: 1.47 },
  ]);
});

test("normalizePublicStats: languages filtered to percent >= 0.5", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  // YAML at 0.2 should be filtered out
  assert.deepEqual(item.payload.languages, [
    { name: "Python", percent: 60.48 },
    { name: "Terraform", percent: 1.75 },
    { name: "Docker", percent: 1.09 },
    { name: "Bash", percent: 0.98 },
  ]);
});

test("normalizePublicStats: os filtered to percent > 1", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  // Unknown at 0.5 should be filtered out
  assert.deepEqual(item.payload.os, [
    { name: "Mac", percent: 53.19 },
    { name: "Linux", percent: 20.82 },
    { name: "Windows", percent: 13.74 },
  ]);
});

test("normalizePublicStats: extracts aiCodingPercent correctly", () => {
  const [item] = normalizePublicStats(publicFixture, cfg);
  assert.equal(item.payload.aiCodingPercent, 13.68);
});

test("normalizePublicStats: aiCodingPercent is 0 when no AI Coding category", () => {
  const raw = {
    data: {
      categories: [{ name: "Coding", percent: 100 }],
      editors: [],
      languages: [],
      operating_systems: [],
    },
  };
  const [item] = normalizePublicStats(raw, cfg);
  assert.equal(item.payload.aiCodingPercent, 0);
});

test("normalizePublicStats: returns [] when categories is missing", () => {
  const raw = { data: { editors: [], languages: [], operating_systems: [] } };
  assert.deepEqual(normalizePublicStats(raw, cfg), []);
});

test("normalizePublicStats: returns [] when all categories have percent 0", () => {
  const raw = {
    data: {
      categories: [{ name: "Coding", percent: 0 }],
      editors: [],
      languages: [],
      operating_systems: [],
    },
  };
  assert.deepEqual(normalizePublicStats(raw, cfg), []);
});

test("normalizePublicStats: returns [] on garbage / empty input (never throws)", () => {
  assert.deepEqual(normalizePublicStats(null, cfg), []);
  assert.deepEqual(normalizePublicStats({}, cfg), []);
  assert.deepEqual(normalizePublicStats({ data: null }, cfg), []);
  assert.deepEqual(normalizePublicStats("nope", cfg), []);
});

const origFetch = globalThis.fetch;

test("fetch_ returns [] when WAKATIME_API_KEY is absent (graceful, no throw)", async () => {
  const saved = process.env.WAKATIME_API_KEY;
  delete process.env.WAKATIME_API_KEY;
  // Stub fetch so the public endpoint call (which needs no key) returns empty categories -> []
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: { categories: [], editors: [], languages: [], operating_systems: [] } }),
  });
  try {
    const out = await wakatimeFetch(cfg);
    assert.deepEqual(out, [], "missing key + empty public stats -> [] without throwing");
  } finally {
    globalThis.fetch = origFetch;
    if (saved !== undefined) process.env.WAKATIME_API_KEY = saved;
  }
});

test("fetch_ sends correct Basic auth header", async () => {
  const captured = {};
  const apiKey = "test-api-key-123";
  const expectedAuth = "Basic " + Buffer.from(apiKey + ":").toString("base64");
  const savedKey = process.env.WAKATIME_API_KEY;
  process.env.WAKATIME_API_KEY = apiKey;
  globalThis.fetch = async (url, opts) => {
    // Only capture the auth header when it is present (the authed endpoints)
    const authHeader = opts?.headers?.Authorization || opts?.headers?.authorization;
    if (authHeader) captured.auth = authHeader;
    return {
      ok: true,
      json: async () => ({
        data: {
          username: "user",
          human_readable_total: "10 hrs",
          total_seconds: 36000,
          languages: [],
          editors: [],
          categories: [],
          operating_systems: [],
        },
      }),
    };
  };
  try {
    await wakatimeFetch({ ...cfg, enabled: true });
    assert.equal(captured.auth, expectedAuth, "WakaTime must use Basic base64(apiKey:) auth");
  } finally {
    globalThis.fetch = origFetch;
    if (savedKey !== undefined) process.env.WAKATIME_API_KEY = savedKey;
    else delete process.env.WAKATIME_API_KEY;
  }
});

test("fetch_ returns [] for missing cfg", async () => {
  const out = await wakatimeFetch(undefined);
  assert.deepEqual(out, []);
});

test("fetch_ returns [] on network error", async () => {
  const savedKey = process.env.WAKATIME_API_KEY;
  process.env.WAKATIME_API_KEY = "some-key";
  globalThis.fetch = async () => {
    throw new Error("Network failed");
  };
  try {
    const out = await wakatimeFetch({ ...cfg, enabled: true });
    assert.deepEqual(out, []);
  } finally {
    globalThis.fetch = origFetch;
    if (savedKey !== undefined) process.env.WAKATIME_API_KEY = savedKey;
    else delete process.env.WAKATIME_API_KEY;
  }
});

test("fetch_ returns [] on non-200 HTTP response", async () => {
  const savedKey = process.env.WAKATIME_API_KEY;
  process.env.WAKATIME_API_KEY = "some-key";
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  try {
    const out = await wakatimeFetch({ ...cfg, enabled: true });
    assert.deepEqual(out, []);
  } finally {
    globalThis.fetch = origFetch;
    if (savedKey !== undefined) process.env.WAKATIME_API_KEY = savedKey;
    else delete process.env.WAKATIME_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// normalizeAgentName
// ---------------------------------------------------------------------------

test("normalizeAgentName: maps Claude variants", () => {
  assert.equal(normalizeAgentName("claude-3-opus"), "Claude");
  assert.equal(normalizeAgentName("Claude Sonnet"), "Claude");
  assert.equal(normalizeAgentName("claude-haiku"), "Claude");
  assert.equal(normalizeAgentName("Cursor"), "Claude");
});

test("normalizeAgentName: maps Copilot variants", () => {
  assert.equal(normalizeAgentName("GitHub Copilot"), "Copilot");
  assert.equal(normalizeAgentName("github-copilot-chat"), "Copilot");
  assert.equal(normalizeAgentName("copilot"), "Copilot");
});

test("normalizeAgentName: maps GPT variants", () => {
  assert.equal(normalizeAgentName("gpt-4o"), "GPT");
  assert.equal(normalizeAgentName("OpenAI"), "GPT");
  assert.equal(normalizeAgentName("openai-codex"), "GPT");
});

test("normalizeAgentName: returns null for unknown agents", () => {
  assert.equal(normalizeAgentName("Gemini"), null);
  assert.equal(normalizeAgentName("llama-3"), null);
  assert.equal(normalizeAgentName(""), null);
  assert.equal(normalizeAgentName(null), null);
  assert.equal(normalizeAgentName(42), null);
});

// ---------------------------------------------------------------------------
// normalizeDurations
// ---------------------------------------------------------------------------

const durationDay1 = {
  data: [
    {
      ai_additions: 3000,
      ai_deletions: 200,
      human_additions: 500,
      human_deletions: 100,
      ai_sessions: 5,
      ai_prompt_events_total: 20,
      ai_input_tokens: 10000,
      ai_output_tokens: 5000,
      ai_agent_line_changes: { "claude-3-opus": 2800, "GitHub Copilot": 200 },
      ai_agent_costs: { "claude-3-opus": 0.04 },
    },
  ],
};

const durationDay2 = {
  data: [
    {
      ai_additions: 1000,
      ai_deletions: 0,
      human_additions: 200,
      human_deletions: 50,
      ai_sessions: 2,
      ai_prompt_events_total: 8,
      ai_input_tokens: 4000,
      ai_output_tokens: 2000,
      ai_agent_line_changes: { "claude-sonnet": 1000 },
      ai_agent_costs: { "claude-sonnet": 0.01 },
    },
  ],
};

test("normalizeDurations: aggregates across multiple days and emits one envelope", () => {
  const out = normalizeDurations([durationDay1, durationDay2], cfg);
  assert.equal(out.length, 1);
  const [item] = out;
  assert.equal(item.id, "wakatime:rating:ai-agents-7d");
  assert.equal(item.source, "wakatime");
  assert.equal(item.kind, "rating");
  assert.equal(item.payload.subkind, "ai-agents");
  assert.equal(item.payload.platform, "wakatime");
});

test("normalizeDurations: totals are summed correctly", () => {
  const [item] = normalizeDurations([durationDay1, durationDay2], cfg);
  // ai: 3000+200+1000 = 4200; human: 500+100+200+50 = 850
  assert.equal(item.payload.totalAiLines, 4200);
  assert.equal(item.payload.totalHumanLines, 850);
  assert.equal(item.payload.totalAiSessions, 7);
  assert.equal(item.payload.totalPromptEvents, 28);
  assert.equal(item.payload.totalAiTokens, 21000); // (10000+5000)+(4000+2000)
});

test("normalizeDurations: agent names are normalized and summed", () => {
  const [item] = normalizeDurations([durationDay1, durationDay2], cfg);
  // claude-3-opus -> Claude: 2800, GitHub Copilot -> Copilot: 200, claude-sonnet -> Claude: 1000
  assert.equal(item.payload.agentLineChanges.Claude, 3800);
  assert.equal(item.payload.agentLineChanges.Copilot, 200);
  assert.equal(item.payload.agentCosts.Claude, 0.05); // 0.04 + 0.01
});

test("normalizeDurations: aiLinePercent is rounded integer", () => {
  const [item] = normalizeDurations([durationDay1, durationDay2], cfg);
  const expected = Math.round(4200 / (4200 + 850) * 100);
  assert.equal(item.payload.aiLinePercent, expected);
});

test("normalizeDurations: returns [] when totalAiLines is 0", () => {
  const noAi = { data: [{ human_additions: 100, human_deletions: 50 }] };
  assert.deepEqual(normalizeDurations([noAi], cfg), []);
});

test("normalizeDurations: returns [] on empty input", () => {
  assert.deepEqual(normalizeDurations([], cfg), []);
  assert.deepEqual(normalizeDurations(null, cfg), []);
  assert.deepEqual(normalizeDurations([null, undefined], cfg), []);
});

test("normalizeDurations: skips null daily responses gracefully", () => {
  const out = normalizeDurations([null, durationDay1, null], cfg);
  assert.equal(out.length, 1);
});

// ---------------------------------------------------------------------------
// normalizeSummaries
// ---------------------------------------------------------------------------

function makeSummaryDay(date, totalSeconds, aiCodingSeconds) {
  return {
    range: { date },
    grand_total: { total_seconds: totalSeconds, ai_coding_seconds: aiCodingSeconds },
  };
}

const summaries30dRaw = {
  data: [
    makeSummaryDay("2026-05-24", 7200, 1800),
    makeSummaryDay("2026-05-25", 10800, 5400),
    makeSummaryDay("2026-05-26", 3600, 900),
    makeSummaryDay("2026-05-27", 0, 0), // no activity
    makeSummaryDay("2026-05-28", 14400, 7200),
  ],
};

test("normalizeSummaries: happy path emits one envelope with correct id", () => {
  const out = normalizeSummaries(summaries30dRaw, cfg);
  assert.equal(out.length, 1);
  const [item] = out;
  assert.equal(item.id, "wakatime:rating:summaries-30d");
  assert.equal(item.source, "wakatime");
  assert.equal(item.kind, "rating");
  assert.equal(item.payload.subkind, "summaries");
  assert.equal(item.payload.platform, "wakatime");
});

test("normalizeSummaries: daysWithData counts only non-zero days", () => {
  const [item] = normalizeSummaries(summaries30dRaw, cfg);
  assert.equal(item.payload.daysWithData, 4); // the zero-activity day excluded
});

test("normalizeSummaries: days array is correctly structured", () => {
  const [item] = normalizeSummaries(summaries30dRaw, cfg);
  assert.equal(item.payload.days.length, 5);
  const day0 = item.payload.days[0];
  assert.equal(day0.date, "2026-05-24");
  assert.equal(day0.totalSeconds, 7200);
  assert.equal(day0.aiSeconds, 1800);
  assert.equal(day0.humanSeconds, 5400);
  assert.equal(day0.aiPercent, 25);
});

test("normalizeSummaries: avgAiPercent averages only non-zero days", () => {
  const [item] = normalizeSummaries(summaries30dRaw, cfg);
  // percents: 25, 50, 25, 0(excluded), 50 -> avg of [25,50,25,50] = 37.5 -> round 38
  assert.equal(item.payload.avgAiPercent, 38);
});

test("normalizeSummaries: returns [] when daysWithData < 3", () => {
  const sparse = {
    data: [
      makeSummaryDay("2026-05-24", 7200, 1800),
      makeSummaryDay("2026-05-25", 3600, 900),
    ],
  };
  assert.deepEqual(normalizeSummaries(sparse, cfg), []);
});

test("normalizeSummaries: returns [] on empty / garbage input", () => {
  assert.deepEqual(normalizeSummaries(null, cfg), []);
  assert.deepEqual(normalizeSummaries({}, cfg), []);
  assert.deepEqual(normalizeSummaries({ data: [] }, cfg), []);
});

// ---------------------------------------------------------------------------
// normalizeProjects
// ---------------------------------------------------------------------------

const projectsRaw = {
  data: [
    { name: "sora", last_heartbeat_at: "2026-06-20T18:30:00Z" },
    { name: "personal-site", last_heartbeat_at: "2026-06-18T10:00:00Z" },
    { name: "dotfiles" }, // no last_heartbeat_at
  ],
};

test("normalizeProjects: happy path emits one envelope with correct id", () => {
  const out = normalizeProjects(projectsRaw, cfg);
  assert.equal(out.length, 1);
  const [item] = out;
  assert.equal(item.id, "wakatime:rating:projects");
  assert.equal(item.source, "wakatime");
  assert.equal(item.kind, "rating");
  assert.equal(item.payload.subkind, "projects");
  assert.equal(item.payload.platform, "wakatime");
});

test("normalizeProjects: projects array is correct", () => {
  const [item] = normalizeProjects(projectsRaw, cfg);
  assert.equal(item.payload.projects.length, 3);
  assert.equal(item.payload.projects[0].name, "sora");
  assert.equal(item.payload.projects[0].lastHeartbeatAt, "2026-06-20T18:30:00Z");
  assert.equal(item.payload.projects[2].name, "dotfiles");
  assert.equal(item.payload.projects[2].lastHeartbeatAt, undefined);
});

test("normalizeProjects: caps at 20 projects", () => {
  const raw = {
    data: Array.from({ length: 25 }, (_, i) => ({ name: `project-${i}` })),
  };
  const [item] = normalizeProjects(raw, cfg);
  assert.equal(item.payload.projects.length, 20);
});

test("normalizeProjects: returns [] when data is empty", () => {
  assert.deepEqual(normalizeProjects({ data: [] }, cfg), []);
  assert.deepEqual(normalizeProjects({ data: [null, undefined] }, cfg), []);
});

test("normalizeProjects: returns [] on garbage input", () => {
  assert.deepEqual(normalizeProjects(null, cfg), []);
  assert.deepEqual(normalizeProjects({}, cfg), []);
});

// ---------------------------------------------------------------------------
// normalizeLeaderboard
// ---------------------------------------------------------------------------

const leaderboardRaw = {
  current_user: {
    rank: 42,
    running_total: {
      languages: [
        { name: "Python", total_seconds: 120000 },
        { name: "TypeScript", total_seconds: 80000 },
      ],
    },
  },
  range: { slug: "last_7_days", name: "Last 7 Days" },
};

test("normalizeLeaderboard: happy path emits one envelope with correct id", () => {
  const out = normalizeLeaderboard(leaderboardRaw, cfg);
  assert.equal(out.length, 1);
  const [item] = out;
  assert.equal(item.id, "wakatime:rating:leaderboard");
  assert.equal(item.source, "wakatime");
  assert.equal(item.kind, "rating");
  assert.equal(item.payload.subkind, "leaderboard");
  assert.equal(item.payload.platform, "wakatime");
});

test("normalizeLeaderboard: rank and rangeLabel are correct", () => {
  const [item] = normalizeLeaderboard(leaderboardRaw, cfg);
  assert.equal(item.payload.rank, 42);
  assert.equal(item.payload.rangeLabel, "last_7_days");
});

test("normalizeLeaderboard: languages are mapped correctly", () => {
  const [item] = normalizeLeaderboard(leaderboardRaw, cfg);
  assert.deepEqual(item.payload.languages, [
    { name: "Python", totalSeconds: 120000 },
    { name: "TypeScript", totalSeconds: 80000 },
  ]);
});

test("normalizeLeaderboard: returns [] when current_user is absent (unauthenticated)", () => {
  const noUser = { data: [{ rank: 1 }], range: { slug: "last_7_days" } };
  assert.deepEqual(normalizeLeaderboard(noUser, cfg), []);
});

test("normalizeLeaderboard: returns [] when rank is missing", () => {
  const noRank = { current_user: { running_total: { languages: [] } } };
  assert.deepEqual(normalizeLeaderboard(noRank, cfg), []);
});

test("normalizeLeaderboard: returns [] on garbage input", () => {
  assert.deepEqual(normalizeLeaderboard(null, cfg), []);
  assert.deepEqual(normalizeLeaderboard({}, cfg), []);
  assert.deepEqual(normalizeLeaderboard("nope", cfg), []);
});
