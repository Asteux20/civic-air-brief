/**
 * POST /api/brief  (Vercel serverless function, also used by dev-server.js locally)
 *
 * Gemini spend is bounded four ways, all held in the shared store so they apply across
 * instances: a failed-access throttle, a per-IP limit, a global hourly cap, and a cache
 * keyed by the exact prompt. Identical concurrent requests share one Gemini call.
 */
import { createHash, randomUUID } from 'node:crypto';
import { prepareBrief, generateBrief, assembleResult } from '../lib/brief.js';
import { callGemini, FALLBACK_MODEL, PROMPT_VERSION } from '../lib/ai.js';
import { validateRequest, checkAccess, clientIp } from '../lib/validate.js';
import { loadConfig } from '../lib/config.js';
import { createStore, createMemoryStore, createSingleFlight } from '../lib/store.js';
import { AppError } from '../lib/errors.js';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const CACHE_TTL_MS = 30 * MINUTE;
const AUTH_FAIL_LIMIT = 10;
const AUTH_FAIL_WINDOW_MS = 10 * MINUTE;

/** Random id for this warm instance, returned in responses as proof of which instance served them. */
export const instanceId = randomUUID().slice(0, 8);

/**
 * One structured log line per event. Never logs table contents.
 * @param {string} event
 * @param {object} [data]
 */
function log(event, data = {}) {
  const level = /failed|degraded/.test(event) ? 'error' : 'log';
  console[level](JSON.stringify({ event, at: new Date().toISOString(), instanceId, ...data }));
}

const defaultConfig = loadConfig();
const defaultStore = createStore(defaultConfig, { log });
const degradedCap = createMemoryStore();
const flight = createSingleFlight();

/**
 * Cache key over the prompt version, the model and the full prompt (which carries role,
 * languages, reading level, the previous-brief diff and every fact the model sees).
 * @param {string} prompt
 * @param {string} model
 * @returns {string}
 */
export function cacheKey(prompt, model) {
  return `cab:brief:${createHash('sha256').update(JSON.stringify([PROMPT_VERSION, model, prompt])).digest('hex')}`;
}

/**
 * Refuse callers without the access code, and throttle repeated wrong codes per IP.
 * @throws {AppError} 401 wrong code, 429 too many wrong codes
 */
async function requireAccess(req, ip, config, store) {
  if (!config.accessCode) return;
  const key = `cab:authfail:${ip}`;
  if ((Number(await store.get(key)) || 0) >= AUTH_FAIL_LIMIT) {
    throw new AppError(429, 'auth_throttled', 'Too many wrong access codes. Wait 10 minutes, then paste the code from the README again.', 'code');
  }
  if (checkAccess(req.headers['x-access-code'], config.accessCode)) return;
  await store.limit(key, AUTH_FAIL_LIMIT, AUTH_FAIL_WINDOW_MS);
  log('auth_denied', { ip });
  throw new AppError(401, 'auth_invalid', 'Access code is wrong. Check the code in the README and paste it again.', 'code');
}

/**
 * Count one Gemini call against the per-IP limit and the hourly cap.
 * While the shared store is down, a stricter per-instance cap applies instead of the global one.
 * @throws {AppError} 429
 */
async function spendGeminiCall(ip, config, store) {
  const perIp = await store.limit(`cab:ip:${ip}`, config.perIpPerMinute, MINUTE);
  if (!perIp.allowed) throw new AppError(429, 'rate_ip', `Up to ${config.perIpPerMinute} new briefs a minute. Wait a minute and try again.`);
  const hourly = await store.limit('cab:hourly', config.maxBriefsPerHour, HOUR);
  const allowed = hourly.degraded ? (await degradedCap.limit('degraded', config.degradedPerHour, HOUR)).allowed : hourly.allowed;
  if (!allowed) throw new AppError(429, 'rate_hourly', 'The hourly brief limit for this demo is reached. Try again in an hour, or reuse a cached brief.');
}

/**
 * Cached AI output for this prompt, or a fresh Gemini call (cached only when complete).
 * @returns {Promise<{ai: object, cached: boolean}>}
 */
async function aiFor(prepared, ip, { config, store, generate }) {
  const key = cacheKey(prepared.prompt, config.geminiModel);
  const hit = await store.get(key);
  if (hit) return { ai: hit, cached: true };
  await spendGeminiCall(ip, config, store);
  const ai = await flight(key, () => generateBrief(prepared.prompt, prepared.input.languages, generate));
  if (ai.aiStatus === 'complete') await store.set(key, ai, CACHE_TTL_MS);
  return { ai, cached: false };
}

/** Parse a string body; objects pass through (Vercel parses JSON bodies). */
function parseBody(body) {
  try {
    return typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    throw new AppError(400, 'bad_json', 'The request was not valid JSON. Reload the page and try again.');
  }
}

/** Send an error as JSON; unknown errors are logged and hidden behind a generic message. */
function sendError(res, err, started) {
  const status = err.status || 500;
  log(status >= 500 ? 'brief_failed' : 'brief_refused', { status, code: err.code, message: err.message, detail: err.detail, ms: Date.now() - started });
  const message = status === 500 ? 'Something went wrong while creating the brief. Try again; if it repeats, try a smaller table.' : err.message;
  return res.status(status).json({ error: message, code: err.code || 'server_error', ...(err.field ? { field: err.field } : {}) });
}

/**
 * Vercel function handler. deps lets tests inject the AI call, the store and the config.
 * @param {object} req
 * @param {object} res
 * @param {{generate?: Function, store?: import('../lib/store.js').Store, config?: ReturnType<typeof loadConfig>}} [deps]
 */
export default async function handler(req, res, deps = {}) {
  const { config = defaultConfig, store = defaultStore } = deps;
  const generate = deps.generate || ((prompt, opts) => callGemini(prompt, { ...opts, apiKey: config.geminiApiKey, models: [config.geminiModel, FALLBACK_MODEL] }));
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.', code: 'method' });
  }
  const started = Date.now();
  const ip = clientIp(req);
  try {
    await requireAccess(req, ip, config, store);
    const prepared = prepareBrief(validateRequest(parseBody(req.body)));
    const { ai, cached } = await aiFor(prepared, ip, { config, store, generate });
    const result = assembleResult(prepared, ai);
    log('brief_ok', { role: result.role, langs: result.brief.advisories.length, rows: result.analysis.rowCount, cached, aiStatus: ai.aiStatus, store: store.kind, ms: Date.now() - started });
    return res.status(200).json({ ...result, cached, instanceId, store: store.kind });
  } catch (err) {
    return sendError(res, err, started);
  }
}
