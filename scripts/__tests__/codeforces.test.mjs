import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeRatings, normalizeProfile, fetch_ } from "../adapters/codeforces.mjs";

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
  let callCount = 0;
  globalThis.fetch = async (url) => {
    callCount++;
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
