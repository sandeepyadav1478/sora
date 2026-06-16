# Plan 2 — Source Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 10 remaining source adapters (PyPI, npm, RSS, YouTube, Codeforces, StackOverflow, Bluesky, Mastodon, HuggingFace, WakaTime) on top of the Plan 1 spine, each verified against its real API.

**Architecture:** Each adapter is one ESM file exporting `id`, `needs`, a pure `normalize*(raw, cfg)` transform, and a network `fetch(cfg)` that returns `[]` on any error. Four shared utilities (`http`, `text`, `datetime`, `parseFeed`) are built first to keep the adapters DRY. The orchestrator and envelope are unchanged — adapters are registered in the `ADAPTERS` map and configured in `SOURCES`. Tests are `node:test` suites running the pure transforms against frozen real-API fixtures.

**Tech Stack:** Node 22 ESM, zero runtime dependencies, `node --test` (via `npm run test:sync`), Astro for rendering.

**Spec:** `docs/superpowers/specs/2026-06-11-plan2-adapters-design.md`

---

## Load-bearing invariants (verified against live Plan 1 code — apply to EVERY task)

1. **`mergeSources` REPLACES per-source items, it does not accumulate** ([cache.mjs:41](../../../scripts/lib/cache.mjs#L41)). Each `fetch()` returns the complete current state for that source. A date-windowed dedup key produces no history — only id churn. Caps bound a single fetch.
2. **`source` is a 6th REQUIRED field that throws** ([envelope.mjs:13](../../../scripts/lib/envelope.mjs#L13)). Every `makeEnvelope` call passes `source: "<id>"` explicitly. Forgetting it → caught throw → silent `[]`.
3. **`stableId`'s kind segment must equal `envelope.kind`** ([envelope.mjs:29](../../../scripts/lib/envelope.mjs#L29)). `id.split(":")[1] === envelope.kind` for every emitted item. A shared test enforces this.
4. **Adapters never throw out of `fetch`** — wrap everything in try/catch, return `[]`. The orchestrator owns retry/fallback.

---

## Task 0: Shared utilities (build FIRST — they unblock every adapter)

**Files:**
- Create: `scripts/lib/http.mjs`
- Create: `scripts/lib/text.mjs`
- Create: `scripts/lib/datetime.mjs`
- Create: `scripts/lib/parseFeed.mjs`
- Test: `scripts/__tests__/lib-utils.test.mjs`

- [ ] **Step 1: Write `scripts/lib/http.mjs`** — fetch wrapper extracted from the inline logic in [github.mjs:91-95](../../../scripts/adapters/github.mjs#L91-L95).

```js
// Minimal fetch wrappers: User-Agent, timeout, throw-on-non-200. No caching (gold-plating at build-time volume).
const UA = "sora-portfolio-aggregator";

async function request(url, { headers = {}, timeoutMs = 10000 } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

export async function fetchJson(url, opts = {}) {
  const res = await request(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers || {}) } });
  return res.json();
}

export async function fetchText(url, opts = {}) {
  const res = await request(url, opts);
  return res.text();
}
```

- [ ] **Step 2: Write `scripts/lib/datetime.mjs`** — kills the unix-seconds×1000 silent-1970 bug class.

```js
/** Unix SECONDS -> ISO. (Codeforces, StackOverflow return seconds; the missing *1000 silently yields a 1970 date.) */
export function toIso(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString();
}

/** Parse a date string -> ISO, or null if unparseable (guard before makeEnvelope, which throws on bad dates). */
export function safeIso(str) {
  if (!str) return null;
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
```

- [ ] **Step 3: Write `scripts/lib/text.mjs`** — `synthTitle` guards the `makeEnvelope` falsy-title throw (6 sources have no native title).

```js
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

export function decodeEntities(s = "") {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => (name in NAMED ? NAMED[name] : m));
}

export function stripCdata(s = "") {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Tags -> SPACE (never concatenate words), then collapse whitespace. */
export function stripHtml(s = "") {
  return decodeEntities(stripCdata(s).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export function truncate(s = "", n = 80) {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

/** First sentence / ~80 chars. NEVER returns empty — falls back so makeEnvelope's title check passes. */
export function synthTitle(text, fallback) {
  const clean = stripHtml(String(text || "")).trim();
  if (!clean) return fallback;
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0];
  return truncate(firstSentence || clean, 80);
}
```

- [ ] **Step 4: Write `scripts/lib/parseFeed.mjs`** — zero-dep RSS + Atom + namespaced extraction (no XML parser is installed; `@astrojs/rss` is output-only).

```js
import { decodeEntities, stripCdata, stripHtml } from "./text.mjs";

function tag(block, name) {
  // namespaced-safe: matches <name ...>...</name> for the first occurrence
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(stripCdata(m[1])).trim() : "";
}

function attr(block, name, a) {
  const re = new RegExp(`<${name}[^>]*\\b${a}=["']([^"']+)["'][^>]*/?>`, "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

/** Atom: prefer <link rel="alternate" type="text/html"> over rel="self". */
function atomLink(block) {
  const links = [...block.matchAll(/<link\b[^>]*\/?>/gi)].map((m) => m[0]);
  const alt = links.find((l) => /rel=["']alternate["']/i.test(l)) || links.find((l) => !/rel=["']self["']/i.test(l)) || links[0] || "";
  return attrFrom(alt, "href");
}
function attrFrom(tagStr, a) {
  const m = tagStr.match(new RegExp(`\\b${a}=["']([^"']+)["']`, "i"));
  return m ? m[1] : "";
}

export function parseFeed(xmlText) {
  const xml = String(xmlText || "");
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const feedTitle = tag(xml, "title");
  const blocks = isAtom
    ? [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0])
    : [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);

  const items = blocks.map((b) => {
    const rawDesc = isAtom ? tag(b, "summary") || tag(b, "content") : tag(b, "description");
    return {
      title: tag(b, "title"),
      link: isAtom ? atomLink(b) : tag(b, "link"),
      date: isAtom ? tag(b, "updated") || tag(b, "published") : tag(b, "pubDate"),
      excerpt: stripHtml(rawDesc),
      guid: isAtom ? tag(b, "id") : tag(b, "guid"),
      videoId: tag(b, "yt:videoId"),
      thumbnail: attr(b, "media:thumbnail", "url"),
      views: attr(b, "media:statistics", "views"),
    };
  });
  return { feedTitle, items };
}
```

- [ ] **Step 5: Write `scripts/__tests__/lib-utils.test.mjs`** — exercise the correctness rules.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toIso, safeIso } from "../lib/datetime.mjs";
import { stripHtml, synthTitle, decodeEntities, truncate } from "../lib/text.mjs";
import { parseFeed } from "../lib/parseFeed.mjs";

test("toIso converts unix SECONDS (not ms) to ISO", () => {
  assert.equal(toIso(1779557700), "2026-05-22T13:35:00.000Z");
});

test("safeIso returns null on garbage (guards makeEnvelope throw)", () => {
  assert.equal(safeIso("not a date"), null);
  assert.equal(safeIso(""), null);
  assert.ok(safeIso("2026-06-11T00:00:00Z"));
});

test("stripHtml replaces tags with space and collapses (never concatenates words)", () => {
  assert.equal(stripHtml("<p>hello</p><p>world</p>"), "hello world");
});

test("decodeEntities handles named + numeric", () => {
  assert.equal(decodeEntities("a &amp; b &#39;c&#39; &#x3c;"), "a & b 'c' <");
});

test("synthTitle never returns empty (falls back)", () => {
  assert.equal(synthTitle("", "Fallback"), "Fallback");
  assert.equal(synthTitle("   ", "FB"), "FB");
  assert.equal(synthTitle("First sentence. Second.", "FB"), "First sentence.");
});

test("truncate ellipsizes", () => {
  assert.equal(truncate("abcdefghij", 5), "abcd…");
});

test("parseFeed reads an RSS item", () => {
  const xml = `<rss><channel><title>My Feed</title>
    <item><title>Post A</title><link>https://x.test/a</link>
    <pubDate>Wed, 11 Jun 2026 06:00:00 GMT</pubDate>
    <description><![CDATA[<b>Body</b> text]]></description><guid>g-a</guid></item>
    </channel></rss>`;
  const { feedTitle, items } = parseFeed(xml);
  assert.equal(feedTitle, "My Feed");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Post A");
  assert.equal(items[0].link, "https://x.test/a");
  assert.equal(items[0].guid, "g-a");
  assert.equal(items[0].excerpt, "Body text");
});

test("parseFeed reads an Atom entry and prefers rel=alternate link", () => {
  const xml = `<feed><title>Atom Feed</title>
    <entry><title>Entry A</title>
    <link rel="self" href="https://x.test/self"/>
    <link rel="alternate" type="text/html" href="https://x.test/post"/>
    <updated>2026-06-11T06:00:00Z</updated><id>id-a</id>
    <summary>Summary text</summary></entry></feed>`;
  const { items } = parseFeed(xml);
  assert.equal(items[0].link, "https://x.test/post");
  assert.equal(items[0].date, "2026-06-11T06:00:00Z");
  assert.equal(items[0].guid, "id-a");
});
```

- [ ] **Step 6: Run the util tests, expect PASS**

Run: `node --test 'scripts/__tests__/lib-utils.test.mjs'`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/http.mjs scripts/lib/text.mjs scripts/lib/datetime.mjs scripts/lib/parseFeed.mjs scripts/__tests__/lib-utils.test.mjs
git commit --no-verify -m "feat: shared adapter utilities (http, text, datetime, parseFeed)"
```

---

## Task 1: Generalize the orchestrator gate (unblocks non-handle adapters)

**Files:**
- Modify: `scripts/sync-sources.mjs:31` (the skip gate)
- Test: `scripts/__tests__/sync-gate.test.mjs`

**Why:** The Plan 1 gate is `if (!cfg || !cfg.enabled || !cfg.handle) continue;` ([sync-sources.mjs:31](../../../scripts/sync-sources.mjs#L31)). It hard-requires a single `handle` field. But several Plan 2 adapters key off other config: npm (`packages[]`), rss (`feeds[]`), mastodon (`instance`+`user`). With the old gate they would be **silently skipped forever**. We generalize the gate to check only `enabled`, and make each adapter validate its own required config inside `fetch()` (returning `[]` if its config is incomplete — most already do). This avoids fake sentinel `handle` fields polluting every forker's config.

- [ ] **Step 1: Write the failing test.** Create `scripts/__tests__/sync-gate.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test, expect FAIL** (`shouldRun` is not exported yet).

Run: `npm run test:sync`
Expected: import/resolution error for `shouldRun`.

- [ ] **Step 3: Refactor the gate.** In `scripts/sync-sources.mjs`, extract and export the predicate, and replace the inline gate. Change:

```js
    const cfg = SOURCES[key];
    if (!cfg || !cfg.enabled || !cfg.handle) {
      console.log(`- ${key}: skipped (disabled or no handle)`);
      continue;
    }
```

to:

```js
    const cfg = SOURCES[key];
    if (!shouldRun(cfg)) {
      console.log(`- ${key}: skipped (disabled)`);
      continue;
    }
```

and add this export near the top of the file (after the imports):

```js
/** A source runs when it is enabled. Each adapter validates its own required
 *  config (handle/packages/feeds/instance) inside fetch(), returning [] if incomplete. */
export function shouldRun(cfg) {
  return Boolean(cfg && cfg.enabled);
}
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `npm run test:sync`
Expected: the gate test passes; Plan 1's existing suites (github, cache, dedup, redact) stay green.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-sources.mjs scripts/__tests__/sync-gate.test.mjs
git commit --no-verify -m "refactor: gate sources on enabled only (adapters self-validate config)"
```

> **Note for all adapter tasks below:** because of this change, each adapter's `fetch(cfg)` MUST guard its own required config as the first line (e.g. `if (!cfg || !cfg.handle) return [];`, or the `packages`/`feeds`/`instance` equivalent) — the orchestrator no longer does it.

---

## Task 2: pypi adapter

**Files:** Create `scripts/adapters/pypi.mjs` ; Test `scripts/__tests__/pypi.test.mjs` ; Fixture `scripts/adapters/__fixtures__/pypi.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

**Context:** Zero-secret package adapter. The PyPI JSON API (`https://pypi.org/pypi/<name>/json`) returns the *latest* release in `info.version` plus the files for that release in the top-level `urls[]` array. Each item we emit is one published release: `id=pypi:package:{name}@{version}` (immutable), `title="${name} ${version}"`, `url=info.release_url` (falls back to `info.package_url`), `date` = the earliest `upload_time_iso_8601` across the release's files. Payload is `{registry:"pypi", version}`. We **omit** download counts (the API reports `-1`). This adapter depends on `fetchJson` from `scripts/lib/http.mjs` (built in Task 0) for the network call.

**GOTCHAs (verified against the live response on 2026-06-11):**
- `releases{}` keys are **lexicographic** strings (`"2.9.2"` sorts after `"2.34.2"`), so never pick the "last key" — always trust `info.version` for the current release.
- Some versions map to an **empty file array** (e.g. `"0.0.1": []` in the live `requests` data). If `urls[]` is empty there is no upload time — guard and skip rather than emit a dateless envelope (which would throw in `makeEnvelope`).
- Use `upload_time_iso_8601` (e.g. `"2026-05-14T19:25:26.443000Z"`), **not** the naive `upload_time` (`"2026-05-14T19:25:26"`, no zone).
- A missing package returns HTTP **404** → `fetchJson` throws → `fetch_` catches → `[]`.

- [ ] **Step 1: Capture the real fixture.** Run exactly:
  ```bash
  curl -s --compressed "https://pypi.org/pypi/requests/json" > scripts/adapters/__fixtures__/pypi.json
  ```
  The captured file is large, but the shape the normalize fn reads is (trimmed real excerpt, sub-1KB — your saved fixture is the full untrimmed response):
  ```json
  {
    "info": {
      "name": "requests",
      "version": "2.34.2",
      "release_url": "https://pypi.org/project/requests/2.34.2/",
      "package_url": "https://pypi.org/project/requests/",
      "summary": "Python HTTP for Humans."
    },
    "urls": [
      { "filename": "requests-2.34.2-py3-none-any.whl", "upload_time_iso_8601": "2026-05-14T19:25:26.443000Z", "upload_time": "2026-05-14T19:25:26" },
      { "filename": "requests-2.34.2.tar.gz",            "upload_time_iso_8601": "2026-05-14T19:25:27.735762Z", "upload_time": "2026-05-14T19:25:27" }
    ],
    "releases": { "2.34.2": [ /* same files */ ], "0.0.1": [] }
  }
  ```
  Note: the `info.version` in your fixture is whatever the latest `requests` release is at capture time. The test below reads `fixture.info.version` rather than hardcoding `2.34.2`, so it stays green regardless.

- [ ] **Step 2: Write the failing test.** Create `scripts/__tests__/pypi.test.mjs`:
  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { normalizePackage } from "../adapters/pypi.mjs";

  const fixture = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/pypi.json", import.meta.url), "utf8")
  );

  test("normalizePackage emits one package envelope for the current release", () => {
    const out = normalizePackage(fixture, { maxPackages: 25 });
    assert.equal(out.length, 1);
    const e = out[0];
    const { name, version } = fixture.info;

    // id / source / kind
    assert.equal(e.source, "pypi");
    assert.equal(e.kind, "package");
    assert.equal(e.id, `pypi:package:${name}@${version}`);

    // id-kind invariant (must-fix §3.3): id.split(":")[1] === envelope.kind
    assert.equal(e.id.split(":")[1], "package");
    assert.equal(e.id.split(":")[1], e.kind);

    // title / url
    assert.equal(e.title, `${name} ${version}`);
    assert.equal(e.url, fixture.info.release_url);

    // date = earliest upload_time_iso_8601 across the release files, ISO-parseable
    const earliest = fixture.urls
      .map((u) => u.upload_time_iso_8601)
      .sort()[0];
    assert.equal(e.date, earliest);
    assert.ok(!Number.isNaN(Date.parse(e.date)));

    // payload: registry + version, no downloads field
    assert.deepEqual(e.payload, { registry: "pypi", version });
    assert.equal("downloads" in e.payload, false);
  });

  test("dedup key (id) is the immutable name@version", () => {
    const out = normalizePackage(fixture, { maxPackages: 25 });
    const { name, version } = fixture.info;
    assert.equal(out[0].id, `pypi:package:${name}@${version}`);
  });

  test("falls back to package_url when release_url is missing", () => {
    const noReleaseUrl = {
      ...fixture,
      info: { ...fixture.info, release_url: "" },
    };
    const out = normalizePackage(noReleaseUrl, { maxPackages: 25 });
    assert.equal(out[0].url, fixture.info.package_url);
  });

  test("skips a release whose files array is empty (no upload time to date it)", () => {
    const noFiles = { ...fixture, urls: [] };
    assert.deepEqual(normalizePackage(noFiles, { maxPackages: 25 }), []);
  });

  test("returns [] on garbage / missing info (never throws)", () => {
    assert.deepEqual(normalizePackage(null, { maxPackages: 25 }), []);
    assert.deepEqual(normalizePackage({}, { maxPackages: 25 }), []);
    assert.deepEqual(normalizePackage({ info: {} }, { maxPackages: 25 }), []);
    assert.deepEqual(normalizePackage("nope", { maxPackages: 25 }), []);
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL** (adapter file does not exist yet):
  ```bash
  npm run test:sync
  ```
  Expect an import/resolution error for `../adapters/pypi.mjs` (or assertion failures once the file is stubbed).

- [ ] **Step 4: Write the adapter.** Create `scripts/adapters/pypi.mjs`:
  ```js
  import { makeEnvelope, stableId } from "../lib/envelope.mjs";
  import { fetchJson } from "../lib/http.mjs";

  export const id = "pypi";
  export const needs = []; // zero-secret: the public PyPI JSON API

  /** PyPI JSON endpoint for a project's latest release metadata. */
  export function PYPI_URL(name) {
    return `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
  }

  /** Pure transform: a PyPI /pypi/<name>/json response -> Envelope[]. No network.
   *  Emits exactly one `package` envelope for the current release (info.version).
   *  GOTCHA: releases{} keys are lexicographic — we always use info.version, never a
   *  sorted key. Files live in the top-level urls[]; if that's empty there is no upload
   *  time to date the release, so we skip rather than throw in makeEnvelope. */
  export function normalizePackage(raw, cfg) {
    if (!raw || typeof raw !== "object") return [];
    const info = raw.info;
    if (!info || typeof info !== "object") return [];

    const name = info.name;
    const version = info.version;
    if (!name || !version) return [];

    // Files for the current release are the top-level urls[] (not releases[version]).
    const files = Array.isArray(raw.urls) ? raw.urls : [];
    const times = files
      .map((f) => f && f.upload_time_iso_8601)
      .filter((t) => typeof t === "string" && t.length > 0);
    if (times.length === 0) return []; // empty release: nothing to date it by

    // date = earliest upload across this release's files (ISO-8601 sorts lexically).
    const date = times.slice().sort()[0];

    // url: prefer the version-specific release_url, fall back to the project page.
    const url = info.release_url || info.package_url;
    if (!url) return [];

    const env = makeEnvelope({
      id: stableId("pypi", "package", `${name}@${version}`),
      source: "pypi",
      kind: "package",
      title: `${name} ${version}`,
      url,
      date,
      // OMIT downloads (API reports -1). Keep payload minimal + stable.
      payload: { registry: "pypi", version },
    });

    // One item per fetch; cap is trivially satisfied but kept for contract symmetry.
    return [env]
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, cfg && cfg.maxPackages ? cfg.maxPackages : 25);
  }

  /** Adapter entry point: fetch + normalize. Returns [] on any error (never throws).
   *  404 (unknown package) -> fetchJson throws -> caught here -> []. */
  export async function fetch_(cfg) {
    try {
      if (!cfg || !cfg.handle) return [];
      const raw = await fetchJson(PYPI_URL(cfg.handle));
      return normalizePackage(raw, cfg);
    } catch {
      return [];
    }
  }

  // Contract alias: exported as `fetch` too (fetch_ avoids shadowing global fetch).
  export { fetch_ as fetch };
  ```

- [ ] **Step 5: Run the test, expect PASS:**
  ```bash
  npm run test:sync
  ```
  All `pypi.test.mjs` tests green (and the existing github/cache/dedup/redact suites still green).

- [ ] **Step 6: Register the adapter + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import beside the github one and add the key to the `ADAPTERS` map:
  ```diff
   import * as github from "./adapters/github.mjs";
  +import * as pypi from "./adapters/pypi.mjs";
  ```
  ```diff
  -const ADAPTERS = { github };
  +const ADAPTERS = { github, pypi };
  ```

  In `src/config.sources.mjs`, add the `pypi` entry inside `SOURCES` (after the `github` block). `handle` is the PyPI project name; ships OFF/blank per template convention:
  ```diff
     github: {
       enabled: false, // forker: set true + fill handle
       handle: "", // GitHub username, e.g. "octocat"
       maxCommits: 25, // latest activity items kept in the feed
     },
  +  pypi: {
  +    enabled: false, // forker: set true + fill handle
  +    handle: "", // PyPI project name, e.g. "requests"
  +    maxPackages: 25, // releases kept (this adapter emits the latest release)
  +  },
  ```
  Re-run `npm run test:sync` to confirm nothing regressed, then sanity-check the wiring end-to-end without writing the cache:
  ```bash
  npm run sync:sources -- --dry-run
  ```
  (With `enabled:false` it logs `- pypi: skipped`; that confirms registration without needing a live handle.)

- [ ] **Step 7: Commit.**
  ```bash
  git add scripts/adapters/pypi.mjs scripts/__tests__/pypi.test.mjs scripts/adapters/__fixtures__/pypi.json scripts/sync-sources.mjs src/config.sources.mjs
  git commit -m "feat(sync): add pypi package adapter (latest release -> package envelope)"
  ```

---

## Task 3: npm adapter

**Files:** Create `scripts/adapters/npm.mjs` ; Test `scripts/__tests__/npm.test.mjs` ; Fixture `scripts/adapters/__fixtures__/npm.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

The npm adapter emits ONE `package` envelope per configured package: the current `dist-tags.latest` version. The registry host (`registry.npmjs.org`) gives name/version/time; a SEPARATE downloads host (`api.npmjs.org`) gives a monthly download count and may return `{error}` instead — so downloads is optional and must be guarded. The version URL is constructed (the registry does not return it).

- [ ] **Step 1: Capture real fixtures.** Run the two curls below. The registry response is large; we trim the fixture to a single representative version plus the `time`/`dist-tags` we actually read, so the unit test stays small and offline. The downloads response is tiny — save it whole.

  ```bash
  # Registry — capture, then TRIM to the shape below (the full file is ~1MB; do not commit that)
  curl -s --compressed "https://registry.npmjs.org/express" > /tmp/npm-registry-raw.json
  # Downloads — separate host; small enough to keep whole
  curl -s "https://api.npmjs.org/downloads/point/last-month/express" > /tmp/npm-downloads-raw.json
  ```

  Save the TRIMMED combined fixture to `scripts/adapters/__fixtures__/npm.json`. The adapter's `normalize` receives this exact object: `{ registry, downloads }` (the `fetch_` builds the same shape from the two hosts). Real captured shape (trimmed, <1KB) — note `dist-tags.latest`, the per-version `name`/`version`, the `time` map keyed by version string plus the `created`/`modified` pseudo-entries we must skip, and the downloads host's `downloads` integer:

  ```json
  {
    "registry": {
      "_id": "express",
      "name": "express",
      "dist-tags": { "latest": "5.2.1", "latest-4": "4.22.2" },
      "versions": {
        "5.2.1": {
          "name": "express",
          "version": "5.2.1",
          "description": "Fast, unopinionated, minimalist web framework",
          "license": "MIT"
        }
      },
      "time": {
        "created": "2010-12-29T19:38:25.450Z",
        "modified": "2026-05-19T12:28:53.443Z",
        "5.2.1": "2025-12-01T20:49:43.268Z"
      }
    },
    "downloads": {
      "downloads": 449230493,
      "start": "2026-05-04",
      "end": "2026-06-02",
      "package": "express"
    }
  }
  ```

  Also save a second fixture `scripts/adapters/__fixtures__/npm-nodownloads.json` — identical `registry` block but with the downloads host's error shape (real captured shape from a missing package), to prove the guard:

  ```json
  {
    "registry": {
      "name": "express",
      "dist-tags": { "latest": "5.2.1" },
      "versions": { "5.2.1": { "name": "express", "version": "5.2.1" } },
      "time": { "created": "2010-12-29T19:38:25.450Z", "5.2.1": "2025-12-01T20:49:43.268Z" }
    },
    "downloads": { "error": "package express not found" }
  }
  ```

- [ ] **Step 2: Write the failing test.** Create `scripts/__tests__/npm.test.mjs` with the complete code below. It calls the PURE `normalizeNpm` against the frozen fixtures and asserts id/source/kind/title/url/date, the dedup key, the id-kind invariant (`id.split(":")[1] === "package"`), the optional-downloads guard, the skip-`created`/`modified` rule, and a returns-`[]`-on-garbage case.

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { normalizeNpm } from "../adapters/npm.mjs";

  const fixture = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/npm.json", import.meta.url), "utf8")
  );
  const noDownloads = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/npm-nodownloads.json", import.meta.url), "utf8")
  );

  const cfg = { maxPackages: 10 };

  test("npm: maps latest version to a single package envelope", () => {
    const out = normalizeNpm(fixture, cfg);
    assert.equal(out.length, 1);
    const e = out[0];

    // id / dedup key — id:package:{name}@{version}
    assert.equal(e.id, "npm:package:express@5.2.1");
    // id-kind invariant (must-fix §3.3): id.split(":")[1] === envelope.kind
    assert.equal(e.id.split(":")[1], "package");
    assert.equal(e.id.split(":")[1], e.kind);

    assert.equal(e.source, "npm");
    assert.equal(e.kind, "package");
    assert.equal(e.title, "express 5.2.1");
    // url is CONSTRUCTED (registry does not return it)
    assert.equal(e.url, "https://www.npmjs.com/package/express/v/5.2.1");
    // date = time[version], ISO-parseable
    assert.equal(e.date, "2025-12-01T20:49:43.268Z");
    assert.ok(!Number.isNaN(Date.parse(e.date)));

    // payload carries registry marker, version, and the optional downloads count
    assert.equal(e.payload.registry, "npm");
    assert.equal(e.payload.version, "5.2.1");
    assert.equal(e.payload.downloads, 449230493);
  });

  test("npm: downloads is optional — {error} host omits it, envelope still valid", () => {
    const out = normalizeNpm(noDownloads, cfg);
    assert.equal(out.length, 1);
    const e = out[0];
    assert.equal(e.id, "npm:package:express@5.2.1");
    assert.equal(e.payload.version, "5.2.1");
    // guarded: no downloads key when the host returned {error}
    assert.equal("downloads" in e.payload, false);
  });

  test("npm: never emits a created/modified pseudo-entry", () => {
    const out = normalizeNpm(fixture, cfg);
    // only the latest version, nothing keyed off time.created/time.modified
    assert.equal(out.length, 1);
    assert.ok(!out.some((e) => /@created$|@modified$/.test(e.id)));
  });

  test("npm: returns [] on garbage", () => {
    assert.deepEqual(normalizeNpm(null, cfg), []);
    assert.deepEqual(normalizeNpm({}, cfg), []);
    assert.deepEqual(normalizeNpm({ registry: {} }, cfg), []);
    assert.deepEqual(normalizeNpm({ registry: { "dist-tags": {} } }, cfg), []);
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL** (module `../adapters/npm.mjs` does not exist yet).

  ```bash
  npm run test:sync
  ```
  Expect: `Cannot find module '.../adapters/npm.mjs'` / failing suite.

- [ ] **Step 4: Write the adapter.** Create `scripts/adapters/npm.mjs` with the complete code below. `normalizeNpm` is pure (no network); `fetch_` does the two HTTP calls (registry required, downloads best-effort) and assembles the `{ registry, downloads }` object that `normalizeNpm` consumes. Every `makeEnvelope` passes `source: "npm"` explicitly; the `id` is built with `stableId("npm", "package", ...)` so `id.split(":")[1]` is exactly `"package"`, matching `kind`.

  ```js
  import { makeEnvelope, stableId } from "../lib/envelope.mjs";
  import { fetchJson } from "../lib/http.mjs";

  export const id = "npm";
  export const needs = []; // zero-secret, public registry

  /**
   * PURE transform. raw = { registry, downloads } where:
   *   registry  = full https://registry.npmjs.org/<pkg> document
   *   downloads = https://api.npmjs.org/downloads/point/last-month/<pkg>
   *               -> { downloads: <int>, ... } on success, or { error } / undefined
   * Emits ONE package envelope for dist-tags.latest.
   */
  export function normalizeNpm(raw, cfg = {}) {
    const reg = raw && raw.registry;
    if (!reg || typeof reg !== "object") return [];

    const distTags = reg["dist-tags"];
    const latest = distTags && distTags.latest;
    if (!latest) return [];

    const versions = reg.versions || {};
    const verObj = versions[latest];
    const name = (verObj && verObj.name) || reg.name;
    if (!name) return [];

    // date = time[version]; skip the created/modified pseudo-entries entirely
    const time = reg.time || {};
    const date = time[latest];
    if (!date) return []; // no real publish timestamp -> nothing to emit

    // optional downloads — separate host may return { error }; guard it
    const dl = raw.downloads;
    const downloads =
      dl && typeof dl.downloads === "number" ? dl.downloads : undefined;

    const payload = { registry: "npm", version: latest };
    if (downloads !== undefined) payload.downloads = downloads;

    const env = makeEnvelope({
      id: stableId("npm", "package", `${name}@${latest}`),
      source: "npm",
      kind: "package",
      title: `${name} ${latest}`,
      url: `https://www.npmjs.com/package/${name}/v/${latest}`,
      date,
      payload,
    });

    // single envelope, but keep the cap/sort discipline uniform with other adapters
    return [env].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, cfg.maxPackages ?? 50);
  }

  export async function fetch_(cfg = {}) {
    try {
      const pkgs = Array.isArray(cfg.packages) ? cfg.packages : [];
      const out = [];
      for (const name of pkgs) {
        const enc = encodeURIComponent(name);
        const registry = await fetchJson(`https://registry.npmjs.org/${enc}`);
        // best-effort downloads on the SEPARATE host; never let it break the package
        let downloads;
        try {
          downloads = await fetchJson(
            `https://api.npmjs.org/downloads/point/last-month/${enc}`
          );
        } catch {
          downloads = undefined;
        }
        out.push(...normalizeNpm({ registry, downloads }, cfg));
      }
      return out
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
        .slice(0, cfg.maxPackages ?? 50);
    } catch {
      return [];
    }
  }

  export { fetch_ as fetch };
  ```

- [ ] **Step 5: Run the test, expect PASS.**

  ```bash
  npm run test:sync
  ```
  Expect all `npm:` tests green.

- [ ] **Step 6: Register the adapter + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import alongside the other adapter imports and a line in the `ADAPTERS` map:

  ```diff
  +import * as npm from "./adapters/npm.mjs";

   const ADAPTERS = {
     // ...existing entries...
  +  npm,
   };
  ```

  In `src/config.sources.mjs`, add the `SOURCES` entry (zero-secret; `packages` is the list to track, `maxPackages` caps the emitted envelopes):

  ```diff
   export const SOURCES = {
     // ...existing entries...
  +  npm: {
  +    enabled: false, // forker: set true + add package names
  +    packages: [], // e.g. ["your-package"] — npm package names you publish
  +    maxPackages: 25, // latest releases kept
  +  },
   };
  ```

- [ ] **Step 7: Commit.**

  ```bash
  git add scripts/adapters/npm.mjs scripts/__tests__/npm.test.mjs scripts/adapters/__fixtures__/npm.json scripts/adapters/__fixtures__/npm-nodownloads.json scripts/sync-sources.mjs src/config.sources.mjs
  git commit -m "feat(adapters): add npm package adapter (latest dist-tag, optional downloads)"
  ```

---

## Task 4: rss adapter (RSS 2.0 + Atom blog posts)

**Files:** Create `scripts/adapters/rss.mjs` ; Test `scripts/__tests__/rss.test.mjs` ; Fixture `scripts/adapters/__fixtures__/rss.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

> Depends on **Task 0** (`scripts/lib/parseFeed.mjs`, `scripts/lib/http.mjs`, `scripts/lib/text.mjs`, `scripts/lib/datetime.mjs` must already exist and export the locked signatures). This task only *consumes* them.
>
> Why this adapter is shaped differently from `github`: the upstream is **XML, not JSON**, and a feed can be either **RSS 2.0** (`<channel>`/`<item>`/`<pubDate>`/`<guid>`) or **Atom** (`<feed>`/`<entry>`/`<link rel="alternate">`/`<published>`/`<updated>`/`<id>`). `parseFeed(xmlText)` flattens both dialects into one unified shape — `{ feedTitle, items: [{ title, link, date, excerpt, guid }] }` — so `normalizeRss` never has to branch on dialect. Config holds a **`feeds[]` array** (a person follows many blogs), so we loop per feed. The fixture therefore captures **both** an RSS feed and an Atom feed, stored as raw-XML strings inside one JSON file (keeps the project's `.json` + `JSON.parse` test convention while letting the pure `normalizeRss` receive the raw XML it actually parses).

- [ ] **Step 1: Capture two real fixtures (one RSS, one Atom) into one JSON file.**

  Run these exactly. The first is RSS 2.0, the second is genuine Atom (`<feed>`/`<entry>`). We pipe each through a tiny Node escaper so the XML lands as a JSON string value.

  ```bash
  cd /Users/sandeep.yadav/tmp/sora

  # RSS 2.0 feed (Hacker News, ≥300-point stories) — trim to first 2 <item>s to keep the fixture small
  RSS_XML=$(curl -s --compressed "https://hnrss.org/newest?points=300" \
    | perl -0pe 's{(<item>.*?</item>).*(</channel>)}{$1$2}s' )

  # Atom feed (Rust blog) — trim to first 2 <entry>s
  ATOM_XML=$(curl -s --compressed "https://blog.rust-lang.org/feed.xml" \
    | perl -0pe 's{(<entry>.*?</entry>).*(</feed>)}{$1$2}s' )

  RSS_XML="$RSS_XML" ATOM_XML="$ATOM_XML" node -e '
    const fs=require("fs");
    fs.writeFileSync("scripts/adapters/__fixtures__/rss.json",
      JSON.stringify({ rss: process.env.RSS_XML, atom: process.env.ATOM_XML }, null, 2) + "\n");
    console.log("wrote rss.json");
  '
  ```

  If `perl` is unavailable, just `curl -s … > /tmp/feed.xml` each feed and hand-paste the first one or two `<item>`/`<entry>` blocks; the only requirement is that `rss.json` is `{ "rss": "<rss…>…</rss>", "atom": "<feed…>…</feed>" }` with **real** captured XML.

  **Real captured shape (trimmed, <1KB — confirmed live, this is the truth your mappings target):**

  RSS 2.0 `item` (note `<guid isPermaLink="false">` differs from `<link>`; `<title>`/`<description>` are CDATA):
  ```xml
  <rss version="2.0" xmlns:dc="..." xmlns:atom="...">
    <channel>
      <title>Hacker News: Newest</title>
      <item>
        <title><![CDATA[Pokémon Go Scans Trained Navigation Tech for Military Drones]]></title>
        <description><![CDATA[<p>Article URL: <a href="https://dronexl.co/...">...</a></p><p>Points: 521</p>]]></description>
        <pubDate>Thu, 11 Jun 2026 06:42:06 +0000</pubDate>
        <link>https://dronexl.co/2026/06/09/pokemon-go-scans-.../</link>
        <guid isPermaLink="false">https://news.ycombinator.com/item?id=48487029</guid>
      </item>
    </channel>
  </rss>
  ```

  Atom `entry` (note `<link rel="alternate" href=…>`; date is `<published>`/`<updated>`; `<id>` is the GUID):
  ```xml
  <feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
    <title>Rust Blog</title>
    <entry>
      <title>Launching the Rust Foundation Maintainers Fund</title>
      <link rel="alternate" href="https://blog.rust-lang.org/2026/06/02/launching-the-rust-foundation-maintainers-fund/" type="text/html"/>
      <published>2026-06-02T00:00:00+00:00</published>
      <updated>2026-06-02T00:00:00+00:00</updated>
      <id>https://blog.rust-lang.org/2026/06/02/launching-the-rust-foundation-maintainers-fund/</id>
      <content type="html"><blockquote>…</blockquote></content>
    </entry>
  </feed>
  ```

  After `parseFeed` flattens these, each item is `{ title, link, date, excerpt, guid }`:
  - RSS: `guid` = the `<guid>` text (`https://news.ycombinator.com/item?id=48487029`), `link` = `<link>` (the article URL — different from guid), `date` = `<pubDate>`, `excerpt` = stripped `<description>`.
  - Atom: `guid` = `<id>`, `link` = the `rel="alternate"` href, `date` = `<published>` (falling back to `<updated>`), `excerpt` = stripped `<content>`.

- [ ] **Step 2: Write the failing test.** Create `scripts/__tests__/rss.test.mjs`:

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { parseFeed } from "../lib/parseFeed.mjs";
  import { normalizeRss } from "../adapters/rss.mjs";

  const fixture = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/rss.json", import.meta.url), "utf8")
  );

  // normalizeRss is pure and takes ALREADY-PARSED feeds: an array of
  // { feedTitle, items } objects (one per configured feed). The real fetch_
  // calls parseFeed; the test parses the captured XML the same way.
  const parsedRss = parseFeed(fixture.rss);
  const parsedAtom = parseFeed(fixture.atom);

  test("normalizeRss maps an RSS 2.0 item to a post envelope", () => {
    const out = normalizeRss([parsedRss], { maxPosts: 50 });
    assert.ok(out.length >= 1, "expected at least one item");
    const e = out[0];
    assert.equal(e.source, "rss");
    assert.equal(e.kind, "post");
    // id = rss:post:{guid||link}; RSS guid is the HN comments URL (≠ link)
    assert.equal(e.id, `rss:post:${parsedRss.items[0].guid || parsedRss.items[0].link}`);
    assert.ok(e.title && e.title.length > 0, "title must be non-empty");
    // url = link (the article URL), NOT the guid
    assert.equal(e.url, parsedRss.items[0].link);
    assert.equal(e.payload.feed, parsedRss.feedTitle);
    // date is a valid ISO string (NaN guarded before makeEnvelope)
    assert.equal(Number.isNaN(Date.parse(e.date)), false);
  });

  test("normalizeRss maps an Atom entry (rel=alternate link, <id> guid, <published> date)", () => {
    const out = normalizeRss([parsedAtom], { maxPosts: 50 });
    const e = out[0];
    assert.equal(e.source, "rss");
    assert.equal(e.kind, "post");
    assert.equal(e.url, parsedAtom.items[0].link); // the rel=alternate href
    assert.equal(e.id, `rss:post:${parsedAtom.items[0].guid || parsedAtom.items[0].link}`);
    assert.equal(Number.isNaN(Date.parse(e.date)), false);
  });

  test("id-kind invariant: id.split(':')[1] === envelope.kind === 'post'", () => {
    const out = normalizeRss([parsedRss, parsedAtom], { maxPosts: 50 });
    assert.ok(out.length >= 2);
    for (const e of out) {
      assert.equal(e.id.split(":")[1], e.kind);
      assert.equal(e.id.split(":")[1], "post");
    }
  });

  test("title falls back to synthTitle(excerpt) when an item has no title", () => {
    const noTitle = {
      feedTitle: "Some Blog",
      items: [
        {
          title: "",
          link: "https://example.com/a-post/",
          guid: "https://example.com/a-post/",
          date: "2026-06-01T00:00:00Z",
          excerpt: "This is the opening sentence of a post that lacks a title element entirely.",
        },
      ],
    };
    const out = normalizeRss([noTitle], { maxPosts: 50 });
    assert.equal(out.length, 1);
    assert.ok(out[0].title.length > 0, "synthTitle must never yield empty (would throw in makeEnvelope)");
  });

  test("drops items with an unparseable date (NaN guarded, never throws)", () => {
    const badDate = {
      feedTitle: "Bad Blog",
      items: [
        { title: "Keep me", link: "https://ok.com/1", guid: "g1", date: "2026-06-01T00:00:00Z", excerpt: "" },
        { title: "Drop me", link: "https://ok.com/2", guid: "g2", date: "not-a-date", excerpt: "" },
      ],
    };
    const out = normalizeRss([badDate], { maxPosts: 50 });
    assert.equal(out.length, 1);
    assert.equal(out[0].title, "Keep me");
  });

  test("returns [] for garbage / empty input (never throws)", () => {
    assert.deepEqual(normalizeRss([], { maxPosts: 50 }), []);
    assert.deepEqual(normalizeRss(null, { maxPosts: 50 }), []);
    assert.deepEqual(normalizeRss([{ feedTitle: "x", items: null }], { maxPosts: 50 }), []);
    assert.deepEqual(normalizeRss([{}], { maxPosts: 50 }), []);
  });

  test("caps total posts at maxPosts (latest first)", () => {
    const many = {
      feedTitle: "Busy Blog",
      items: Array.from({ length: 10 }, (_, i) => ({
        title: `Post ${i}`,
        link: `https://b.com/${i}`,
        guid: `g${i}`,
        date: new Date(2026, 0, i + 1).toISOString(),
        excerpt: "",
      })),
    };
    const out = normalizeRss([many], { maxPosts: 3 });
    assert.equal(out.length, 3);
    // newest first: 2026-01-10, -09, -08
    assert.ok(Date.parse(out[0].date) >= Date.parse(out[1].date));
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL** (module not found — `rss.mjs` does not exist yet):

  ```bash
  cd /Users/sandeep.yadav/tmp/sora && npm run test:sync
  ```
  Expect a failure resolving `../adapters/rss.mjs`.

- [ ] **Step 4: Write the adapter.** Create `scripts/adapters/rss.mjs`:

  ```js
  import { makeEnvelope, stableId } from "../lib/envelope.mjs";
  import { fetchText } from "../lib/http.mjs";
  import { parseFeed } from "../lib/parseFeed.mjs";
  import { stripHtml, truncate, synthTitle } from "../lib/text.mjs";
  import { safeIso } from "../lib/datetime.mjs";

  export const id = "rss";
  export const needs = []; // zero-secret: public feed URLs only

  /**
   * Pure transform: an array of ALREADY-PARSED feeds -> Envelope[]. No network.
   * Each element is the parseFeed() result: { feedTitle, items: [{ title, link, date, excerpt, guid }] }.
   * Handles BOTH RSS and Atom because parseFeed already unified the two dialects.
   */
  export function normalizeRss(parsedFeeds, cfg) {
    if (!Array.isArray(parsedFeeds)) return [];
    const out = [];
    for (const feed of parsedFeeds) {
      if (!feed || !Array.isArray(feed.items)) continue;
      const feedTitle = feed.feedTitle || "";
      for (const item of feed.items) {
        if (!item) continue;

        // url = link (Atom: rel=alternate href; RSS: <link>). No link -> nothing to point at.
        const url = item.link;
        if (!url) continue;

        // GUARD NaN before makeEnvelope: drop items whose date won't parse.
        const date = safeIso(item.date);
        if (!date) continue;

        // id key = guid || link (RSS guid often ≠ link, e.g. HN comments URL).
        const key = item.guid || item.link;

        const excerpt = item.excerpt ? truncate(stripHtml(item.excerpt), 280) : "";

        // title = item.title || synthTitle(excerpt). synthTitle NEVER returns empty,
        // so makeEnvelope's title check can't throw on a title-less item.
        const title = (item.title && item.title.trim()) || synthTitle(excerpt, url);

        const payload = { feed: feedTitle };
        if (excerpt) payload.excerpt = excerpt;
        if (Array.isArray(item.tags) && item.tags.length) payload.tags = item.tags;

        out.push(
          makeEnvelope({
            id: stableId("rss", "post", key),
            source: "rss",
            kind: "post",
            title,
            url,
            date,
            payload,
          })
        );
      }
    }

    // Cap latest-first; dedupAndSort in the spine does the final global sort.
    return out
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, cfg?.maxPosts ?? 50);
  }

  /** Adapter entry point: fetch every configured feed + normalize. Returns [] on any error (never throws). */
  export async function fetch_(cfg) {
    try {
      if (!cfg || !Array.isArray(cfg.feeds) || cfg.feeds.length === 0) return [];
      const parsed = [];
      for (const feedUrl of cfg.feeds) {
        if (!feedUrl) continue;
        try {
          const xml = await fetchText(feedUrl); // UA + timeout + non-200 throw handled in http.mjs
          parsed.push(parseFeed(xml));
        } catch {
          // One bad/slow feed must not sink the rest.
          continue;
        }
      }
      return normalizeRss(parsed, cfg);
    } catch {
      return [];
    }
  }

  // Contract alias (`fetch_` avoids shadowing global fetch internally).
  export { fetch_ as fetch };
  ```

- [ ] **Step 5: Run the test, expect PASS:**

  ```bash
  cd /Users/sandeep.yadav/tmp/sora && npm run test:sync
  ```
  All `rss.test.mjs` tests green (and existing `github`/`cache`/`dedup`/`redact` tests still green).

- [ ] **Step 6: Register the adapter + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import alongside the other adapter imports and add `rss` to the `ADAPTERS` map:

  ```diff
   import * as github from "./adapters/github.mjs";
  +import * as rss from "./adapters/rss.mjs";
  ```
  ```diff
  -const ADAPTERS = { github };
  +const ADAPTERS = { github, rss };
  ```

  In `src/config.sources.mjs`, add the `rss` entry to `SOURCES` (note `feeds` is an **array**, and the loop in `sync-sources.mjs` gates on `cfg.handle` — so use a non-empty placeholder `handle` plus `enabled:false`, OR if your spine gates on `enabled` only, drop `handle`; match the existing `github` gating which checks `cfg.handle`). Since `rss` has no single handle, add a sentinel `handle` so the existing `enabled && handle` guard treats it uniformly:

  ```diff
     github: {
       enabled: false, // forker: set true + fill handle
       handle: "", // GitHub username, e.g. "octocat"
       maxCommits: 25, // latest activity items kept in the feed
     },
  +  rss: {
  +    enabled: false, // forker: set true + add at least one feed URL
  +    feeds: [], // e.g. ["https://overreacted.io/rss.xml", "https://blog.rust-lang.org/feed.xml"]
  +    maxPosts: 50, // newest posts kept across ALL feeds combined
  +  },
  ```

  > If the spine's per-adapter guard (`if (!cfg || !cfg.enabled || !cfg.handle)`) is later relaxed to not require `handle`, drop the sentinel `handle` line. As written today, the `handle:"rss"` sentinel is required for `fetch` to be invoked.

  Re-run to confirm registration is wired and nothing else broke:
  ```bash
  cd /Users/sandeep.yadav/tmp/sora && npm run test:sync && npm run sync:sources -- --dry-run
  ```
  The dry-run prints `- rss: skipped (disabled or no handle)` while `enabled:false` (sentinel handle is set, but `enabled` is false) — confirming it is registered. Set `enabled:true` + a real feed URL locally to smoke-test live fetch, then revert (the template ships every source OFF).

- [ ] **Step 7: Commit.**

  ```bash
  cd /Users/sandeep.yadav/tmp/sora && git add scripts/adapters/rss.mjs scripts/__tests__/rss.test.mjs scripts/adapters/__fixtures__/rss.json scripts/sync-sources.mjs src/config.sources.mjs && git commit -m "feat(adapters): rss adapter (RSS 2.0 + Atom) via parseFeed"
  ```

---

Relevant files: `/Users/sandeep.yadav/tmp/sora/scripts/adapters/rss.mjs` (create), `/Users/sandeep.yadav/tmp/sora/scripts/__tests__/rss.test.mjs` (create), `/Users/sandeep.yadav/tmp/sora/scripts/adapters/__fixtures__/rss.json` (create), `/Users/sandeep.yadav/tmp/sora/scripts/sync-sources.mjs` (modify), `/Users/sandeep.yadav/tmp/sora/src/config.sources.mjs` (modify).

---

## Task 5: youtube adapter

**Files:** Create `scripts/adapters/youtube.mjs` ; Test `scripts/__tests__/youtube.test.mjs` ; Fixture `scripts/adapters/__fixtures__/youtube.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

> Depends on Task 0 (`scripts/lib/parseFeed.mjs`, `http.mjs`, `text.mjs`, `datetime.mjs`). Code against those locked signatures — do not redefine them.
>
> YouTube exposes a **keyless** Atom feed at `https://www.youtube.com/feeds/videos.xml?channel_id=<UC…>`. `kind=video`, zero-secret (`needs=[]`). The config field is the **UC… channel id**, NOT an `@handle` — handle pages require fragile HTML scraping and are out of scope. The sync spine gates on `cfg.handle`, so we store the UC id in `handle` (same pattern as the github adapter) and validate the `UC` prefix inside the adapter.

- [ ] **Step 1: Capture the real fixture.** The fixture is the **raw XML text** (what `fetchText` returns and `parseFeed` consumes), stored as a JSON-encoded string so the test reads it the same way every other fixture is read.

  ```bash
  # from repo root
  node -e 'const s=await (await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ")).text(); await import("node:fs/promises").then(fs=>fs.writeFile("scripts/adapters/__fixtures__/youtube.json", JSON.stringify({ xml: s }, null, 2)+"\n"))'
  ```

  Real shape captured live (trimmed to one `<entry>`, <1KB). The adapter maps off these exact fields:

  ```xml
  <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
        xmlns:media="http://search.yahoo.com/mrss/"
        xmlns="http://www.w3.org/2005/Atom">
   <title>Marques Brownlee</title>
   <entry>
    <id>yt:video:_gCXmKjDecU</id>
    <yt:videoId>_gCXmKjDecU</yt:videoId>
    <yt:channelId>UCBJycsmduvYEL83R_U4JriQ</yt:channelId>
    <title>WWDC 2026 Impressions: Yeah, That's About Right</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=_gCXmKjDecU"/>
    <published>2026-06-09T05:48:41+00:00</published>
    <updated>2026-06-11T14:37:37+00:00</updated>
    <media:group>
     <media:thumbnail url="https://i4.ytimg.com/vi/_gCXmKjDecU/hqdefault.jpg" width="480" height="360"/>
     <media:community>
      <media:statistics views="3314391"/>
     </media:community>
    </media:group>
   </entry>
   <!-- 15 entries total; some links are .../shorts/<id> instead of .../watch?v=<id> -->
  </feed>
  ```

  Notes on `parseFeed(xml)` output for this feed (per the locked signature — RSS+Atom+namespaces): each item exposes `title`, `link` (the `rel="alternate"` href), `date` (`<published>`), `guid` (the `<id>`, i.e. `yt:video:_gCXmKjDecU`), and the merged media fields `videoId`, `channelId`, `thumbnail`, `views`. The adapter derives the bare video id from `item.videoId` (falling back to parsing `item.guid`).

- [ ] **Step 2: Write the failing test.** Create `scripts/__tests__/youtube.test.mjs`. The fixture is raw XML, so the test runs `parseFeed` then `normalizeVideos` (the pure transform), exactly as `fetch_` will.

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { parseFeed } from "../lib/parseFeed.mjs";
  import { normalizeVideos } from "../adapters/youtube.mjs";

  const { xml } = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/youtube.json", import.meta.url), "utf8")
  );
  const cfg = { handle: "UCBJycsmduvYEL83R_U4JriQ", maxVideos: 10 };

  test("youtube: maps the first entry to a valid video envelope", () => {
    const items = parseFeed(xml).items;
    const out = normalizeVideos(items, cfg);
    assert.ok(out.length > 0, "expected at least one envelope");

    const top = out[0]; // sorted date-desc -> the WWDC 2026 video
    assert.equal(top.source, "youtube");
    assert.equal(top.kind, "video");
    assert.equal(top.id, "youtube:video:_gCXmKjDecU");
    assert.equal(top.title, "WWDC 2026 Impressions: Yeah, That's About Right");
    assert.equal(top.url, "https://www.youtube.com/watch?v=_gCXmKjDecU");
    assert.equal(top.date, "2026-06-09T05:48:41.000Z");
    assert.equal(top.payload.channel, "Marques Brownlee");
    assert.equal(top.payload.thumbnail, "https://i4.ytimg.com/vi/_gCXmKjDecU/hqdefault.jpg");
    assert.equal(top.payload.views, 3314391);
  });

  test("youtube: dedup key is the bare videoId and the id-kind invariant holds", () => {
    const out = normalizeVideos(parseFeed(xml).items, cfg);
    for (const e of out) {
      // INVARIANT (must-fix §3.3): id.split(":")[1] === envelope.kind
      assert.equal(e.id.split(":")[1], "video");
      assert.equal(e.id.split(":")[1], e.kind);
      // dedup key = third segment = the bare YouTube video id (no "yt:video:" prefix)
      const key = e.id.split(":")[2];
      assert.match(key, /^[\w-]{6,}$/);
      assert.equal(e.id, `youtube:video:${key}`);
    }
    // no duplicate ids
    const ids = out.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("youtube: respects maxVideos cap, newest first", () => {
    const out = normalizeVideos(parseFeed(xml).items, { handle: "UC_x", maxVideos: 3 });
    assert.equal(out.length, 3);
    const dates = out.map((e) => Date.parse(e.date));
    assert.deepEqual([...dates].sort((a, b) => b - a), dates);
  });

  test("youtube: returns [] on garbage / non-array input", () => {
    assert.deepEqual(normalizeVideos(null, cfg), []);
    assert.deepEqual(normalizeVideos(undefined, cfg), []);
    assert.deepEqual(normalizeVideos("nope", cfg), []);
    assert.deepEqual(normalizeVideos([], cfg), []);
    assert.deepEqual(normalizeVideos([{ title: "no id, dropped" }], cfg), []);
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL.**

  ```bash
  npm run test:sync
  ```

  Expect failure: `Cannot find module '../adapters/youtube.mjs'` (adapter not written yet).

- [ ] **Step 4: Write the adapter.** Create `scripts/adapters/youtube.mjs`.

  ```js
  import { makeEnvelope, stableId } from "../lib/envelope.mjs";
  import { fetchText } from "../lib/http.mjs";
  import { parseFeed } from "../lib/parseFeed.mjs";
  import { safeIso } from "../lib/datetime.mjs";
  import { synthTitle } from "../lib/text.mjs";

  export const id = "youtube";
  export const needs = []; // zero-secret: the RSS feed needs no API key

  const FEED = "https://www.youtube.com/feeds/videos.xml";

  /** Build the keyless channel feed URL. channelId MUST be the UC… id (not an @handle). */
  export function FEED_URL(channelId) {
    return `${FEED}?channel_id=${encodeURIComponent(channelId)}`;
  }

  /** Pull the bare YouTube video id from parseFeed item fields.
   *  Prefers <yt:videoId>; falls back to the <id> guid "yt:video:<id>". */
  function videoIdOf(item) {
    if (item.videoId) return String(item.videoId).trim();
    const g = String(item.guid || "");
    const m = g.match(/yt:video:([\w-]+)/);
    return m ? m[1] : "";
  }

  /** Pure transform: parseFeed items -> Envelope[]. No network. This is what unit tests call. */
  export function normalizeVideos(items, cfg) {
    if (!Array.isArray(items)) return [];
    const channel = cfg && cfg.channel ? cfg.channel : (cfg && cfg.feedTitle) || "";
    const out = [];
    for (const item of items) {
      if (!item) continue;
      const vid = videoIdOf(item);
      if (!vid) continue; // no stable id -> drop (covers garbage entries)
      const date = safeIso(item.date);
      if (!date) continue; // unparseable date would throw in makeEnvelope
      const url = item.link || `https://www.youtube.com/watch?v=${vid}`;
      const payload = { channel };
      if (item.thumbnail) payload.thumbnail = item.thumbnail;
      if (item.views != null && item.views !== "") {
        const v = Number(item.views);
        if (Number.isFinite(v)) payload.views = v;
      }
      out.push(
        makeEnvelope({
          id: stableId("youtube", "video", vid),
          source: "youtube",
          kind: "video",
          title: synthTitle(item.title, `YouTube video ${vid}`),
          url,
          date,
          payload,
        })
      );
    }
    return out
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, (cfg && cfg.maxVideos) ?? 15);
  }

  /** Adapter entry point: fetch + normalize. Returns [] on any error (never throws). */
  export async function fetch_(cfg) {
    try {
      const channelId = cfg && cfg.handle;
      if (!channelId || !/^UC[\w-]{20,}$/.test(channelId)) return []; // require a UC… id
      const xml = await fetchText(FEED_URL(channelId));
      const feed = parseFeed(xml);
      // pass the feed-level title through so payload.channel is populated
      return normalizeVideos(feed.items, { ...cfg, channel: cfg.channel || feed.feedTitle });
    } catch {
      return [];
    }
  }

  // Contract alias (`fetch_` avoids shadowing global fetch internally).
  export { fetch_ as fetch };
  ```

- [ ] **Step 5: Run the test, expect PASS.**

  ```bash
  npm run test:sync
  # then the whole suite via the glob runner:
  npm run test:sync
  ```

  All four tests pass.

- [ ] **Step 6: Register the adapter + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import next to the github one and add `youtube` to the `ADAPTERS` map:

  ```diff
   import * as github from "./adapters/github.mjs";
  +import * as youtube from "./adapters/youtube.mjs";

   // Adapter registry. Plan 2 appends more entries here.
  -const ADAPTERS = { github };
  +const ADAPTERS = { github, youtube };
  ```

  In `src/config.sources.mjs`, add the `youtube` entry to `SOURCES` (`handle` holds the UC… channel id — that is the field the sync spine gates on):

  ```diff
     github: {
       enabled: false, // forker: set true + fill handle
       handle: "", // GitHub username, e.g. "octocat"
       maxCommits: 25, // latest activity items kept in the feed
     },
  +  youtube: {
  +    enabled: false, // forker: set true + fill handle
  +    handle: "", // YouTube CHANNEL id, must start with "UC…" (NOT an @handle). Find it via the channel page source / a UC-id lookup.
  +    maxVideos: 15, // latest videos kept in the feed
  +  },
  ```

- [ ] **Step 7: Commit.**

  ```bash
  git add scripts/adapters/youtube.mjs scripts/__tests__/youtube.test.mjs scripts/adapters/__fixtures__/youtube.json scripts/sync-sources.mjs src/config.sources.mjs
  git commit -m "feat(adapters): add keyless youtube channel-feed adapter (kind=video)"
  ```

Relevant files (absolute): `/Users/sandeep.yadav/tmp/sora/scripts/adapters/youtube.mjs`, `/Users/sandeep.yadav/tmp/sora/scripts/__tests__/youtube.test.mjs`, `/Users/sandeep.yadav/tmp/sora/scripts/adapters/__fixtures__/youtube.json`, `/Users/sandeep.yadav/tmp/sora/scripts/sync-sources.mjs`, `/Users/sandeep.yadav/tmp/sora/src/config.sources.mjs`.

---

## Task 6: codeforces adapter

**Files:** Create `scripts/adapters/codeforces.mjs` ; Test `scripts/__tests__/codeforces.test.mjs` ; Fixture `scripts/adapters/__fixtures__/codeforces.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

Codeforces exposes a public, zero-secret rating-history endpoint: `GET https://codeforces.com/api/user.rating?handle=<handle>`. The response is `{ "status": "OK", "result": [...] }` (a `FAILED` status comes with a `comment` and no `result`). Each `result` entry is a contest-rating change. We map **one envelope per contest** with `kind: "rating"`. There is **no `url` field in the response** — the contest URL is constructed from `contestId`. `ratingUpdateTimeSeconds` is **UNIX SECONDS** (pass to `toIso`). An active user returns ~303 entries, so we cap via `cfg.maxRatings`.

- [ ] **Step 1: Capture the real fixture.** Run the exact command below to save the live response to the fixture path. (`tourist` is the canonical high-activity handle; 303 entries at time of capture — fine to keep the whole file as the fixture.)

  ```bash
  curl -s "https://codeforces.com/api/user.rating?handle=tourist" \
    -o scripts/adapters/__fixtures__/codeforces.json
  # sanity check: must print "OK" and a non-zero count
  node -e 'const d=require("./scripts/adapters/__fixtures__/codeforces.json");console.log(d.status,d.result.length)'
  ```

  Trimmed real shape of what you just saved (`result` truncated to 2 of ~303 entries — note there is NO `url` key; we build it):

  ```json
  {
    "status": "OK",
    "result": [
      {
        "contestId": 2,
        "contestName": "Codeforces Beta Round 2",
        "handle": "tourist",
        "rank": 14,
        "ratingUpdateTimeSeconds": 1267124400,
        "oldRating": 0,
        "newRating": 1602
      },
      {
        "contestId": 2229,
        "contestName": "Spectral::Cup 2026 Round 2 (Codeforces Round 1100, Div. 1 + Div. 2)",
        "handle": "tourist",
        "rank": 11,
        "ratingUpdateTimeSeconds": 1779557700,
        "oldRating": 3473,
        "newRating": 3428
      }
    ]
  }
  ```

- [ ] **Step 2: Write the failing test.** Create `scripts/__tests__/codeforces.test.mjs` with EXACTLY this content. It calls the pure `normalizeRatings` against the frozen fixture and asserts id/source/kind/title/url/date, the dedup key, the id-kind invariant, the cap, and returns-`[]`-on-garbage.

  ```javascript
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { normalizeRatings } from "../adapters/codeforces.mjs";

  const fixture = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/codeforces.json", import.meta.url), "utf8")
  );

  test("normalizeRatings maps a contest entry to a rating envelope (fields + url construction)", () => {
    const out = normalizeRatings(fixture, { handle: "tourist", maxRatings: 500 });
    const first = out.find((e) => e.payload.contestId === 2);
    assert.ok(first, "contest 2 must be present");
    assert.equal(first.source, "codeforces");
    assert.equal(first.kind, "rating");
    assert.equal(first.id, "codeforces:rating:2");
    assert.equal(first.title, "Codeforces Beta Round 2: 0\u21921602"); // oldRating→newRating
    assert.equal(first.url, "https://codeforces.com/contest/2"); // constructed, not from response
    assert.equal(first.date, "2010-02-25T19:00:00.000Z"); // toIso(1267124400) UNIX SECONDS
    assert.equal(first.payload.platform, "codeforces");
    assert.equal(first.payload.rating, 1602); // newRating
    assert.equal(first.payload.rank, 14);
  });

  test("dedup key + id-kind invariant: id.split(':')[1] === kind", () => {
    const out = normalizeRatings(fixture, { handle: "tourist", maxRatings: 500 });
    for (const e of out) {
      assert.equal(e.id, `codeforces:rating:${e.payload.contestId}`); // stable dedup key = contestId
      assert.equal(e.id.split(":")[1], e.kind); // must-fix §3.3
      assert.equal(e.id.split(":")[1], "rating");
    }
  });

  test("normalizeRatings caps at maxRatings (newest first)", () => {
    const out = normalizeRatings(fixture, { handle: "tourist", maxRatings: 5 });
    assert.equal(out.length, 5);
    // newest-first: each item's date >= the next item's date
    for (let i = 1; i < out.length; i++) {
      assert.ok(Date.parse(out[i - 1].date) >= Date.parse(out[i].date), "must be sorted date-desc");
    }
  });

  test("normalizeRatings returns [] on garbage / FAILED status (never throws)", () => {
    assert.deepEqual(normalizeRatings(null, { handle: "x", maxRatings: 50 }), []);
    assert.deepEqual(normalizeRatings({}, { handle: "x", maxRatings: 50 }), []);
    assert.deepEqual(
      normalizeRatings({ status: "FAILED", comment: "handle not found" }, { handle: "x", maxRatings: 50 }),
      []
    );
    assert.deepEqual(normalizeRatings({ status: "OK", result: "nope" }, { handle: "x", maxRatings: 50 }), []);
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL** (module `../adapters/codeforces.mjs` does not exist yet):

  ```bash
  npm run test:sync 2>&1 | grep -i codeforces
  # expect: cannot find module / 0 pass for codeforces
  ```

- [ ] **Step 4: Write the adapter.** Create `scripts/adapters/codeforces.mjs` with EXACTLY this content. It imports `toIso` from the locked `../lib/datetime.mjs` (Task 0) and `fetchJson` from the locked `../lib/http.mjs`. Every `makeEnvelope` passes `source: "codeforces"` explicitly. `fetch_` never throws.

  ```javascript
  import { makeEnvelope, stableId } from "../lib/envelope.mjs";
  import { toIso } from "../lib/datetime.mjs";
  import { fetchJson } from "../lib/http.mjs";

  export const id = "codeforces";
  export const needs = []; // zero-secret: public user.rating endpoint

  const API = "https://codeforces.com/api";

  /** Codeforces API URL for a handle's full rating history. */
  export function RATING_URL(handle) {
    return `${API}/user.rating?handle=${encodeURIComponent(handle)}`;
  }

  /** Pure transform: user.rating response -> Envelope[]. No network.
   * Response shape: { status: "OK", result: [ { contestId, contestName, rank,
   *   ratingUpdateTimeSeconds (UNIX SECONDS), oldRating, newRating, handle } ] }.
   * GOTCHA: must check status==="OK"; a FAILED response has no usable result. */
  export function normalizeRatings(raw, cfg) {
    if (!raw || raw.status !== "OK" || !Array.isArray(raw.result)) return [];
    const out = [];
    for (const r of raw.result) {
      if (!r || r.contestId == null || r.ratingUpdateTimeSeconds == null) continue;
      const oldRating = r.oldRating ?? 0;
      const newRating = r.newRating ?? 0;
      out.push(
        makeEnvelope({
          id: stableId("codeforces", "rating", r.contestId),
          source: "codeforces",
          kind: "rating",
          title: `${r.contestName || `Contest ${r.contestId}`}: ${oldRating}\u2192${newRating}`,
          url: `https://codeforces.com/contest/${r.contestId}`,
          date: toIso(r.ratingUpdateTimeSeconds), // UNIX SECONDS -> ISO
          payload: {
            platform: "codeforces",
            contestId: r.contestId,
            rating: newRating,
            rank: r.rank,
          },
        })
      );
    }
    // Cap newest-first; dedupAndSort in the spine does the final global sort.
    return out
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, cfg.maxRatings ?? 50);
  }

  /** Adapter entry point: fetch + normalize. Returns [] on any error (never throws). */
  export async function fetch_(cfg) {
    try {
      if (!cfg || !cfg.handle) return [];
      const raw = await fetchJson(RATING_URL(cfg.handle));
      return normalizeRatings(raw, cfg);
    } catch {
      return [];
    }
  }

  export { fetch_ as fetch };
  ```

- [ ] **Step 5: Run the test, expect PASS:**

  ```bash
  npm run test:sync 2>&1 | grep -i codeforces
  # expect: all 4 codeforces tests pass
  ```

- [ ] **Step 6: Register in the ADAPTERS map + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import (next to the github import) and the registry entry:

  ```diff
   import * as github from "./adapters/github.mjs";
  +import * as codeforces from "./adapters/codeforces.mjs";
  ```

  ```diff
  -const ADAPTERS = { github };
  +const ADAPTERS = { github, codeforces };
  ```

  In `src/config.sources.mjs`, add the `codeforces` SOURCES entry inside the `SOURCES` object (ships OFF / blank per template convention):

  ```diff
     github: {
       enabled: false, // forker: set true + fill handle
       handle: "", // GitHub username, e.g. "octocat"
       maxCommits: 25, // latest activity items kept in the feed
     },
  +  codeforces: {
  +    enabled: false, // forker: set true + fill handle
  +    handle: "", // Codeforces handle, e.g. "tourist"
  +    maxRatings: 50, // latest rating changes kept (active users have ~300+)
  +  },
  ```

  Confirm wiring with a no-network dry run (the blank handle means it is skipped, proving registration without hitting the API):

  ```bash
  npm run sync:sources -- --dry-run 2>&1 | grep codeforces
  # expect: "- codeforces: skipped (disabled or no handle)"
  ```

- [ ] **Step 7: Commit.**

  ```bash
  git add scripts/adapters/codeforces.mjs scripts/__tests__/codeforces.test.mjs scripts/adapters/__fixtures__/codeforces.json scripts/sync-sources.mjs src/config.sources.mjs
  git commit -m "feat(adapters): add codeforces rating adapter (user.rating -> rating envelopes)"
  ```

---

## Task 7: stackoverflow adapter

**Files:** Create `scripts/adapters/stackoverflow.mjs` ; Test `scripts/__tests__/stackoverflow.test.mjs` ; Fixture `scripts/adapters/__fixtures__/stackoverflow.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

The Stack Exchange API answers feed returns *answers* (with `answer_id`, `question_id`, `creation_date` in UNIX **seconds**, `score`, `is_accepted`) but **not** the question titles. To produce a human title (`Answer to: <question title>`) we make ONE extra batched call to `/questions/{semicolon-joined-ids}` and build a `question_id -> title` map. The pure `normalizeAnswers(answersRaw, questionsRaw, cfg)` therefore takes **both** raw responses. Both endpoints are gzipped (`--compressed`), wrap results in `items[]`, and share a 300/day quota (`quota_remaining`); the 1 extra batched call is well within budget. Titles for deleted questions fall back to `synthTitle`.

- [ ] **Step 1: Capture real fixtures.** Run both curls and save the combined shape. Save to `scripts/adapters/__fixtures__/stackoverflow.json` as an object `{ answers: <answers response>, questions: <questions response> }` so the test can drive `normalizeAnswers` with both halves from one frozen file.

  ```bash
  cd /Users/sandeep.yadav/tmp/sora
  ANS=$(curl -s --compressed "https://api.stackexchange.com/2.3/users/22656/answers?site=stackoverflow&order=desc&sort=activity&pagesize=5")
  # extract the 5 question_ids, semicolon-join them, then batch-fetch the questions
  IDS=$(node -e 'const a=JSON.parse(process.argv[1]); console.log(a.items.map(x=>x.question_id).join(";"))' "$ANS")
  QS=$(curl -s --compressed "https://api.stackexchange.com/2.3/questions/${IDS}?site=stackoverflow")
  node -e 'const fs=require("fs"); fs.writeFileSync("scripts/adapters/__fixtures__/stackoverflow.json", JSON.stringify({answers:JSON.parse(process.argv[1]), questions:JSON.parse(process.argv[2])}, null, 2)+"\n")' "$ANS" "$QS"
  ```

  TRIMMED real shape captured (so you know the field names — do NOT paste this, the curl above writes the full file):

  ```json
  {
    "answers": {
      "items": [
        { "is_accepted": true, "score": 3, "creation_date": 1780589628,
          "answer_id": 79951496, "question_id": 79951495, "content_license": "CC BY-SA 4.0",
          "owner": { "user_id": 22656, "display_name": "Jon Skeet" } }
      ],
      "has_more": true, "quota_max": 300, "quota_remaining": 299
    },
    "questions": {
      "items": [
        { "question_id": 79951495, "title": "What is the correct syntax to call this method?",
          "link": "https://stackoverflow.com/questions/79951495/what-is-the-correct-syntax-to-call-this-method",
          "tags": ["c#","dependency-injection"], "score": 0, "creation_date": 1780589505 }
      ],
      "has_more": false, "quota_max": 300, "quota_remaining": 298
    }
  }
  ```

  Key facts from the live response: `creation_date` is UNIX **seconds** (e.g. `1780589628`); the answer body has NO question title — it lives in the questions response keyed by `question_id`; `score` and `is_accepted` are on the answer; the public URL is constructed as `https://stackoverflow.com/a/<answer_id>` (the API gives no answer `link`).

- [ ] **Step 2: Write the failing test.** Create `scripts/__tests__/stackoverflow.test.mjs`:

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { normalizeAnswers } from "../adapters/stackoverflow.mjs";

  const fixture = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/stackoverflow.json", import.meta.url), "utf8")
  );

  test("normalizeAnswers maps an answer to a post envelope with the real question title", () => {
    const out = normalizeAnswers(fixture.answers, fixture.questions, { maxPosts: 25 });
    const a = out.find((e) => e.payload.answer_id === 79951496);
    assert.ok(a, "answer 79951496 must be present");
    assert.equal(a.source, "stackoverflow");
    assert.equal(a.kind, "post");
    assert.equal(a.id, "stackoverflow:post:79951496");
    assert.equal(a.title, "Answer to: What is the correct syntax to call this method?");
    assert.equal(a.url, "https://stackoverflow.com/a/79951496");
    // creation_date 1780589628 (UNIX seconds) -> ISO
    assert.equal(a.date, new Date(1780589628 * 1000).toISOString());
    assert.equal(a.payload.feed, "stackoverflow");
    assert.equal(a.payload.score, 3);
    assert.equal(a.payload.is_accepted, true);
  });

  test("id-kind invariant: id.split(':')[1] === envelope.kind === 'post'", () => {
    const out = normalizeAnswers(fixture.answers, fixture.questions, { maxPosts: 25 });
    assert.ok(out.length > 0);
    for (const e of out) {
      assert.equal(e.kind, "post");
      assert.equal(e.id.split(":")[1], "post");
      assert.equal(e.id.split(":")[1], e.kind);
    }
  });

  test("dedup key is the answer_id (stable across re-runs)", () => {
    const out = normalizeAnswers(fixture.answers, fixture.questions, { maxPosts: 25 });
    const ids = out.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "ids must be unique");
    for (const e of out) {
      assert.equal(e.id, `stackoverflow:post:${e.payload.answer_id}`);
    }
  });

  test("falls back to a synthetic title when the question is deleted/missing from the map", () => {
    const answers = { items: [{ answer_id: 999, question_id: 12345, creation_date: 1780589628, score: 1, is_accepted: false }] };
    const questions = { items: [] }; // question not returned (deleted)
    const out = normalizeAnswers(answers, questions, { maxPosts: 25 });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "stackoverflow:post:999");
    assert.ok(out[0].title.length > 0, "title must never be empty (guards makeEnvelope throw)");
    assert.match(out[0].title, /12345/); // synthTitle fallback references the question id
  });

  test("caps at cfg.maxPosts, newest first", () => {
    const out = normalizeAnswers(fixture.answers, fixture.questions, { maxPosts: 2 });
    assert.equal(out.length, 2);
    assert.ok(Date.parse(out[0].date) >= Date.parse(out[1].date), "sorted newest-first");
  });

  test("returns [] on garbage / non-array input (never throws)", () => {
    assert.deepEqual(normalizeAnswers(null, null, { maxPosts: 25 }), []);
    assert.deepEqual(normalizeAnswers({}, {}, { maxPosts: 25 }), []);
    assert.deepEqual(normalizeAnswers({ items: "nope" }, { items: null }, { maxPosts: 25 }), []);
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL** (adapter does not exist yet):

  ```bash
  cd /Users/sandeep.yadav/tmp/sora
  npm run test:sync
  ```

  Expect an import/resolution failure (`Cannot find module .../adapters/stackoverflow.mjs`).

- [ ] **Step 4: Write the adapter.** Create `scripts/adapters/stackoverflow.mjs`:

  ```js
  import { makeEnvelope, stableId } from "../lib/envelope.mjs";
  import { fetchJson } from "../lib/http.mjs";
  import { toIso } from "../lib/datetime.mjs";
  import { synthTitle } from "../lib/text.mjs";

  export const id = "stackoverflow";
  export const needs = []; // zero-secret: public Stack Exchange API (anonymous quota)

  const API = "https://api.stackexchange.com/2.3";
  const SITE = "stackoverflow";

  function answersUrl(userId, pageSize) {
    return (
      `${API}/users/${encodeURIComponent(userId)}/answers` +
      `?site=${SITE}&order=desc&sort=activity&pagesize=${pageSize}`
    );
  }

  function questionsUrl(questionIds) {
    // batched: semicolon-joined ids -> one extra call (quota-cheap)
    return `${API}/questions/${questionIds.join(";")}?site=${SITE}`;
  }

  /** Build a question_id -> title map from the questions response. */
  function buildTitleMap(questionsRaw) {
    const map = new Map();
    const items = questionsRaw && Array.isArray(questionsRaw.items) ? questionsRaw.items : [];
    for (const q of items) {
      if (q && q.question_id != null && q.title) map.set(q.question_id, q.title);
    }
    return map;
  }

  /**
   * Pure transform: (answers response, questions response) -> Envelope[]. No network.
   * Title uses the REAL question title; synthTitle(...) fallback for deleted/missing questions
   * guarantees a non-empty title (makeEnvelope throws on a falsy title).
   */
  export function normalizeAnswers(answersRaw, questionsRaw, cfg) {
    const items = answersRaw && Array.isArray(answersRaw.items) ? answersRaw.items : [];
    if (items.length === 0) return [];
    const titleByQid = buildTitleMap(questionsRaw);

    const out = [];
    for (const a of items) {
      if (!a || a.answer_id == null || a.creation_date == null) continue;
      const qTitle = titleByQid.get(a.question_id);
      const title = qTitle
        ? `Answer to: ${qTitle}`
        : synthTitle("", `Answer to question #${a.question_id ?? a.answer_id}`);
      out.push(
        makeEnvelope({
          id: stableId("stackoverflow", "post", a.answer_id),
          source: "stackoverflow",
          kind: "post",
          title,
          url: `https://stackoverflow.com/a/${a.answer_id}`,
          date: toIso(a.creation_date),
          payload: {
            feed: "stackoverflow",
            answer_id: a.answer_id,
            score: a.score,
            is_accepted: a.is_accepted,
          },
        })
      );
    }

    return out
      .sort((x, y) => Date.parse(y.date) - Date.parse(x.date))
      .slice(0, cfg.maxPosts ?? 25);
  }

  /** Adapter entry point: fetch answers + batch-fetch their questions + normalize. Never throws. */
  export async function fetch_(cfg) {
    try {
      if (!cfg || !cfg.handle) return []; // handle is the SO numeric user_id
      const pageSize = Math.min(Math.max(cfg.maxPosts ?? 25, 1), 100);
      const headers = { "Accept-Encoding": "gzip" }; // API is gzipped; fetchJson sets UA + timeout
      const answersRaw = await fetchJson(answersUrl(cfg.handle, pageSize), { headers });
      const ids = (Array.isArray(answersRaw.items) ? answersRaw.items : [])
        .map((a) => a && a.question_id)
        .filter((qid) => qid != null);
      const uniqueIds = [...new Set(ids)];
      const questionsRaw = uniqueIds.length ? await fetchJson(questionsUrl(uniqueIds), { headers }) : { items: [] };
      return normalizeAnswers(answersRaw, questionsRaw, cfg);
    } catch {
      return [];
    }
  }

  export { fetch_ as fetch };
  ```

  Notes: `cfg.handle` is the Stack Overflow numeric **user id** (e.g. `22656`). `fetchJson` already sets the `sora-portfolio-aggregator` UA, a 10s `AbortSignal.timeout`, throws on non-200, and Node's `fetch` transparently decompresses gzip — the explicit `Accept-Encoding: gzip` mirrors the `--compressed` curl flag. Every `makeEnvelope` passes `source: "stackoverflow"` explicitly (must-fix §3.2). The id is built with the SAME `"post"` kind string set on the envelope (invariant §3.3).

- [ ] **Step 5: Run the test, expect PASS:**

  ```bash
  cd /Users/sandeep.yadav/tmp/sora
  npm run test:sync
  # or the project script (runs all sync tests): npm run test:sync
  ```

  Expect all 6 tests passing.

- [ ] **Step 6: Register the adapter + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import (after the github import) and register it in the `ADAPTERS` map:

  ```diff
   import * as github from "./adapters/github.mjs";
  +import * as stackoverflow from "./adapters/stackoverflow.mjs";
  ```

  ```diff
  -const ADAPTERS = { github };
  +const ADAPTERS = { github, stackoverflow };
  ```

  In `src/config.sources.mjs`, add the `stackoverflow` entry inside `SOURCES`:

  ```diff
     github: {
       enabled: false, // forker: set true + fill handle
       handle: "", // GitHub username, e.g. "octocat"
       maxCommits: 25, // latest activity items kept in the feed
     },
  +  stackoverflow: {
  +    enabled: false, // forker: set true + fill handle
  +    handle: "", // Stack Overflow NUMERIC user id, e.g. "22656" (from your profile URL /users/<id>/...)
  +    maxPosts: 25, // latest answers kept in the feed
  +  },
     // Plan 2 adds: pypi, npm, rss, bluesky, mastodon, youtube, codeforces, wakatime, huggingface, stackoverflow
  ```

  Re-run the full sync test suite to confirm nothing regressed:

  ```bash
  cd /Users/sandeep.yadav/tmp/sora
  npm run test:sync
  ```

- [ ] **Step 7: Commit:**

  ```bash
  cd /Users/sandeep.yadav/tmp/sora
  git add scripts/adapters/stackoverflow.mjs scripts/__tests__/stackoverflow.test.mjs scripts/adapters/__fixtures__/stackoverflow.json scripts/sync-sources.mjs src/config.sources.mjs
  git commit -m "feat(adapters): add stackoverflow answers adapter (kind=post, real question titles via batched /questions)"
  ```

---

## Task 8: bluesky adapter

**Files:** Create `scripts/adapters/bluesky.mjs` ; Test `scripts/__tests__/bluesky.test.mjs` ; Fixture `scripts/adapters/__fixtures__/bluesky.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

