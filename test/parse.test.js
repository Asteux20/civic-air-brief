import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTable, classifyHeader, detectUnit, parseTime, toCanonical, detectDelimiter, splitLine } from '../lib/parse.js';

const sample = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');

test('classifies messy headers', () => {
  assert.equal(classifyHeader('PM2.5 (ug/m3)'), 'pm25');
  assert.equal(classifyHeader('pm_2_5'), 'pm25');
  assert.equal(classifyHeader('PM10'), 'pm10');
  assert.equal(classifyHeader('NO2 (ppb)'), 'no2');
  assert.equal(classifyHeader('CO (ppm)'), 'co');
  assert.equal(classifyHeader('Station Name'), 'location');
  assert.equal(classifyHeader('Ward'), 'location');
  assert.equal(classifyHeader('Date'), 'time');
  assert.equal(classifyHeader('Remarks'), null);
});

test('detects units', () => {
  assert.equal(detectUnit('PM2.5 (µg/m³)'), 'ug/m3');
  assert.equal(detectUnit('0.07 mg/m3'), 'mg/m3');
  assert.equal(detectUnit('NO2 ppb'), 'ppb');
  assert.equal(detectUnit('CO ppm'), 'ppm');
  assert.equal(detectUnit('PM10'), null);
});

test('parses day-first Indian dates and ISO', () => {
  assert.equal(parseTime('14/11/2026'), '2026-11-14T00:00:00.000Z');
  assert.equal(parseTime('14-11-2026 08:30'), '2026-11-14T08:30:00.000Z');
  assert.equal(parseTime('2026-11-14'), '2026-11-14T00:00:00.000Z');
  assert.equal(parseTime('31/13/2026'), null);
  assert.equal(parseTime(''), null);
});

test('converts units to canonical', () => {
  assert.equal(toCanonical('pm25', 0.072, 'mg/m3').value, 72);
  assert.ok(Math.abs(toCanonical('no2', 10, 'ppb').value - 18.8) < 1e-9);
  assert.ok(Math.abs(toCanonical('co', 1, 'ppm').value - 1.145) < 1e-9);
  assert.equal(toCanonical('pm10', 50, null).converted, false);
});

test('detects delimiters and respects quotes', () => {
  assert.equal(detectDelimiter(['a;b;c', '1;2;3']), ';');
  assert.equal(detectDelimiter(['a\tb', '1\t2']), '\t');
  assert.deepEqual(splitLine('"Ward 1, East",5', ','), ['Ward 1, East', '5']);
});

test('flags every kind of messy reading in the sample', () => {
  const p = parseTable(sample);
  const types = new Set(p.issues.map((i) => i.type));
  for (const t of ['missing', 'negative', 'implausible', 'duplicate', 'converted', 'flatline', 'inconsistent']) {
    assert.ok(types.has(t), `expected issue type ${t}`);
  }
  assert.equal(p.rowCount, 21);
  const implausible = p.issues.find((i) => i.type === 'implausible');
  assert.equal(implausible.row, 18);
  assert.equal(implausible.location, 'Market Yard Junction');
});

test('every reading keeps its source row', () => {
  const p = parseTable(sample);
  assert.ok(p.readings.every((r) => Number.isInteger(r.row) && r.row >= 2));
});

test('rejects tables without pollutant columns', () => {
  assert.throws(() => parseTable('name,colour\na,b'), /No pollutant columns/);
  assert.throws(() => parseTable(''), /empty/);
  assert.throws(() => parseTable('PM2.5'), /header row/);
});

test('handles space-aligned tables', () => {
  const p = parseTable('Site      PM10    PM2.5\nNorth     120     70\nSouth     80      30');
  assert.equal(p.readings.length, 4);
  assert.equal(p.readings[0].location, 'North');
});
