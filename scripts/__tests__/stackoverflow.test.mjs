import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeAnswers, normalizeProfile, fetch_ } from "../adapters/stackoverflow.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/stackoverflow.json", import.meta.url), "utf8")
);

test("normalizeAnswers maps an answer to a post envelope with the real question title", () => {
  const out = normalizeAnswers(fixture.answers, fixture.questions, { maxPosts: 25 });
  const a = out.find((e) => e.payload.answer_id === 79951496);
  assert.ok(a, "answer 79951496 must be present");
  assert.equal(a.source, "stackoverflow");
  assert.equal(a.kind, "post");
  assert.equal(a.id, "stackoverflow:post:79951496");
  assert.equal(a.title, "Answer to: What is the correct syntax to call this method?");
  assert.equal(a.url, "https://stackoverflow.com/a/79951496");
  // creation_date 1780589628 (UNIX seconds) -> ISO
  assert.equal(a.date, new Date(1780589628 * 1000).toISOString());
  assert.equal(a.payload.feed, "stackoverflow");
  assert.equal(a.payload.score, 3);
  assert.equal(a.payload.is_accepted, true);
});

test("id-kind invariant: id.split(':')[1] === envelope.kind === 'post'", () => {
  const out = normalizeAnswers(fixture.answers, fixture.questions, { maxPosts: 25 });
  assert.ok(out.length > 0);
  for (const e of out) {
    assert.equal(e.kind, "post");
    assert.equal(e.id.split(":")[1], "post");
    assert.equal(e.id.split(":")[1], e.kind);
  }
});

test("dedup key is the answer_id (stable across re-runs)", () => {
  const out = normalizeAnswers(fixture.answers, fixture.questions, { maxPosts: 25 });
  const ids = out.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  for (const e of out) {
    assert.equal(e.id, `stackoverflow:post:${e.payload.answer_id}`);
  }
});

test("falls back to a synthetic title when the question is deleted/missing from the map", () => {
  const answers = { items: [{ answer_id: 999, question_id: 12345, creation_date: 1780589628, score: 1, is_accepted: false }] };
  const questions = { items: [] }; // question not returned (deleted)
  const out = normalizeAnswers(answers, questions, { maxPosts: 25 });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "stackoverflow:post:999");
  assert.ok(out[0].title.length > 0, "title must never be empty (guards makeEnvelope throw)");
  assert.match(out[0].title, /12345/); // synthTitle fallback references the question id
});

test("caps at cfg.maxPosts, newest first", () => {
  const out = normalizeAnswers(fixture.answers, fixture.questions, { maxPosts: 2 });
  assert.equal(out.length, 2);
  assert.ok(Date.parse(out[0].date) >= Date.parse(out[1].date), "sorted newest-first");
});

test("returns [] on garbage / non-array input (never throws)", () => {
  assert.deepEqual(normalizeAnswers(null, null, { maxPosts: 25 }), []);
  assert.deepEqual(normalizeAnswers({}, {}, { maxPosts: 25 }), []);
  assert.deepEqual(normalizeAnswers({ items: "nope" }, { items: null }, { maxPosts: 25 }), []);
});

// ── normalizeProfile tests ────────────────────────────────────────────────────

test("normalizeProfile emits a rating envelope from fixture profile", () => {
  const env = normalizeProfile(fixture.profile);
  assert.ok(env, "profile envelope must be emitted");
  assert.equal(env.source, "stackoverflow");
  assert.equal(env.kind, "rating");
  assert.equal(env.id, "stackoverflow:rating:8440245");
  assert.equal(env.url, "https://stackoverflow.com/users/8440245/sandeepyadav1478");
  assert.equal(env.payload.platform, "stackoverflow");
  assert.equal(env.payload.reputation, 11);
  assert.deepEqual(env.payload.badgeCounts, { bronze: 3, silver: 0, gold: 0 });
  assert.equal(env.payload.location, "Jaipur");
  assert.equal(env.payload.memberSinceYear, 2017);
  assert.equal(env.payload.lastActiveYear, 2025);
});

test("normalizeProfile extracts collectives into payload", () => {
  const env = normalizeProfile(fixture.profile);
  assert.ok(env, "envelope must be present");
  assert.deepEqual(env.payload.collectives, ["Google Cloud"]);
  assert.match(env.title, /Google Cloud/);
});

test("normalizeProfile title format includes reputation and collective", () => {
  const env = normalizeProfile(fixture.profile);
  assert.ok(env);
  assert.equal(env.title, "Stack Overflow: 11 reputation · Google Cloud");
});

