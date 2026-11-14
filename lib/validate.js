/**
 * Request validation and lightweight protection for the brief endpoint.
 */
import { timingSafeEqual } from 'node:crypto';
import { ROLES, LANGUAGES, READING_LEVELS } from './ai.js';

export const MAX_TABLE_CHARS = 300000;

/** Validate and normalise the request body. Throws an Error with status 400. */
export function validateRequest(body) {
  const fail = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (!body || typeof body !== 'object') throw fail('Request body must be JSON.');
  const { table, role, languages, readingLevel, previous } = body;
  if (typeof table !== 'string' || !table.trim()) throw fail('Paste or upload a data table first.');
  if (table.length > MAX_TABLE_CHARS) throw fail(`Table is too large (max ${MAX_TABLE_CHARS} characters).`);
  if (!Object.hasOwn(ROLES, role)) throw fail('Choose who is asking: ward officer, housing society or school.');
  const langs = Array.isArray(languages) ? [...new Set(languages)].filter((l) => LANGUAGES.includes(l)) : [];
  if (!langs.length) throw fail('Choose at least one advisory language.');
  if (langs.length > 4) throw fail('Choose up to 4 languages per brief.');
  const level = Object.hasOwn(READING_LEVELS, readingLevel) ? readingLevel : 'standard';
  return { table, role, languages: langs, readingLevel: level, previous: sanitizeSnapshot(previous) };
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Rebuild a client-supplied previous snapshot from scratch, keeping only well-typed fields.
 * Anything malformed is dropped instead of crashing the comparison.
 */
export function sanitizeSnapshot(prev) {
  if (!isPlainObject(prev) || !isPlainObject(prev.locations)) return null;
  const locations = {};
  for (const [name, means] of Object.entries(prev.locations).slice(0, 500)) {
    if (!isPlainObject(means) || name.length > 200) continue;
    const clean = {};
    for (const [k, v] of Object.entries(means)) if (/^[a-z0-9]{2,4}$/.test(k) && Number.isFinite(v)) clean[k] = v;
    locations[name] = clean;
  }
  const hotspots = Array.isArray(prev.hotspots) ? prev.hotspots.filter((h) => typeof h === 'string').slice(0, 500) : [];
  const issueTotal = Number.isFinite(prev.issueTotal) ? prev.issueTotal : 0;
  return { locations, hotspots, issueTotal };
}

/** Constant-time access code check. Open access when no code is configured. */
export function checkAccess(provided, expected = process.env.ACCESS_CODE) {
  if (!expected) return true;
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Fixed-window in-memory rate limiter (per warm server instance). */
export function createRateLimiter({ limit = 8, windowMs = 60000 } = {}) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 5000) hits.clear();
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
