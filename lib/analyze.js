// @ts-check
/**
 * Deterministic analysis of parsed readings.
 *
 * Produces numbered facts (F1, F2, ...) that each point back to source rows.
 * The AI layer may only cite these fact ids, which is how every finding stays
 * traceable and how unsupported claims get caught. Every comparison uses raw
 * values; numbers are rounded only when written into fact text.
 */
import { POLLUTANTS, fmt } from './parse.js';

/** India NAAQS limits per pollutant: 24-hour, except CO and O3 which are 8-hour. Units match POLLUTANTS. */
export const STANDARDS = { pm25: 60, pm10: 100, no2: 80, o3: 100, so2: 80, co: 2, aqi: 100 };

/** CPCB AQI band names, best to worst; the band breakpoints index into this list. */
export const BANDS = ['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe'];
const BREAKPOINTS = {
  pm25: [30, 60, 90, 120, 250],
  pm10: [50, 100, 250, 350, 430],
  no2: [40, 80, 180, 280, 400],
  o3: [50, 100, 168, 208, 748],
  so2: [40, 80, 380, 800, 1600],
  co: [1, 2, 10, 17, 34],
  aqi: [50, 100, 200, 300, 400],
};
const SERIES_POINTS = 60;

/**
 * CPCB band for a raw pollutant concentration.
 * @param {string} pollutant key from POLLUTANTS
 * @param {number} value raw concentration in the canonical unit
 * @returns {string} band name, or 'Unknown' for an unknown pollutant
 */
