import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNoSecrets, sanitize } from "../lib/redact.mjs";

test("assertNoSecrets throws when output contains a secret value", () => {
  const secrets = ["SUPER_SECRET_KEY_123"];
  const output = JSON.stringify({ items: [{ note: "leaked SUPER_SECRET_KEY_123 here" }] });
  assert.throws(() => assertNoSecrets(output, secrets), /secret value detected/i);
});

test("assertNoSecrets passes for clean output", () => {
  const secrets = ["SUPER_SECRET_KEY_123"];
  const output = JSON.stringify({ items: [{ note: "all public data" }] });
  assert.doesNotThrow(() => assertNoSecrets(output, secrets));
});

test("assertNoSecrets ignores empty/short secret values", () => {
  // empty string and very short values must NOT trigger (would match everything)
  assert.doesNotThrow(() => assertNoSecrets("anything", ["", "ab"]));
});

test("sanitize replaces secret occurrences in a string", () => {
  const out = sanitize("error from token=SUPER_SECRET_KEY_123 failed", ["SUPER_SECRET_KEY_123"]);
  assert.ok(!out.includes("SUPER_SECRET_KEY_123"));
  assert.match(out, /\[REDACTED\]/);
});