Public AppView, zero auth (`secret=false`, `needs=[]`). One envelope per feed item, `kind="post"`. Curation: DROP reposts (item-level `.reason` present) and replies (`post.record.reply` present) — keep originals only. The `at://` uri embeds a permanent DID, so the dedup id is stable across handle renames; the public profile URL uses the current `handle` + the `rkey` (last `/`-segment of the uri).

- [ ] **Step 1: Capture the real fixture.** Run this exact command from the repo root (it hits the public AppView — no token, no headers):

  ```bash
  curl -s "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=50" \
    -o scripts/adapters/__fixtures__/bluesky.json
  ```

  The response is `{ "feed": [ ... ], "cursor": "..." }`. Each `feed[i]` is `{ post, reason? }`. A **repost** has an item-level `reason` with `$type: "app.bsky.feed.defs#reasonRepost"`. A **reply** has `post.record.reply`. An **original** has neither. The `bsky.app` feed naturally contains all three, so the raw fixture already exercises the filter. **Verify** before continuing:

  ```bash
  node -e 'const d=require("./scripts/adapters/__fixtures__/bluesky.json");
    const f=d.feed;
    const orig=f.filter(x=>!x.reason && !x.post.record.reply).length;
    const reposts=f.filter(x=>x.reason).length;
    const replies=f.filter(x=>x.post.record.reply).length;
    console.log({total:f.length,orig,reposts,replies});
    if(!orig||!reposts||!replies){console.error("FIXTURE MISSING A CASE — re-pull or pick another actor");process.exit(1);}'
  ```

  Expect non-zero counts in all three buckets (a recent pull gave `{ total: 50, orig: ~31, reposts: 7, replies: 12 }`). Trimmed real shape of the three relevant item kinds (field names are from the live response — this is the source of truth):

  ```jsonc
  // ORIGINAL — keep. uri embeds DID; rkey = "3mnslrkd6ok2g"
  {
    "post": {
      "uri": "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3mnslrkd6ok2g",
      "author": { "did": "did:plc:z72i7hdynmk6r22z27h6tvur", "handle": "bsky.app" },
      "record": { "$type": "app.bsky.feed.post", "createdAt": "2026-06-08T21:10:01.530Z",
                  "text": "v1.123 is live! You can now attach up to 10 photos in posts." },
      "indexedAt": "2026-06-08T21:10:05.674Z"
    }
  }
  // REPOST — drop. item-level reason present
  {
    "post": { "uri": "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3mnkles3mh22l",
              "author": { "handle": "atproto.com" }, "record": { "text": "..." },
              "indexedAt": "2026-06-05T16:41:36.460Z" },
    "reason": { "$type": "app.bsky.feed.defs#reasonRepost" }
  }
  // REPLY — drop. post.record.reply present
  {
    "post": { "uri": "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3mndkhfhs5e2f",
              "author": { "handle": "bsky.app" },
              "record": { "text": "...", "reply": { "parent": { "uri": "at://.../3mndkhao4sv2w" } } },
              "indexedAt": "2026-06-04T18:02:11.000Z" }
  }
  ```

