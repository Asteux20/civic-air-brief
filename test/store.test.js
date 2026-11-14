// Covers the Upstash, memory and fallback stores, single-flight, and store sharing across handler instances.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/brief.js';
import { createMemoryStore, createUpstashStore, createStore, createSingleFlight } from '../lib/store.js';

const sample = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');
const creds = { url: 'https://example-redis.upstash.io', token: 'tok-123' };

/** Fake fetch that records every call and answers with the given data. */
function recordingFetch(data, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    return { ok, status, json: async () => data };
  };
  return { calls, fetchImpl };
}

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

const fakeBrief = {
  summary: 's', changeNarrative: 'c', internalNote: 'n',
  trends: [{ text: 't', evidence: ['F2'] }],
  hotspots: [{ location: 'Ward 12 Bus Depot', why: 'w', evidence: ['F1'] }],
  actions: [{ priority: 1, action: 'a', why: 'y', timeframe: 'today', evidence: ['F1'] }],
  dataCaveats: [{ text: 'd', evidence: ['F3'] }],
  advisories: ['English', 'Hindi'].map((language) => ({ language, headline: 'h', general: 'g', children: 'c', olderAdults: 'o', sensitiveGroups: 's', outdoorWorkers: 'w' })),
};

const testConfig = (overrides = {}) => ({
  geminiApiKey: 'k', geminiModel: 'test-model', accessCode: '', maxBriefsPerHour: 60,
  perIpPerMinute: 4, degradedPerHour: 10, store: null, ...overrides,
});

const briefReq = (table, ip) => ({
  method: 'POST',
  headers: { 'x-forwarded-for': ip },
  body: { table, role: 'school', languages: ['English', 'Hindi'], readingLevel: 'simple', previous: null },
});

