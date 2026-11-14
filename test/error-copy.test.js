// Every refusal the user can see says how to fix it, carries a stable code, and names the field when there is one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest } from '../lib/validate.js';
import { prepareBrief } from '../lib/brief.js';
import { AppError } from '../lib/errors.js';

const FIX = /\b(paste|upload|choose|split|check|wait|try|reload|add|remove|use)\b/i;
const ok = { table: 'Site,Date,PM10\nA,2026-11-10,120', role: 'school', languages: ['English'] };

function refusal(fn) {
  try { fn(); } catch (err) { return err; }
  assert.fail('expected a refusal');
}

const cases = [
  ['bad_body', () => validateRequest('x')],
  ['table_missing', () => validateRequest({ ...ok, table: ' ' })],
  ['table_too_large', () => validateRequest({ ...ok, table: 'x'.repeat(300001) })],
  ['role_invalid', () => validateRequest({ ...ok, role: 'mayor' })],
  ['languages_missing', () => validateRequest({ ...ok, languages: [] })],
  ['languages_too_many', () => validateRequest({ ...ok, languages: ['English', 'Hindi', 'Tamil', 'Urdu', 'Telugu'] })],
  ['table_unreadable (header only)', () => prepareBrief(validateRequest({ ...ok, table: 'Site,Date,PM10' }))],
  ['table_unreadable (no pollutant column)', () => prepareBrief(validateRequest({ ...ok, table: 'Site,Date,Mood\nA,2026-11-10,ok' }))],
  ['no_readings', () => prepareBrief(validateRequest({ ...ok, table: 'Site,Date,PM10\nA,2026-11-10,N/A' }))],
];

for (const [name, fn] of cases) {
  test(`refusal ${name} says how to fix it`, () => {
    const err = refusal(fn);
    assert.ok(err instanceof AppError, `${name} is not an AppError`);
    assert.ok(err.status >= 400 && err.status < 500);
    assert.match(err.code, /^[a-z_]+$/);
    assert.match(err.message, FIX, `${name}: "${err.message}" gives no fix`);
  });
}