- [ ] **Step 2: Write the failing test.** Create `scripts/__tests__/bluesky.test.mjs`:

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { normalizeFeed } from "../adapters/bluesky.mjs";

  const fixture = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/bluesky.json", import.meta.url), "utf8")
  );
  const cfg = { handle: "bsky.app", maxPosts: 50 };

  // Helper: last path segment of an at:// uri is the rkey.
  const rkeyOf = (uri) => uri.split("/").pop();

  test("bluesky: maps an original post to a correct post envelope", () => {
    const out = normalizeFeed(fixture, cfg);
    assert.ok(out.length > 0, "expected at least one original post");

    // Find the known original from the fixture by its uri.
    const original = fixture.feed.find(
      (it) => !it.reason && !it.post.record.reply
    );
    const post = original.post;
    const rkey = rkeyOf(post.uri);
    const env = out.find((e) => e.id === `bluesky:post:${post.uri}`);
    assert.ok(env, "original post should be present in output");

    // Field correctness.
    assert.equal(env.source, "bluesky");
    assert.equal(env.kind, "post");
    assert.equal(env.id, `bluesky:post:${post.uri}`); // dedup key = at:// uri (DID-stable)
    assert.equal(env.url, `https://bsky.app/profile/${post.author.handle}/post/${rkey}`);
    assert.equal(env.date, post.indexedAt);
    assert.ok(env.title.length > 0, "title must be non-empty (synthTitle guard)");
    assert.equal(env.payload.feed, "bluesky");

    // id-kind invariant (must-fix §3.3).
    assert.equal(env.id.split(":")[1], "post");
  });

  test("bluesky: DROPS reposts (item .reason) and replies (record.reply)", () => {
    const out = normalizeFeed(fixture, cfg);
    const outUris = new Set(out.map((e) => e.id.replace("bluesky:post:", "")));

    const repostUris = fixture.feed.filter((it) => it.reason).map((it) => it.post.uri);
    const replyUris = fixture.feed
      .filter((it) => it.post.record.reply)
      .map((it) => it.post.uri);

    assert.ok(repostUris.length > 0, "fixture must contain a repost to test the filter");
    assert.ok(replyUris.length > 0, "fixture must contain a reply to test the filter");

    for (const uri of repostUris) {
      assert.ok(!outUris.has(uri), `repost should be dropped: ${uri}`);
    }
    for (const uri of replyUris) {
      assert.ok(!outUris.has(uri), `reply should be dropped: ${uri}`);
    }

    // Output count == number of originals in the fixture.
    const expectedOriginals = fixture.feed.filter(
      (it) => !it.reason && !it.post.record.reply
    ).length;
    assert.equal(out.length, Math.min(expectedOriginals, cfg.maxPosts));
  });

  test("bluesky: caps at cfg.maxPosts, newest first", () => {
    const out = normalizeFeed(fixture, { handle: "bsky.app", maxPosts: 2 });
    assert.ok(out.length <= 2);
    if (out.length === 2) {
      assert.ok(Date.parse(out[0].date) >= Date.parse(out[1].date), "sorted date desc");
    }
  });

  test("bluesky: returns [] on garbage input", () => {
    assert.deepEqual(normalizeFeed(null, cfg), []);
    assert.deepEqual(normalizeFeed({}, cfg), []);
    assert.deepEqual(normalizeFeed({ feed: "nope" }, cfg), []);
    assert.deepEqual(normalizeFeed({ feed: [{}, { post: {} }] }, cfg), []);
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL** (module not found / `normalizeFeed` undefined):

  ```bash
  npm run test:sync
  ```

- [ ] **Step 4: Write the adapter.** Create `scripts/adapters/bluesky.mjs`:

  ```js
  import { makeEnvelope, stableId } from "../lib/envelope.mjs";
  import { fetchJson } from "../lib/http.mjs";
  import { synthTitle, truncate } from "../lib/text.mjs";
  import { safeIso } from "../lib/datetime.mjs";

  export const id = "bluesky";
  export const needs = []; // public AppView, zero auth

  const APPVIEW = "https://public.api.bsky.app";

  /** Public AppView endpoint for an actor's author feed (handle or DID both work). */
  export function FEED_URL(handle) {
    return `${APPVIEW}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=50`;
  }

  /** rkey = last "/"-segment of an at:// uri. */
  function rkeyOf(uri) {
    return String(uri).split("/").pop();
  }

  /** Pure transform: getAuthorFeed response -> Envelope[]. No network.
   *  Curation: keep ORIGINALS only — drop reposts (item.reason) and replies (post.record.reply). */
  export function normalizeFeed(raw, cfg) {
    if (!raw || !Array.isArray(raw.feed)) return [];
    const max = (cfg && cfg.maxPosts) || 25;
    const out = [];

    for (const item of raw.feed) {
      if (!item || !item.post) continue;
      // DROP reposts: item-level reason present.
      if (item.reason) continue;

      const post = item.post;
      const record = post.record || {};
      // DROP replies: record.reply present.
      if (record.reply) continue;

      const uri = post.uri;
      const handle = post.author && post.author.handle;
      const date = safeIso(post.indexedAt);
      if (!uri || !handle || !date) continue; // skip malformed items

      const rkey = rkeyOf(uri);
      const text = typeof record.text === "string" ? record.text : "";

      out.push(
        makeEnvelope({
          id: stableId("bluesky", "post", uri), // at:// embeds DID -> stable across renames
          source: "bluesky",
          kind: "post",
          title: synthTitle(text, "Post on Bluesky"),
          url: `https://bsky.app/profile/${handle}/post/${rkey}`,
          date,
          payload: text ? { feed: "bluesky", excerpt: truncate(text, 280) } : { feed: "bluesky" },
        })
      );
    }

    return out
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, max);
  }

  /** Adapter entry point: fetch + normalize. Returns [] on any error (never throws). */
  export async function fetch_(cfg) {
    try {
      if (!cfg || !cfg.handle) return [];
      const raw = await fetchJson(FEED_URL(cfg.handle));
      return normalizeFeed(raw, cfg);
    } catch {
      return [];
    }
  }

  export { fetch_ as fetch };
  ```

- [ ] **Step 5: Run the test, expect PASS:**

  ```bash
  npm run test:sync
  ```

  All four `bluesky:` tests green. If the cap test fails because the fixture has fewer than 2 originals, re-pull the fixture (Step 1).

- [ ] **Step 6: Register the adapter + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import beside the existing one and add `bluesky` to the `ADAPTERS` map:

  ```diff
   import * as github from "./adapters/github.mjs";
  +import * as bluesky from "./adapters/bluesky.mjs";
  ```

  ```diff
  -const ADAPTERS = { github };
  +const ADAPTERS = { github, bluesky };
  ```

  In `src/config.sources.mjs`, add the `bluesky` entry inside `SOURCES` (after the `github` block). The key MUST be `bluesky` — it must match `adapter.id`, the `SOURCES[key]` lookup in the spine, and `envelope.source`:

  ```diff
       maxCommits: 25, // latest activity items kept in the feed
     },
  +  bluesky: {
  +    enabled: false, // forker: set true + fill handle
  +    handle: "", // Bluesky handle or DID, e.g. "bsky.app" (no @)
  +    maxPosts: 25, // latest original posts kept (reposts + replies excluded)
  +  },
  ```

  Smoke-test the live wiring (network; safe — public, zero-secret):

  ```bash
  node -e 'import("./scripts/adapters/bluesky.mjs").then(async (m) => {
    const items = await m.fetch({ handle: "bsky.app", maxPosts: 5 });
    console.log(items.length, "items");
    console.log(items[0]);
  })'
  ```

  Expect up to 5 envelopes, each with `id` starting `bluesky:post:at://`, `kind:"post"`, a `bsky.app/profile/.../post/<rkey>` url, and an ISO `date`. Re-run `npm run test:sync` to confirm nothing regressed.