test("normalizeProfile title says 'member' when no collectives", () => {
  const profileNoCollective = {
    items: [{
      user_id: 999,
      reputation: 15,
      badge_counts: { bronze: 1, silver: 0, gold: 0 },
      collectives: [],
      location: "London",
      creation_date: 1502286661,
      last_access_date: 1738714340,
      link: "https://stackoverflow.com/users/999/test",
    }],
  };
  const env = normalizeProfile(profileNoCollective);
  assert.ok(env);
  assert.equal(env.title, "Stack Overflow: 15 reputation · member");
  assert.deepEqual(env.payload.collectives, []);
});

test("normalizeProfile: emits when reputation >= 10 with no collectives (passes filter)", () => {
  const profileHighRep = {
    items: [{
      user_id: 1,
      reputation: 10,
      badge_counts: { bronze: 0, silver: 0, gold: 0 },
      collectives: [],
      location: null,
      creation_date: 1502286661,
      last_access_date: 1738714340,
      link: "https://stackoverflow.com/users/1/test",
    }],
  };
  const env = normalizeProfile(profileHighRep);
  assert.ok(env, "must emit when reputation === 10");
});

test("normalizeProfile: emits when reputation < 10 but collective membership exists (passes filter)", () => {
  const profileLowRepWithCollective = {
    items: [{
      user_id: 2,
      reputation: 5,
      badge_counts: { bronze: 0, silver: 0, gold: 0 },
      collectives: [{ collective: { name: "Google Cloud", slug: "google-cloud", tags: [] } }],
      location: null,
      creation_date: 1502286661,
      last_access_date: 1738714340,
      link: "https://stackoverflow.com/users/2/test",
    }],
  };
  const env = normalizeProfile(profileLowRepWithCollective);
  assert.ok(env, "must emit when collective membership exists even with low rep");
  assert.deepEqual(env.payload.collectives, ["Google Cloud"]);
});

test("normalizeProfile: suppressed when reputation < 10 AND no collectives", () => {
  const profileLowRep = {
    items: [{
      user_id: 3,
      reputation: 9,
      badge_counts: { bronze: 0, silver: 0, gold: 0 },
      collectives: [],
      location: null,
      creation_date: 1502286661,
      last_access_date: 1738714340,
      link: "https://stackoverflow.com/users/3/test",
    }],
  };
  const env = normalizeProfile(profileLowRep);
  assert.equal(env, null, "must suppress profile when reputation < 10 and no collectives");
});

test("normalizeProfile returns null on empty/garbage input", () => {
  assert.equal(normalizeProfile(null), null);
  assert.equal(normalizeProfile({}), null);
  assert.equal(normalizeProfile({ items: [] }), null);
  assert.equal(normalizeProfile({ items: [null] }), null);
});

// ── fetch_ mock tests ──────────────────────────────────────────────────────────

const origFetch = globalThis.fetch;

test("fetch_ returns envelopes for a valid user", async () => {
  // fetchJson calls fetch in parallel for answers + profile, then sequentially for questions.
  // We distinguish by URL pattern: /answers -> answers, /users/1? -> profile, /questions/ -> questions.
  globalThis.fetch = async (url) => {
    if (url.includes("/answers")) {
      return {
        ok: true,
        json: async () => ({
          items: [{ answer_id: 42, question_id: 99, creation_date: 1700000000, score: 3, is_accepted: true }],
        }),
      };
    }
    if (url.includes("/questions/")) {
      return {
        ok: true,
        json: async () => ({
          items: [{ question_id: 99, title: "How do I mock fetch?" }],
        }),
      };
    }
    // user profile endpoint
    return {
      ok: true,
      json: async () => ({
        items: [{
          user_id: 1,
          reputation: 11,
          badge_counts: { bronze: 1, silver: 0, gold: 0 },
          collectives: [{ collective: { name: "Google Cloud", slug: "google-cloud", tags: [] } }],
          location: "Test City",
          creation_date: 1502286661,
          last_access_date: 1700000000,
          link: "https://stackoverflow.com/users/1/test",
        }],
      }),
    };
  };
  const out = await fetch_({ handle: "1" });
  assert.ok(Array.isArray(out));
  assert.ok(out.length >= 1);
  assert.equal(out[0].source, "stackoverflow");
  // First envelope should be the rating profile envelope
  assert.equal(out[0].kind, "rating");
  assert.equal(out[0].id, "stackoverflow:rating:1");
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
