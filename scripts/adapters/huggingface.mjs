import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";
import { safeIso } from "../lib/datetime.mjs";
import { truncate } from "../lib/text.mjs";

export const id = "huggingface";
export const needs = []; // zero-secret: public read-only endpoints

const MAX_TAGS = 12;

// Drop noisy machine tags, keep the human-meaningful ones, cap the count.
function trimTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t) => typeof t === "string" && t.length > 0)
    .filter((t) => !/^(region:|format:|modality:|library:|base_model:|size_categories:|arxiv:)/.test(t))
    .slice(0, MAX_TAGS)
    .map((t) => truncate(t, 60));
}

// downloads/likes are sometimes absent or 0. 0 is a real value — keep it.
// Only coerce non-finite (undefined/null/NaN) to 0; never emit -1.
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toBadge(raw, kindOf) {
  if (!raw || typeof raw !== "object") return null;
  const hfId = typeof raw.id === "string" ? raw.id : raw.modelId;
  if (!hfId || typeof hfId !== "string") return null; // no id -> cannot build envelope

  const date = safeIso(raw.createdAt) || safeIso(raw.lastModified);
  if (!date) return null; // makeEnvelope throws on a bad date; drop instead

  const url =
    kindOf === "dataset"
      ? `https://huggingface.co/datasets/${hfId}`
      : `https://huggingface.co/${hfId}`;

  // label: models have pipeline_tag, fall back to library_name; datasets have neither.
  const label =
    (typeof raw.pipeline_tag === "string" && raw.pipeline_tag) ||
    (typeof raw.library_name === "string" && raw.library_name) ||
    kindOf; // graceful non-empty fallback ("dataset"/"model")

  return makeEnvelope({
    id: stableId("huggingface", "badge", hfId), // id = huggingface:badge:{id}; segment[1] === "badge"
    source: "huggingface", // must-fix §3.2 — always explicit
    kind: "badge",
    title: hfId, // title = the model/dataset id
    url,
    date,
    payload: {
      issuer: "huggingface",
      downloads: num(raw.downloads),
      likes: num(raw.likes),
      label,
      kindOf, // "model" | "dataset"
      tags: trimTags(raw.tags),
    },
  });
}

export function normalizeHuggingface(raw, cfg) {
  if (!raw || typeof raw !== "object") return [];
  const models = Array.isArray(raw.models) ? raw.models : [];
  const datasets = Array.isArray(raw.datasets) ? raw.datasets : [];

  const items = [
    ...models.map((m) => toBadge(m, "model")),
    ...datasets.map((d) => toBadge(d, "dataset")),
  ].filter(Boolean); // drop the nulls (missing id / bad date)

  const max = cfg && Number.isFinite(cfg.maxBadges) ? cfg.maxBadges : 50;
  return items
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)) // newest first
    .slice(0, max);
}

export async function fetch_(cfg) {
  try {
    if (!cfg || !cfg.handle) return [];
    const author = encodeURIComponent(cfg.handle);
    const limit = cfg && Number.isFinite(cfg.maxBadges) ? cfg.maxBadges : 50;
    const [models, datasets] = await Promise.all([
      fetchJson(`https://huggingface.co/api/models?author=${author}&limit=${limit}`),
      fetchJson(`https://huggingface.co/api/datasets?author=${author}&limit=${limit}`),
    ]);
    return normalizeHuggingface({ models, datasets }, cfg);
  } catch {
    return []; // never throw out of fetch
  }
}

export { fetch_ as fetch };