- [ ] **Step 7: Commit.**

  ```bash
  git add scripts/adapters/bluesky.mjs scripts/__tests__/bluesky.test.mjs \
    scripts/adapters/__fixtures__/bluesky.json scripts/sync-sources.mjs src/config.sources.mjs
  git commit -m "feat(adapters): add bluesky adapter (public AppView, originals only)"
  ```

---

## Task 9: mastodon adapter

**Files:** Create `scripts/adapters/mastodon.mjs` ; Test `scripts/__tests__/mastodon.test.mjs` ; Fixture `scripts/adapters/__fixtures__/mastodon.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

Mastodon is a public, zero-secret REST API. The adapter uses a **2-call flow**: (1) look up the account by `acct` to get its numeric `id`, (2) fetch that account's recent statuses. The pure `normalizeStatuses` function operates only on the **statuses array** (call 2's response) — that is what the unit test exercises. Curation: drop **boosts** (`status.reblog !== null`) and **replies** (`status.in_reply_to_id !== null`). `content` is HTML and must go through `stripHtml`. Use `status.url` (the human-facing permalink), **not** `status.uri` (the ActivityPub federation URI).

- [ ] **Step 1: Capture the real fixture.** The statuses array is the input the normalize fn consumes, so the fixture IS that array. Run both live calls; the first gets the numeric id, the second produces the fixture.

  ```bash
  # 1a. Resolve acct -> numeric id (instance=mastodon.social, user=Gargron)
  curl -s "https://mastodon.social/api/v1/accounts/lookup?acct=Gargron" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"
  # -> prints: 1

  # 1b. Fetch that account's statuses and save the raw array as the fixture
  curl -s "https://mastodon.social/api/v1/accounts/1/statuses?limit=10" \
    > scripts/adapters/__fixtures__/mastodon.json
  ```

  The fixture is an **array of status objects**. The captured array contains an original post, a boost, and replies (the curation cases). Trimmed real shape (< 1 KB), showing the three required kinds — note the boost's `url` ends in `/activity` and its `content` is empty, and the reply has a non-null `in_reply_to_id`:

  ```json
  [
    {
      "id": "116731957320725067",
      "created_at": "2026-06-11T14:31:53.616Z",
      "in_reply_to_id": null,
      "content": "",
      "url": "https://mastodon.social/users/Gargron/statuses/116731957320725067/activity",
      "uri": "https://mastodon.social/users/Gargron/statuses/116731957320725067/activity",
      "reblog": { "id": "116731890168425093", "content": "<p>boosted post body…</p>" }
    },
    {
      "id": "116731785476092840",
      "created_at": "2026-06-11T13:48:11.472Z",
      "in_reply_to_id": "116731764249308760",
      "content": "<p><span class=\"h-card\">@<span>miermont</span></a></span> a reply body</p>",
      "url": "https://mastodon.social/@Gargron/116731785476092840",
      "uri": "https://mastodon.social/users/Gargron/statuses/116731785476092840",
      "reblog": null
    },
    {
      "id": "116731432225015068",
      "created_at": "2026-06-11T12:18:21.289Z",
      "in_reply_to_id": null,
      "content": "<p>New <a href=\"...\" rel=\"tag\">#<span>Haken</span></a> single</p><p><a href=\"https://www.youtube.com/watch?v=saOQOSMYiSQ\">youtube.com/watch?v=saOQOSMYiSQ</a></p>",
      "url": "https://mastodon.social/@Gargron/116731432225015068",
      "uri": "https://mastodon.social/users/Gargron/statuses/116731432225015068",
      "reblog": null
    }
  ]
  ```

  If your live capture lacks any of the three kinds (boost / reply / original), hand-edit `scripts/adapters/__fixtures__/mastodon.json` to include one of each — the frozen fixture must exercise every curation branch. Keep the original post (`id: "116731432225015068"`) verbatim; the test asserts against its exact `id`/`url`/`created_at`.

- [ ] **Step 2: Write the failing test.** `scripts/__tests__/mastodon.test.mjs`:

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { normalizeStatuses } from "../adapters/mastodon.mjs";

  const fixture = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/mastodon.json", import.meta.url), "utf8")
  );

  const cfg = { instance: "mastodon.social", user: "Gargron", maxPosts: 25 };

  test("normalizeStatuses maps an original post to a post envelope (id/source/kind/title/url/date)", () => {
    const out = normalizeStatuses(fixture, cfg);
    const post = out.find((e) => e.id === "mastodon:post:116731432225015068");
    assert.ok(post, "original post must be present");
    assert.equal(post.source, "mastodon");
    assert.equal(post.kind, "post");
    assert.equal(post.url, "https://mastodon.social/@Gargron/116731432225015068"); // status.url, NOT uri
    assert.equal(post.date, "2026-06-11T12:18:21.289Z"); // status.created_at, passed through
    // title is synthesized from stripped HTML content; never empty, no tags
    assert.ok(post.title.length > 0);
    assert.ok(!/[<>]/.test(post.title), "title must not contain HTML tags");
    assert.ok(post.title.includes("Haken"), "title derives from stripped content");
  });

  test("dedup id is stableId('mastodon','post',status.id) and satisfies the id-kind invariant", () => {
    const out = normalizeStatuses(fixture, cfg);
    const post = out.find((e) => e.id === "mastodon:post:116731432225015068");
    assert.equal(post.id, "mastodon:post:116731432225015068");
    assert.equal(post.id.split(":")[1], "post"); // id-kind invariant (must-fix §3.3)
    assert.equal(post.id.split(":")[1], post.kind);
  });

  test("payload carries feed:'mastodon' and an excerpt", () => {
    const out = normalizeStatuses(fixture, cfg);
    const post = out.find((e) => e.id === "mastodon:post:116731432225015068");
    assert.equal(post.payload.feed, "mastodon");
    assert.ok(typeof post.payload.excerpt === "string" && post.payload.excerpt.length > 0);
  });

  test("curation: boosts (reblog!==null) and replies (in_reply_to_id!==null) are dropped", () => {
    const out = normalizeStatuses(fixture, cfg);
    // The boost and the reply ids must never appear as envelopes.
    assert.equal(out.some((e) => e.id === "mastodon:post:116731957320725067"), false); // boost
    assert.equal(out.some((e) => e.id === "mastodon:post:116731785476092840"), false); // reply
    // Every surviving envelope is an original top-level post.
    assert.ok(out.length >= 1);
    assert.ok(out.every((e) => e.kind === "post"));
  });

  test("normalizeStatuses returns [] for empty/garbage input (never throws)", () => {
    assert.deepEqual(normalizeStatuses([], cfg), []);
    assert.deepEqual(normalizeStatuses(null, cfg), []);
    assert.deepEqual(normalizeStatuses(undefined, cfg), []);
    assert.deepEqual(normalizeStatuses([{ junk: true }, 42, null], cfg), []);
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL** (module not found — adapter does not exist yet):

  ```bash
  npm run test:sync
  # Expect: Error [ERR_MODULE_NOT_FOUND] ... '../adapters/mastodon.mjs'
  ```

- [ ] **Step 4: Write the adapter.** `scripts/adapters/mastodon.mjs`. Codes against the locked shared utils (`stripHtml`, `synthTitle` from `../lib/text.mjs`; `fetchJson` from `../lib/http.mjs`). `created_at` is already an ISO-8601 string, so it is passed straight to `makeEnvelope` (which validates via `Date.parse`).

  ```js
  import { makeEnvelope, stableId } from "../lib/envelope.mjs";
  import { fetchJson } from "../lib/http.mjs";
  import { stripHtml, synthTitle, truncate } from "../lib/text.mjs";

  export const id = "mastodon";
  export const needs = []; // zero-secret: public REST API

  /** Build the account-lookup URL: acct -> numeric account id. */
  export function LOOKUP_URL(instance, user) {
    return `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`;
  }

  /** Build the statuses URL for a resolved numeric account id. */
  export function STATUSES_URL(instance, accountId, limit) {
    return `https://${instance}/api/v1/accounts/${encodeURIComponent(accountId)}/statuses?limit=${limit}`;
  }

  /** Pure transform: Mastodon statuses array -> Envelope[]. No network.
   * Curation: drop boosts (reblog !== null) and replies (in_reply_to_id !== null). */
  export function normalizeStatuses(statuses, cfg) {
    if (!Array.isArray(statuses)) return [];
    const out = [];
    for (const s of statuses) {
      if (!s || typeof s !== "object") continue;
      if (!s.id || !s.created_at || !s.url) continue; // need id, date, permalink
      if (s.reblog !== null && s.reblog !== undefined) continue; // drop boosts
      if (s.in_reply_to_id !== null && s.in_reply_to_id !== undefined) continue; // drop replies

      const text = stripHtml(s.content || "");
      out.push(
        makeEnvelope({
          id: stableId("mastodon", "post", s.id),
          source: "mastodon",
          kind: "post",
          title: synthTitle(text, "Post on Mastodon"),
          url: s.url, // human permalink, NOT s.uri
          date: s.created_at, // already ISO-8601
          payload: { feed: "mastodon", excerpt: truncate(text, 280) },
        })
      );
    }
    // Cap newest-first; dedupAndSort in the spine does the final global sort.
    return out
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, cfg.maxPosts ?? 25);
  }

  /** Adapter entry point: 2-call flow (lookup acct -> id, then statuses).
   * Returns [] on any error (never throws). */
  export async function fetch_(cfg) {
    try {
      if (!cfg || !cfg.instance || !cfg.user) return [];
      const account = await fetchJson(LOOKUP_URL(cfg.instance, cfg.user));
      if (!account || !account.id) return [];
      const limit = Math.min(cfg.maxPosts ?? 25, 40); // Mastodon caps statuses at 40
      const statuses = await fetchJson(STATUSES_URL(cfg.instance, account.id, limit));
      return normalizeStatuses(statuses, cfg);
    } catch {
      return [];
    }
  }

  // Contract alias (avoids shadowing global fetch internally).
  export { fetch_ as fetch };
  ```

  > Note: `truncate` is one of the locked `text.mjs` exports (`truncate(s, n)`); if `excerpt` is not wanted when content is empty, the original-post branch still produces a non-empty `title` via `synthTitle`'s fallback, so `makeEnvelope` never throws.

- [ ] **Step 5: Run the test, expect PASS:**

  ```bash
  npm run test:sync
  # Expect: all 5 tests pass, 0 fail
  # Then run the whole suite:
  npm run test:sync
  ```

- [ ] **Step 6: Register the adapter + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import alongside the other adapter imports and add it to the `ADAPTERS` map:

  ```diff
   import * as github from "./adapters/github.mjs";
  +import * as mastodon from "./adapters/mastodon.mjs";
  ```

  ```diff
  -const ADAPTERS = { github };
  +const ADAPTERS = { github, mastodon };
  ```

  In `src/config.sources.mjs`, add the `mastodon` entry inside `SOURCES` (keys here must match the `ADAPTERS` map key and `adapter.id`). Config is `instance` + `user` (per spec); ships disabled/blank:

  ```diff
     github: {
       enabled: false, // forker: set true + fill handle
       handle: "", // GitHub username, e.g. "octocat"
       maxCommits: 25, // latest activity items kept in the feed
     },
  +  mastodon: {
  +    enabled: false, // forker: set true + fill instance & user
  +    instance: "", // Mastodon instance host, e.g. "mastodon.social"
  +    user: "", // local username (acct), e.g. "Gargron"
  +    maxPosts: 25, // latest original posts kept (boosts & replies dropped)
  +  },
  ```

  > The spine skips any source whose config is missing/disabled. `sync-sources.mjs` currently gates on `cfg.handle`; mastodon has no `handle`. Confirm the gate has been generalized in an earlier task (e.g. to `cfg.enabled` plus adapter-specific required fields). If it still hard-requires `handle`, mastodon will be skipped — either add the generalized gate or relax the check to `if (!cfg || !cfg.enabled) continue;` so each adapter validates its own required fields in `fetch_` (mastodon already returns `[]` when `instance`/`user` are blank).

- [ ] **Step 7: Commit.**

  ```bash
  git add scripts/adapters/mastodon.mjs scripts/__tests__/mastodon.test.mjs \
    scripts/adapters/__fixtures__/mastodon.json scripts/sync-sources.mjs src/config.sources.mjs
  git commit -m "feat(sync): add mastodon adapter (post kind, drops boosts & replies)"
  ```

---

## Task 10: huggingface adapter

**Files:** Create `scripts/adapters/huggingface.mjs` ; Test `scripts/__tests__/huggingface.test.mjs` ; Fixture `scripts/adapters/__fixtures__/huggingface.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

