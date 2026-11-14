/**
 * Deterministic analysis of parsed readings.
 *
 * Produces numbered facts (F1, F2, ...) that each point back to source rows.
 * The AI layer may only cite these fact ids, which is how every finding stays
 * traceable and how unsupported claims get caught.
 */
import { POLLUTANTS } from './parse.js';

// India NAAQS 24-hour limits (CO and O3 are 8-hour). Units match POLLUTANTS.
export const STANDARDS = { pm25: 60, pm10: 100, no2: 80, o3: 100, so2: 80, co: 2, aqi: 100 };

// CPCB AQI sub-index breakpoints (upper bound of each band).
const BANDS = ['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe'];
const BREAKPOINTS = {
  pm25: [30, 60, 90, 120, 250],
  pm10: [50, 100, 250, 350, 430],
  no2: [40, 80, 180, 280, 400],
  o3: [50, 100, 168, 208, 748],
  so2: [40, 80, 380, 800, 1600],
  co: [1, 2, 10, 17, 34],
  aqi: [50, 100, 200, 300, 400],
};

/** CPCB band for a pollutant concentration. */
export function band(pollutant, value) {
  const bp = BREAKPOINTS[pollutant];
  if (!bp) return 'Unknown';
  const i = bp.findIndex((limit) => value <= limit);
  return BANDS[i === -1 ? 5 : i];
}

const round = (n) => Math.round(n * 10) / 10;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Trend from time-ordered values: compares first third with last third. */
export function trendOf(points) {
  const timed = points.filter((p) => p.time).sort((a, b) => a.time.localeCompare(b.time));
  if (timed.length < 3) return null;
  const k = Math.max(1, Math.floor(timed.length / 3));
  const first = mean(timed.slice(0, k).map((p) => p.value));
  const last = mean(timed.slice(-k).map((p) => p.value));
  const pct = first === 0 ? 0 : ((last - first) / first) * 100;
  const direction = pct > 10 ? 'rising' : pct < -10 ? 'falling' : 'stable';
  return {
    direction,
    pct: round(pct),
    from: round(first),
    to: round(last),
    rows: [...timed.slice(0, k), ...timed.slice(-k)].map((p) => p.row),
  };
}

/**
 * Analyse parsed output.
 * @param {{readings: object[], issues: object[], rowCount: number}} parsed
 */
