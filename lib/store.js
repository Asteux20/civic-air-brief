// @ts-check
/**
 * Shared state for rate limits and the brief cache.
 *
 * With Upstash Redis credentials every serverless instance shares one store, so limits
 * and cached briefs hold across instances. Without them, or while Upstash is unreachable,
 * a bounded in-memory store keeps the app working on each instance.
 */

/**
 * @typedef {object} Store
 * @property {string} kind 'upstash' or 'memory'
 * @property {(key: string, limit: number, windowMs: number) => Promise<{allowed: boolean, count: number, degraded?: boolean}>} limit
 *   fixed-window counter: the first hit starts the window, the window never slides
 * @property {(key: string) => Promise<any>} get parsed value, or null when absent or expired
 * @property {(key: string, value: any, ttlMs: number) => Promise<void>} set
 */

/** Deadline for each Upstash call, in milliseconds. */
export const STORE_TIMEOUT_MS = 400;
/** Most keys the in-memory store holds before it evicts the least recently used. */
export const MEMORY_MAX_KEYS = 5000;

/**
 * Bounded in-memory store. Least recently used keys are evicted past maxKeys.
 * @param {{maxKeys?: number, now?: () => number}} [options]
 * @returns {Store & {size: () => number}}
 */
export function createMemoryStore({ maxKeys = MEMORY_MAX_KEYS, now = Date.now } = {}) {
  /** @type {Map<string, {value: any, expiresAt: number}>} */
  const entries = new Map();
  const read = (key) => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    entries.delete(key);
    if (entry.expiresAt <= now()) return undefined;
    entries.set(key, entry); // re-insert: Map order is the LRU order
    return entry;
  };
  const write = (key, entry) => {
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > maxKeys) entries.delete(entries.keys().next().value);
  };
  return {
    kind: 'memory',
    async limit(key, limit, windowMs) {
      const entry = read(key);
      const count = (entry?.value ?? 0) + 1;
      write(key, { value: count, expiresAt: entry?.expiresAt ?? now() + windowMs });
      return { allowed: count <= limit, count };
    },
    async get(key) {
      return read(key)?.value ?? null;
    },
    async set(key, value, ttlMs) {
      write(key, { value, expiresAt: now() + ttlMs });
    },
    size: () => entries.size,
  };
}

/**
 * Upstash Redis over its REST API (fetch only, no client library).
 * Every call has a 400 ms deadline and throws on any failure.
 * @param {{url: string, token: string}} credentials
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [options]
 * @returns {Store}
 */
export function createUpstashStore({ url, token }, { fetchImpl = fetch, timeoutMs = STORE_TIMEOUT_MS } = {}) {
  const call = async (path, body) => {
    const res = await fetchImpl(url + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`store HTTP ${res.status}`);
    const data = await res.json();
    if (data?.error) throw new Error(`store error: ${data.error}`);
    return data;
  };
  return {
    kind: 'upstash',
    async limit(key, limit, windowMs) {
      // MULTI/EXEC: the increment and the first-hit expiry are applied atomically; NX keeps the window fixed.
      const replies = await call('/multi-exec', [['INCR', key], ['PEXPIRE', key, String(windowMs), 'NX']]);
      const count = Number(replies?.[0]?.result);
      if (!Number.isInteger(count)) throw new Error('store returned no count');
      return { allowed: count <= limit, count };
    },
    async get(key) {
      const { result } = await call('', ['GET', key]);
      return result == null ? null : JSON.parse(result);
    },
    async set(key, value, ttlMs) {
      await call('', ['SET', key, JSON.stringify(value), 'PX', String(ttlMs)]);
    },
  };
}

/**
 * Use the primary store, and the local one for any call the primary fails.
 * limit() results from the local store carry degraded: true so callers can apply a stricter cap.
 * @param {Store} primary
 * @param {Store} local
 * @param {(event: string, data: object) => void} log
 * @returns {Store}
 */
export function withFallback(primary, local, log) {
  const run = async (op, args) => {
    try {
      return { value: await primary[op](...args), degraded: false };
    } catch (err) {
      log('store_degraded', { op, message: err.message });
      return { value: await local[op](...args), degraded: true };
    }
  };
  return {
    kind: primary.kind,
    async limit(key, limit, windowMs) {
      const { value, degraded } = await run('limit', [key, limit, windowMs]);
      return { ...value, degraded };
    },
    get: async (key) => (await run('get', [key])).value,
    set: async (key, value, ttlMs) => { await run('set', [key, value, ttlMs]); },
  };
}

/**
 * The store for this deployment: Upstash with a memory fallback when credentials exist, memory otherwise.
 * @param {{store: {url: string, token: string} | null}} config
 * @param {{fetchImpl?: typeof fetch, log?: (event: string, data: object) => void}} [options]
 * @returns {Store}
 */
export function createStore(config, { fetchImpl = fetch, log = () => {} } = {}) {
  if (!config.store) return createMemoryStore();
  return withFallback(createUpstashStore(config.store, { fetchImpl }), createMemoryStore(), log);
}

/**
 * Share one in-flight promise per key on this instance, so identical concurrent
 * requests make one Gemini call. The entry is removed when the promise settles, including on rejection.
 * @returns {<T>(key: string, fn: () => Promise<T>) => Promise<T>}
 */
export function createSingleFlight() {
  /** @type {Map<string, Promise<any>>} */
  const inflight = new Map();
  return (key, fn) => {
    const running = inflight.get(key);
    if (running) return running;
    const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