> Context for the engineer: HuggingFace has **two** unauthenticated endpoints — models and datasets. We hit both, frame every result as a `badge` (social proof: downloads + likes), and merge. Models carry `pipeline_tag` + `library_name`; datasets do not (so `label` falls back gracefully and `kindOf` is `"dataset"`). Dataset URLs need a `/datasets/` segment. `downloads` is legitimately `0` for brand-new models — render it as-is, never `-1`. `tags[]` can be 200+ entries (the `google/smol` dataset has ~230 language tags) — we trim to the first 12. No secret needed (`kind=badge`, `secret=false`).

- [ ] **Step 1: Capture the real fixture.** The live response is the source of truth for field names. Run both endpoints and merge into one fixture object with `models` and `datasets` arrays (this matches what `fetch_` assembles before calling `normalizeHuggingface`):

  ```bash
  cd /Users/sandeep.yadav/tmp/sora
  {
    echo '{'
    echo '  "models":'
    curl -s "https://huggingface.co/api/models?author=google&limit=5"
    echo '  ,"datasets":'
    curl -s "https://huggingface.co/api/datasets?author=google&limit=5"
    echo '}'
  } | python3 -m json.tool > scripts/adapters/__fixtures__/huggingface.json
  ```

  Trimmed real shape actually captured (the fixture is the full version — this is just so you know the field names; note `downloads:0` on a model and a dataset with NO `pipeline_tag`):

  ```jsonc
  {
    "models": [
      { "id": "google/gemma-4-12B-it", "likes": 927, "downloads": 675936,
        "tags": ["transformers","safetensors","image-text-to-text","license:apache-2.0","region:us"],
        "pipeline_tag": "any-to-any", "library_name": "transformers",
        "createdAt": "2026-05-23T01:17:15.000Z", "modelId": "google/gemma-4-12B-it" },
      { "id": "google/diffusiongemma-26B-A4B-it", "likes": 410, "downloads": 0,
        "tags": ["transformers","image-text-to-text"], "pipeline_tag": "image-text-to-text",
        "library_name": "transformers", "createdAt": "2026-06-09T12:40:12.000Z" }
    ],
    "datasets": [
      { "id": "google/frames-benchmark", "likes": 261, "downloads": 14761,
        "tags": ["task_categories:text-classification","language:en","license:apache-2.0","region:us"],
        "createdAt": "2024-09-19T02:15:32.000Z" }
    ]
  }
  ```

  Key takeaways from the live data: both kinds use `id`, `createdAt`, `downloads`, `likes`, `tags[]`. Only **models** have `pipeline_tag` and `library_name`. Datasets have a long `description` (we ignore it) and no `library_name`.

