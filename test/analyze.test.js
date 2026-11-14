import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTable } from '../lib/parse.js';
import { analyze, band, trendOf, snapshot } from '../lib/analyze.js';
import { compareSnapshots } from '../lib/diff.js';

const sample = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');

test('CPCB bands', () => {
  assert.equal(band('pm25', 25), 'Good');
  assert.equal(band('pm25', 100), 'Poor');
  assert.equal(band('pm25', 300), 'Severe');
  assert.equal(band('pm10', 100), 'Satisfactory');
});

test('trend detection', () => {
  const pts = [10, 12, 20, 30, 40, 50].map((v, i) => ({ value: v, row: i + 2, time: `2026-11-0${i + 1}` }));
  assert.equal(trendOf(pts).direction, 'rising');
  assert.equal(trendOf(pts.slice(0, 2)), null);
});

test('bus depot is the top hotspot and is rising', () => {
  const a = analyze(parseTable(sample));
  assert.equal(a.locations[0].name, 'Ward 12 Bus Depot');
  assert.ok(a.hotspots.includes('Ward 12 Bus Depot'));
  const pm25 = a.stats.find((s) => s.location === 'Ward 12 Bus Depot' && s.pollutant === 'pm25');
  assert.equal(pm25.trend.direction, 'rising');
  assert.equal(pm25.n, 4);
});

test('suspect readings are excluded from stats', () => {
  const a = analyze(parseTable(sample));
  const market = a.stats.find((s) => s.location === 'Market Yard Junction' && s.pollutant === 'pm25');
  assert.ok(market.max < 1000, 'implausible 9999 must not reach stats');
  const school = a.stats.find((s) => s.location === 'Govt Primary School Kothrud' && s.pollutant === 'pm25');
  assert.equal(school.n, 1, 'four flatlined school PM2.5 rows are excluded, only the converted row stays');
  assert.equal(school.mean, 72, '0.072 mg/m3 converts to 72 µg/m³');
});

test('facts have ids and rows', () => {
  const a = analyze(parseTable(sample));
  assert.ok(a.facts.length > 5);
  a.facts.forEach((f, i) => {
    assert.equal(f.id, `F${i + 1}`);
    assert.ok(f.rows.length > 0);
  });
});

test('compare snapshots reports change', () => {
  const cur = snapshot(analyze(parseTable(sample)));
  const prev = { hotspots: ['Sunrise Housing Society'], issueTotal: 2, locations: { 'Ward 12 Bus Depot': { pm25: 100 }, 'Old Site': { pm10: 50 } } };
  const d = compareSnapshots(cur, prev);
  assert.equal(d.hasPrevious, true);
  assert.ok(d.newHotspots.includes('Ward 12 Bus Depot'));
  assert.ok(d.changes.some((c) => c.type === 'worse' && c.location === 'Ward 12 Bus Depot'));
  assert.ok(d.changes.some((c) => c.type === 'missing_location' && c.location === 'Old Site'));
  assert.ok(d.issueDelta > 0);
});

test('compare with no previous', () => {
  assert.equal(compareSnapshots({ locations: {} }, null).hasPrevious, false);
});
