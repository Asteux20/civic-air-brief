// Covers validateSnapshot and validateBrief: trust-boundary cleaning of client snapshots and Gemini output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, validateBrief } from '../lib/schema.js';
import { POLLUTANTS } from '../lib/parse.js';

const LANGS = ['English', 'Hindi'];
const advisory = (language, overrides = {}) => ({
  language, headline: 'h', general: 'g', children: 'c', olderAdults: 'o', sensitiveGroups: 's', outdoorWorkers: 'w', ...overrides,
});
const completeBrief = () => ({
  summary: 'sum', internalNote: 'note',
  actions: [{ priority: 1, action: 'a', why: 'y', timeframe: 'today', evidence: ['F1'] }],
  advisories: LANGS.map((l) => advisory(l)),
});

test('snapshot drops a hotspot that is not in locations and keeps one that is', () => {
  const snap = validateSnapshot({ locations: { A: { pm25: 50 } }, hotspots: ['A', 'Ghost'], issueTotal: 1 });
  assert.deepEqual(snap.hotspots, ['A']);
});

test('snapshot strips __proto__ and constructor keys without polluting prototypes', () => {
  const raw = JSON.parse('{"locations":{"__proto__":{"polluted":true},"constructor":{"pm25":1},"A":{"__proto__":{"polluted":true},"constructor":5,"pm25":40}},"hotspots":[]}');
  const snap = validateSnapshot(raw);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.hasOwn(snap.locations, '__proto__'), false);
  assert.equal(Object.hasOwn(snap.locations, 'constructor'), false);
  assert.equal(Object.hasOwn(snap.locations.A, '__proto__'), false);
  assert.equal(Object.hasOwn(snap.locations.A, 'constructor'), false);
  assert.equal(snap.locations.A.polluted, undefined);
  assert.equal(snap.locations.A.pm25, 40);
});

test('snapshot drops a non-ISO period and keeps a valid one', () => {
  const bad = validateSnapshot({ locations: {}, period: { from: 'yesterday', to: '2026-11-14T00:00:00.000Z' } });
  assert.equal('period' in bad, false);
  const period = { from: '2026-11-01T00:00:00.000Z', to: '2026-11-07T00:00:00.000Z' };
  assert.deepEqual(validateSnapshot({ locations: {}, period }).period, period);
});

test('snapshot means drop unknown keys, negatives, over-max values and NaN', () => {
  const snap = validateSnapshot({
    locations: { A: { pm25: 50, bogus: 5, pm10: -1, no2: POLLUTANTS.no2.max + 1, so2: NaN, co: POLLUTANTS.co.max } },
  });
  assert.deepEqual(snap.locations.A, { pm25: 50, co: POLLUTANTS.co.max });
});

test('snapshot issueTotal that is negative or not an integer becomes 0', () => {
  assert.equal(validateSnapshot({ locations: {}, issueTotal: -3 }).issueTotal, 0);
  assert.equal(validateSnapshot({ locations: {}, issueTotal: 2.5 }).issueTotal, 0);
  assert.equal(validateSnapshot({ locations: {}, issueTotal: 4 }).issueTotal, 4);
});

test('snapshot cuts locations to 500 and drops names over 200 chars', () => {
  const locations = {};
  for (let i = 0; i < 600; i += 1) locations[`site${i}`] = { pm25: 10 };
  assert.equal(Object.keys(validateSnapshot({ locations }).locations).length, 500);
  const long = validateSnapshot({ locations: { ['x'.repeat(201)]: { pm25: 1 }, ok: { pm25: 1 } } });
  assert.deepEqual(Object.keys(long.locations), ['ok']);
});

test('snapshot without a locations object is null', () => {
  assert.equal(validateSnapshot(null), null);
  assert.equal(validateSnapshot({ hotspots: [] }), null);
});

test('brief: a complete brief has nothing missing', () => {
  const { missing } = validateBrief(completeBrief(), LANGS);
  assert.deepEqual(missing, []);
});

test('brief: missing summary and a missing language are reported', () => {
  const raw = completeBrief();
  delete raw.summary;
  raw.advisories = [advisory('English')];
  const { missing } = validateBrief(raw, LANGS);
  assert.ok(missing.includes('summary'));
  assert.ok(missing.includes('advisory:Hindi'));
});

test('brief: an advisory without outdoorWorkers counts as missing', () => {
  const raw = completeBrief();
  raw.advisories[1] = advisory('Hindi', { outdoorWorkers: '' });
  assert.deepEqual(validateBrief(raw, LANGS).missing, ['advisory:Hindi']);
  delete raw.advisories[1].outdoorWorkers;
  assert.deepEqual(validateBrief(raw, LANGS).missing, ['advisory:Hindi']);
});

test('brief: list items that are not objects or lack required text are dropped', () => {
  const raw = completeBrief();
  raw.trends = ['plain string', null, { text: '' }, { text: 'kept', evidence: ['F2', 7] }];
  raw.hotspots = [{ location: 'A' }, { location: 'B', why: 'because' }];
  const { brief } = validateBrief(raw, LANGS);
  assert.deepEqual(brief.trends, [{ text: 'kept', evidence: ['F2'] }]);
  assert.equal(brief.hotspots.length, 1);
  assert.equal(brief.hotspots[0].location, 'B');
});

test('brief: action priority outside 1 to 9 becomes 9', () => {
  const raw = completeBrief();
  const base = { action: 'a', why: 'y', timeframe: 't' };
  raw.actions = [{ ...base, priority: 0 }, { ...base, priority: 10 }, { ...base, priority: 2.5 }, { ...base, priority: 3 }];
  const { brief } = validateBrief(raw, LANGS);
  assert.deepEqual(brief.actions.map((a) => a.priority), [9, 9, 9, 3]);
});

test('brief: strings are trimmed and capped at 4000 chars', () => {
  const raw = completeBrief();
  raw.summary = `  ${'x'.repeat(5000)}  `;
  raw.internalNote = '  padded  ';
  const { brief } = validateBrief(raw, LANGS);
  assert.equal(brief.summary.length, 4000);
  assert.equal(brief.internalNote, 'padded');
});

test('brief: non-object input reports every required field missing', () => {
  for (const raw of [null, 'text', 42, ['a']]) {
    const { missing } = validateBrief(raw, LANGS);
    assert.deepEqual(missing, ['summary', 'internalNote', 'actions', 'advisory:English', 'advisory:Hindi']);
  }
});
