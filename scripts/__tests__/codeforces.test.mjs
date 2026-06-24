import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeRatings, normalizeProfile, normalizeSubmissions, fetch_ } from "../adapters/codeforces.mjs";

const origFetch = globalThis.fetch;

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/codeforces.json", import.meta.url), "utf8")
);

test("normalizeRatings maps a contest entry to a rating envelope (fields + url construction)", () => {
  const out = normalizeRatings(fixture, { handle: "tourist", maxRatings: 500 });
  const first = out.find((e) => e.payload.contestId === 2);
  assert.ok(first, "contest 2 must be present");
  assert.equal(first.source, "codeforces");
  assert.equal(first.kind, "rating");
  assert.equal(first.id, "codeforces:rating:2");
  assert.equal(first.title, "Codeforces Beta Round 2: 0→1602"); // oldRating→newRating
  assert.equal(first.url, "https://codeforces.com/contest/2"); // constructed, not from response
  assert.equal(first.date, "2010-02-25T19:00:00.000Z"); // toIso(1267124400) UNIX SECONDS
  assert.equal(first.payload.platform, "codeforces");
  assert.equal(first.payload.rating, 1602); // newRating
  assert.equal(first.payload.rank, 14);
});

test("dedup key + id-kind invariant: id.split(':')[1] === kind", () => {
  const out = normalizeRatings(fixture, { handle: "tourist", maxRatings: 500 });
  for (const e of out) {
    assert.equal(e.id, `codeforces:rating:${e.payload.contestId}`); // stable dedup key = contestId
    assert.equal(e.id.split(":")[1], e.kind); // must-fix §3.3
    assert.equal(e.id.split(":")[1], "rating");
  }
});

test("normalizeRatings caps at maxRatings (newest first)", () => {
  const out = normalizeRatings(fixture, { handle: "tourist", maxRatings: 5 });
  assert.equal(out.length, 5);
  // newest-first: each item's date >= the next item's date
  for (let i = 1; i < out.length; i++) {
    assert.ok(Date.parse(out[i - 1].date) >= Date.parse(out[i].date), "must be sorted date-desc");
  }
});

test("normalizeRatings returns [] on garbage / FAILED status (never throws)", () => {
  assert.deepEqual(normalizeRatings(null, { handle: "x", maxRatings: 50 }), []);
  assert.deepEqual(normalizeRatings({}, { handle: "x", maxRatings: 50 }), []);
  assert.deepEqual(
    normalizeRatings({ status: "FAILED", comment: "handle not found" }, { handle: "x", maxRatings: 50 }),
    []
  );
  assert.deepEqual(normalizeRatings({ status: "OK", result: "nope" }, { handle: "x", maxRatings: 50 }), []);
});

test("fetch_ returns envelopes for a valid handle", async () => {
  // fetch_ calls RATING_URL and USER_INFO_URL in parallel — stub both
  let _callCount = 0;
  globalThis.fetch = async (url) => {
    _callCount++;
    if (String(url).includes("user.info")) {
      return {
        ok: true,
        json: async () => ({
          status: "OK",
          result: [
            {
              rating: 1500,
              maxRating: 1550,
              rank: "specialist",
              maxRank: "specialist",
              registrationTimeSeconds: 1600000000,
              lastOnlineTimeSeconds: 1700000000,
              contribution: 0,
              avatar: "https://example.com/avatar.jpg",
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        status: "OK",
        result: [
          {
            contestId: 1,
            contestName: "Codeforces Round 1",
            rank: 10,
            ratingUpdateTimeSeconds: 1700000000,
            oldRating: 1400,
            newRating: 1500,
            handle: "user",
          },
        ],
      }),
    };
  };
  const out = await fetch_({ handle: "user" });
  assert.ok(Array.isArray(out));
  assert.ok(out.length >= 1);
  assert.equal(out[0].source, "codeforces");
  globalThis.fetch = origFetch;
});

test("fetch_ returns [] for missing cfg", async () => {
  const out = await fetch_(undefined);
  assert.deepEqual(out, []);
});

test("fetch_ returns [] on network error", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network failed");
  };
  const out = await fetch_({ handle: "user" });
  assert.deepEqual(out, []);
  globalThis.fetch = orig;
});

test("fetch_ returns [] on non-200 HTTP response", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const out = await fetch_({ handle: "user" });
  assert.deepEqual(out, []);
  globalThis.fetch = orig;
});

test("normalizeProfile emits a profile envelope with correct fields", () => {
  const userInfo = {
    rating: 679,
    maxRating: 679,
    rank: "newbie",
    maxRank: "newbie",
    registrationTimeSeconds: 1767962056,
    lastOnlineTimeSeconds: 1782151087,
  };
  const env = normalizeProfile(userInfo, "sandeepyadav1478", 2);
  assert.ok(env, "profile envelope must be emitted when rating >= 1");
  assert.equal(env.source, "codeforces");
  assert.equal(env.kind, "profile");
  assert.equal(env.id, "codeforces:profile:sandeepyadav1478");
  assert.equal(env.title, "Codeforces: rating 679 (newbie)");
  assert.equal(env.url, "https://codeforces.com/profile/sandeepyadav1478");
  assert.equal(env.payload.rating, 679);
  assert.equal(env.payload.maxRating, 679);
  assert.equal(env.payload.rank, "newbie");
  assert.equal(env.payload.maxRank, "newbie");
  assert.equal(env.payload.registrationYear, 2026); // 1767962056 -> 2026
  assert.equal(env.payload.contestsAttended, 2);
  assert.equal(env.payload.platform, "codeforces");
});

