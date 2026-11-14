import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hourlySeries } from '../public/lib/geo.js';
import {
  GROUPS, ACTIVITIES, inhaledDose, doseRatio, pm25Band, bestWindow, advice,
} from '../public/lib/exposure.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/open-meteo-pune-2026-11-14.json', import.meta.url), 'utf8'));
const series = hourlySeries(fixture);

test('breathing rates match EFH 2011 Table 6-2 mean values', () => {
  assert.deepEqual(ACTIVITIES, ['sitting', 'walking', 'play', 'sport']);
  const rates = (g) => [g.sedentary, g.light, g.moderate, g.high];
  assert.deepEqual(rates(GROUPS.child), [0.0048, 0.011, 0.022, 0.042]);
  assert.deepEqual(rates(GROUPS.adult), [0.0048, 0.013, 0.028, 0.052]);
  assert.deepEqual(rates(GROUPS.older), [0.005, 0.012, 0.025, 0.047]);
});

test('inhaledDose is concentration x rate x minutes, 1 decimal', () => {
  assert.equal(inhaledDose(40, 'adult', 'walking', 60), 31.2);
  assert.equal(inhaledDose(50, 'child', 'play', 30), 33);
  assert.equal(inhaledDose(100, 'older', 'sitting', 120), 60);
  assert.equal(inhaledDose(38, 'child', 'walking', 60), 25.1);
  assert.equal(inhaledDose(100, 'adult', 'sport', 720), 3744);
  assert.equal(inhaledDose(0, 'adult', 'sport', 60), 0);
  assert.equal(inhaledDose(80, 'adult', 'sitting', 0), 0);
});

test('inhaledDose rejects unknown or unsafe input', () => {
  assert.throws(() => inhaledDose(40, 'teen', 'walking', 60), /Unknown age group/);
  assert.throws(() => inhaledDose(40, 'adult', 'swimming', 60), /Unknown activity/);
  assert.throws(() => inhaledDose(40, 'toString', 'walking', 60), /Unknown age group/);
  assert.throws(() => inhaledDose(-1, 'adult', 'walking', 60), /Concentration/);
  assert.throws(() => inhaledDose(NaN, 'adult', 'walking', 60), /Concentration/);
  assert.throws(() => inhaledDose(40, 'adult', 'walking', -5), /Minutes/);
  assert.throws(() => inhaledDose(40, 'adult', 'walking', Infinity), /Minutes/);
  assert.throws(() => inhaledDose(40, 'adult', 'walking', 721), /more than 720/);
  assert.throws(() => inhaledDose('40', 'adult', 'walking', 60), /Concentration/);
});

test('doseRatio is relative to an adult sitting', () => {
  assert.equal(doseRatio('adult', 'sitting', 60), 1);
  assert.equal(doseRatio('child', 'play', 60), 4.6);
  assert.equal(doseRatio('child', 'walking', 60), 2.3);
  assert.equal(doseRatio('adult', 'sport', 30), 10.8);
  assert.equal(doseRatio('older', 'walking', 30), 2.5);
  assert.throws(() => doseRatio('adult', 'nap', 30), /Unknown activity/);
  assert.throws(() => doseRatio('adult', 'sitting', 900), /more than 720/);
});

test('pm25Band uses India CPCB breakpoints at the edges', () => {
  assert.deepEqual(pm25Band(0), { band: 'Good', index: 0 });
  assert.deepEqual(pm25Band(30), { band: 'Good', index: 0 });
  assert.deepEqual(pm25Band(30.1), { band: 'Satisfactory', index: 1 });
  assert.deepEqual(pm25Band(60), { band: 'Satisfactory', index: 1 });
  assert.deepEqual(pm25Band(60.1), { band: 'Moderate', index: 2 });
  assert.deepEqual(pm25Band(90), { band: 'Moderate', index: 2 });
  assert.deepEqual(pm25Band(120), { band: 'Poor', index: 3 });
  assert.deepEqual(pm25Band(121), { band: 'Very Poor', index: 4 });
  assert.deepEqual(pm25Band(250), { band: 'Very Poor', index: 4 });
  assert.deepEqual(pm25Band(250.1), { band: 'Severe', index: 5 });
  assert.throws(() => pm25Band(-1), /PM2.5/);
  assert.throws(() => pm25Band(NaN), /PM2.5/);
});

