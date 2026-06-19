import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WORKS_DIR = resolve(
  fileURLToPath(import.meta.url),
  "../../../src/data/works"
);

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*"?([^"#\r\n]*)"?\s*$/);
    if (m) fm[m[1].trim()] = m[2].trim();
  }
  return fm;
}

export function getArchivedRepos(worksDir = DEFAULT_WORKS_DIR) {
  try {
    const files = readdirSync(worksDir).filter((f) => f.endsWith(".md"));
    const out = [];
    for (const f of files) {
      try {
        const content = readFileSync(join(worksDir, f), "utf8");
        const fm = parseFrontmatter(content);
        if (!fm) continue;
        if (fm.status === "archived" && fm.githubRepo && fm.title) {
          out.push({ title: fm.title, githubRepo: fm.githubRepo });
        }
      } catch {
        // skip unreadable files
      }
    }
    return out;
  } catch {
    return [];
  }
}
