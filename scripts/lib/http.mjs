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