test('bestWindow on the fixture picks 15:00 to 17:00 on 14 Nov (hand-checked 25.4 + 25.1)', () => {
  const w = bestWindow(series, { hours: 2, from: '2026-11-14T06:00', to: '2026-11-14T20:00' });
  assert.deepEqual(w, { start: '2026-11-14T15:00', end: '2026-11-14T17:00', meanPm25: 25.3 });
});

test('bestWindow respects from and to, and the hours size', () => {
  const morning = bestWindow(series, { hours: 2, from: '2026-11-14T06:00', to: '2026-11-14T10:00' });
  assert.equal(morning.start, '2026-11-14T09:00');
  assert.equal(morning.end, '2026-11-14T11:00');
  const three = bestWindow(series, { hours: 3, from: '2026-11-14T06:00', to: '2026-11-14T20:00' });
  assert.equal(three.start, '2026-11-14T14:00');
  assert.equal(bestWindow(series, { hours: 1, from: '2026-11-14T06:00', to: '2026-11-14T20:00' }).start, '2026-11-14T16:00');
  assert.throws(() => bestWindow(series, { hours: 0 }), /Hours/);
});

test('bestWindow skips windows with a null and returns null when nothing fits', () => {
  const holes = series.map((s) => (s.time === '2026-11-14T15:00' ? { ...s, pm25: null } : s));
  const w = bestWindow(holes, { hours: 2, from: '2026-11-14T06:00', to: '2026-11-14T20:00' });
  assert.equal(w.start, '2026-11-14T16:00');
  assert.equal(w.meanPm25, 26);
  assert.equal(bestWindow(series, { hours: 2, from: '2026-11-20T00:00' }), null);
  assert.equal(bestWindow(series, { hours: 2, from: '2026-11-14T06:00', to: '2026-11-14T06:00' }), null);
  assert.equal(bestWindow([], {}), null);
  const allNull = series.map((s) => ({ ...s, pm25: null }));
  assert.equal(bestWindow(allNull, {}), null);
});

test('bestWindow breaks ties by the earliest start and refuses runs with a time gap', () => {
  const flat = ['2026-11-14T01:00', '2026-11-14T02:00', '2026-11-14T03:00'].map((time) => ({ time, pm25: 20, pm10: null }));
  assert.equal(bestWindow(flat, { hours: 2 }).start, '2026-11-14T01:00');
  const gap = [{ time: '2026-11-14T01:00', pm25: 10, pm10: null }, { time: '2026-11-14T03:00', pm25: 10, pm10: null }];
  assert.equal(bestWindow(gap, { hours: 2 }), null);
});

test('advice is deterministic and scales with the band', () => {
  assert.deepEqual(advice(0, 'adult'), { watchFor: [], reduce: [] });
  const poor = advice(3, 'child');
  assert.ok(poor.watchFor.includes('Chest tightness'));
  assert.ok(poor.watchFor.some((s) => s.startsWith('A child')));
  assert.ok(poor.reduce.includes('Avoid busy roads'));
  assert.deepEqual(advice(3, 'child'), poor);
  const severe = advice(5, 'older');
  assert.ok(severe.reduce.some((s) => s.includes('N95')));
  assert.ok(severe.watchFor.some((s) => s.startsWith('Breathlessness')));
  assert.ok(advice(4, 'adult').reduce.some((s) => s.includes('N95')));
  assert.throws(() => advice(6, 'adult'), /Band index/);
  assert.throws(() => advice(1.5, 'adult'), /Band index/);
  assert.throws(() => advice(2, 'robot'), /Unknown age group/);
});

test('exposure and geo modules contain no em dashes or node imports', () => {
  for (const f of ['geo.js', 'exposure.js']) {
    const src = readFileSync(new URL(`../public/lib/${f}`, import.meta.url), 'utf8');
    assert.ok(!src.includes(String.fromCharCode(0x2014)));
    assert.ok(!/from 'node:|process\./.test(src));
  }
});
