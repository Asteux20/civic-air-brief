// GenAI guard rails: prompt budget, output validation with one retry, partial results never cached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/brief.js';
import { buildPrompt, PROMPT_BUDGET_BYTES, MAX_PROMPT_FACTS } from '../lib/ai.js';
import { prepareBrief, generateBrief } from '../lib/brief.js';
import { createMemoryStore } from '../lib/store.js';

const sample = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');
const config = { geminiApiKey: 'k', geminiModel: 'test-model', accessCode: '', maxBriefsPerHour: 60, perIpPerMinute: 10, degradedPerHour: 10, store: null };
const advisory = (language) => ({ language, headline: 'h', general: 'g', children: 'c', olderAdults: 'o', sensitiveGroups: 's', outdoorWorkers: 'w' });
const complete = (languages) => ({
  summary: 's', internalNote: 'n', changeNarrative: 'c', trends: [], hotspots: [], dataCaveats: [],
  actions: [{ priority: 1, action: 'Sprinkle roads', why: 'dust', timeframe: 'today', evidence: ['F1'] }],
  advisories: languages.map(advisory),
});
const mockRes = () => ({
  statusCode: 200, headers: {}, body: null,
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; },
});
const input = (languages = ['English']) => ({ table: sample, role: 'school', languages, readingLevel: 'simple', previous: null });

/** A 5,000-row table across 1,000 sites, about 2,600 facts before the budget. */
function bigTable() {
  const rows = ['Site,Date,PM2.5,PM10'];
  for (let i = 0; i < 5000; i += 1) rows.push(`Site ${i % 1000},2026-11-0${(i % 5) + 1},${40 + (i % 97)},${90 + (i % 211)}`);
  return rows.join('\n');
}

test('prompt never exceeds 24 KB or 120 facts, and omissions are disclosed', () => {
  const prepared = prepareBrief({ ...input(), table: bigTable() });
  assert.ok(Buffer.byteLength(prepared.prompt) <= PROMPT_BUDGET_BYTES, `prompt is ${Buffer.byteLength(prepared.prompt)} bytes`);
  assert.ok(prepared.promptFacts.length <= MAX_PROMPT_FACTS);
  assert.ok(prepared.omitted > 0);
  assert.match(prepared.prompt, new RegExp(`${prepared.omitted} lower-ranked facts omitted`));
});

test('prompt keeps quality facts and the worst sites first', () => {
  const prepared = prepareBrief(input());
  const kinds = prepared.promptFacts.map((f) => f.kind);
  assert.equal(kinds[0], 'quality');
  const firstStat = prepared.promptFacts.find((f) => f.kind === 'stat');
  assert.match(firstStat.text, /^Ward 12 Bus Depot/);
});

test('only facts given to the model count as evidence', () => {
  const { prompt, facts } = buildPrompt({
    analysis: { facts: [{ id: 'F1', kind: 'stat', text: 'A' }, { id: 'F2', kind: 'stat', text: 'B' }], stats: [{ ratio: 2, factId: 'F1' }], locations: [] },
    comparison: { hasPrevious: false }, role: 'school', languages: ['English'], readingLevel: 'simple',
  });
  assert.deepEqual(facts.map((f) => f.id), ['F1']);
  assert.doesNotMatch(prompt, /F2 \[stat\]/);
});

test('malformed Gemini output is retried once, then returned as partial', async () => {
  let calls = 0;
  const generate = async () => { calls += 1; return { brief: { summary: 'only a summary' }, model: 'm' }; };
  const ai = await generateBrief('p', ['English'], generate);
  assert.equal(calls, 2);
  assert.equal(ai.aiStatus, 'partial');
  assert.ok(ai.missing.includes('actions'));
  assert.ok(ai.missing.includes('advisory:English'));
});

test('a complete second attempt wins after a malformed first one', async () => {
  const answers = [{ summary: 'x' }, complete(['Hindi'])];
  const ai = await generateBrief('p', ['Hindi'], async () => ({ brief: answers.shift(), model: 'm' }));
  assert.equal(ai.aiStatus, 'complete');
  assert.deepEqual(ai.missing, []);
});

test('a failed retry keeps the first partial answer', async () => {
  let calls = 0;
  const generate = async () => {
    calls += 1;
    if (calls === 2) throw new Error('upstream down');
    return { brief: { summary: 'x' }, model: 'm' };
  };
  const ai = await generateBrief('p', ['English'], generate);
  assert.equal(ai.aiStatus, 'partial');
});

test('partial briefs are never cached', async () => {
  const store = createMemoryStore();
  let calls = 0;
  const generate = async () => { calls += 1; return { brief: { summary: 'x' }, model: 'm' }; };
  const body = input(['English']);
  for (let i = 0; i < 2; i += 1) {
    const res = mockRes();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '5.5.5.5' }, body }, res, { generate, store, config });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.aiStatus, 'partial');
    assert.equal(res.body.cached, false);
  }
  assert.equal(calls, 4, 'two requests x (first try + one retry), no cache hit');
});

test('response reports claims traced, alerts, instance id and store kind', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '5.5.5.6' }, body: input(['English']) }, res, {
    generate: async () => ({ brief: complete(['English']), model: 'm' }), store: createMemoryStore(), config,
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.traced, { verified: 1, total: 1 });
  assert.ok(res.body.alerts.length > 0);
  assert.match(res.body.instanceId, /^[0-9a-f]{8}$/);
  assert.equal(res.body.store, 'memory');
});

test('the prompt carries the plain-writing rules and bans the slop words', async () => {
  const { prepareBrief } = await import('../lib/brief.js');
  const { readFileSync } = await import('node:fs');
  const table = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');
  const { prompt } = prepareBrief({ table, role: 'citizen', languages: ['English'], readingLevel: 'standard', previous: null });
  assert.match(prompt, /Put the number first/);
  assert.match(prompt, /crucial, vital, robust, ensure, delve, landscape, navigate/);
  assert.match(prompt, /Parent or resident/);
});

test('clause 1: the prompt shows Gemini how code mapped each messy header', async () => {
  const { prepareBrief } = await import('../lib/brief.js');
  const table = 'Station Name,Date,PM2.5 (ug/m3)\nWard 1,01/11/2026,80\nWard 1,02/11/2026,95\n';
  const { prompt } = prepareBrief({ table, role: 'ward_officer', languages: ['English'], readingLevel: 'standard' });
  assert.match(prompt, /<table> how code parsed/);
  assert.match(prompt, /PM2\.5 \(ug\/m3\) -> pm25/);
});
