// @ts-check
/**
 * Proactive alerts, computed in code before the AI runs and shown without being asked for.
 * Each alert cites the facts it comes from and gives the asking role one next step.
 * Change alerts also carry the before and after values and both periods from the diff.
 */
import { POLLUTANTS, fmt } from './parse.js';

const SEVERE_BANDS = new Set(['Very Poor', 'Severe']);
const WORSENED_PCT = 25;
const MAX_ALERTS = 8;
// Sort order: severity first, then kind, so change alerts are not crowded out by rising trends.
const KIND_ORDER = ['severe', 'new_hotspot', 'worsened', 'rising', 'low_confidence'];

/** One next step per alert kind and role, in plain words. */
export const NEXT_STEPS = {
  severe: {
    ward_officer: 'Order road sprinkling and stop open burning and dust work near this site today.',
    housing_society: 'Pause on-site dust work and post a notice asking residents to keep windows shut today.',
    school: 'Move assembly and outdoor sport indoors today and tell parents why.',
    health_officer: 'Alert clinics today to expect more breathing and heart cases near this site.',
    traffic_police: 'Divert heavy vehicles away from this site and rotate constables off this junction today.',
    site_manager: 'Stop dusty work and wet the site and haul roads today.',
    citizen: 'Keep children and older adults indoors near this site today and use an N95 mask outdoors.',
    outdoor_worker: 'Shift work away from this site today, wear an N95 mask on long shifts and take breaks indoors.',
  },
  rising: {
    ward_officer: 'Send an inspection team this week to find the source before it worsens.',
    housing_society: 'Check for new construction or burning nearby and raise it with the ward office this week.',
    school: 'Plan indoor alternatives for this week in case readings keep rising.',
    health_officer: 'Tell ASHA workers this week to check on asthma and heart patients near this site.',
    traffic_police: 'Watch congestion near this site this week and plan diversions if it keeps rising.',
    site_manager: 'Check covers, wheel washing and generators this week before readings rise further.',
    citizen: 'Plan outdoor time for the cleanest hours this week.',
    outdoor_worker: 'Plan shifts for the cleanest hours this week and keep a mask with you.',
  },
  new_hotspot: {
    ward_officer: 'Add this site to the daily enforcement round starting today.',
    housing_society: 'Tell residents this area now exceeds the limit and share the advisory today.',
    school: 'Review outdoor timetables for classes near this site today.',
    health_officer: 'Add this area to the health advisory for clinics this week.',
    traffic_police: 'Add this site to the daily traffic watch starting today.',
    site_manager: 'Check whether your site adds to this new hotspot and cut dust today.',
    citizen: 'Share the advisory with neighbours in this area today.',
    outdoor_worker: 'Pick routes that avoid this site starting today.',
  },
  worsened: {
    ward_officer: 'Compare with last period and target the new source this week.',
    housing_society: 'Ask the committee to review what changed on or near the premises this week.',
    school: 'Inform parents that air near the school is worse than last period.',
    health_officer: 'Compare clinic visits with last period for this area this week.',
    traffic_police: 'Check what changed in traffic near this site this week.',
    site_manager: 'Review what changed on your site since last period this week.',
    citizen: 'Report burning or dust near this site to the ward office this week.',
    outdoor_worker: 'Ask your platform or employer this week for rest points away from this site.',
  },
  low_confidence: {
    ward_officer: 'Get the monitor checked before acting on these readings.',
    housing_society: 'Ask the sensor owner to check the device before relying on it.',
    school: 'Treat these readings as uncertain and ask for the monitor to be checked.',
    health_officer: 'Treat these readings as uncertain until the monitor is checked.',
    traffic_police: 'Treat these readings as uncertain until the monitor is checked.',
    site_manager: 'Treat these readings as uncertain and ask for the monitor to be checked.',
    citizen: 'Treat these readings as uncertain until the monitor is checked.',
    outdoor_worker: 'Treat these readings as uncertain and still keep a mask for long shifts.',
  },
};