export function analyze(parsed) {
  const { readings, issues, rowCount } = parsed;
  const facts = [];
  const addFact = (fact) => {
    const id = `F${facts.length + 1}`;
    facts.push({ id, ...fact, rows: [...new Set(fact.rows)].sort((a, b) => a - b).slice(0, 30) });
    return id;
  };

  const groups = new Map();
  for (const r of readings) {
    if (r.suspect) continue;
    const k = `${r.location}::${r.pollutant}`;
    if (!groups.has(k)) groups.set(k, { location: r.location, pollutant: r.pollutant, points: [] });
    groups.get(k).points.push(r);
  }

  const issueCountByLocation = {};
  for (const is of issues) {
    if (is.type === 'converted' || !is.location) continue;
    issueCountByLocation[is.location] = (issueCountByLocation[is.location] || 0) + 1;
  }

  const stats = [];
  for (const g of groups.values()) {
    const values = g.points.map((p) => p.value);
    const rawMean = mean(values);
    const avg = round(rawMean);
    const maxPoint = g.points.reduce((a, b) => (b.value > a.value ? b : a));
    const standard = STANDARDS[g.pollutant];
    const exceedances = g.points.filter((p) => p.value > standard);
    const stat = {
      location: g.location,
      pollutant: g.pollutant,
      n: values.length,
      mean: avg,
      max: maxPoint.value,
      maxRow: maxPoint.row,
      maxTime: maxPoint.time,
      band: band(g.pollutant, avg),
      ratio: round(rawMean / standard),
      rawRatio: rawMean / standard, // unrounded, used for ranking and hotspot cut-off
      exceedances: exceedances.length,
      trend: trendOf(g.points),
    };
    stat.factId = addFact({
      kind: 'stat',
      text: `${g.location}: ${POLLUTANTS[g.pollutant].label} average ${avg} ${POLLUTANTS[g.pollutant].unit} over ${values.length} valid readings (${stat.band}); peak ${maxPoint.value} at row ${maxPoint.row}; ${exceedances.length} above the ${standard} limit.`,
      rows: [maxPoint.row, ...exceedances.map((p) => p.row), ...g.points.slice(0, 3).map((p) => p.row)],
    });
    if (stat.trend) {
      stat.trendFactId = addFact({
        kind: 'trend',
        text: `${g.location}: ${POLLUTANTS[g.pollutant].label} is ${stat.trend.direction} (${stat.trend.pct > 0 ? '+' : ''}${stat.trend.pct}%, ${stat.trend.from} to ${stat.trend.to}).`,
        rows: stat.trend.rows,
      });
    }
    stats.push(stat);
  }

  const byLocation = new Map();
  for (const s of stats) {
    if (!byLocation.has(s.location)) byLocation.set(s.location, []);
    byLocation.get(s.location).push(s);
  }

  const locations = [...byLocation.entries()].map(([name, list]) => {
    const worst = list.reduce((a, b) => (b.rawRatio > a.rawRatio ? b : a));
    const valid = list.reduce((a, s) => a + s.n, 0);
    const problems = issueCountByLocation[name] || 0;
    const qualityShare = valid + problems === 0 ? 0 : problems / (valid + problems);
    return {
      name,
      worstPollutant: worst.pollutant,
      worstRatio: worst.ratio,
      exceeds: worst.rawRatio > 1,
      rawRatio: worst.rawRatio,
      worstBand: worst.band,
      worstFactId: worst.factId,
      validReadings: valid,
      flaggedReadings: problems,
      confidence: qualityShare > 0.3 ? 'low' : qualityShare > 0.1 ? 'medium' : 'high',
      means: Object.fromEntries(list.map((s) => [s.pollutant, s.mean])),
    };
  });
  locations.sort((a, b) => b.rawRatio - a.rawRatio);

  const hotspots = locations.filter((l) => l.exceeds).map((l) => l.name);

  const issueSummary = {};
  for (const is of issues) issueSummary[is.type] = (issueSummary[is.type] || 0) + 1;
  const issueGroups = Object.entries(issueSummary).filter(([type]) => type !== 'converted');
  for (const [type, count] of issueGroups) {
    const rows = issues.filter((i) => i.type === type).map((i) => i.row);
    addFact({ kind: 'quality', text: `${count} data issue(s) of type "${type}" (rows ${rows.slice(0, 8).join(', ')}${rows.length > 8 ? ', ...' : ''}).`, rows });
  }
  if (issueSummary.converted) {
    const rows = issues.filter((i) => i.type === 'converted').map((i) => i.row);
    addFact({ kind: 'quality', text: `${issueSummary.converted} reading(s) were converted to standard units.`, rows });
  }

  const times = readings.map((r) => r.time).filter(Boolean).sort();
  return {
    rowCount,
    validReadings: readings.filter((r) => !r.suspect).length,
    issueSummary,
    period: times.length ? { from: times[0], to: times[times.length - 1] } : null,
    stats,
    locations,
    hotspots,
    facts,
  };
}

/** Compact snapshot stored by the client so the next brief can be compared. */
export function snapshot(analysis) {
  return {
    hotspots: analysis.hotspots,
    issueTotal: Object.entries(analysis.issueSummary).filter(([t]) => t !== 'converted').reduce((a, [, n]) => a + n, 0),
    locations: Object.fromEntries(analysis.locations.map((l) => [l.name, l.means])),
    period: analysis.period,
  };
}
