// @ts-check
/**
 * Indicative inhaled-dose helpers. Deterministic tables, no network, no node: imports.
 * Results are rough planning numbers for outdoor air, not a medical measurement.
 *
 * Breathing rates: US EPA Exposure Factors Handbook (2011), Chapter 6, Table 6-2,
 * "Recommended Short-Term Exposure Values for Inhalation (males and females combined)",
 * MEAN column in m3/minute. Read from the handbook PDF with pdftotext -table (checked 2026-11-14).
 * Handbook age rows: child 6 to <11 yr, adult 41 to <51 yr, older adult 71 to <81 yr.
 * Handbook activity levels: Sedentary/Passive, Light, Moderate, High intensity.
 * Band edges: India CPCB National AQI PM2.5 breakpoints.
 */

/** @typedef {'child'|'adult'|'older'} GroupKey */
/** @typedef {'sitting'|'walking'|'play'|'sport'} Activity */

export const GROUPS = {
  child: { label: 'Child, 6 to under 11 years', sedentary: 0.0048, light: 0.011, moderate: 0.022, high: 0.042 },
  adult: { label: 'Adult, 41 to under 51 years', sedentary: 0.0048, light: 0.013, moderate: 0.028, high: 0.052 },
  older: { label: 'Older adult, 71 to under 81 years', sedentary: 0.0050, light: 0.012, moderate: 0.025, high: 0.047 },
};

/** Activity name to the handbook intensity column. */
const LEVEL = { sitting: 'sedentary', walking: 'light', play: 'moderate', sport: 'high' };

export const ACTIVITIES = ['sitting', 'walking', 'play', 'sport'];

const MAX_MINUTES = 720;
const BANDS = ['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe'];
const BAND_TOP = [30, 60, 90, 120, 250];

/**
 * Look up the breathing rate in m3 per minute.
 * @param {string} group
 * @param {string} activity
 * @returns {number}
 * @throws {Error} on an unknown group or activity
 */
function rate(group, activity) {
  if (!Object.hasOwn(GROUPS, group)) throw new Error(`Unknown age group "${group}".`);
  if (!Object.hasOwn(LEVEL, activity)) throw new Error(`Unknown activity "${activity}".`);
  return GROUPS[group][LEVEL[activity]];
}

/**
 * Require a finite number that is zero or more.
 * @param {unknown} v
 * @param {string} label
 */
function nonNegative(v, label) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`${label} must be a number that is zero or more.`);
  }
}

/**
 * Require a valid number of minutes outdoors.
 * @param {unknown} minutes
 */
function checkMinutes(minutes) {
  nonNegative(minutes, 'Minutes');
  if (/** @type {number} */ (minutes) > MAX_MINUTES) {
    throw new Error(`Minutes cannot be more than ${MAX_MINUTES} (12 hours).`);
  }
}

/**
 * Air breathed in during an outing.
 * @param {number} concentrationUgM3 PM2.5 or PM10 in ug/m3
 * @param {GroupKey} group child, adult or older
 * @param {Activity} activity sitting, walking, play or sport
 * @param {number} minutes time outdoors, 0 to 720
 * @returns {number} micrograms inhaled, 1 decimal
 * @throws {Error} on unknown group or activity, bad numbers, or minutes above 720
 */
export function inhaledDose(concentrationUgM3, group, activity, minutes) {
  const r = rate(group, activity);
  nonNegative(concentrationUgM3, 'Concentration');
  checkMinutes(minutes);
  return Math.round(concentrationUgM3 * r * minutes * 10) / 10;
}

/**
 * How much more air this person breathes than an adult sitting for the same time.
 * @param {GroupKey} group
 * @param {Activity} activity
 * @param {number} minutes same validation as inhaledDose
 * @returns {number} ratio, 1 decimal (2.6 means 2.6 times)
 * @throws {Error} on unknown group or activity, or bad minutes
 */
export function doseRatio(group, activity, minutes) {
  const r = rate(group, activity);
  checkMinutes(minutes);
  return Math.round((r / GROUPS.adult.sedentary) * 10) / 10;
}

/**
 * India CPCB PM2.5 band.
 * @param {number} v PM2.5 in ug/m3
 * @returns {{band: string, index: number}} index 0 (Good) to 5 (Severe)
 * @throws {Error} when v is negative or not a number
 */
