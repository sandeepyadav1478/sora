import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectSecrets, sanitize } from "./lib/redact.mjs";

// Use __dirname-anchored path so this script works regardless of CWD.
const REPORT_PATH = resolve(fileURLToPath(import.meta.url), "../../sync-report.json");

let report;
try {
  report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
} catch (e) {
  console.error("process-report: could not read sync-report.json:", e.message);
  process.exit(1);
}

// Independent redaction layer — upstream already sanitizes, but re-sanitize before
// any value reaches public GHA outputs (annotations, issue body).
const secrets = collectSecrets(["WAKATIME_API_KEY"]);
const safeError = (err) => sanitize((err ?? "").replace(/\n/g, " "), secrets);

// Write failure_count to GitHub Actions output (read by if: conditions in workflow)
const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `failure_count=${report.failures.length}\n`);
}

// Emit ::warning:: annotations — visible in the Actions summary without opening the full log
for (const f of report.failures) {
  process.stdout.write(`::warning::Sync failed for source ${f.source}: ${safeError(f.error)}\n`);
}

// Write issue body to a temp file (workflow uses --body-file to avoid quoting issues)
const runUrl =
  process.env.GITHUB_SERVER_URL &&
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_RUN_ID
    ? [
        process.env.GITHUB_SERVER_URL,
        process.env.GITHUB_REPOSITORY,
        "actions/runs",
        process.env.GITHUB_RUN_ID,
      ].join("/")
    : "";

const bodyLines = [
  "## Sync failures",
  "",
  runUrl ? `**Run:** ${runUrl}` : "_Run URL unavailable_",
  "",
  ...report.failures.map((f) => `- **${f.source}**: \`${safeError(f.error)}\``),
  "",
  `_Last updated: ${report.generatedAt}_`,
];
writeFileSync("/tmp/issue_body.md", bodyLines.join("\n"));
