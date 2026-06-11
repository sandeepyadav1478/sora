import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRun } from "../sync-sources.mjs";

test("shouldRun gates on enabled only (not on a 'handle' field)", () => {
  assert.equal(shouldRun({ enabled: true, packages: ["x"] }), true);   // npm-style, no handle
  assert.equal(shouldRun({ enabled: true, feeds: ["u"] }), true);      // rss-style
  assert.equal(shouldRun({ enabled: true, instance: "m", user: "u" }), true); // mastodon-style
  assert.equal(shouldRun({ enabled: true, handle: "x" }), true);       // github/pypi-style
});

test("shouldRun skips disabled or missing config", () => {
  assert.equal(shouldRun({ enabled: false, handle: "x" }), false);
  assert.equal(shouldRun(null), false);
  assert.equal(shouldRun(undefined), false);
  assert.equal(shouldRun({}), false);
});
