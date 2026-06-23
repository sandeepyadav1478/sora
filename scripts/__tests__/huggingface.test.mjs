import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeHuggingface, toProfileEnvelope, fetch_ as huggingfaceFetch } from "../adapters/huggingface.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/huggingface.json", import.meta.url), "utf8"),
);

const cfg = { handle: "google", maxBadges: 50 };

test("huggingface: merges models + datasets into badge envelopes", () => {
  const out = normalizeHuggingface(fixture, cfg);
  assert.ok(out.length >= 2, "should yield model + dataset badges");
  assert.ok(out.some((e) => e.payload.kindOf === "model"), "has a model badge");
  assert.ok(out.some((e) => e.payload.kindOf === "dataset"), "has a dataset badge");
});

test("huggingface: model envelope core fields", () => {
  const out = normalizeHuggingface(fixture, cfg);
  const m = out.find((e) => e.payload.kindOf === "model");

  assert.equal(m.source, "huggingface");
  assert.equal(m.kind, "badge");
  assert.equal(m.id, `huggingface:badge:${m.title}`); // id = huggingface:badge:{id}, title = the model id
  assert.equal(m.id.split(":")[1], "badge", "id-kind invariant: id segment[1] === envelope.kind");
  assert.equal(m.url, `https://huggingface.co/${m.title}`);
  assert.equal(m.payload.issuer, "huggingface");
  assert.ok(!Number.isNaN(Date.parse(m.date)), "date is ISO-parseable");
  assert.equal(typeof m.payload.downloads, "number");
  assert.equal(typeof m.payload.likes, "number");
});

test("huggingface: dataset url gets /datasets/ segment + label falls back", () => {
  const out = normalizeHuggingface(fixture, cfg);
  const d = out.find((e) => e.payload.kindOf === "dataset");

  assert.equal(d.url, `https://huggingface.co/datasets/${d.title}`);
  assert.equal(d.id.split(":")[1], "badge");
  // datasets have no pipeline_tag/library_name -> label must be a non-empty string, never undefined
  assert.equal(typeof d.payload.label, "string");
});

test("huggingface: downloads of 0 render as 0, never -1", () => {
  const out = normalizeHuggingface(fixture, cfg);
  const zero = out.find((e) => e.payload.downloads === 0);
  assert.ok(zero, "the diffusiongemma model with downloads:0 should survive");
  assert.notEqual(zero.payload.downloads, -1);
});

test("huggingface: large tags[] arrays are trimmed", () => {
  const out = normalizeHuggingface(fixture, cfg);
  for (const e of out) {
    assert.ok(Array.isArray(e.payload.tags));
    assert.ok(e.payload.tags.length <= 12, "tags trimmed to <=12");
  }
});

test("huggingface: returns [] on garbage input", () => {
  assert.deepEqual(normalizeHuggingface(null, cfg), []);
  assert.deepEqual(normalizeHuggingface({}, cfg), []);
  assert.deepEqual(normalizeHuggingface({ models: "nope", datasets: 42 }, cfg), []);
  assert.deepEqual(normalizeHuggingface({ models: [{}], datasets: [] }, cfg), []); // entry with no id is dropped
});

test("fetch_ returns [] when handle is missing (graceful, no network, no throw)", async () => {
  const out = await huggingfaceFetch({ enabled: true, handle: "" });
  assert.deepEqual(out, []);
});

test("huggingface: toProfileEnvelope emits profile when overview has org membership", () => {
  const overview = {
    isPro: false,
    fullname: "Sandeep Yadav",
    numModels: 0,
    numDatasets: 0,
    numSpaces: 0,
    numDiscussions: 1,
    numPapers: 0,
    numUpvotes: 1,
    numLikes: 1,
    numFollowers: 0,
    numFollowing: 1,
    orgs: [{ name: "allanite-ml", fullname: "Allanite Machine Learning" }],
    user: "sandeepyadav1478",
    createdAt: "2023-08-02T08:48:26.000Z",
  };
  const envelope = toProfileEnvelope(overview, "sandeepyadav1478");
  assert.ok(envelope !== null, "should emit a profile envelope");
  assert.equal(envelope.source, "huggingface");
  assert.equal(envelope.kind, "profile");
  assert.ok(envelope.title.startsWith("HuggingFace: "), "title has HuggingFace prefix");
  assert.ok(envelope.title.includes("Allanite Machine Learning"), "title includes org fullname");
  assert.equal(envelope.url, "https://huggingface.co/sandeepyadav1478");
  assert.equal(envelope.payload.platform, "huggingface");
  assert.equal(envelope.payload.orgs.length, 1);
  assert.equal(envelope.payload.orgs[0].name, "allanite-ml");
  assert.equal(envelope.payload.orgs[0].fullname, "Allanite Machine Learning");
  assert.equal(envelope.payload.joinedAt, "2023-08-02T08:48:26.000Z");
  assert.equal(envelope.id.split(":")[1], "profile", "id-kind invariant: id segment[1] === envelope.kind");
});

test("huggingface: toProfileEnvelope suppresses profile when all counts are zero and no orgs", () => {
  const overview = {
    isPro: false,
    fullname: "Ghost User",
    numModels: 0,
    numDatasets: 0,
    numSpaces: 0,
    numDiscussions: 0,
    numPapers: 0,
    numUpvotes: 0,
    numLikes: 0,
    numFollowers: 0,
    numFollowing: 0,
    orgs: [],
    user: "ghost",
    createdAt: "2024-01-01T00:00:00.000Z",
  };
  const envelope = toProfileEnvelope(overview, "ghost");
  assert.equal(envelope, null, "should return null when profile has no meaningful data");
});