export function band(pollutant, value) {
  const bp = BREAKPOINTS[pollutant];
  if (!bp) return 'Unknown';
  const i = bp.findIndex((limit) => value <= limit);
  return BANDS[i === -1 ? 5 : i];
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Trend from time-ordered values: compares the mean of the first third with the last third.
 * @param {{value: number, time: string|null, row: number}[]} points
 * @returns {import('./types.js').Trend | null} null under 3 dated points
 */
export function trendOf(points) {
  const timed = points.filter((p) => p.time).sort((a, b) => a.time.localeCompare(b.time));
  if (timed.length < 3) return null;
  const k = Math.max(1, Math.floor(timed.length / 3));
  const from = mean(timed.slice(0, k).map((p) => p.value));
  const to = mean(timed.slice(-k).map((p) => p.value));
  const pct = from === 0 ? 0 : ((to - from) / from) * 100;
  const direction = pct > 10 ? 'rising' : pct < -10 ? 'falling' : 'stable';
  return { direction, pct, from, to, rows: [...timed.slice(0, k), ...timed.slice(-k)].map((p) => p.row) };
}

/** Group trusted (non-suspect) readings by location and pollutant. */
function groupReadings(readings) {
  const groups = new Map();
  for (const r of readings) {
    if (r.suspect) continue;
    const k = `${r.location}::${r.pollutant}`;
    if (!groups.has(k)) groups.set(k, { location: r.location, pollutant: r.pollutant, points: [] });
    groups.get(k).points.push(r);
  }
  return [...groups.values()];
}

/** Fact text for one location and pollutant. */
function statText(s) {
  const { label, unit } = POLLUTANTS[s.pollutant];
  return `${s.location}: ${label} average ${fmt(s.mean)} ${unit} over ${s.n} valid readings (${s.band}); peak ${fmt(s.max)} at row ${s.maxRow}; ${s.exceedances} above the ${STANDARDS[s.pollutant]} limit.`;
}

/** Fact text for a trend. */
function trendText(s) {
  const t = s.trend;
  return `${s.location}: ${POLLUTANTS[s.pollutant].label} is ${t.direction} (${t.pct > 0 ? '+' : ''}${fmt(t.pct)}%, ${fmt(t.from)} to ${fmt(t.to)}).`;
}

/**
 * Compute one stat from a group and register its facts.
 * @param {{location: string, pollutant: string, points: object[]}} group
 * @param {(fact: {kind: string, text: string, rows: number[]}) => string} addFact returns the new fact id
 * @returns {import('./types.js').Stat}
 */
function buildStat({ location, pollutant, points }, addFact) {
  const standard = STANDARDS[pollutant];
  const maxPoint = points.reduce((a, b) => (b.value > a.value ? b : a));
  const exceeding = points.filter((p) => p.value > standard);
  const avg = mean(points.map((p) => p.value));
  const stat = {
    location, pollutant, n: points.length, mean: avg, max: maxPoint.value, maxRow: maxPoint.row, maxTime: maxPoint.time,
    band: band(pollutant, avg), ratio: avg / standard, exceedances: exceeding.length, trend: trendOf(points),
    series: points.filter((p) => p.time).sort((a, b) => a.time.localeCompare(b.time)).slice(-SERIES_POINTS).map((p) => p.value),
  };
  stat.factId = addFact({ kind: 'stat', text: statText(stat), rows: [maxPoint.row, ...exceeding.map((p) => p.row), ...points.slice(0, 3).map((p) => p.row)] });
  if (stat.trend) stat.trendFactId = addFact({ kind: 'trend', text: trendText(stat), rows: stat.trend.rows });
  return stat;
}

/** Count flagged readings per location (unit conversions are not problems). */
function flaggedByLocation(issues) {
  const counts = {};
  for (const is of issues) if (is.type !== 'converted' && is.location) counts[is.location] = (counts[is.location] || 0) + 1;
  return counts;
}

/**
 * One summary per location: worst pollutant by raw ratio to its limit, and data confidence.
 * @param {string} name
 * @param {import('./types.js').Stat[]} list stats for this location
 * @param {number} flagged flagged readings at this location
 * @returns {import('./types.js').LocationSummary}
 */
function summariseLocation(name, list, flagged) {
  const worst = list.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const valid = list.reduce((a, s) => a + s.n, 0);
  const share = flagged / (valid + flagged || 1);
  return {
    name,
    worstPollutant: worst.pollutant,
    worstRatio: worst.ratio,
    exceeds: worst.ratio > 1,
    worstBand: worst.band,
    worstFactId: worst.factId,
    factIds: list.flatMap((s) => [s.factId, s.trendFactId].filter(Boolean)),
    validReadings: valid,
    flaggedReadings: flagged,
    confidence: valid < 3 || share > 0.3 ? 'low' : share > 0.1 ? 'medium' : 'high',
    means: Object.fromEntries(list.map((s) => [s.pollutant, s.mean])),
    series: worst.series,
  };
}

/** Locations ranked worst first. */
function rankLocations(stats, issues) {
  const flagged = flaggedByLocation(issues);
  const byLocation = Map.groupBy(stats, (s) => s.location);
  return [...byLocation.entries()]
    .map(([name, list]) => summariseLocation(name, list, flagged[name] || 0))
    .sort((a, b) => b.worstRatio - a.worstRatio);
}

/** Register one quality fact per issue type, plus one for unit conversions. */
function qualityFacts(issues, addFact) {
  const byType = Map.groupBy(issues, (i) => i.type);
  for (const [type, list] of byType) {
    const rows = list.map((i) => i.row);
    const text = type === 'converted'
      ? `${list.length} reading(s) were converted to standard units.`
      : `${list.length} data issue(s) of type "${type}" (rows ${rows.slice(0, 8).join(', ')}${rows.length > 8 ? ', ...' : ''}).`;
    addFact({ kind: 'quality', text, rows });
  }
}

/**
 * Fact list with sequential ids and at most 30 sorted source rows per fact.
 * @returns {{facts: import('./types.js').Fact[], add: (fact: {kind: string, text: string, rows: number[]}) => string}}
 */
function createFacts() {
  const facts = [];
  const add = (fact) => {
    const id = `F${facts.length + 1}`;
    facts.push({ id, ...fact, rows: [...new Set(fact.rows)].sort((a, b) => a - b).slice(0, 30) });
    return id;
  };
  return { facts, add };
}

/**
 * Analyse parsed output into stats, ranked locations, hotspots and numbered facts.
 * @param {{readings: import('./types.js').Reading[], issues: import('./types.js').Issue[], rowCount: number}} parsed output of parseTable
 * @returns {import('./types.js').Analysis}
 */
export function analyze({ readings, issues, rowCount }) {
  const { facts, add } = createFacts();
  const stats = groupReadings(readings).map((g) => buildStat(g, add));
  const locations = rankLocations(stats, issues);
  const ordered = [...issues].sort((a, b) => (a.type === 'converted') - (b.type === 'converted'));
  qualityFacts(ordered, add);
  const issueSummary = Object.fromEntries([...Map.groupBy(issues, (i) => i.type)].map(([t, l]) => [t, l.length]));
  const times = readings.map((r) => r.time).filter(Boolean).sort();
  return {
    rowCount,
    validReadings: readings.filter((r) => !r.suspect).length,
    issueSummary,
    period: times.length ? { from: times[0], to: times[times.length - 1] } : null,
    stats,
    locations,
    hotspots: locations.filter((l) => l.exceeds).map((l) => l.name),
    facts,
  };
}

/**
 * Compact snapshot the client keeps so the next brief can be compared. Means stay raw.
 * @param {import('./types.js').Analysis} analysis
 * @returns {import('./types.js').Snapshot}
 */
export function snapshot(analysis) {
  return {
    hotspots: analysis.hotspots,
    issueTotal: Object.entries(analysis.issueSummary).filter(([t]) => t !== 'converted').reduce((a, [, n]) => a + n, 0),
    locations: Object.fromEntries(analysis.locations.map((l) => [l.name, l.means])),
    period: analysis.period,
  };
}
