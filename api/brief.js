/**
 * POST /api/brief  (Vercel serverless function, also used by dev-server.js locally)
 *
 * Gemini spend is bounded three ways: a per-IP limit, a per-instance hourly cap
 * (MAX_BRIEFS_PER_HOUR) and a cache, so the same table and options never call Gemini twice.
 */
import { createHash } from 'node:crypto';
import { createBrief } from '../lib/brief.js';
import { validateRequest, checkAccess, createRateLimiter } from '../lib/validate.js';

const perIp = createRateLimiter({ limit: 4, windowMs: 60000 });
const hourly = createRateLimiter({ limit: Number(process.env.MAX_BRIEFS_PER_HOUR) || 60, windowMs: 3600000 });
const CACHE_TTL_MS = 30 * 60000;
const CACHE_MAX = 50;
const cache = new Map();

function log(level, event, data = {}) {
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, event, at: new Date().toISOString(), ...data }));
}

/** Cache key over everything that changes the brief. */
export function cacheKey(input) {
  const { table, role, languages, readingLevel, previous } = input;
  return createHash('sha256').update(JSON.stringify([table, role, [...languages].sort(), readingLevel, previous])).digest('hex');
}

function fromCache(key, now = Date.now()) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

function toCache(key, result) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); // oldest first
  cache.set(key, { at: Date.now(), result });
}

export default async function handler(req, res, deps = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (!checkAccess(req.headers['x-access-code'])) {
    log('warn', 'auth_denied', { ip });
    return res.status(401).json({ error: 'Invalid access code.' });
  }
  const started = Date.now();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const input = validateRequest(body);
    const key = cacheKey(input);
    const cached = fromCache(key);
    if (cached) {
      log('info', 'brief_cached', { role: input.role });
      return res.status(200).json({ ...cached, cached: true });
    }
    if (!perIp(ip)) {
      log('warn', 'rate_limited', { ip });
      return res.status(429).json({ error: 'Too many briefs in a minute. Please wait a minute and try again.' });
    }
    if (!hourly('global')) {
      log('warn', 'hourly_cap');
      return res.status(429).json({ error: 'The hourly brief limit for this demo is reached. Please try again later.' });
    }
    const result = await createBrief(input, deps);
    toCache(key, result);
    log('info', 'brief_ok', { role: input.role, langs: input.languages.length, rows: result.analysis.rowCount, unverified: result.unverifiedCount, ms: Date.now() - started });
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || (err instanceof SyntaxError ? 400 : 500);
    log('error', 'brief_failed', { status, message: err.message, detail: err.detail, ms: Date.now() - started });
    return res.status(status).json({ error: status === 500 ? 'Something went wrong while creating the brief.' : err.message });
  }
}
