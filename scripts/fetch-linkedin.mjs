/* eslint-disable no-console */
/**
 * fetch-linkedin.mjs — Local-only script to refresh LinkedIn data via MCP.
 *
 * NOT run in CI. Run locally when you want to update linkedin-cache.json:
 *   npm run fetch:linkedin
 *
 * Requires: uvx and the LinkedIn MCP server configured with your credentials.
 * After first run you may need to authenticate (the server will print instructions).
 */

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(__dirname, "../src/data/linkedin-cache.json");
const MCP_PORT = 7771;
const MCP_URL = `http://localhost:${MCP_PORT}/mcp`;
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Spawn the MCP server
// ---------------------------------------------------------------------------

let serverProc = null;

function startServer() {
  console.log("Starting mcp-server-linkedin via uvx...");
  serverProc = spawn(
    "uvx",
    [
      "mcp-server-linkedin@latest",
      "--transport", "streamable-http",
      "--port", String(MCP_PORT),
      "--auto-import",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  serverProc.stdout.on("data", (d) => process.stdout.write(d));
  serverProc.stderr.on("data", (d) => process.stderr.write(d));

  serverProc.on("error", (err) => {
    console.error("Failed to start mcp-server-linkedin:", err.message);
    console.error("Make sure uvx is installed: pip install uv");
  });

  return serverProc;
}

function stopServer() {
  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGTERM");
    serverProc = null;
  }
}

process.on("exit", stopServer);
process.on("SIGINT", () => { stopServer(); process.exit(0); });
process.on("SIGTERM", () => { stopServer(); process.exit(0); });

// ---------------------------------------------------------------------------
// JSON-RPC helpers (streamable-http transport)
// ---------------------------------------------------------------------------

async function rpcCall(method, params = {}) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body,
  });

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    // Parse SSE response — accumulate data: lines
    const text = await res.text();
    let result = null;
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6).trim());
          if (parsed && parsed.result !== undefined) {
            result = parsed.result;
          } else if (parsed && parsed.id !== undefined) {
            result = parsed;
          }
        } catch {
          // non-JSON data line, skip
        }
      }
    }
    return result;
  }

  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

// ---------------------------------------------------------------------------
// Poll until server is ready
// ---------------------------------------------------------------------------

async function waitForServer(timeoutMs = POLL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    try {
      await rpcCall("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "fetch-linkedin", version: "1.0.0" },
      });
      console.log(`Server ready after ${attempts} attempt(s).`);
      return true;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Call the profile tool
// ---------------------------------------------------------------------------

async function fetchProfile() {
  const result = await rpcCall("tools/call", {
    name: "get_my_profile",
    arguments: {
      sections: "experience,education,skills,certifications,projects,contact_info",
    },
  });

  if (!result) throw new Error("Empty result from get_my_profile");

  // The tool may return content as an array of text blocks
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block.type === "text" && block.text) {
        try {
          return JSON.parse(block.text);
        } catch {
          // Return as-is if not JSON parseable
          return { raw: block.text };
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Normalise the MCP response into our cache format
// ---------------------------------------------------------------------------

function buildCache(raw) {
  const profile = raw?.profile ?? raw;
  return {
    fetchedAt: new Date().toISOString().slice(0, 10),
    profile: {
      url: profile.url || profile.publicProfileUrl || "https://www.linkedin.com/in/sandeepyadav1478/",
      name: profile.firstName
        ? `${profile.firstName} ${profile.lastName || ""}`.trim()
        : (profile.name || ""),
      headline: profile.headline || "",
      location: profile.locationName || profile.location || "",
      followers: profile.followersCount ?? profile.followers ?? 0,
      connections: profile.connectionsCount ? String(profile.connectionsCount) : (profile.connections || ""),
      openToWork: profile.openToWork || [],
      experience: (profile.experience || profile.positions || []).map((e) => ({
        title: e.title || e.role || "",
        company: e.company?.name || e.companyName || e.company || "",
        type: e.employmentType || e.type || "",
        start: e.startDate
          ? formatDate(e.startDate)
          : (e.start || ""),
        end: e.endDate
          ? formatDate(e.endDate)
          : (e.end || "Present"),
        duration: e.duration || "",
        location: e.locationName || e.location || "",
        bullets: e.description
          ? [e.description]
          : (e.bullets || []),
        isCurrent: !e.endDate || e.isCurrent === true,
      })),
      education: (profile.education || []).map((ed) => ({
        school: ed.schoolName || ed.school || "",
        degree: ed.degree || ed.degreeName || "",
        field: ed.fieldOfStudy || ed.field || "",
        start: ed.startDate?.year ? String(ed.startDate.year) : (ed.start || ""),
        end: ed.endDate?.year ? String(ed.endDate.year) : (ed.end || ""),
      })),
      projects: (profile.projects || []).map((pr) => ({
        title: pr.title || "",
        start: pr.startDate ? formatDate(pr.startDate) : (pr.start || ""),
        end: pr.endDate ? formatDate(pr.endDate) : (pr.end || "Present"),
        url: pr.url || "",
        skills: pr.skills || [],
      })),
      contact: {
        email: profile.emailAddress || (profile.contact && profile.contact.email) || "",
        website: profile.websites?.[0]?.url || (profile.contact && profile.contact.website) || "",
      },
    },
  };
}

function formatDate(d) {
  if (!d) return "";
  if (typeof d === "string") return d;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (d.month && d.year) return `${months[d.month - 1]} ${d.year}`;
  if (d.year) return String(d.year);
  return "";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  startServer();

  console.log(`Waiting for MCP server on port ${MCP_PORT}...`);
  const ready = await waitForServer();
  if (!ready) {
    console.error(
      `Timed out waiting for mcp-server-linkedin after ${POLL_TIMEOUT_MS / 1000}s.\n` +
      "Make sure uvx is installed and you have valid LinkedIn credentials.\n" +
      "If this is your first run, the server may need authentication — check its output."
    );
    stopServer();
    process.exit(1);
  }

  console.log("Fetching LinkedIn profile...");
  let raw;
  try {
    raw = await fetchProfile();
  } catch (err) {
    console.error("Failed to fetch profile:", err.message);
    if (err.message.includes("auth") || err.message.includes("401") || err.message.includes("login")) {
      console.error(
        "\nAuthentication required. The LinkedIn MCP server needs your credentials.\n" +
        "Follow the server's auth instructions, then re-run: npm run fetch:linkedin"
      );
    }
    stopServer();
    process.exit(1);
  }

  const cache = buildCache(raw);
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
  console.log(`Written to ${CACHE_PATH}`);
  console.log(`Profile: ${cache.profile.name} — ${cache.profile.headline}`);
  console.log(`Experience entries: ${cache.profile.experience.length}`);

  stopServer();
}

main().catch((err) => {
  console.error("fetch-linkedin fatal:", err.message);
  stopServer();
  process.exit(1);
});
