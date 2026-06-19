import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../");
const configSrc = readFileSync(resolve(ROOT, "src/config.ts"), "utf8");
const contentConfigSrc = readFileSync(resolve(ROOT, "src/content.config.ts"), "utf8");

// These tests only apply to the template repo (isTemplate: true).
// Personal forks legitimately enable sections and features with real content.
const IS_TEMPLATE = /isTemplate:\s*true/.test(configSrc);
if (!IS_TEMPLATE) process.exit(0); // skip gracefully in forks

// ── content.config.ts ──────────────────────────────────────────────────────
test("content.config.ts: draft defaults to true (safe template default)", () => {
  assert.ok(
    /draft.*\.optional\(\)\.default\(true\)/.test(contentConfigSrc),
    "draft must default to true so demo works don't render on fresh fork"
  );
  assert.ok(
    !/draft.*\.optional\(\)\.default\(false\)/.test(contentConfigSrc),
    "draft must not default to false"
  );
});

// ── SECTIONS ───────────────────────────────────────────────────────────────
const dangerousSections = [
  "showStartHere",
  "showExperience",
  "showSkills",
  "showPublications",
  "showStats",
  "showOpenSource",
  "showSpeaking",
  "showFeaturedModels",
  "showResources",
  "showCuratedLists",
  "showClients",
  "showEducation",
  "showAwards",
  "showFAQ",
];

for (const flag of dangerousSections) {
  test(`config.ts: SECTIONS.${flag} ships false (template default)`, () => {
    const match = configSrc.match(new RegExp(`${flag}:\\s*(true|false)`));
    assert.ok(match, `${flag} must be present in SECTIONS`);
    assert.equal(match[1], "false", `${flag} must default to false so demo data doesn't render`);
  });
}

// ── Feature block enabled flags ────────────────────────────────────────────
const featureBlocks = ["TESTIMONIALS", "NEWSLETTER", "CONNECT", "USES", "READING"];
for (const block of featureBlocks) {
  test(`config.ts: ${block} ships enabled:false (template default)`, () => {
    // Find the block and check that the first "enabled:" after its export is false
    const blockRe = new RegExp(`export const ${block}[^{]*\\{[^}]*enabled:\\s*(true|false)`);
    const match = configSrc.match(blockRe);
    assert.ok(match, `${block} must have an enabled field`);
    assert.equal(match[1], "false", `${block}.enabled must default to false`);
  });
}