test("normalizeProfile returns null when rating < 1", () => {
  const userInfo = { rating: 0, maxRating: 0, rank: "newbie", maxRank: "newbie",
    registrationTimeSeconds: 1767962056, lastOnlineTimeSeconds: 1782151087 };
  assert.equal(normalizeProfile(userInfo, "x", 0), null);
  assert.equal(normalizeProfile(null, "x", 0), null);
});

test("normalizeRatings augments contest payloads with maxRating when userInfo provided", () => {
  const ratingsRaw = {
    status: "OK",
    result: [
      { contestId: 1079, contestName: "Round 1079 Div 2", rank: 5944,
        ratingUpdateTimeSeconds: 1769000000, oldRating: 0, newRating: 473, handle: "sandeepyadav1478" },
      { contestId: 1083, contestName: "Round 1083 Div 2", rank: 10459,
        ratingUpdateTimeSeconds: 1770000000, oldRating: 473, newRating: 679, handle: "sandeepyadav1478" },
    ],
  };
  const userInfo = {
    rating: 679,
    maxRating: 679,
    maxRank: "newbie",
    registrationTimeSeconds: 1767962056,
    lastOnlineTimeSeconds: 1782151087,
  };
  const envelopes = normalizeRatings(ratingsRaw, { maxRatings: 50 }, userInfo);
  assert.equal(envelopes.length, 2);
  // All envelopes get maxRating from userInfo
  for (const e of envelopes) {
    assert.equal(e.payload.maxRating, 679, "each contest envelope must include maxRating");
    assert.equal(e.payload.maxRank, "newbie");
    assert.equal(e.payload.registrationTimeSeconds, 1767962056);
  }
  // Most-recent (index 0) gets currentRating
  const newest = envelopes.find((e) => e.payload.contestId === 1083);
  assert.equal(newest.payload.currentRating, 679, "most-recent contest must include currentRating");
  // Older contest must NOT have currentRating
  const older = envelopes.find((e) => e.payload.contestId === 1079);
  assert.equal(older.payload.currentRating, undefined, "non-newest contest must not have currentRating");
});

test("normalizeRatings without userInfo does not add maxRating to payloads", () => {
  const ratingsRaw = {
    status: "OK",
    result: [
      { contestId: 1, contestName: "Round 1", rank: 10,
        ratingUpdateTimeSeconds: 1700000000, oldRating: 1400, newRating: 1500, handle: "x" },
    ],
  };
  const envelopes = normalizeRatings(ratingsRaw, { maxRatings: 50 }); // no userInfo
  assert.equal(envelopes.length, 1);
  assert.equal(envelopes[0].payload.maxRating, undefined);
  assert.equal(envelopes[0].payload.currentRating, undefined);
});

// ── normalizeSubmissions tests ──────────────────────────────────────────────

function makeSubmission(overrides = {}) {
  return {
    id: 1,
    contestId: 100,
    creationTimeSeconds: 1700000000,
    problem: { contestId: 100, index: "A", name: "Two Sum", type: "PROGRAMMING", rating: 800, tags: ["math", "greedy"] },
    verdict: "OK",
    programmingLanguage: "Python3",
    testset: "TESTS",
    passedTestCount: 10,
    timeConsumedMillis: 100,
    memoryConsumedBytes: 4096,
    ...overrides,
  };
}

test("normalizeSubmissions happy path: correct acRate, envelope shape, and stats", () => {
  const result = [
    makeSubmission({ id: 1, verdict: "OK",            programmingLanguage: "C++17",   problem: { rating: 1200, tags: ["dp"] } }),
    makeSubmission({ id: 2, verdict: "WRONG_ANSWER",  programmingLanguage: "C++17",   problem: { rating: 1000, tags: ["math"] } }),
    makeSubmission({ id: 3, verdict: "OK",            programmingLanguage: "Python3", problem: { rating: 800,  tags: ["math", "greedy"] } }),
    makeSubmission({ id: 4, verdict: "TIME_LIMIT_EXCEEDED", programmingLanguage: "Python3", problem: { rating: 900, tags: ["sort"] } }),
    makeSubmission({ id: 5, verdict: "OK",            programmingLanguage: "C++17",   problem: { rating: 1000, tags: ["dp", "greedy"] } }),
    makeSubmission({ id: 6, verdict: "OK",            programmingLanguage: "C++17",   problem: { rating: 1200, tags: ["math"] } }),
    makeSubmission({ id: 7, verdict: "OK",            programmingLanguage: "Python3", problem: { rating: 0,    tags: [] } }),
  ];
  const raw = { status: "OK", result };
  const env = normalizeSubmissions(raw, { handle: "tester" });

  assert.ok(env, "must return an envelope");
  assert.equal(env.kind, "profile");
  assert.equal(env.source, "codeforces");
  assert.equal(env.id, "codeforces:profile:tester-submissions");

  const p = env.payload;
  assert.equal(p.totalSubmissions, 7);
  assert.equal(p.acSubmissions, 5);
  // 5/7 = 71.4... -> Math.round -> 71
  assert.equal(p.acRate, Math.round(5 / 7 * 100));
  assert.equal(p.platform, "codeforces");
  assert.equal(p.subkind, "submissions");

  // Language breakdown sorted desc by count; C++17 appears 4x, Python3 3x
  assert.equal(p.languageBreakdown[0].lang, "C++17");
  assert.equal(p.languageBreakdown[0].count, 4);
  assert.equal(p.languageBreakdown[1].lang, "Python3");
  assert.equal(p.languageBreakdown[1].count, 3);
});

