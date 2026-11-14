/**
 * Compare the current analysis snapshot with the previous brief's snapshot.
 * Pure and deterministic, so "what changed" never depends on the AI.
 */
import { POLLUTANTS } from './parse.js';

const round = (n) => Math.round(n * 10) / 10;

/**
 * @param {object} current snapshot() of the new analysis
 * @param {object|null} previous snapshot() of the previous analysis
 * @returns {{hasPrevious: boolean, changes: object[], newHotspots: string[], resolvedHotspots: string[], issueDelta: number}}
 */
export function compareSnapshots(current, previous) {
  if (!previous || typeof previous !== 'object' || !previous.locations) {
    return { hasPrevious: false, changes: [], newHotspots: [], resolvedHotspots: [], issueDelta: 0 };
  }
  const prevHot = new Set(previous.hotspots || []);
  const curHot = new Set(current.hotspots || []);
  const changes = [];

  for (const [location, means] of Object.entries(current.locations)) {
    const before = previous.locations[location];
    if (!before) {
      changes.push({ location, pollutant: null, type: 'new_location', text: `${location} is new in this brief.` });
      continue;
    }
    for (const [pollutant, value] of Object.entries(means)) {
      const old = before[pollutant];
      if (typeof old !== 'number' || old === 0) continue;
      const pct = round(((value - old) / old) * 100);
      if (Math.abs(pct) < 10) continue;
      const label = POLLUTANTS[pollutant]?.label || pollutant;
      changes.push({
        location,
        pollutant,
        type: pct > 0 ? 'worse' : 'better',
        before: old,
        after: value,
        pct,
        text: `${location}: ${label} ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% (${old} to ${value}).`,
      });
    }
  }
  for (const location of Object.keys(previous.locations)) {
    if (!current.locations[location]) {
      changes.push({ location, pollutant: null, type: 'missing_location', text: `${location} has no data in this brief (was reported before).` });
    }
  }

  return {
    hasPrevious: true,
    changes: changes.sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0)),
    newHotspots: [...curHot].filter((h) => !prevHot.has(h)),
    // A hotspot only counts as resolved if the site still reports data; no data is not "better".
    resolvedHotspots: [...prevHot].filter((h) => !curHot.has(h) && current.locations[h]),
    issueDelta: (current.issueTotal || 0) - (previous.issueTotal || 0),
  };
}
