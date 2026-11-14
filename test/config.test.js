// loadConfig: defaults, limits and the shared-store credentials, read once from the environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, intSetting } from '../lib/config.js';

test('defaults apply when nothing is set, and the config is frozen', () => {
  const c = loadConfig({});
  assert.equal(c.geminiModel, 'gemini-3.5-flash');
  assert.equal(c.accessCode, '');
  assert.equal(c.maxBriefsPerHour, 60);
  assert.equal(c.store, null);
  assert.ok(Object.isFrozen(c));
});

test('MAX_BRIEFS_PER_HOUR outside 1..10000 or not an integer falls back to 60', () => {
  for (const raw of ['0', '10001', '2.5', 'lots', '-3']) assert.equal(loadConfig({ MAX_BRIEFS_PER_HOUR: raw }).maxBriefsPerHour, 60, raw);
  assert.equal(loadConfig({ MAX_BRIEFS_PER_HOUR: '120' }).maxBriefsPerHour, 120);
  assert.equal(intSetting('10000', 1, 1, 10000), 10000);
});

test('store needs an https URL and a token; trailing slashes are stripped', () => {
  assert.deepEqual(loadConfig({ UPSTASH_REDIS_REST_URL: 'https://r.upstash.io//', UPSTASH_REDIS_REST_TOKEN: 't' }).store, { url: 'https://r.upstash.io', token: 't' });
  assert.equal(loadConfig({ UPSTASH_REDIS_REST_URL: 'http://r.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't' }).store, null);
  assert.equal(loadConfig({ UPSTASH_REDIS_REST_URL: 'https://r.upstash.io' }).store, null);
});

test('the Vercel KV variable pair works as the store when the Upstash pair is absent', () => {
  assert.deepEqual(loadConfig({ KV_REST_API_URL: 'https://kv.example.io', KV_REST_API_TOKEN: 'k' }).store, { url: 'https://kv.example.io', token: 'k' });
});
