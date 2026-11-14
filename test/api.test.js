import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/brief.js';
import { verifyEvidence, buildPrompt, callGemini } from '../lib/ai.js';
import { validateRequest, checkAccess, createRateLimiter } from '../lib/validate.js';

const sample = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');

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
  hotspots: [{ location: 'Ward 12 Bus Depot', why: 'w', evidence: ['F1', 'F999'] }],
  actions: [{ priority: 2, action: 'b', why: 'y', timeframe: 'today', evidence: [] }, { priority: 1, action: 'a', why: 'y', timeframe: 'today', evidence: ['f1'] }],
  dataCaveats: [{ text: 'd', evidence: ['F3'] }],
  advisories: [{ language: 'English', headline: 'h', general: 'g', children: 'c', olderAdults: 'o', sensitiveGroups: 's' }],
};

test('verifyEvidence drops unknown ids and marks uncited items', () => {
  const facts = [{ id: 'F1' }, { id: 'F2' }, { id: 'F3' }];
  const { brief, unverifiedCount } = verifyEvidence(fakeBrief, facts);
  assert.deepEqual(brief.hotspots[0].evidence, ['F1']);
  assert.equal(brief.actions[0].priority, 1, 'actions sorted by priority');
  assert.equal(brief.actions[0].verified, true, 'lowercase id normalised');
  assert.equal(brief.actions[1].verified, false);
  assert.equal(unverifiedCount, 1);
});

test('validateRequest guards input', () => {
  assert.throws(() => validateRequest(null), /JSON/);
  assert.throws(() => validateRequest({ table: '', role: 'school', languages: ['English'] }), /table/);
  assert.throws(() => validateRequest({ table: 'x', role: 'hacker', languages: ['English'] }), /who is asking/);
  assert.throws(() => validateRequest({ table: 'x', role: 'school', languages: ['Klingon'] }), /language/);
  assert.throws(() => validateRequest({ table: 'x', role: 'school', languages: ['English', 'Hindi', 'Tamil', 'Telugu', 'Marathi'] }), /up to 4/);
  const ok = validateRequest({ table: 'x', role: 'school', languages: ['Hindi', 'Hindi'], readingLevel: 'weird', previous: [] });
  assert.deepEqual(ok.languages, ['Hindi']);
  assert.equal(ok.readingLevel, 'standard');
  assert.equal(ok.previous, null);
});

test('access code check is exact', () => {
  assert.equal(checkAccess('abc', 'abc'), true);
  assert.equal(checkAccess('abd', 'abc'), false);
  assert.equal(checkAccess(undefined, 'abc'), false);
  assert.equal(checkAccess(undefined, ''), true);
});

test('rate limiter blocks after limit', () => {
  const allow = createRateLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(allow('ip', 0), true);
  assert.equal(allow('ip', 1), true);
  assert.equal(allow('ip', 2), false);
  assert.equal(allow('ip', 2000), true);
});

test('prompt contains only computed facts and requested languages', () => {
  const analysis = { facts: [{ id: 'F1', kind: 'stat', text: 'Ward A: PM2.5 average 90' }], locations: [] };
  const p = buildPrompt({ analysis, comparison: { hasPrevious: false }, role: 'school', languages: ['Hindi', 'Tamil'], readingLevel: 'simple' });
  assert.match(p, /F1 \[stat\] Ward A/);
  assert.match(p, /Hindi, Tamil/);
  assert.match(p, /School principal/);
});

test('callGemini reports missing key and bad responses', async () => {
  await assert.rejects(callGemini('x', { apiKey: '' }), /GEMINI_API_KEY/);
  const bad = async () => ({ ok: false, status: 429, text: async () => 'quota' });
  await assert.rejects(callGemini('x', { apiKey: 'k', fetchImpl: bad }), /429/);
  const good = async (url, opts) => {
    assert.equal(opts.headers['x-goog-api-key'], 'k');
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"summary":"ok"}' }] } }] }) };
  };
  const r = await callGemini('x', { apiKey: 'k', fetchImpl: good });
  assert.equal(r.brief.summary, 'ok');
});

test('handler end to end with injected AI', async () => {
  const res = mockRes();
  let seenPrompt = '';
  await handler({ method: 'POST', headers: {}, body: { table: sample, role: 'ward_officer', languages: ['English', 'Hindi'], readingLevel: 'simple', previous: null } }, res, {
    generate: async (prompt) => { seenPrompt = prompt; return { brief: fakeBrief, model: 'test' }; },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.analysis.hotspots[0], 'Ward 12 Bus Depot');
  assert.ok(res.body.issues.length > 5);
  assert.equal(res.body.comparison.hasPrevious, false);
  assert.match(seenPrompt, /Ward officer/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('handler rejects wrong method, bad body and unparseable tables', async () => {
  let res = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  res = mockRes();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.1' }, body: '{bad' }, res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.2' }, body: { table: 'a,b\n1,2', role: 'school', languages: ['English'] } }, res);
  assert.equal(res.statusCode, 422);
});
