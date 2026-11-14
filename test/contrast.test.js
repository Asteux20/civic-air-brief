// scripts/contrast.js: the WCAG maths and the token reader behind the README contrast table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratio, themes, check } from '../scripts/contrast.js';

test('contrast ratio matches WCAG reference values', () => {
  assert.equal(Math.round(ratio('#000000', '#FFFFFF') * 100) / 100, 21);
  assert.equal(ratio('#777777', '#777777'), 1);
  assert.equal(Math.round(ratio('#767676', '#FFFFFF') * 100) / 100, 4.54);
});

test('dark tokens override light ones and a failing pair is reported', () => {
  const css = ':root { --ink: #0A0A0A; --ground: #FFFFFF; --field: #DDDDDD; }\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --ground: #101114; --ink: #ECEDEF; } }';
  const t = themes(css);
  assert.equal(t.dark.ground, '#101114');
  assert.equal(t.dark.field, '#DDDDDD');
  const rows = check(css);
  assert.ok(rows.find((r) => r.theme === 'light' && r.fg === 'field' && !r.pass), 'light field border at 1.36:1 must fail');
  assert.ok(rows.filter((r) => r.fg === 'ink' && r.bg === 'ground').every((r) => r.pass));
});
