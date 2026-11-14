// @ts-check
/**
 * Live efficiency numbers from a deployed URL: sends the shipped sample table 3 times with
 * the same settings. Call 1 is a cache miss (one real Gemini call) unless the brief is already
 * cached; calls 2 and 3 should come back cached from the shared store, possibly from other
 * instances. Prints status, cached flag, instanceId, store kind, wall time and response bytes.
 * Run: BRIEF_ACCESS_CODE=<code> node scripts/bench-live.js https://<deployment>
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const CALLS = 3;

/** One POST to /api/brief; returns what the README table needs. */
async function call(base, body, code) {
  const t = performance.now();
  const res = await fetch(new URL('/api/brief', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(code ? { 'x-access-code': code } : {}) },
    body,
  });
  const text = await res.text();
  const ms = performance.now() - t;
  let data = {};
  try { data = JSON.parse(text); } catch { /* non-JSON error page: keep the status only */ }
  return { status: res.status, cached: data.cached ?? null, instanceId: data.instanceId ?? null, store: data.store ?? null, ms: Math.round(ms), responseBytes: Buffer.byteLength(text), error: data.error };
}

async function main() {
  const base = process.argv[2];
  if (!base || !/^https?:\/\//.test(base)) {
    process.stderr.write('Usage: BRIEF_ACCESS_CODE=<code> node scripts/bench-live.js https://<deployment>\n');
    process.exitCode = 2;
    return;
  }
  const table = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');
  const body = JSON.stringify({ table, role: 'ward_officer', languages: ['English', 'Hindi'] });
  const calls = [];
  for (let i = 0; i < CALLS; i += 1) calls.push(await call(base, body, process.env.BRIEF_ACCESS_CODE));
  const ok = calls.filter((c) => c.status === 200);
  const summary = {
    url: base,
    calls,
    cachedAfterFirst: ok.slice(1).every((c) => c.cached === true) && ok.length === CALLS,
    distinctInstances: new Set(ok.map((c) => c.instanceId)).size,
    stores: [...new Set(ok.map((c) => c.store))],
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = ok.length === CALLS ? 0 : 1;
}

await main();
