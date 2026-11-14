// The function-length lint guard measures function bodies, ignoring braces in strings, templates and comments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { functionLengths } from '../scripts/check-fn-length.js';

test('measures declarations, arrows and functions with destructured parameters', () => {
  const src = [
    'function a({ x }, y = {}) {', '  return "}" + `{`; // }', '}',
    'const b = () => {', '  /* { */', '  return 1;', '};',
  ].join('\n');
  assert.deepEqual(functionLengths(src), [{ line: 1, length: 3 }, { line: 4, length: 4 }]);
});
