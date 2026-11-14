/**
 * POST /api/brief  (Vercel serverless function, also used by server.js locally)
 */
import { createBrief } from '../lib/brief.js';
import { validateRequest, checkAccess, createRateLimiter } from '../lib/validate.js';

const allow = createRateLimiter({ limit: 8, windowMs: 60000 });

function log(level, event, data = {}) {
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, event, at: new Date().toISOString(), ...data }));
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
  if (!allow(ip)) {
    log('warn', 'rate_limited', { ip });
    return res.status(429).json({ error: 'Too many briefs in a minute. Please wait and try again.' });
  }
  const started = Date.now();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const input = validateRequest(body);
    const result = await createBrief(input, deps);
    log('info', 'brief_ok', { role: input.role, langs: input.languages.length, rows: result.analysis.rowCount, unverified: result.unverifiedCount, ms: Date.now() - started });
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || (err instanceof SyntaxError ? 400 : 500);
    log('error', 'brief_failed', { status, message: err.message, detail: err.detail, ms: Date.now() - started });
    return res.status(status).json({ error: status === 500 ? 'Something went wrong while creating the brief.' : err.message });
  }
}
