import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLinkedIn, fetch_ } from "../adapters/linkedin.mjs";

const fixture = {
  fetchedAt: "2026-06-25",
  profile: {
    url: "https://www.linkedin.com/in/testuser/",
    name: "Test User",
    headline: "Software Engineer @ Acme",
    location: "New Delhi, India",
    followers: 100,
    connections: "200+",
    openToWork: ["Software Engineer"],
    experience: [
      {
        title: "Software Engineer",
        company: "Acme Corp",
        type: "Full-time",
        start: "Jun 2024",
        end: "Present",
        duration: "1 yr",
        location: "Remote",
        bullets: ["Built API integrations"],
        isCurrent: true,
      },
      {
        title: "Developer",
        company: "Startup Inc",
        type: "Full-time",
        start: "Jan 2022",
        end: "May 2024",
        duration: "2 yrs 5 mos",
        location: "India",
        bullets: [],
        isCurrent: false,
      },
    ],
    education: [],
    projects: [],
    contact: { email: "test@example.com" },
  },
};

test("emits profile envelope with correct fields", () => {
  const envelopes = normalizeLinkedIn(fixture);
  const profile = envelopes.find((e) => e.kind === "profile");
  assert.ok(profile, "profile envelope should exist");
  assert.equal(profile.source, "linkedin");
  assert.ok(profile.title.includes("Test User"), "title should include name");
  assert.ok(profile.title.includes("Software Engineer @ Acme"), "title should include headline");
  assert.equal(profile.payload.platform, "linkedin");
  assert.equal(profile.payload.name, "Test User");
  assert.equal(profile.payload.headline, "Software Engineer @ Acme");
  assert.equal(profile.payload.followers, 100);
});

test("emits one experience envelope per job", () => {
  const envelopes = normalizeLinkedIn(fixture);
  const ratings = envelopes.filter((e) => e.kind === "rating");
  assert.equal(ratings.length, fixture.profile.experience.length);
});

test("current role has isCurrent:true in payload", () => {
  const envelopes = normalizeLinkedIn(fixture);
  const ratings = envelopes.filter((e) => e.kind === "rating");
  const current = ratings.find((e) => e.payload.company === "Acme Corp");
  assert.ok(current, "Acme Corp envelope should exist");
  assert.equal(current.payload.isCurrent, true);
});

test("experience envelope has title, company, duration, bullets", () => {
  const envelopes = normalizeLinkedIn(fixture);
  const ratings = envelopes.filter((e) => e.kind === "rating");
  const acme = ratings.find((e) => e.payload.company === "Acme Corp");
  assert.ok(acme, "Acme Corp envelope should exist");
  assert.equal(acme.payload.title, "Software Engineer");
  assert.equal(acme.payload.company, "Acme Corp");
  assert.equal(acme.payload.duration, "1 yr");
  assert.deepEqual(acme.payload.bullets, ["Built API integrations"]);
});

test("returns [] for null/empty cache", () => {
  assert.deepEqual(normalizeLinkedIn(null), []);
  assert.deepEqual(normalizeLinkedIn({}), []);
  assert.deepEqual(normalizeLinkedIn({ profile: null }), []);
});

test("fetch_ returns [] when disabled", async () => {
  const result = await fetch_({ enabled: false, cacheFile: "does-not-matter" });
  assert.deepEqual(result, []);
});

test("fetch_ returns [] when cacheFile does not exist", async () => {
  const result = await fetch_({ enabled: true, cacheFile: "/tmp/__nonexistent_linkedin_cache__.json" });
  assert.deepEqual(result, []);
});