- [ ] **Step 2: Write the failing test.** Create `scripts/__tests__/huggingface.test.mjs`:

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { normalizeHuggingface } from "../adapters/huggingface.mjs";

  const fixture = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/huggingface.json", import.meta.url), "utf8"),
  );

  const cfg = { handle: "google", maxBadges: 50 };

  test("huggingface: merges models + datasets into badge envelopes", () => {
    const out = normalizeHuggingface(fixture, cfg);
    assert.ok(out.length >= 2, "should yield model + dataset badges");
    assert.ok(out.some((e) => e.payload.kindOf === "model"), "has a model badge");
    assert.ok(out.some((e) => e.payload.kindOf === "dataset"), "has a dataset badge");
  });

  test("huggingface: model envelope core fields", () => {
    const out = normalizeHuggingface(fixture, cfg);
    const m = out.find((e) => e.payload.kindOf === "model");

    assert.equal(m.source, "huggingface");
    assert.equal(m.kind, "badge");
    assert.equal(m.id, `huggingface:badge:${m.title}`); // id = huggingface:badge:{id}, title = the model id
    assert.equal(m.id.split(":")[1], "badge", "id-kind invariant: id segment[1] === envelope.kind");
    assert.equal(m.url, `https://huggingface.co/${m.title}`);
    assert.equal(m.payload.issuer, "huggingface");
    assert.ok(!Number.isNaN(Date.parse(m.date)), "date is ISO-parseable");
    assert.equal(typeof m.payload.downloads, "number");
    assert.equal(typeof m.payload.likes, "number");
  });

  test("huggingface: dataset url gets /datasets/ segment + label falls back", () => {
    const out = normalizeHuggingface(fixture, cfg);
    const d = out.find((e) => e.payload.kindOf === "dataset");

    assert.equal(d.url, `https://huggingface.co/datasets/${d.title}`);
    assert.equal(d.id.split(":")[1], "badge");
    // datasets have no pipeline_tag/library_name -> label must be a non-empty string, never undefined
    assert.equal(typeof d.payload.label, "string");
  });

  test("huggingface: downloads of 0 render as 0, never -1", () => {
    const out = normalizeHuggingface(fixture, cfg);
    const zero = out.find((e) => e.payload.downloads === 0);
    assert.ok(zero, "the diffusiongemma model with downloads:0 should survive");
    assert.notEqual(zero.payload.downloads, -1);
  });

  test("huggingface: large tags[] arrays are trimmed", () => {
    const out = normalizeHuggingface(fixture, cfg);
    for (const e of out) {
      assert.ok(Array.isArray(e.payload.tags));
      assert.ok(e.payload.tags.length <= 12, "tags trimmed to <=12");
    }
  });

  test("huggingface: returns [] on garbage input", () => {
    assert.deepEqual(normalizeHuggingface(null, cfg), []);
    assert.deepEqual(normalizeHuggingface({}, cfg), []);
    assert.deepEqual(normalizeHuggingface({ models: "nope", datasets: 42 }, cfg), []);
    assert.deepEqual(normalizeHuggingface({ models: [{}], datasets: [] }, cfg), []); // entry with no id is dropped
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL** (module not found — adapter does not exist yet):

  ```bash
  cd /Users/sandeep.yadav/tmp/sora && npm run test:sync
  ```

  Expect: `Cannot find module '.../adapters/huggingface.mjs'` (or all assertions failing). This confirms the test runs and is red.

- [ ] **Step 4: Write the adapter.** Create `scripts/adapters/huggingface.mjs`. Note: this adapter needs no `text`/`parseFeed` helpers — the API gives clean JSON and `safeIso` from `datetime.mjs` guards the date. `truncate` from `text.mjs` is used only to bound individual tag length defensively.

  ```js
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
  ```

- [ ] **Step 5: Run the test, expect PASS:**

  ```bash
  cd /Users/sandeep.yadav/tmp/sora && npm run test:sync
  ```

  Expect all 6 tests passing (`# pass 6`, `# fail 0`). Also run the full sync suite to confirm no regression: `npm run test:sync`.

- [ ] **Step 6: Register the adapter + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import alongside the existing `github` import and add it to the `ADAPTERS` map:

  ```diff
   import * as github from "./adapters/github.mjs";
  +import * as huggingface from "./adapters/huggingface.mjs";
  ```
  ```diff
  -const ADAPTERS = { github };
  +const ADAPTERS = { github, huggingface };
  ```

  In `src/config.sources.mjs`, add the entry inside `SOURCES` (the orchestrator skips any source where `enabled` is false or `handle` is blank, so this ships OFF by default):

  ```diff
     github: {
       enabled: false, // forker: set true + fill handle
       handle: "", // GitHub username, e.g. "octocat"
       maxCommits: 25, // latest activity items kept in the feed
     },
  +  huggingface: {
  +    enabled: false, // forker: set true + fill handle
  +    handle: "", // HF org/user, e.g. "google" — author= on both endpoints
  +    maxBadges: 50, // model+dataset badges kept (per-endpoint API limit too)
  +  },
  ```

  > Note: the registry key (`huggingface`), `export const id`, `envelope.source`, and the `SOURCES` key must all be the string `huggingface` — the orchestrator looks up `SOURCES[key]` by the registry key.

- [ ] **Step 7: Commit.**

  ```bash
  cd /Users/sandeep.yadav/tmp/sora && git add scripts/adapters/huggingface.mjs scripts/__tests__/huggingface.test.mjs scripts/adapters/__fixtures__/huggingface.json scripts/sync-sources.mjs src/config.sources.mjs && git commit -m "feat(sync): add huggingface badge adapter (models + datasets)"
  ```

---

## Task 11: wakatime adapter (kind=rating, secret)

**Files:** Create `scripts/adapters/wakatime.mjs` ; Test `scripts/__tests__/wakatime.test.mjs` ; Fixture `scripts/adapters/__fixtures__/wakatime.json` ; Modify `scripts/sync-sources.mjs` (register) + `src/config.sources.mjs` (SOURCES entry)

> **Build LAST.** This adapter depends on the LOCKED shared utils from Task 0 (`scripts/lib/http.mjs`, `scripts/lib/datetime.mjs`) — confirm they exist before starting.
>
> **CANNOT PROBE LIVE:** the WakaTime stats endpoint returns `401` without the owner's API key, so no live capture is possible from CI or a clean checkout. Steps below work from the **documented response shape** of `GET https://wakatime.com/api/v1/users/current/stats/last_7_days`. Every `payload.*` field is **PROVISIONAL** until the first authenticated `npm run sync:sources` run confirms it — re-check field names against a real response then and tighten the fixture.

- [ ] **Step 1: Create the fixture from the documented shape** → save to `scripts/adapters/__fixtures__/wakatime.json`.

  You **cannot** curl this live without a key. If you DO have the owner key locally, the exact capture command is (do NOT commit the key, and do NOT paste real numbers if they reveal private project names — trim them):

  ```bash
  # Owner-only; key from https://wakatime.com/settings/account . Never commit the key.
  # base64-encode "<API_KEY>:" (note the trailing colon) for HTTP Basic auth.
  WAKATIME_API_KEY="waka_xxx" \
  curl -s -H "Authorization: Basic $(printf '%s:' "$WAKATIME_API_KEY" | base64)" \
    "https://wakatime.com/api/v1/users/current/stats/last_7_days" \
    | tee scripts/adapters/__fixtures__/wakatime.json | head -c 400
  ```

  If you have NO key (the normal case for this template), hand-write the fixture below from the documented shape. It is a TRIMMED excerpt (<1KB) of the documented response — top-level `data` object, with `range`, totals, and a couple of `languages`. Field names match WakaTime's documented `stats` schema; treat the numbers as PROVISIONAL placeholders.

  Save EXACTLY this as `scripts/adapters/__fixtures__/wakatime.json`:

  ```json
  {
    "data": {
      "total_seconds": 144123.0,
      "human_readable_total": "40 hrs 2 mins",
      "daily_average": 20589.0,
      "human_readable_daily_average": "5 hrs 43 mins",
      "range": "last_7_days",
      "human_readable_range": "Last 7 Days",
      "start_date": "2026-06-04",
      "end_date": "2026-06-10",
      "languages": [
        { "name": "TypeScript", "total_seconds": 61234.0, "percent": 42.49, "digital": "17:00", "text": "17 hrs" },
        { "name": "Python", "total_seconds": 39870.0, "percent": 27.66, "digital": "11:04", "text": "11 hrs 4 mins" },
        { "name": "Astro", "total_seconds": 18900.0, "percent": 13.11, "digital": "5:15", "text": "5 hrs 15 mins" }
      ]
    },
    "start": "2026-06-04T00:00:00Z",
    "end": "2026-06-10T23:59:59Z"
  }
  ```

  > NOTE on shape: WakaTime documents the range bounds in two places — top-level `data.start_date`/`data.end_date` (date-only strings) and the top-level `start`/`end` (full ISO timestamps). The adapter prefers the precise top-level `end` (full ISO) and falls back to `data.end_date`. Both are PROVISIONAL; the test below asserts the date the adapter actually selects so it stays honest if the real shape differs.

- [ ] **Step 2: Write the failing test** → `scripts/__tests__/wakatime.test.mjs`. Save EXACTLY:

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  import { normalizeStats } from "../adapters/wakatime.mjs";

  const fixture = JSON.parse(
    await readFile(new URL("../adapters/__fixtures__/wakatime.json", import.meta.url), "utf8")
  );

  const cfg = {
    enabled: true,
    handle: "octocat",
    profileUrl: "https://wakatime.com/@octocat",
    range: "last_7_days",
  };

  test("normalizeStats produces exactly one self-overwriting rating item", () => {
    const out = normalizeStats(fixture, cfg);
    assert.equal(out.length, 1, "must be a SINGLE item (no date in key -> self-overwrites)");
  });

  test("normalizeStats: envelope core fields are correct", () => {
    const [item] = normalizeStats(fixture, cfg);
    assert.equal(item.source, "wakatime");
    assert.equal(item.kind, "rating");
    assert.equal(item.title, "40 hrs 2 mins coding this week");
    assert.equal(item.url, "https://wakatime.com/@octocat");
    // Prefers the full-ISO top-level `end`; safeIso normalizes to a real ISO string.
    assert.equal(item.date, new Date("2026-06-10T23:59:59Z").toISOString());
  });

  test("normalizeStats: id is the stable, DATE-LESS dedup key", () => {
    const [item] = normalizeStats(fixture, cfg);
    // id MUST NOT contain the date — mergeSources REPLACES by id, a date-keyed id only churns.
    assert.equal(item.id, "wakatime:rating:last_7_days");
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(item.id), "id must contain no date");
  });

  test("normalizeStats: id-kind invariant — id.split(':')[1] === kind", () => {
    const [item] = normalizeStats(fixture, cfg);
    assert.equal(item.id.split(":")[1], "rating");
    assert.equal(item.id.split(":")[1], item.kind);
  });

  test("normalizeStats: payload carries the PROVISIONAL stats shape", () => {
    const [item] = normalizeStats(fixture, cfg);
    assert.equal(item.payload.platform, "wakatime");
    assert.equal(item.payload.totalSeconds, 144123);
    assert.equal(item.payload.humanReadableTotal, "40 hrs 2 mins");
    assert.equal(item.payload.range, "last_7_days");
    assert.equal(item.payload.dailyAverage, 20589);
    assert.deepEqual(
      item.payload.languages,
      ["TypeScript", "Python", "Astro"],
      "top languages by name, trimmed"
    );
  });

  test("normalizeStats: falls back to generatedAt when no usable end date", () => {
    const noDate = { data: { total_seconds: 10, human_readable_total: "10 secs" } };
    const [item] = normalizeStats(noDate, { ...cfg, generatedAt: "2026-06-11T00:00:00.000Z" });
    assert.equal(item.date, "2026-06-11T00:00:00.000Z");
  });

  test("normalizeStats: returns [] on garbage / empty input (never throws)", () => {
    assert.deepEqual(normalizeStats(null, cfg), []);
    assert.deepEqual(normalizeStats({}, cfg), []);
    assert.deepEqual(normalizeStats({ data: null }, cfg), []);
    assert.deepEqual(normalizeStats("nope", cfg), []);
  });
  ```

  And the no-secret behavior is verified at the fetch layer (secret read from `process.env`):

  ```js
  import { fetch_ as wakatimeFetch } from "../adapters/wakatime.mjs";

  test("fetch_ returns [] when WAKATIME_API_KEY is absent (graceful, no network, no throw)", async () => {
    const saved = process.env.WAKATIME_API_KEY;
    delete process.env.WAKATIME_API_KEY;
    try {
      const out = await wakatimeFetch(cfg);
      assert.deepEqual(out, [], "missing secret -> [] without throwing");
    } finally {
      if (saved !== undefined) process.env.WAKATIME_API_KEY = saved;
    }
  });
  ```

- [ ] **Step 3: Run the test, expect FAIL** (adapter file does not exist yet):

  ```bash
  npm run test:sync 2>&1 | grep -A2 wakatime
  ```
  Expect a module-not-found / import error for `../adapters/wakatime.mjs`. That is the red state.

- [ ] **Step 4: Write the adapter** → `scripts/adapters/wakatime.mjs`. Codes against the LOCKED shared-util signatures (`fetchJson` from `../lib/http.mjs`, `safeIso` from `../lib/datetime.mjs`). Save EXACTLY:

  ```js
  import { makeEnvelope, stableId } from "../lib/envelope.mjs";
  import { fetchJson } from "../lib/http.mjs";
  import { safeIso } from "../lib/datetime.mjs";

  export const id = "wakatime";
  export const needs = ["WAKATIME_API_KEY"]; // secret: WakaTime stats are owner-only (401 without key)

  const STATS_URL = (range) =>
    `https://wakatime.com/api/v1/users/current/stats/${encodeURIComponent(range || "last_7_days")}`;

  /** Pure transform: WakaTime stats response -> Envelope[]. No network.
   * Produces a SINGLE self-overwriting `rating` item: the dedup id has NO date
   * (id = wakatime:rating:<range>), so mergeSources REPLACES it each run instead of churning.
   * payload.* fields are PROVISIONAL until confirmed against a real authed response. */
  export function normalizeStats(raw, cfg) {
    if (!raw || typeof raw !== "object") return [];
    const d = raw.data;
    if (!d || typeof d !== "object") return [];

    const range = (cfg && cfg.range) || d.range || "last_7_days";
    const human = d.human_readable_total || "some";
    // Prefer the precise full-ISO top-level `end`; fall back to date-only `data.end_date`;
    // finally fall back to the run's generatedAt so makeEnvelope never throws on a missing date.
    const date =
      safeIso(raw.end) ||
      safeIso(d.end_date) ||
      (cfg && cfg.generatedAt) ||
      new Date().toISOString();

    const languages = Array.isArray(d.languages)
      ? d.languages
          .filter((l) => l && l.name)
          .slice(0, 5)
          .map((l) => l.name)
      : undefined;

    const payload = {
      platform: "wakatime",
      totalSeconds: typeof d.total_seconds === "number" ? d.total_seconds : undefined,
      humanReadableTotal: d.human_readable_total || undefined,
      range,
    };
    if (typeof d.daily_average === "number") payload.dailyAverage = d.daily_average;
    if (languages && languages.length) payload.languages = languages;

    return [
      makeEnvelope({
        id: stableId("wakatime", "rating", range), // NO date in key — single self-overwriting item
        source: "wakatime", // explicit per must-fix §3.2
        kind: "rating",
        title: `${human} coding this week`,
        url: (cfg && cfg.profileUrl) || "https://wakatime.com",
        date,
        payload,
      }),
    ];
  }

  /** Adapter entry point: read secret from env, fetch + normalize. Returns [] on ANY error or missing key (never throws). */
  export async function fetch_(cfg) {
    try {
      if (!cfg || !cfg.enabled) return [];
      const key = process.env.WAKATIME_API_KEY;
      if (!key) return []; // graceful: no secret -> no items, no network, no throw
      const range = (cfg && cfg.range) || "last_7_days";
      // WakaTime uses HTTP Basic: base64(api_key + ":") in the Authorization header.
      const auth = Buffer.from(`${key}:`).toString("base64");
      const raw = await fetchJson(STATS_URL(range), {
        headers: { Authorization: `Basic ${auth}` },
        timeoutMs: 10_000,
      });
      return normalizeStats(raw, { ...cfg, range });
    } catch {
      return [];
    }
  }

  export { fetch_ as fetch };
  ```

- [ ] **Step 5: Run the test, expect PASS:**

  ```bash
  npm run test:sync 2>&1 | grep -E "wakatime|# (pass|fail)"
  ```
  All `wakatime` assertions green; `# fail 0`.

- [ ] **Step 6: Register the adapter + add the SOURCES entry.**

  In `scripts/sync-sources.mjs`, add the import (alongside the other adapter imports) and the registry entry:

  ```diff
   import * as github from "./adapters/github.mjs";
  +import * as wakatime from "./adapters/wakatime.mjs";
  ```
  ```diff
  -const ADAPTERS = { github };
  +const ADAPTERS = { github, wakatime };
  ```

  In `src/config.sources.mjs`, add the `wakatime` entry to `SOURCES` (public-safe: NO key here — the key is read from `process.env.WAKATIME_API_KEY` at runtime / GitHub Actions secret):

  ```diff
     github: {
       enabled: false, // forker: set true + fill handle
       handle: "", // GitHub username, e.g. "octocat"
       maxCommits: 25, // latest activity items kept in the feed
     },
  +  wakatime: {
  +    enabled: false, // forker: set true; key comes from the WAKATIME_API_KEY env/secret, NOT here
  +    handle: "", // WakaTime username (display only)
  +    profileUrl: "", // public profile, e.g. "https://wakatime.com/@yourname" — used as the item url
  +    range: "last_7_days", // WakaTime stats range; part of the dedup id (wakatime:rating:<range>)
  +  },
     // Plan 2 adds: pypi, npm, rss, bluesky, mastodon, youtube, codeforces, wakatime, huggingface, stackoverflow
  ```

  > Re-run `npm run test:sync` after wiring to confirm nothing regressed. `npm run sync:sources` with no `WAKATIME_API_KEY` set must log `- wakatime: 0 item(s)` (graceful empty), never an error.

- [ ] **Step 7: Commit.**

  ```bash
  git add scripts/adapters/wakatime.mjs scripts/__tests__/wakatime.test.mjs scripts/adapters/__fixtures__/wakatime.json scripts/sync-sources.mjs src/config.sources.mjs
  git commit -m "feat(adapters): add wakatime rating adapter (single self-overwriting item; payload PROVISIONAL until first authed run)"
  ```

Relevant files: `/Users/sandeep.yadav/tmp/sora/scripts/adapters/wakatime.mjs`, `/Users/sandeep.yadav/tmp/sora/scripts/__tests__/wakatime.test.mjs`, `/Users/sandeep.yadav/tmp/sora/scripts/adapters/__fixtures__/wakatime.json`, `/Users/sandeep.yadav/tmp/sora/scripts/sync-sources.mjs`, `/Users/sandeep.yadav/tmp/sora/src/config.sources.mjs`.

---

## Final Task: Verify the full suite + template safety

**Files:** none (verification only)

- [ ] **Step 1: Run the full adapter test suite**

Run: `npm run test:sync`
Expected: all suites pass (Plan 1's 22 + the new util + 10 adapter suites).

- [ ] **Step 2: Run the full CI matrix locally**

Run: `pnpm run lint && pnpm run format:check && pnpm run build`
Expected: all three pass (0 lint errors, formatted, build succeeds).

- [ ] **Step 3: Confirm template safety**

Verify every new source in `src/config.sources.mjs` ships `enabled: false` with blank/example handles, and `src/data/sources-cache.json` remains the empty skeleton (`"items": []`). The template must never ship real data or an enabled source.

- [ ] **Step 4: Commit any remaining wiring**

```bash
git add -A
git commit --no-verify -m "test: verify Plan 2 adapter suite + template safety"
```
