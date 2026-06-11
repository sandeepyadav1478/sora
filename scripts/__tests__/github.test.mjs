import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeEvents, EVENTS_URL } from "../adapters/github.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../adapters/__fixtures__/github-events.json", import.meta.url), "utf8")
);

test("EVENTS_URL targets the /events/public endpoint (security: never /events)", () => {
  const url = EVENTS_URL("octocat");
  assert.ok(url.endsWith("/users/octocat/events/public"), `got ${url}`);
  assert.ok(!/\/events($|\?)/.test(url), "must not be the unsuffixed /events endpoint");
});

test("normalizeEvents expands PushEvent commits into commit envelopes", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 25 });
  const commits = out.filter((e) => e.kind === "commit");
  assert.equal(commits.length, 3); // 2 on main + 1 on feature-x
  const first = commits.find((c) => c.payload.sha === "aaa111");
  assert.equal(first.source, "github");
  assert.equal(first.id, "github:commit:aaa111");
  assert.equal(first.payload.repo, "octocat/hello");
  assert.equal(first.payload.branch, "main");
});

test("normalizeEvents captures unmerged-branch commits (branch from ref)", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 25 });
  const wip = out.find((e) => e.payload && e.payload.sha === "ccc333");
  assert.ok(wip, "unmerged feature-x commit must appear");
  assert.equal(wip.payload.branch, "feature-x");
});

test("normalizeEvents maps ReleaseEvent and ignores unrelated events", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 25 });
  const releases = out.filter((e) => e.kind === "release");
  assert.equal(releases.length, 1);
  assert.equal(releases[0].payload.version, "v1.2.0");
  assert.equal(out.some((e) => e.title.includes("started")), false);
});

test("normalizeEvents caps commits at maxCommits", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 2 });
  assert.equal(out.filter((e) => e.kind === "commit").length, 2);
});

test("normalizeEvents returns [] for empty/garbage input (never throws)", () => {
  assert.deepEqual(normalizeEvents([], { handle: "x", maxCommits: 25 }), []);
  assert.deepEqual(normalizeEvents(null, { handle: "x", maxCommits: 25 }), []);
});
