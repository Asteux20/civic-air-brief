// One behaviour test per clause of the problem statement, run through the real handler with an injected AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/brief.js';
import { createMemoryStore } from '../lib/store.js';

const sample = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');
const config = { geminiApiKey: 'k', geminiModel: 'test-model', accessCode: '', maxBriefsPerHour: 60, perIpPerMinute: 50, degradedPerHour: 10, store: null };
const mockRes = () => ({
  statusCode: 200, headers: {}, body: null,
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; },
});

/** Run the handler; the fake model cites F1 and answers in every requested language. */
async function brief(overrides = {}) {
  const prompts = [];
  const languages = overrides.languages || ['English'];
  const generate = async (prompt) => {
    prompts.push(prompt);
    return {
      model: 'fake',
      brief: {
        summary: 'Air is poor at the bus depot.', internalNote: 'See F1.', changeNarrative: 'First brief.',
        trends: [{ text: 'PM2.5 rising at the depot', evidence: ['F2'] }],
        hotspots: [{ location: 'Ward 12 Bus Depot', why: 'PM2.5 above the limit', evidence: ['F1'] }],
        actions: [{ priority: 1, action: 'Sprinkle roads', why: 'dust', timeframe: 'today', evidence: ['F1'] }],
        dataCaveats: [{ text: 'Some readings were missing', evidence: ['F99'] }],
        advisories: languages.map((language) => ({ language, headline: 'h', general: 'g', children: 'c', olderAdults: 'o', sensitiveGroups: 's', outdoorWorkers: 'w' })),
      },
    };
  };
  const res = mockRes();
  const body = { table: sample, role: 'ward_officer', languages, readingLevel: 'simple', previous: null, ...overrides };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '6.6.6.6' }, body }, res, { generate, store: createMemoryStore(), config });
  return { res, body: res.body, prompt: prompts[0] };
}

test('clause 1: a messy pasted table is interpreted (mixed units, bad cells, Indian dates)', async () => {
  const { res, body } = await brief();
  assert.equal(res.statusCode, 200);
  assert.equal(body.analysis.rowCount, 21);
  assert.ok(body.analysis.period.from.startsWith('2026-11-10'));
  assert.ok(body.issues.some((i) => i.type === 'converted'));
});

test('clause 2: trends and hotspots come from computed facts', async () => {
  const { body, prompt } = await brief();
  assert.equal(body.analysis.hotspots[0], 'Ward 12 Bus Depot');
  assert.ok(body.analysis.facts.some((f) => f.kind === 'trend'));
  assert.match(prompt, /<facts>\nF\d+ \[quality\]/);
});

test('clause 3: actions are prioritised for the asking role', async () => {
  const ward = await brief({ role: 'ward_officer' });
  const school = await brief({ role: 'school' });
  assert.match(ward.prompt, /Ward officer/);
  assert.match(school.prompt, /School principal/);
  assert.notEqual(ward.body.alerts[0].nextStep, school.body.alerts[0].nextStep);
  assert.equal(ward.body.brief.actions[0].priority, 1);
});

test('clause 4: every finding is traceable and gaps are flagged', async () => {
  const { body } = await brief();
  const known = new Set(body.analysis.facts.map((f) => f.id));
  assert.ok(body.brief.hotspots[0].evidence.every((id) => known.has(id)));
  assert.equal(body.brief.dataCaveats[0].verified, false, 'a caveat citing an unknown fact is marked unverified');
  assert.ok(body.issues.some((i) => i.type === 'flatline'));
  assert.ok(body.analysis.facts.every((f) => f.rows.length > 0));
});

test('clause 5: each brief is compared with the previous one', async () => {
  const first = await brief();
  const second = await brief({ previous: { ...first.body.snapshot, locations: { ...first.body.snapshot.locations, 'Ward 12 Bus Depot': { pm25: 100 } }, hotspots: [] } });
  assert.equal(second.body.comparison.hasPrevious, true);
  assert.ok(second.body.comparison.newHotspots.includes('Ward 12 Bus Depot'));
  assert.ok(second.body.alerts.some((a) => a.kind === 'worsened'));
});

test('clause 6: note and advisories in the requested languages and level, incl. outdoor workers', async () => {
  const { body, prompt } = await brief({ languages: ['Hindi', 'Urdu'], readingLevel: 'simple' });
  assert.ok(body.brief.internalNote);
  assert.deepEqual(body.brief.advisories.map((a) => a.language), ['Hindi', 'Urdu']);
  for (const a of body.brief.advisories) for (const k of ['children', 'olderAdults', 'sensitiveGroups', 'outdoorWorkers']) assert.ok(a[k]);
  assert.match(prompt, /about age 10 reading level/);
  assert.match(prompt, /delivery riders, street vendors/);
});
