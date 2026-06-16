import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const report = JSON.parse(readFileSync("sync-report.json", "utf8"));

// Write failure_count to GitHub Actions output (read by if: conditions in workflow)
const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `failure_count=${report.failures.length}\n`);
}

// Emit ::warning:: annotations — visible in the Actions summary without opening the full log
for (const f of report.failures) {
  process.stdout.write(`::warning::Sync failed for source ${f.source}: ${f.error.replace(/\n/g, " ")}\n`);
}

// Write issue body to a temp file (workflow uses --body-file to avoid quoting issues)
const runUrl = process.env.GITHUB_SERVER_URL &&
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
  ...report.failures.map((f) => `- **${f.source}**: \`${f.error}\``),
  "",
  `_Last updated: ${report.generatedAt}_`,
];
writeFileSync("/tmp/issue_body.md", bodyLines.join("\n"));
