import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getArchivedRepos } from "../lib/parseWorks.mjs";
import { buildAlerts } from "../check-archives.mjs";

const FIXTURES_DIR = resolve(
  fileURLToPath(import.meta.url),
  "../../adapters/__fixtures__/works"
);

test("getArchivedRepos returns archived entries with githubRepo set", () => {
  const out = getArchivedRepos(FIXTURES_DIR);
  assert.equal(out.length, 1, "only one fixture has status:archived + githubRepo");
  assert.equal(out[0].title, "my-old-lib");
  assert.equal(out[0].githubRepo, "octocat/my-old-lib");
});

test("getArchivedRepos ignores archived entries without githubRepo", () => {
  const out = getArchivedRepos(FIXTURES_DIR);
  assert.ok(!out.some((r) => r.title === "no-repo-work"), "no-repo entry must be excluded");
});

test("getArchivedRepos ignores active entries even with githubRepo set", () => {
  const out = getArchivedRepos(FIXTURES_DIR);
  assert.ok(!out.some((r) => r.githubRepo === "octocat/active-project"), "active entry must be excluded");
});

test("getArchivedRepos never throws on malformed or missing frontmatter", () => {
  assert.doesNotThrow(() => getArchivedRepos(FIXTURES_DIR));
});

test("getArchivedRepos excludes draft:true entries", () => {
  const out = getArchivedRepos(FIXTURES_DIR);
  assert.ok(!out.some((r) => r.githubRepo === "your-username/your-repo"), "draft entry must be excluded");
});

test("buildAlerts returns repos whose githubRepo appears in github cache items", () => {
  const items = [
    { source: "github", payload: { repo: "octocat/my-old-lib", visibility: "public" } },
    { source: "github", payload: { repo: "octocat/other", visibility: "public" } },
  ];
  const archived = [{ title: "my-old-lib", githubRepo: "octocat/my-old-lib" }];
  const alerts = buildAlerts(items, archived);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].githubRepo, "octocat/my-old-lib");
});

test("buildAlerts ignores private cache items (payload.repo === 'private')", () => {
  const items = [
    { source: "github", payload: { repo: "private", visibility: "private" } },
  ];
  const archived = [{ title: "secret", githubRepo: "octocat/secret" }];
  const alerts = buildAlerts(items, archived);
  assert.equal(alerts.length, 0, "private cache items must not match archived repos");
});

test("buildAlerts returns [] when no match", () => {
  const items = [{ source: "pypi", payload: { registry: "pypi" } }];
  const archived = [{ title: "old", githubRepo: "octocat/old" }];
  assert.deepEqual(buildAlerts(items, archived), []);
});

test("buildAlerts never throws on empty/null inputs", () => {
  assert.doesNotThrow(() => buildAlerts(null, []));
  assert.doesNotThrow(() => buildAlerts([], null));
  assert.deepEqual(buildAlerts(null, []), []);
});
