// @ts-check
/**
 * Every environment variable the app reads, parsed and checked in one place.
 */

/**
 * @typedef {object} Config
 * @property {string} geminiApiKey
 * @property {string} geminiModel primary model; a fallback model is tried after it
 * @property {string} accessCode empty string means open access
 * @property {number} maxBriefsPerHour global Gemini cap while the shared store is healthy
 * @property {number} perIpPerMinute
 * @property {number} degradedPerHour per-instance Gemini cap while the shared store is down
 * @property {{url: string, token: string} | null} store Upstash REST credentials, null = memory only
 */

/**
 * Read an integer setting, falling back when it is missing or out of range.
 * @param {string | undefined} raw
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function intSetting(raw, fallback, min, max) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/**
 * Build the app config from environment variables.
 * Accepts either the Upstash pair or the Vercel KV pair for the shared store.
 * @param {Record<string, string | undefined>} [env]
 * @returns {Readonly<Config>}
 */
export function loadConfig(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '';
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  return Object.freeze({
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-3.5-flash',
    accessCode: env.ACCESS_CODE || '',
    maxBriefsPerHour: intSetting(env.MAX_BRIEFS_PER_HOUR, 60, 1, 10000),
    perIpPerMinute: 4,
    degradedPerHour: 10,
    store: url.startsWith('https://') && token ? { url: url.replace(/\/+$/, ''), token } : null,
  });
}
