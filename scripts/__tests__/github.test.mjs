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
  assert.equal(commits.length, 5); // 2 on main + 1 on feature-x + 1 private + 1 new public
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
  assert.deepEqual(normalizeEvents([], undefined), [], "undefined cfg must not throw");
});

test("normalizeEvents represents a minimal PushEvent (no commits[]) by its head SHA", () => {
  const minimal = [
    {
      type: "PushEvent",
      repo: { name: "octocat/hello" },
      payload: { ref: "refs/heads/feat/x", head: "deadbeef123", before: "c0ffee456" },
      created_at: "2026-06-11T06:05:10Z",
    },
  ];
  const out = normalizeEvents(minimal, { handle: "octocat", maxCommits: 25 });
  const commits = out.filter((e) => e.kind === "commit");
  assert.equal(commits.length, 1);
  assert.equal(commits[0].payload.sha, "deadbeef123");
  assert.equal(commits[0].payload.branch, "feat/x");
  assert.equal(commits[0].id, "github:commit:deadbeef123");
  assert.equal(commits[0].url, "https://github.com/octocat/hello/commit/deadbeef123");
});

test("normalizeEvents: private repo commit has visibility:private and no sensitive data exposed", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 50 });
  const priv = out.find((e) => e.payload && e.payload.visibility === "private");
  assert.ok(priv, "private repo commit must appear");
  assert.equal(priv.payload.visibility, "private");
  assert.equal(priv.payload.message, undefined, "private commits must not expose message");
  assert.equal(priv.payload.sha, undefined, "private commits must not expose sha");
  assert.equal(priv.payload.repo, "private", "private commits must not expose real repo name");
  assert.equal(priv.payload.branch, undefined, "private commits must not expose branch name");
  // id must use event id, not the commit SHA (SHA would leak in sources-cache.json)
  assert.ok(!priv.id.includes("fff999"), "private commit id must not contain the SHA");
  assert.ok(priv.id.startsWith("github:commit:private-"), "private id uses event id prefix");
  // title must NOT contain the repo name — regression guard for C-2
  assert.equal(priv.title, "Pushed to a private repo", "private title must not expose short repo name");
  assert.ok(!priv.title.includes("secret-project"), "private title must not contain short repo name");
  // url must NOT contain the real private repo path (security: private repo name leak)
  assert.ok(!priv.url.includes("secret-project"), `private url must not expose repo name, got: ${priv.url}`);
  assert.ok(priv.url.startsWith("https://github.com"), "private url must still be a valid github URL");
});

test("normalizeEvents: private repo url must not embed the real repo path", () => {
  // Regression test for: url: `https://github.com/${repo}` leaking full private repo name.
  // The fix redirects private events to the user's profile page instead.
  const events = [
    {
      id: "privtest01",
      type: "PushEvent",
      public: false,
      repo: { name: "myorg/super-secret-repo" },
      payload: { ref: "refs/heads/main", commits: [{ sha: "deadbeef", message: "secret work" }] },
      created_at: "2026-06-15T12:00:00Z",
    },
  ];
  const out = normalizeEvents(events, { handle: "myuser", maxCommits: 25 });
  assert.equal(out.length, 1);
  const item = out[0];
  // Core invariant: the full private repo path must never appear in the url
  assert.ok(
    !item.url.includes("super-secret-repo"),
    `url must not contain private repo name, got: ${item.url}`
  );
  assert.ok(
    !item.url.includes("myorg"),
    `url must not contain org name, got: ${item.url}`
  );
  // url should point to the user's GitHub profile, not the repo
  assert.equal(item.url, "https://github.com/myuser", `expected profile url, got: ${item.url}`);
  // payload fields remain correctly redacted
  assert.equal(item.payload.repo, "private");
  assert.equal(item.payload.sha, undefined);
});

test("normalizeEvents: public repo commit has visibility:public with message", () => {
  const out = normalizeEvents(fixture, { handle: "octocat", maxCommits: 50 });
  const pub = out.find((e) => e.payload && e.payload.sha === "eee888");
  assert.ok(pub, "public commit must appear");
  assert.equal(pub.payload.visibility, "public");
  assert.ok(pub.payload.message, "public commits must have message");
  assert.ok(pub.payload.sha, "public commits must have sha");
});

test("normalizeEvents: events with no public field default to visibility:public", () => {
  const noFlag = [
    {
      type: "PushEvent",
      repo: { name: "octocat/test" },
      payload: { ref: "refs/heads/main", commits: [{ sha: "abc", message: "test" }] },
      created_at: "2026-06-01T00:00:00Z",
    },
  ];
  const out = normalizeEvents(noFlag, { handle: "octocat", maxCommits: 25 });
  assert.equal(out[0].payload.visibility, "public");
});

test("normalizeEvents: private ReleaseEvent is suppressed (no leak of repo name)", () => {
  const events = [
    {
      id: "privrel01",
      type: "ReleaseEvent",
      public: false,
      repo: { name: "owner/private-repo" },
      payload: { release: { tag_name: "v1.0", name: "v1.0", html_url: "https://github.com/owner/private-repo/releases/tag/v1.0" } },
      created_at: "2026-06-20T10:00:00Z",
    },
  ];
  const out = normalizeEvents(events, { handle: "owner", maxCommits: 25 });
  assert.equal(out.length, 0, "private ReleaseEvent must be suppressed");
});

test("normalizeEvents: PushEvent with ev.repo={} (no .name) does not throw and returns []", () => {
  const events = [
    {
      id: "badrepo01",
      type: "PushEvent",
      public: true,
      repo: {},
      payload: { ref: "refs/heads/main", commits: [{ sha: "abc123", message: "test" }] },
      created_at: "2026-06-20T11:00:00Z",
    },
  ];
  let out;
  assert.doesNotThrow(() => {
    out = normalizeEvents(events, { handle: "octocat", maxCommits: 25 });
  });
  assert.deepEqual(out, [], "event with missing repo.name must be silently skipped");
});
