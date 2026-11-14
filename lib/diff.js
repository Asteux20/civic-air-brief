// @ts-check
/**
 * Compare the current analysis snapshot with the previous brief's snapshot.
 * Pure and deterministic, so "what changed" never depends on the AI.
 * The 10% threshold is tested on the raw percentage; rounding is for text only.
 */
import { POLLUTANTS, fmt } from './parse.js';

/** Smallest change in a location's mean, in percent, that counts as a change between briefs. */
export const CHANGE_THRESHOLD_PCT = 10;

/**
 * Changes for one location present in both snapshots.
 * @param {string} location
 * @param {Record<string, number>} means current raw means
 * @param {Record<string, number>} before previous raw means
 * @returns {import('./types.js').Change[]}
 */
function locationChanges(location, means, before) {
  const out = [];
  for (const [pollutant, after] of Object.entries(means)) {
    const old = before[pollutant];
    if (typeof old !== 'number' || old === 0) continue;
    const pct = ((after - old) / old) * 100;
    if (Math.abs(pct) < CHANGE_THRESHOLD_PCT) continue;
    const label = POLLUTANTS[pollutant]?.label || pollutant;
    out.push({
      location, pollutant, type: pct > 0 ? 'worse' : 'better', before: old, after, pct: fmt(pct),
      text: `${location}: ${label} ${pct > 0 ? 'up' : 'down'} ${fmt(Math.abs(pct))}% (${fmt(old)} to ${fmt(after)}).`,
    });
  }
  return out;
}

/** Locations that appear in only one of the two snapshots. */
function presenceChanges(current, previous) {
  const added = Object.keys(current.locations).filter((l) => !previous.locations[l])
    .map((location) => ({ location, pollutant: null, type: 'new_location', text: `${location} is new in this brief.` }));
  const gone = Object.keys(previous.locations).filter((l) => !current.locations[l])
    .map((location) => ({ location, pollutant: null, type: 'missing_location', text: `${location} has no data in this brief (was reported before).` }));
  return [...added, ...gone];
}

/**
 * List what changed between the previous snapshot and the current one.
 * @param {import('./types.js').Snapshot} current snapshot() of the new analysis
 * @param {import('./types.js').Snapshot|null} previous validated snapshot of the previous analysis
 * @returns {import('./types.js').Comparison} hasPrevious is false when previous is missing
 */
export function compareSnapshots(current, previous) {
  if (!previous || typeof previous !== 'object' || !previous.locations) {
    return { hasPrevious: false, changes: [], newHotspots: [], resolvedHotspots: [], issueDelta: 0 };
  }
  const prevHot = new Set(previous.hotspots || []);
  const curHot = new Set(current.hotspots || []);
  const changes = Object.entries(current.locations)
    .filter(([location]) => previous.locations[location])
    .flatMap(([location, means]) => locationChanges(location, means, previous.locations[location]));
  return {
    hasPrevious: true,
    changes: [...changes, ...presenceChanges(current, previous)].sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0)),
    newHotspots: [...curHot].filter((h) => !prevHot.has(h)),
    // A hotspot only counts as resolved if the site still reports data; no data is not "better".
    resolvedHotspots: [...prevHot].filter((h) => !curHot.has(h) && current.locations[h]),
    issueDelta: (current.issueTotal || 0) - (previous.issueTotal || 0),
    periods: { before: previous.period || null, after: current.period || null },
  };
}
