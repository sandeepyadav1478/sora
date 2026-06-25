import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const id = "linkedin";
export const needs = []; // file-based — no secrets, no network in CI

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadCache(cacheFile) {
  const path = cacheFile
    ? resolve(process.cwd(), cacheFile)
    : resolve(__dirname, "../../src/data/linkedin-cache.json");
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}

function parseLinkedInDate(dateStr) {
  if (!dateStr) return null;
  const months = { Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12" };
  const m = dateStr.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})/);
  if (!m) return null;
  return m[2] + "-" + months[m[1]] + "-01T00:00:00.000Z";
}

export function normalizeLinkedIn(cache, cfg = {}) {
  if (!cache?.profile) return [];
  const p = cache.profile;
  const out = [];
  const fetchedAt = (cache.fetchedAt || "2026-01-01") + "T00:00:00.000Z";

  // Profile overview
  out.push(makeEnvelope({
    id: stableId("linkedin", "profile", "sandeepyadav1478"),
    source: "linkedin",
    kind: "profile",
    title: p.headline ? p.name + " — " + p.headline : p.name,
    url: p.url || "https://www.linkedin.com/in/sandeepyadav1478/",
    date: fetchedAt,
    payload: {
      platform: "linkedin",
      name: p.name,
      headline: p.headline || "",
      location: p.location || "",
      followers: p.followers || 0,
      connections: p.connections || "",
      openToWork: p.openToWork || [],
      fetchedAt: cache.fetchedAt || "2026-01-01",
    },
  }));

  // Experience envelopes
  for (const exp of (p.experience || [])) {
    if (!exp.title || !exp.company) continue;
    const date = parseLinkedInDate(exp.start) || fetchedAt;
    const key = (exp.company + "-" + (exp.start || "unknown")).replace(/\s+/g, "-").toLowerCase();
    out.push(makeEnvelope({
      id: stableId("linkedin", "rating", key),
      source: "linkedin",
      kind: "rating",
      title: exp.title + " at " + exp.company,
      url: p.url || "https://www.linkedin.com/in/sandeepyadav1478/",
      date,
      payload: {
        platform: "linkedin",
        subkind: "experience",
        title: exp.title,
        company: exp.company,
        type: exp.type || "",
        start: exp.start || "",
        end: exp.end || "Present",
        duration: exp.duration || "",
        location: exp.location || "",
        bullets: exp.bullets || [],
        isCurrent: exp.isCurrent === true,
      },
    }));
  }

  return out;
}

export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.enabled) return [];
    const cache = loadCache(cfg.cacheFile);
    if (!cache) return []; // silently skip — run fetch:linkedin to populate
    return normalizeLinkedIn(cache, cfg);
  } catch {
    return [];
  }
}

export { fetch_ as fetch };
