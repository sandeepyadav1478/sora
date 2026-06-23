import { makeEnvelope, stableId } from "../lib/envelope.mjs";
import { fetchJson } from "../lib/http.mjs";
import { safeIso } from "../lib/datetime.mjs";
import { truncate } from "../lib/text.mjs";

export const id = "huggingface";
export const needs = []; // zero-secret: public read-only endpoints

const MAX_TAGS = 12;

const OVERVIEW_URL = (handle) =>
  `https://huggingface.co/api/users/${encodeURIComponent(handle)}/overview`;

const LIKES_URL = (handle) =>
  `https://huggingface.co/api/users/${encodeURIComponent(handle)}/likes`;

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

const MAX_LIKES = 20;

function normalizeLikes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_LIKES)
    .map((item) => {
      if (!item || !item.repo) return null;
      return {
        name: item.repo.name,
        type: item.repo.type,
        likedAt: item.createdAt,
      };
    })
    .filter(Boolean);
}

export function toProfileEnvelope(overview, handle, likesRaw) {
  if (!overview || typeof overview !== "object") return null;
  const orgs = Array.isArray(overview.orgs) ? overview.orgs : [];
  const numModels = num(overview.numModels);
  const numUpvotes = num(overview.numUpvotes);
  // Only emit if the profile has something worth showing
  if (orgs.length === 0 && numModels === 0 && numUpvotes === 0) return null;

  const titleActivity =
    numModels > 0 ? `${numModels} model${numModels === 1 ? "" : "s"}` : "Active member";
  const titleOrg = orgs.length > 0 ? ` · ${orgs[0].fullname}` : "";

  return makeEnvelope({
    id: stableId("huggingface", "profile", handle),
    source: "huggingface",
    kind: "profile",
    title: `HuggingFace: ${titleActivity}${titleOrg}`,
    url: `https://huggingface.co/${handle}`,
    date: overview.createdAt,
    payload: {
      platform: "huggingface",
      numModels,
      numDatasets: num(overview.numDatasets),
      numSpaces: num(overview.numSpaces),
      numDiscussions: num(overview.numDiscussions),
      numPapers: num(overview.numPapers),
      numUpvotes,
      numLikes: num(overview.numLikes),
      numFollowers: num(overview.numFollowers),
      numFollowing: num(overview.numFollowing),
      orgs: orgs.map((o) => ({ name: o.name, fullname: o.fullname })),
      joinedAt: overview.createdAt,
      likes: normalizeLikes(likesRaw),
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
    const [models, datasets, overview, likesRaw] = await Promise.all([
      fetchJson(`https://huggingface.co/api/models?author=${author}&limit=${limit}`),
      fetchJson(`https://huggingface.co/api/datasets?author=${author}&limit=${limit}`),
      fetchJson(OVERVIEW_URL(cfg.handle)),
      fetchJson(LIKES_URL(cfg.handle)),
    ]);
    const badges = normalizeHuggingface({ models, datasets }, cfg);
    const profile = toProfileEnvelope(overview, cfg.handle, likesRaw);
    return profile ? [profile, ...badges] : badges;
  } catch {
    return []; // never throw out of fetch
  }
}

export { fetch_ as fetch };
