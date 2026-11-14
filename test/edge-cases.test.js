// Edge cases: decimal commas, limit cut-offs, row numbers, malformed snapshots, time zones, invented numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTable, parseNumber, parseTime } from '../lib/parse.js';
import { analyze } from '../lib/analyze.js';
import { compareSnapshots } from '../lib/diff.js';
import { verifyEvidence } from '../lib/ai.js';
import { validateRequest } from '../lib/validate.js';
import { validateSnapshot as sanitizeSnapshot } from '../lib/schema.js';

test('decimal comma is a decimal, thousands comma is thousands', () => {
  assert.equal(parseNumber('1,5'), 1.5);
  assert.equal(parseNumber('1,500'), 1500);
  assert.equal(parseNumber('<12'), 12);
  const p = parseTable('Site;CO (mg/m3)\nA;1,5');
  assert.equal(p.readings[0].value, 1.5);
});

test('61 against a limit of 60 is a hotspot (no rounding before the cut-off)', () => {
  const a = analyze(parseTable('Site,PM2.5\nA,60.4\nA,60.4\nA,60.4'));
  assert.equal(a.locations[0].exceeds, true);
  assert.deepEqual(a.hotspots, ['A']);
  // Readings keep 0.1 precision, so 60 and 60.2 average 60.1, above the limit of 60.
  const b = analyze(parseTable('Site,PM2.5\nB,60\nB,60.2'));
  assert.deepEqual(b.hotspots, ['B']);
});

test('row numbers match the original file even with comments and blank lines', () => {
  const p = parseTable('# exported from portal\nSite,PM10\n\nA,120\n# note\nB,80');
  assert.deepEqual(p.readings.map((r) => r.row), [4, 6]);
});

test('malformed previous snapshot never crashes the comparison', () => {
  assert.equal(sanitizeSnapshot({ hotspots: {} }), null);
  const clean = sanitizeSnapshot({ hotspots: {}, locations: { A: { pm25: 'x', pm10: 90 }, B: 7 }, issueTotal: 'many' });
  assert.deepEqual(clean, { locations: { A: { pm10: 90 } }, hotspots: [], issueTotal: 0 });
  const req = validateRequest({ table: 'x', role: 'school', languages: ['English'], previous: { hotspots: {}, locations: { A: {} } } });
  assert.doesNotThrow(() => compareSnapshots({ locations: { A: { pm10: 10 } }, hotspots: [] }, req.previous));
});

test('explicit timezone offsets are kept', () => {
  assert.equal(parseTime('2026-11-14T18:00:00+05:30'), '2026-11-14T12:30:00.000Z');
  assert.equal(parseTime('2026-11-14T12:30:45Z'), '2026-11-14T12:30:45.000Z');
});

test('a claim citing a real fact but stating a made-up number is unverified', () => {
  const facts = [{ id: 'F1', text: 'A: PM2.5 average 90 over 5 valid readings; peak 120 at row 4; 3 above the 60 limit.' }];
  const brief = {
    summary: 'PM2.5 hit 300 at A.', internalNote: '', changeNarrative: '',
    trends: [], dataCaveats: [], advisories: [],
    hotspots: [{ location: 'A', why: 'average 90, peak 120', evidence: ['F1'] }, { location: 'Z', why: 'bad', evidence: ['F1'] }],
    actions: [{ priority: 1, action: 'Sprinkle water', why: 'peak 450', evidence: ['F1'] }],
  };
  const r = verifyEvidence(brief, facts, { locations: ['A'], languages: ['English', 'Hindi'] });
  assert.equal(r.brief.hotspots[0].verified, true);
  assert.equal(r.brief.hotspots[1].verified, false, 'unknown location');
  assert.match(r.brief.hotspots[1].unverifiedReason, /location/);
  assert.equal(r.brief.actions[0].verified, false, 'made-up number');
  assert.match(r.brief.actions[0].unverifiedReason, /450/);
  assert.deepEqual(r.unsupportedNumbers, [300]);
  assert.deepEqual(r.missingLanguages, ['English', 'Hindi']);
});

test('a site with no data is not reported as a resolved hotspot', () => {
  const d = compareSnapshots({ locations: { B: { pm25: 20 } }, hotspots: [], issueTotal: 0 }, { locations: { A: { pm25: 90 }, B: { pm25: 80 } }, hotspots: ['A', 'B'], issueTotal: 0 });
  assert.deepEqual(d.resolvedHotspots, ['B']);
  assert.ok(d.changes.some((c) => c.type === 'missing_location' && c.location === 'A'));
});
