// @ts-check
/**
 * Deep validation of data that crosses a trust boundary: the previous-brief snapshot
 * sent back by the browser, and the JSON Gemini returns. Both are rebuilt from scratch,
 * keeping only well-typed fields, so nothing malformed reaches the comparison or the UI.
 */
import { POLLUTANTS } from './parse.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_LOCATIONS = 500;
const MAX_NAME = 200;
const MAX_TEXT = 4000;
const MAX_ITEMS = 20;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** @param {unknown} v @returns {v is Record<string, any>} */
export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Own entries without prototype-polluting keys. */
const safeEntries = (obj) => Object.entries(obj).filter(([k]) => !FORBIDDEN_KEYS.has(k));

/** Pollutant means: known pollutant keys, finite values between 0 and the pollutant's plausible maximum. */
function cleanMeans(means) {
  const out = {};
  for (const [k, v] of safeEntries(means)) {
    if (Object.hasOwn(POLLUTANTS, k) && Number.isFinite(v) && v >= 0 && v <= POLLUTANTS[k].max) out[k] = v;
  }
  return out;
}

/** An ISO period, or undefined when either end is missing or not a real date. */
function cleanPeriod(period) {
  if (!isPlainObject(period)) return undefined;
  const ok = (s) => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(s));
  return ok(period.from) && ok(period.to) ? { from: period.from, to: period.to } : undefined;
}

/**
 * Rebuild a client-supplied previous snapshot. Returns null when it has no locations object.
 * Hotspots must be names that also appear in locations.
 * @param {unknown} prev
 * @returns {{locations: Record<string, Record<string, number>>, hotspots: string[], issueTotal: number, period?: {from: string, to: string}} | null}
 */
export function validateSnapshot(prev) {
  if (!isPlainObject(prev) || !isPlainObject(prev.locations)) return null;
  /** @type {Record<string, Record<string, number>>} */
  const locations = {};
  for (const [name, means] of safeEntries(prev.locations).slice(0, MAX_LOCATIONS)) {
    if (isPlainObject(means) && name.length <= MAX_NAME) locations[name] = cleanMeans(means);
  }
  const hotspots = Array.isArray(prev.hotspots)
    ? [...new Set(prev.hotspots.filter((h) => typeof h === 'string' && Object.hasOwn(locations, h)))]
    : [];
  const issueTotal = Number.isInteger(prev.issueTotal) && prev.issueTotal >= 0 ? prev.issueTotal : 0;
  const period = cleanPeriod(prev.period);
  return { locations, hotspots, issueTotal, ...(period ? { period } : {}) };
}

/** Trimmed text capped in length; '' for anything that is not a string. */
const cleanText = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : '');

/** Cited fact ids as strings, at most 20 (verifyEvidence normalises and checks them). */
const cleanEvidence = (v) => (Array.isArray(v) ? v.filter((e) => typeof e === 'string').slice(0, MAX_ITEMS) : []);

// Text fields each cited item must carry; an item missing one is dropped.
const LIST_FIELDS = {
  trends: ['text'],
  hotspots: ['location', 'why'],
  actions: ['action', 'why', 'timeframe'],
  dataCaveats: ['text'],
};

/** Keep list items that are objects with every required text field; normalise evidence and priority. */
function cleanList(items, fields) {
  if (!Array.isArray(items)) return [];
  return items.filter(isPlainObject).slice(0, MAX_ITEMS).flatMap((item) => {
    const out = Object.fromEntries(fields.map((f) => [f, cleanText(item[f])]));
    if (fields.some((f) => !out[f])) return [];
    if ('action' in out) out.priority = Number.isInteger(item.priority) && item.priority >= 1 && item.priority <= 9 ? item.priority : 9;
    return [{ ...out, evidence: cleanEvidence(item.evidence) }];
  });
}

export const ADVISORY_FIELDS = ['headline', 'general', 'children', 'olderAdults', 'sensitiveGroups', 'outdoorWorkers'];

/** One complete advisory per requested language, in the requested order. */
function cleanAdvisories(items, languages) {
  const list = Array.isArray(items) ? items.filter(isPlainObject) : [];
  return languages.flatMap((language) => {
    const found = list.find((a) => a.language === language);
    if (!found) return [];
    const out = Object.fromEntries(ADVISORY_FIELDS.map((f) => [f, cleanText(found[f])]));
    return ADVISORY_FIELDS.every((f) => out[f]) ? [{ language, ...out }] : [];
  });
}

/**
 * Validate Gemini's brief against the response contract.
 * Optional lists are normalised; missing required output is reported, never invented.
 * @param {unknown} raw parsed JSON from Gemini
 * @param {string[]} languages requested advisory languages
 * @returns {{brief: object, missing: string[]}} missing names required fields or languages absent from the output
 */
export function validateBrief(raw, languages) {
  const src = isPlainObject(raw) ? raw : {};
  const brief = {
    summary: cleanText(src.summary),
    internalNote: cleanText(src.internalNote),
    changeNarrative: cleanText(src.changeNarrative),
    ...Object.fromEntries(Object.entries(LIST_FIELDS).map(([name, fields]) => [name, cleanList(src[name], fields)])),
    advisories: cleanAdvisories(src.advisories, languages),
  };
  const missing = [
    ...['summary', 'internalNote'].filter((f) => !brief[f]),
    ...(brief.actions.length ? [] : ['actions']),
    ...languages.filter((l) => !brief.advisories.some((a) => a.language === l)).map((l) => `advisory:${l}`),
  ];
  return { brief, missing };
}
