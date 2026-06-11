// Leak-guard (spec §2.5): the repo is public, so nothing secret may reach a committed file.
const MIN_SECRET_LEN = 6; // ignore short/empty values that would match innocuous text

/** Collect candidate secret values from env var NAMES the run was given. */
export function collectSecrets(envVarNames, env = process.env) {
  return envVarNames
    .map((name) => env[name])
    .filter((v) => typeof v === "string" && v.length >= MIN_SECRET_LEN);
}

/** Throw if any secret value appears in `output`. Call before writing the cache. */
export function assertNoSecrets(output, secrets) {
  for (const s of secrets) {
    if (typeof s !== "string" || s.length < MIN_SECRET_LEN) continue;
    if (output.includes(s)) {
      throw new Error("Leak guard: secret value detected in output — refusing to write cache.");
    }
  }
}

/** Replace any secret occurrence in a string with [REDACTED] (for safe error logging). */
export function sanitize(str, secrets) {
  let out = String(str);
  for (const s of secrets) {
    if (typeof s !== "string" || s.length < MIN_SECRET_LEN) continue;
    out = out.split(s).join("[REDACTED]");
  }
  return out;
}
