import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTable } from '../lib/parse.js';
import {
  AQ_URL, GEO_URL, airQualityUrl, fetchAirQuality, toTable, searchCity, hourlySeries,
} from '../public/lib/geo.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/open-meteo-pune-2026-11-14.json', import.meta.url), 'utf8'));
const HEADER = 'Site,Date,PM2.5 (ug/m3),PM10 (ug/m3),NO2 (ug/m3),O3 (ug/m3),CO (mg/m3)';

/** Fake fetch that records the URL and returns a canned body. */
function fakeFetch(body, ok = true, status = 200) {
  const calls = [];
  const impl = async (url) => { calls.push(url); return { ok, status, json: async () => body }; };
  return { impl, calls };
}

test('airQualityUrl rounds to 2 decimals and asks for the 5 pollutants', () => {
  const url = airQualityUrl(18.520430, 73.856744);
  assert.ok(url.startsWith(`${AQ_URL}?latitude=18.52&longitude=73.86&`));
  assert.match(url, /hourly=pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide/);
  assert.match(url, /timezone=auto&past_days=1&forecast_days=1$/);
  assert.doesNotMatch(url, /18\.5204|73\.8567/);
});

test('airQualityUrl accepts edge values and numeric strings, never prints -0.00', () => {
  assert.match(airQualityUrl(90, -180), /latitude=90\.00&longitude=-180\.00/);
  assert.match(airQualityUrl('12.345', '77.6'), /latitude=12\.35&longitude=77\.60/);
  assert.match(airQualityUrl(-0.001, 0), /latitude=0\.00&longitude=0\.00/);
});

test('airQualityUrl rejects bad coordinates with a plain message', () => {
  assert.throws(() => airQualityUrl(90.01, 0), /Latitude must be a number between -90 and 90/);
  assert.throws(() => airQualityUrl(0, 180.5), /Longitude must be a number between -180 and 180/);
  for (const bad of [NaN, Infinity, '', null, undefined, 'abc']) {
    assert.throws(() => airQualityUrl(bad, 0), /Latitude/);
  }
});

test('fetchAirQuality calls the rounded URL and returns the JSON', async () => {
  const f = fakeFetch(fixture);
  const json = await fetchAirQuality(18.5204, 73.8567, f.impl);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0], airQualityUrl(18.52, 73.86));
  assert.equal(json.hourly.time.length, 72);
});

test('fetchAirQuality throws a plain error on a non-OK answer', async () => {
  const f = fakeFetch({}, false, 503);
  await assert.rejects(() => fetchAirQuality(18.52, 73.86, f.impl), /status 503/);
});

test('toTable writes the header and one row per hour', () => {
  const lines = toTable(fixture, 'Pune').split('\n');
  assert.equal(lines[0], HEADER);
  assert.equal(lines.length, 73);
  assert.ok(lines[1].startsWith('Pune,2026-11-13 00:00,33.8,'));
  assert.ok(lines[72].startsWith('Pune,2026-11-15 23:00,'));
});

test('toTable converts CO from ug/m3 to mg/m3 with 3 decimals', () => {
  const first = toTable(fixture, 'Pune').split('\n')[1].split(',');
  assert.equal(fixture.hourly.carbon_monoxide[0], 684);
  assert.equal(first[6], '0.684');
  const copy = structuredClone(fixture);
  copy.hourly.carbon_monoxide[0] = 1234.6;
  assert.equal(toTable(copy, 'Pune').split('\n')[1].split(',')[6], '1.235');
});

test('toTable leaves null values as empty cells', () => {
  const copy = structuredClone(fixture);
  copy.hourly.pm2_5[1] = null;
  copy.hourly.carbon_monoxide[1] = null;
  const cells = toTable(copy, 'Pune').split('\n')[2].split(',');
  assert.equal(cells.length, 7);
  assert.equal(cells[2], '');
  assert.equal(cells[6], '');
  assert.notEqual(cells[3], '');
});

test('toTable cuts off hours after now', () => {
  const lines = toTable(fixture, 'Pune', '2026-11-13T05:00').split('\n');
  assert.equal(lines.length, 7);
  assert.ok(lines[6].includes('2026-11-13 05:00'));
  assert.equal(toTable(fixture, 'Pune', '2026-11-14T10:30').split('\n').length, 1 + 35);
  assert.equal(toTable(fixture, 'Pune', '2026-11-12T00:00').split('\n').length, 1);
});

test('toTable cleans the site name and never includes coordinates', () => {
  const text = toTable(fixture, 'Kothrud, Pune\nWard 3\r', '2026-11-14T10:00');
  assert.ok(text.split('\n')[1].startsWith('Kothrud Pune Ward 3,2026-11-13 00:00,'));
  for (const line of text.split('\n').slice(1)) assert.equal(line.split(',').length, 7);
  assert.ok(!text.includes(String(fixture.longitude)));
  assert.ok(!/latitude|longitude/i.test(text));
});

test('toTable throws when the response has no hourly data', () => {
  assert.throws(() => toTable({}, 'Pune'), /no hourly readings/);
  assert.throws(() => toTable(null, 'Pune'), /no hourly readings/);
});

test('toTable output goes through the existing parser with no unit conversion issue', () => {
  const parsed = parseTable(toTable(fixture, 'Pune'));
  assert.equal(parsed.rowCount, 72);
  const pollutants = new Set(parsed.readings.map((r) => r.pollutant));
  assert.ok(pollutants.has('pm25'));
  assert.ok(pollutants.has('co'));
  assert.equal(parsed.issues.filter((i) => i.type === 'converted').length, 0);
  const co = parsed.readings.find((r) => r.pollutant === 'co');
  assert.equal(co.value, 0.684);
});

test('searchCity returns up to 5 trimmed results', async () => {
  const body = { results: [{ name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.51957, longitude: 73.85535, id: 1 }] };
  const f = fakeFetch(body);
  const out = await searchCity('  Pune  ', f.impl);
  assert.deepEqual(out, [{ name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.51957, longitude: 73.85535 }]);
  assert.equal(f.calls[0], `${GEO_URL}?name=Pune&count=5&language=en&format=json`);
});

test('searchCity encodes the name, returns [] with no results, and rejects blanks and errors', async () => {
  const f = fakeFetch({});
  assert.deepEqual(await searchCity('New Delhi', f.impl), []);
  assert.match(f.calls[0], /name=New%20Delhi&/);
  await assert.rejects(() => searchCity('   ', f.impl), /city name/);
  await assert.rejects(() => searchCity('Pune', fakeFetch({}, false, 500).impl), /status 500/);
});

test('hourlySeries returns time, pm25 and pm10 with nulls kept as null', () => {
  const copy = structuredClone(fixture);
  copy.hourly.pm10[2] = null;
  const s = hourlySeries(copy);
  assert.equal(s.length, 72);
  assert.deepEqual(s[0], { time: '2026-11-13T00:00', pm25: 33.8, pm10: fixture.hourly.pm10[0] });
  assert.equal(s[2].pm10, null);
  assert.deepEqual(hourlySeries({}), []);
});