test('upstash limit posts an atomic multi-exec with bearer auth and reads the count', async () => {
  const { calls, fetchImpl } = recordingFetch([{ result: 2 }, { result: 0 }]);
  const store = createUpstashStore(creds, { fetchImpl });
  const out = await store.limit('k1', 2, 60000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${creds.url}/multi-exec`);
  assert.equal(calls[0].headers.Authorization, 'Bearer tok-123');
  assert.deepEqual(calls[0].body, [['INCR', 'k1'], ['PEXPIRE', 'k1', '60000', 'NX']]);
  assert.deepEqual(out, { allowed: true, count: 2 });
});

test('upstash limit blocks above the limit', async () => {
  const { fetchImpl } = recordingFetch([{ result: 3 }, { result: 0 }]);
  const store = createUpstashStore(creds, { fetchImpl });
  assert.deepEqual(await store.limit('k1', 2, 60000), { allowed: false, count: 3 });
});

test('upstash get parses JSON and returns null for a missing key', async () => {
  const hit = recordingFetch({ result: JSON.stringify({ a: 1 }) });
  assert.deepEqual(await createUpstashStore(creds, { fetchImpl: hit.fetchImpl }).get('k'), { a: 1 });
  assert.equal(hit.calls[0].url, creds.url);
  assert.deepEqual(hit.calls[0].body, ['GET', 'k']);
  const miss = recordingFetch({ result: null });
  assert.equal(await createUpstashStore(creds, { fetchImpl: miss.fetchImpl }).get('k'), null);
});

test('upstash set posts SET with a 30 minute PX ttl', async () => {
  const { calls, fetchImpl } = recordingFetch({ result: 'OK' });
  await createUpstashStore(creds, { fetchImpl }).set('k', { b: 2 }, 1800000);
  assert.deepEqual(calls[0].body, ['SET', 'k', JSON.stringify({ b: 2 }), 'PX', '1800000']);
});

test('upstash throws on HTTP error, network error and error body', async () => {
  const http = createUpstashStore(creds, { fetchImpl: recordingFetch({}, { ok: false, status: 503 }).fetchImpl });
  await assert.rejects(http.get('k'), /503/);
  const net = createUpstashStore(creds, { fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  await assert.rejects(net.limit('k', 1, 1000), /ECONNRESET/);
  const body = createUpstashStore(creds, { fetchImpl: recordingFetch({ error: 'WRONGPASS bad token' }).fetchImpl });
  await assert.rejects(body.set('k', 1, 1000), /WRONGPASS/);
});

test('upstash call is cut off near the default 400 ms timeout', async () => {
  const hanging = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
  });
  const store = createUpstashStore(creds, { fetchImpl: hanging });
  const started = Date.now();
  await assert.rejects(store.limit('k', 1, 1000));
  assert.ok(Date.now() - started < 2000);
});

test('createStore falls back to memory when upstash fails and logs store_degraded', async () => {
  const events = [];
  const failingFetch = async () => { throw new Error('down'); };
  const store = createStore({ store: creds }, { fetchImpl: failingFetch, log: (event) => events.push(event) });
  const first = await store.limit('ip', 2, 60000);
  assert.equal(first.degraded, true);
  assert.equal(first.allowed, true);
  assert.equal((await store.limit('ip', 2, 60000)).allowed, true);
  const third = await store.limit('ip', 2, 60000);
  assert.equal(third.allowed, false);
  assert.equal(third.count, 3);
  await store.set('v', { x: 1 }, 1000);
  assert.deepEqual(await store.get('v'), { x: 1 });
  assert.ok(events.includes('store_degraded'));
});

test('createStore without credentials returns a memory store', () => {
  assert.equal(createStore({ store: null }).kind, 'memory');
});

test('two handler instances sharing one store serve the second call from cache', async () => {
  const store = createMemoryStore();
  const config = testConfig();
  let calls = 0;
  const generate = async () => { calls += 1; return { brief: fakeBrief, model: 'test-model' }; };
  const a = mockRes();
  await handler(briefReq(sample, '5.5.5.5'), a, { store, config, generate });
  const b = mockRes();
  await handler(briefReq(sample, '5.5.5.5'), b, { store, config, generate });
  assert.equal(a.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(b.body.cached, true);
});

test('per-IP limit holds across instances that share a store', async () => {
  const store = createMemoryStore();
  const config = testConfig({ perIpPerMinute: 2 });
  const instanceA = async () => ({ brief: fakeBrief, model: 'test-model' });
  const instanceB = async () => ({ brief: fakeBrief, model: 'test-model' });
  const tables = [sample, sample.replace('142', '143'), sample.replace('142', '144')];
  const results = [];
  for (const [i, table] of tables.entries()) {
    const res = mockRes();
    await handler(briefReq(table, '6.6.6.6'), res, { store, config, generate: i % 2 ? instanceB : instanceA });
    results.push(res);
  }
  assert.equal(results[0].statusCode, 200);
  assert.equal(results[1].statusCode, 200);
  assert.equal(results[2].statusCode, 429);
  assert.equal(results[2].body.code, 'rate_ip');
});

test('memory store evicts the least recently used key past maxKeys', async () => {
  const store = createMemoryStore({ maxKeys: 2 });
  await store.set('a', 1, 10000);
  await store.set('b', 2, 10000);
  assert.equal(await store.get('a'), 1);
  await store.set('c', 3, 10000);
  assert.equal(await store.get('b'), null);
  assert.equal(await store.get('a'), 1);
  assert.equal(store.size(), 2);
});

test('memory store returns null for a value past its ttl', async () => {
  let t = 0;
  const store = createMemoryStore({ now: () => t });
  await store.set('k', 'v', 1000);
  assert.equal(await store.get('k'), 'v');
  t = 1000;
  assert.equal(await store.get('k'), null);
});

test('single flight runs one call for concurrent keys and clears after rejection', async () => {
  const flight = createSingleFlight();
  let runs = 0;
  const fn = async () => { runs += 1; await new Promise((r) => setTimeout(r, 10)); return 'v'; };
  const [x, y] = await Promise.all([flight('k', fn), flight('k', fn)]);
  assert.equal(runs, 1);
  assert.deepEqual([x, y], ['v', 'v']);

  let tries = 0;
  const flaky = async () => { tries += 1; if (tries === 1) throw new Error('boom'); return 'ok'; };
  await assert.rejects(flight('j', flaky), /boom/);
  assert.equal(await flight('j', flaky), 'ok');
  assert.equal(tries, 2);
});