/** @typedef {import('./types.js').Alert} Alert */

/** Build one alert object. */
function alert(kind, severity, location, text, factIds, role, change) {
  return { id: `${kind}:${location}`, kind, severity, location, text, nextStep: NEXT_STEPS[kind][role], factIds, ...(change ? { change } : {}) };
}

/** The worst matching stat per location (stats sorted by ratio, first one kept). */
function worstPerLocation(stats) {
  const seen = new Set();
  return [...stats].sort((a, b) => b.ratio - a.ratio).filter((s) => !seen.has(s.location) && seen.add(s.location));
}

/** Severe band or at least twice the limit, worst pollutant per location. */
function severeAlerts(stats, role) {
  return worstPerLocation(stats.filter((s) => SEVERE_BANDS.has(s.band) || s.ratio >= 2)).map((s) => alert(
    'severe', 'urgent', s.location,
    `${s.location}: ${POLLUTANTS[s.pollutant].label} average is ${fmt(s.ratio)} times the limit (${s.band}).`,
    [s.factId], role,
  ));
}

/** Rising trend at a location that is already a hotspot, one alert per location. */
function risingAlerts(stats, hotspots, role) {
  const hot = new Set(hotspots);
  return worstPerLocation(stats.filter((s) => s.trend?.direction === 'rising' && hot.has(s.location))).map((s) => alert(
    'rising', 'warning', s.location,
    `${s.location}: ${POLLUTANTS[s.pollutant].label} is rising (${fmt(s.trend.pct)}%) at a site already above the limit.`,
    [s.trendFactId, s.factId], role,
  ));
}

/** New hotspots and pollutants that worsened by 25% or more since the previous brief. */
function changeAlerts(analysis, comparison, role) {
  if (!comparison.hasPrevious) return [];
  const loc = new Map(analysis.locations.map((l) => [l.name, l]));
  const statFact = (location, pollutant) => analysis.stats.find((s) => s.location === location && s.pollutant === pollutant)?.factId;
  const fresh = comparison.newHotspots.map((name) => alert(
    'new_hotspot', 'warning', name, `${name} is above the limit now and was not in the previous brief.`, [loc.get(name).worstFactId], role,
  ));
  const worse = comparison.changes.filter((c) => c.type === 'worse' && c.pct >= WORSENED_PCT).map((c) => ({
    ...alert('worsened', 'warning', c.location, c.text, [statFact(c.location, c.pollutant)].filter(Boolean), role,
      { before: c.before, after: c.after, pct: c.pct, periods: comparison.periods }),
    id: `worsened:${c.location}:${c.pollutant}`,
  }));
  return [...fresh, ...worse];
}

/** Sites where more than 30% of readings were flagged. */
function confidenceAlerts(locations, role) {
  return locations.filter((l) => l.confidence === 'low').map((l) => alert(
    'low_confidence', 'notice', l.name,
    `${l.name}: ${l.flaggedReadings} of ${l.flaggedReadings + l.validReadings} readings were flagged, so conclusions here are uncertain.`,
    l.factIds.slice(0, 2), role,
  ));
}

/**
 * Derive the proactive alerts for one brief, most severe first, at most 8.
 * @param {import('./types.js').Analysis} analysis output of analyze()
 * @param {import('./types.js').Comparison} comparison output of compareSnapshots()
 * @param {string} role key of ROLES
 * @returns {Alert[]}
 */
export function deriveAlerts(analysis, comparison, role) {
  const all = [
    ...severeAlerts(analysis.stats, role),
    ...risingAlerts(analysis.stats, analysis.hotspots, role),
    ...changeAlerts(analysis, comparison, role),
    ...confidenceAlerts(analysis.locations, role),
  ];
  return all.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)).slice(0, MAX_ALERTS);
}