test("normalizeSubmissions tagFrequency counts only tags from AC submissions", () => {
  // id=1 WRONG_ANSWER has tag "wrong-only" — must NOT appear in tagFrequency
  // id=2..6 are OK and share various tags
  const result = [
    makeSubmission({ id: 1, verdict: "WRONG_ANSWER", problem: { rating: 800, tags: ["wrong-only"] } }),
    makeSubmission({ id: 2, verdict: "OK",           problem: { rating: 800, tags: ["math", "greedy"] } }),
    makeSubmission({ id: 3, verdict: "OK",           problem: { rating: 900, tags: ["math"] } }),
    makeSubmission({ id: 4, verdict: "OK",           problem: { rating: 1000, tags: ["dp", "greedy"] } }),
    makeSubmission({ id: 5, verdict: "OK",           problem: { rating: 1100, tags: ["dp"] } }),
    makeSubmission({ id: 6, verdict: "OK",           problem: { rating: 1200, tags: ["math"] } }),
  ];
  const raw = { status: "OK", result };
  const env = normalizeSubmissions(raw, { handle: "tester" });
  assert.ok(env, "must return envelope");

  const tags = env.payload.tagFrequency.map((t) => t.tag);
  assert.ok(!tags.includes("wrong-only"), "wrong-only tag from WA submission must not appear");
  // math appears in ids 2,3,6 (3 AC subs); greedy in 2,4 (2); dp in 4,5 (2)
  assert.equal(env.payload.tagFrequency[0].tag, "math");
  assert.equal(env.payload.tagFrequency[0].count, 3);
});

test("normalizeSubmissions difficultyHistogram excludes rating=0 and undefined entries", () => {
  const result = [
    makeSubmission({ id: 1, verdict: "OK", problem: { rating: 0,         tags: [] } }), // must be excluded
    makeSubmission({ id: 2, verdict: "OK", problem: { tags: [] } }),                     // rating undefined — excluded
    makeSubmission({ id: 3, verdict: "OK", problem: { rating: 800,       tags: [] } }),
    makeSubmission({ id: 4, verdict: "OK", problem: { rating: 1200,      tags: [] } }),
    makeSubmission({ id: 5, verdict: "OK", problem: { rating: 800,       tags: [] } }),
    makeSubmission({ id: 6, verdict: "WRONG_ANSWER", problem: { rating: 500, tags: [] } }), // WA — ignored
  ];
  const raw = { status: "OK", result };
  const env = normalizeSubmissions(raw, { handle: "tester" });
  assert.ok(env, "must return envelope");

  const hist = env.payload.difficultyHistogram;
  const ratings = hist.map((h) => h.rating);
  assert.ok(!ratings.includes(0),         "rating=0 must be excluded from histogram");
  assert.ok(!ratings.includes(undefined), "undefined rating must be excluded");
  // 800 appears twice (ids 3,5), 1200 once (id 4); sorted asc
  assert.equal(hist[0].rating, 800);
  assert.equal(hist[0].count,  2);
  assert.equal(hist[1].rating, 1200);
  assert.equal(hist[1].count,  1);
  // avgDifficulty = (800+1200+800)/3 = 933
  assert.equal(env.payload.avgDifficulty, Math.round((800 + 1200 + 800) / 3));
});

test("normalizeSubmissions returns null when totalSubmissions < 5", () => {
  const result = [
    makeSubmission({ id: 1, verdict: "OK" }),
    makeSubmission({ id: 2, verdict: "OK" }),
    makeSubmission({ id: 3, verdict: "WRONG_ANSWER" }),
    makeSubmission({ id: 4, verdict: "OK" }),
  ];
  const raw = { status: "OK", result };
  assert.equal(normalizeSubmissions(raw, { handle: "tester" }), null);
  // Also test zero submissions
  assert.equal(normalizeSubmissions({ status: "OK", result: [] }, { handle: "tester" }), null);
  // And invalid responses
  assert.equal(normalizeSubmissions(null, { handle: "tester" }), null);
  assert.equal(normalizeSubmissions({ status: "FAILED" }, { handle: "tester" }), null);
});