export function pm25Band(v) {
  nonNegative(v, 'PM2.5');
  const found = BAND_TOP.findIndex((top) => v <= top);
  const index = found === -1 ? 5 : found;
  return { band: BANDS[index], index };
}

/**
 * Add whole hours to a local ISO time such as 2026-11-14T10:00.
 * @param {string} iso
 * @param {number} n
 * @returns {string} same format
 */
function addHours(iso, n) {
  const d = new Date(`${iso.slice(0, 16)}:00Z`);
  d.setUTCHours(d.getUTCHours() + n);
  return d.toISOString().slice(0, 16);
}

/**
 * Mean PM2.5 of one candidate run, or null when it has a gap or a missing value.
 * @param {{time: string, pm25: number|null}[]} run
 * @returns {number|null}
 */
function runMean(run) {
  let sum = 0;
  for (let i = 0; i < run.length; i += 1) {
    const v = run[i].pm25;
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (i > 0 && run[i].time.slice(0, 16) !== addHours(run[i - 1].time, 1)) return null;
    sum += v;
  }
  return sum / run.length;
}

/**
 * Find the cleanest run of hours in a window of the day.
 * @param {{time: string, pm25: number|null}[]} series from hourlySeries, in time order
 * @param {{hours?: number, from?: string, to?: string}} [opts] hours 1 to 24 (default 2);
 *   from is the earliest allowed start, to is the latest allowed hour (both inclusive, local ISO)
 * @returns {{start: string, end: string, meanPm25: number}|null} end is when the run finishes
 *   (start plus hours); null when no run fits. Ties go to the earliest start.
 */
export function bestWindow(series, { hours = 2, from, to } = {}) {
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
    throw new Error('Hours must be a whole number from 1 to 24.');
  }
  let best = null;
  for (let i = 0; i + hours <= series.length; i += 1) {
    const run = series.slice(i, i + hours);
    const start = run[0].time.slice(0, 16);
    if (from && start < from.slice(0, 16)) continue;
    if (to && run[hours - 1].time.slice(0, 16) > to.slice(0, 16)) continue;
    const mean = runMean(run);
    if (mean !== null && (best === null || mean < best.mean)) best = { start, mean };
  }
  if (!best) return null;
  return { start: best.start, end: addHours(best.start, hours), meanPm25: Math.round(best.mean * 10) / 10 };
}

const WATCH = [
  'Cough that is new',
  'Wheeze or a whistling chest',
  'Chest tightness',
  'Eye or throat irritation',
  'Unusual tiredness',
];
const WATCH_EXTRA = {
  child: 'A child who stops playing early or says their chest feels tight',
  older: 'Breathlessness on stairs or a short walk, or a racing heartbeat',
  adult: 'A headache or dry throat that starts outdoors and eases indoors',
};
const MASK = 'Wear an N95 or a well-fitted mask for anything longer than a short trip';
const REDUCE_BY_BAND = [
  [],
  ['Keep outdoor time to the usual'],
  ['Shorten time outdoors', 'Slow the pace'],
  ['Shorten time outdoors', 'Slow the pace', 'Go in the cleanest window of the day', 'Avoid busy roads'],
  ['Cut outdoor time to what is needed', 'Slow the pace', 'Go in the cleanest window of the day',
    'Avoid busy roads', MASK],
  ['Stay indoors where you can', 'Skip sport and hard play', 'Avoid busy roads',
    'Wear an N95 or a well-fitted mask if you must go out', 'Keep windows closed during peak hours'],
];

/**
 * Plain-English advice for a PM2.5 band and age group.
 * @param {number} bandIndex 0 (Good) to 5 (Severe) from pm25Band
 * @param {GroupKey} group
 * @returns {{watchFor: string[], reduce: string[]}}
 * @throws {Error} on a bad index or unknown group
 */
export function advice(bandIndex, group) {
  if (!Number.isInteger(bandIndex) || bandIndex < 0 || bandIndex > 5) {
    throw new Error('Band index must be a whole number from 0 to 5.');
  }
  if (!Object.hasOwn(GROUPS, group)) throw new Error(`Unknown age group "${group}".`);
  const watchFor = bandIndex === 0 ? [] : [...WATCH, WATCH_EXTRA[group]];
  return { watchFor, reduce: [...REDUCE_BY_BAND[bandIndex]] };
}
