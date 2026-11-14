// Lint guard: syntax-checks every source file and fails when any function body is longer than MAX lines.
// Zero dependencies: a brace counter that skips strings, template literals and comments.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const MAX = 40;
const DIRS = ['api', 'lib', 'public', 'scripts', 'test'];
const ROOT_FILES = ['dev-server.js'];
// A line that opens a function body: declarations, arrows ending in "{", and method shorthand.
const OPENS_FUNCTION = /(\bfunction\b[^(]*\([^)]*\)\s*\{\s*$|=>\s*\{\s*$|^\s*(async\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{\s*$)/;

/**
 * Strip string, template and comment contents from one line so braces inside them are ignored.
 * @param {string} line
 * @param {{inBlockComment: boolean, inTemplate: boolean}} state carried across lines
 * @returns {string}
 */
export function codeOnly(line, state) {
  let out = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (state.inBlockComment) {
      if (ch === '*' && line[i + 1] === '/') { state.inBlockComment = false; i += 1; }
      continue;
    }
    if (state.inTemplate) {
      if (ch === '\\') i += 1;
      else if (ch === '`') state.inTemplate = false;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') break;
    if (ch === '/' && line[i + 1] === '*') { state.inBlockComment = true; i += 1; continue; }
    if (ch === '`') { state.inTemplate = true; continue; }
    if (ch === '"' || ch === "'") {
      const end = line.indexOf(ch, i + 1);
      i = end === -1 ? line.length : end;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Lengths of every function body in a source text.
 * @param {string} text
 * @returns {{line: number, length: number}[]}
 */
export function functionLengths(text) {
  const state = { inBlockComment: false, inTemplate: false };
  const stack = [];
  const found = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const opensFn = !state.inTemplate && !state.inBlockComment && OPENS_FUNCTION.test(raw);
    const code = codeOnly(raw, state);
    const bodyBrace = opensFn && code.trimEnd().endsWith('{') ? code.trimEnd().length - 1 : -1;
    for (let i = 0; i < code.length; i += 1) {
      if (code[i] === '{') {
        stack.push({ fn: i === bodyBrace, start: index + 1 });
      } else if (code[i] === '}') {
        const top = stack.pop();
        if (top?.fn) found.push({ line: top.start, length: index + 1 - top.start + 1 });
      }
    }
  });
  return found;
}

/** All .js and .mjs files to check. */
function sourceFiles() {
  return [...ROOT_FILES, ...DIRS.flatMap((d) => readdirSync(d).filter((f) => /\.m?js$/.test(f)).map((f) => join(d, f)))];
}

function main() {
  let worst = { length: 0 };
  const failures = [];
  const files = sourceFiles();
  for (const file of files) {
    execFileSync(process.execPath, ['--check', file]);
    for (const fn of functionLengths(readFileSync(file, 'utf8'))) {
      if (fn.length > worst.length) worst = { ...fn, file };
      if (fn.length > MAX) failures.push(`${file}:${fn.line} function is ${fn.length} lines (max ${MAX})`);
    }
  }
  console.log(`checked ${files.length} files; longest function ${worst.length} lines at ${worst.file}:${worst.line}`);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main();
