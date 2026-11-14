import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STRINGS } from '../public/js/i18n.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const js = readdirSync(new URL('../public/js/', import.meta.url)).map((f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8')).join('\n');

test('every UI language has exactly the English keys', () => {
  const en = Object.keys(STRINGS.en).sort();
  for (const [lang, dict] of Object.entries(STRINGS)) assert.deepEqual(Object.keys(dict).sort(), en, `${lang} keys differ`);
});

test('every data-i18n key and every literal t() key in the page exists in English', () => {
  const used = [...html.matchAll(/data-i18n="([^"]+)"/g), ...js.matchAll(/\bt\('([a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.ok(used.length > 50);
  for (const key of used) assert.ok(key in STRINGS.en, `missing key ${key}`);
});

test('placeholders match across languages', () => {
  const slots = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [key, text] of Object.entries(STRINGS.en)) assert.equal(slots(STRINGS.hi[key]), slots(text), key);
});

test('Hindi strings are in Devanagari and use no em dash', () => {
  assert.match(STRINGS.hi.hero, /[\u0900-\u097F]/);
  for (const dict of Object.values(STRINGS)) for (const v of Object.values(dict)) assert.ok(!v.includes('\u2014'));
});
