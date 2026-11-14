// Boundary values for limits, bands, change thresholds and input sizes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTable } from '../lib/parse.js';
import { analyze, band } from '../lib/analyze.js';
import { compareSnapshots } from '../lib/diff.js';
import { validateRequest, MAX_TABLE_CHARS } from '../lib/validate.js';

const day = (i) => `2026-11-${String(i + 1).padStart(2, '0')}`;
const table = (values) => ['Site,Date,PM2.5', ...values.map((v, i) => `A,${day(i)},${v}`)].join('\n');

test('exactly 60 is not an exceedance', () => {
  const a = analyze(parseTable(table([60, 60, 60])));
  assert.deepEqual(a.hotspots, []);
  assert.equal(a.stats[0].exceedances, 0);
  assert.equal(a.stats[0].band, 'Satisfactory');
});

test('60.04 mean: band and hotspot agree (no rounding before comparison)', () => {
  const a = analyze(parseTable(table([60.03, 60.05])));
  assert.deepEqual(a.hotspots, ['A']);
  assert.equal(a.stats[0].band, 'Moderate');
  assert.equal(a.stats[0].exceedances, 2);
});

test('PM2.5 above PM10 is judged on raw values', () => {
  const p = parseTable('Site,PM2.5,PM10\nA,50.04,50.01');
  assert.ok(p.issues.some((i) => i.type === 'inconsistent'));
});

test('band at each PM2.5 breakpoint', () => {
  const cases = [[30, 'Good'], [30.01, 'Satisfactory'], [60, 'Satisfactory'], [90, 'Moderate'], [120, 'Poor'], [250, 'Very Poor'], [250.01, 'Severe']];
  for (const [v, want] of cases) assert.equal(band('pm25', v), want, `pm25 ${v}`);
});

const snap = (pm25) => ({ locations: { A: { pm25 } }, hotspots: [], issueTotal: 0 });

test('9.96% change is not reported, 10.0% is', () => {
  assert.equal(compareSnapshots(snap(109.96), snap(100)).changes.length, 0);
  const d = compareSnapshots(snap(110), snap(100));
  assert.equal(d.changes.length, 1);
  assert.equal(d.changes[0].pct, 10);
});

test('5,000 data rows accepted, 5,001 rejected', () => {
  const rows = (n) => ['Site,PM2.5', ...Array.from({ length: n }, (_, i) => `S${i},${i % 300}`)].join('\n');
  assert.equal(parseTable(rows(5000)).rowCount, 5000);
  assert.throws(() => parseTable(rows(5001)), /Too many rows/);
});

test('table size limit is exact', () => {
  const base = { role: 'school', languages: ['English'] };
  assert.doesNotThrow(() => validateRequest({ ...base, table: 'x'.repeat(MAX_TABLE_CHARS) }));
  assert.throws(() => validateRequest({ ...base, table: 'x'.repeat(MAX_TABLE_CHARS + 1) }), /too large/);
});

test('4 languages accepted, 5 rejected', () => {
  const base = { table: 'x', role: 'school' };
  assert.equal(validateRequest({ ...base, languages: ['English', 'Hindi', 'Tamil', 'Urdu'] }).languages.length, 4);
  assert.throws(() => validateRequest({ ...base, languages: ['English', 'Hindi', 'Tamil', 'Urdu', 'Bengali'] }), /up to 4/);
});
