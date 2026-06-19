import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getArchivedRepos } from "../lib/parseWorks.mjs";

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
