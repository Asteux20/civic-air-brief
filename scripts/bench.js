// @ts-check
/**
 * Local efficiency numbers for the README: deterministic pipeline time, prompt size, and
 * the cache-hit path through the real handler. Inputs are the shipped sample table and a
 * 5,000-row table built from it (sites renamed, dates shifted). The Gemini call is replaced
 * by a fixed stub here, so these times measure this app's code only, never Gemini.
 * Run: node scripts/bench.js
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { prepareBrief } from '../lib/brief.js';
import { createMemoryStore } from '../lib/store.js';
import { loadConfig } from '../lib/config.js';
import handler from '../api/brief.js';

const RUNS = 20;
const sample = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');

/** 5,000 data rows made from the sample: each copy gets new site names and later dates. */
function largeTable() {
  const [header, ...rows] = sample.trim().split('\n');
  const out = [];
  for (let copy = 0; out.length < 5000; copy += 1) {
    for (const row of rows) {
      if (out.length === 5000) break;
      const cells = row.split(',');
      const day = String(1 + (copy % 28)).padStart(2, '0');
      out.push([`${cells[0]} ${Math.floor(copy / 28)}`, `${day}/10/2026`, ...cells.slice(2)].join(','));
    }
  }
  return [header, ...out].join('\n');
}

/** Median of RUNS timings of fn, in milliseconds. */
async function median(fn) {
  const times = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(RUNS / 2)];
}

/** Pipeline time and prompt size for one table. */
async function pipeline(label, table) {
  const input = { table, role: 'ward_officer', languages: ['English', 'Hindi'], readingLevel: 'standard', previous: null };
  const ms = await median(() => prepareBrief(input));
  const p = prepareBrief(input);
  return { input: label, rows: p.analysis.rowCount, pipelineMs: +ms.toFixed(2), promptBytes: Buffer.byteLength(p.prompt), factsSent: p.promptFacts.length, factsOmitted: p.omitted };
}

/** A minimal valid brief so the handler caches it; stands in for Gemini only in this script. */
function stubGenerate() {
  const advisory = (language) => ({ language, headline: 'h', general: 'g', children: 'c', olderAdults: 'o', sensitiveGroups: 's', outdoorWorkers: 'w' });
  const brief = { summary: 's', internalNote: 'n', trends: [], hotspots: [], actions: [{ priority: 1, action: 'a', why: 'w', timeframe: 't', evidence: [] }], dataCaveats: [], advisories: ['English', 'Hindi'].map(advisory) };
  return async () => ({ brief, model: 'stub' });
}

/** Call the real handler once and return its status, body and wall time. */
async function callHandler(deps, body) {
  let status = 0, payload = '';
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(d) { payload = JSON.stringify(d); return this; } };
  const t = performance.now();
  await handler({ method: 'POST', headers: {}, body, socket: { remoteAddress: '127.0.0.1' } }, res, deps);
  return { status, payload, ms: performance.now() - t };
}

/** First call (stubbed AI, then cached) versus the median cached call. */
async function cachePath() {
  const deps = { store: createMemoryStore(), config: { ...loadConfig({}), perIpPerMinute: 1000 }, generate: stubGenerate() };
  const body = { table: sample, role: 'ward_officer', languages: ['English', 'Hindi'] };
  const miss = await callHandler(deps, body);
  const hits = [];
  for (let i = 0; i < RUNS; i += 1) hits.push(await callHandler(deps, body));
  hits.sort((a, b) => a.ms - b.ms);
  const hit = hits[Math.floor(RUNS / 2)];
  return { firstCallMs: +miss.ms.toFixed(2), cachedCallMs: +hit.ms.toFixed(2), cached: JSON.parse(hit.payload).cached, responseBytes: Buffer.byteLength(hit.payload), status: hit.status };
}

console.log = () => {}; // the handler logs one line per call; keep stdout to the results
const results = { node: process.version, runs: RUNS, pipeline: [await pipeline('sample (21 rows)', sample), await pipeline('5,000 rows built from the sample', largeTable())], handler: await cachePath() };
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
