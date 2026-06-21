import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeAnswers, fetch_ } from "../adapters/stackoverflow.mjs";

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

// ── fetch_ mock tests ──────────────────────────────────────────────────────────

const origFetch = globalThis.fetch;

test("fetch_ returns envelopes for a valid user", async () => {
  // fetchJson calls fetch twice: once for answers, once for questions.
  // First call returns an answer item; second call returns the matching question.
  let callCount = 0;
  globalThis.fetch = async (_url) => {
    callCount += 1;
    if (callCount === 1) {
      // answers endpoint
      return {
        ok: true,
        json: async () => ({
          items: [{ answer_id: 42, question_id: 99, creation_date: 1700000000, score: 3, is_accepted: true }],
        }),
      };
    }
    // questions batch endpoint
    return {
      ok: true,
      json: async () => ({
        items: [{ question_id: 99, title: "How do I mock fetch?" }],
      }),
    };
  };
  const out = await fetch_({ handle: "1" });
  assert.ok(Array.isArray(out));
  assert.ok(out.length >= 1);
  assert.equal(out[0].source, "stackoverflow");
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
