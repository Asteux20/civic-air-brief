// Covers deriveAlerts: severe, rising, change and low confidence alerts, role next steps, ordering and the cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTable } from '../lib/parse.js';
import { analyze, snapshot } from '../lib/analyze.js';
import { compareSnapshots } from '../lib/diff.js';
import { deriveAlerts, NEXT_STEPS } from '../lib/alerts.js';

const sample = readFileSync(new URL('../public/sample-messy.csv', import.meta.url), 'utf8');
const DEPOT = 'Ward 12 Bus Depot';

/** Run the real pipeline on a table and derive alerts for a role. */
function run(table, role, previous = null) {
  const analysis = analyze(parseTable(table));
  const comparison = compareSnapshots(snapshot(analysis), previous);
  return { analysis, comparison, alerts: deriveAlerts(analysis, comparison, role) };
}

test('severe alert for the depot is urgent, cites real facts and gives the role next step', () => {
  const { analysis, alerts } = run(sample, 'ward_officer');
  const severe = alerts.find((a) => a.kind === 'severe' && a.location === DEPOT);
  assert.ok(severe);
  assert.equal(severe.severity, 'urgent');
  assert.ok(severe.factIds.length > 0);
  const known = new Set(analysis.facts.map((f) => f.id));
  assert.ok(severe.factIds.every((id) => known.has(id)));
  assert.equal(severe.nextStep, NEXT_STEPS.severe.ward_officer);
});

test('rising alert at the depot cites the trend fact', () => {
  const { analysis, alerts } = run(sample, 'ward_officer');
  const rising = alerts.find((a) => a.kind === 'rising' && a.location === DEPOT);
  assert.ok(rising);
  const kinds = rising.factIds.map((id) => analysis.facts.find((f) => f.id === id)?.kind);
  assert.ok(kinds.includes('trend'));
});

test('next step differs between ward officer, housing society and school', () => {
  const steps = ['ward_officer', 'housing_society', 'school'].map((role) => {
    const { alerts } = run(sample, role);
    return alerts.find((a) => a.kind === 'severe' && a.location === DEPOT).nextStep;
  });
  assert.equal(new Set(steps).size, 3);
});

/** Previous snapshot where the depot read 100 and nothing was a hotspot. */
const previousFor = (period) => ({ locations: { [DEPOT]: { pm25: 100 } }, hotspots: [], issueTotal: 0, period });
const PERIOD = { from: '2026-11-01T00:00:00.000Z', to: '2026-11-07T00:00:00.000Z' };

function assertChangeAlerts(table) {
  const analysis = analyze(parseTable(table));
  const { alerts } = run(table, 'ward_officer', previousFor(PERIOD));
  const worsened = alerts.find((a) => a.kind === 'worsened' && a.location === DEPOT);
  assert.ok(worsened);
  assert.equal(worsened.change.before, 100);
  assert.equal(worsened.change.after, snapshot(analysis).locations[DEPOT].pm25);
  assert.ok(worsened.change.pct >= 25);
  assert.deepEqual(worsened.change.periods.after, analysis.period);
  assert.deepEqual(worsened.change.periods.before, PERIOD);
  assert.ok(alerts.some((a) => a.kind === 'new_hotspot'));
}

test('worsened and new hotspot alerts carry the before and after record with both periods', () => {
  // Depot rows only (header plus 5 lines), so the 8 alert cap does not apply.
  assertChangeAlerts(sample.split('\n').slice(0, 6).join('\n'));
});

// Known bug: on the full sample the 8 alert cap is filled by 2 severe and 6 rising alerts, so change alerts never show.
test('worsened and new hotspot alerts survive the cap on the full sample', () => {
  assertChangeAlerts(sample);
});

test('clean data gives no alerts', () => {
  const { alerts } = run('Site,Date,PM2.5\nA,2026-11-01,20\nA,2026-11-02,22\nA,2026-11-03,21', 'school');
  assert.deepEqual(alerts, []);
});

test('a site with more than 30 percent flagged cells gets a notice for low confidence', () => {
  const table = 'Site,Date,PM2.5\nB,2026-11-01,20\nB,2026-11-02,NA\nB,2026-11-03,NA\nB,2026-11-04,21\nB,2026-11-05,NA';
  const { alerts } = run(table, 'school');
  const low = alerts.find((a) => a.kind === 'low_confidence');
  assert.ok(low);
  assert.equal(low.severity, 'notice');
  assert.equal(low.location, 'B');
});

test('alerts are sorted urgent, warning, notice', () => {
  const rows = ['Site,Date,PM2.5', 'S,2026-11-01,200', 'S,2026-11-02,210', 'S,2026-11-03,220'];
  rows.push('L,2026-11-01,20', 'L,2026-11-02,NA', 'L,2026-11-03,NA', 'L,2026-11-04,21');
  const { alerts } = run(rows.join('\n'), 'school');
  const rank = { urgent: 0, warning: 1, notice: 2 };
  assert.ok(alerts.some((a) => a.severity === 'urgent'));
  assert.ok(alerts.some((a) => a.severity === 'notice'));
  assert.deepEqual(alerts.map((a) => rank[a.severity]), alerts.map((a) => rank[a.severity]).sort((a, b) => a - b));
});

test('alerts are capped at 8', () => {
  const rows = ['Site,Date,PM2.5'];
  for (let i = 0; i < 12; i += 1) rows.push(`Site ${i},2026-11-01,200`, `Site ${i},2026-11-02,210`, `Site ${i},2026-11-03,220`);
  const { alerts } = run(rows.join('\n'), 'ward_officer');
  assert.equal(alerts.length, 8);
});

test('alert ids are deterministic for the same input', () => {
  const analysis = analyze(parseTable(sample));
  const comparison = compareSnapshots(snapshot(analysis), null);
  const first = deriveAlerts(analysis, comparison, 'school').map((a) => a.id);
  const second = deriveAlerts(analysis, comparison, 'school').map((a) => a.id);
  assert.deepEqual(first, second);
});
