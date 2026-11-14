// @ts-check
/**
 * Request validation and caller identity for the brief endpoint.
 */
import { timingSafeEqual } from 'node:crypto';
import { ROLES, LANGUAGES, READING_LEVELS } from './ai.js';
import { AppError } from './errors.js';
import { isPlainObject, validateSnapshot } from './schema.js';

export const MAX_TABLE_CHARS = 300000;
export const MAX_LANGUAGES = 4;

/**
 * Validate and normalise the request body.
 * @param {unknown} body parsed JSON body
 * @returns {{table: string, role: string, languages: string[], readingLevel: string, previous: ReturnType<typeof validateSnapshot>}}
 * @throws {AppError} 400 with a code and the field at fault
 */
export function validateRequest(body) {
  if (!isPlainObject(body)) throw new AppError(400, 'bad_body', 'Request body must be a JSON object.');
  const { table, role, languages, readingLevel, previous } = body;
  if (typeof table !== 'string' || !table.trim()) throw new AppError(400, 'table_missing', 'Paste or upload a data table first.', 'table');
  if (table.length > MAX_TABLE_CHARS) {
    throw new AppError(400, 'table_too_large', `Table is too large (max ${MAX_TABLE_CHARS} characters). Split it by month or by site and try again.`, 'table');
  }
  if (typeof role !== 'string' || !Object.hasOwn(ROLES, role)) {
    throw new AppError(400, 'role_invalid', 'Choose who is asking: ward officer, housing society or school.', 'role');
  }
  const langs = Array.isArray(languages) ? [...new Set(languages)].filter((l) => LANGUAGES.includes(l)) : [];
  if (!langs.length) throw new AppError(400, 'languages_missing', 'Choose at least one advisory language.', 'languages');
  if (langs.length > MAX_LANGUAGES) throw new AppError(400, 'languages_too_many', `Choose up to ${MAX_LANGUAGES} languages per brief.`, 'languages');
  const level = typeof readingLevel === 'string' && Object.hasOwn(READING_LEVELS, readingLevel) ? readingLevel : 'standard';
  return { table, role, languages: langs, readingLevel: level, previous: validateSnapshot(previous) };
}

/**
 * Constant-time access code check. Open access when no code is configured.
 * @param {unknown} provided value of the x-access-code header
 * @param {string} expected configured code ('' = open)
 * @returns {boolean}
 */
export function checkAccess(provided, expected) {
  if (!expected) return true;
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Best available client address, in order: x-vercel-forwarded-for, x-real-ip,
 * the first x-forwarded-for entry, then the socket. Capped at 64 characters for use in store keys.
 * @param {{headers?: Record<string, string | string[] | undefined>, socket?: {remoteAddress?: string}}} req
 * @returns {string}
 */
export function clientIp(req) {
  const h = req.headers || {};
  const first = (v) => String(v || '').split(',')[0].trim();
  const ip = first(h['x-vercel-forwarded-for']) || first(h['x-real-ip']) || first(h['x-forwarded-for']) || req.socket?.remoteAddress || 'unknown';
  return ip.slice(0, 64);
}
