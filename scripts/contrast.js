// @ts-check
/**
 * WCAG 2.2 contrast table for the colour tokens in public/styles.css, light and dark.
 * Text pairs need 4.5:1 (AA), non-text pairs (field borders, focus ring, icons) need 3:1.
 * Prints a Markdown table for the README and exits 1 when any pair fails.
 * Run: node scripts/contrast.js [path/to/styles.css]
 */
import { readFileSync } from 'node:fs';

/** [foreground token, background token, minimum ratio, what the pair is] */
export const PAIRS = [
  ['ink', 'ground', 4.5, 'body text'],
  ['muted', 'ground', 4.5, 'secondary text'],
  ['muted', 'panel', 4.5, 'secondary text on the input rail'],
  ['accent', 'ground', 4.5, 'links, fact chips, step numbers'],
  ['accent-ink', 'accent', 4.5, 'primary button label'],
  ['ink', 'accent-soft', 4.5, 'selected option text'],
  ['severe', 'ground', 4.5, 'Severe label'],
  ['slate', 'ground', 4.5, 'Uncertain label'],
  ['shell-ink', 'shell', 4.5, 'top bar text'],
  ['folk-ink', 'folk-ground', 4.5, 'advisory text'],
  ['field', 'ground', 3, 'field and button borders'],
  ['accent', 'ground', 3, 'focus ring'],
];

/** Relative luminance of a #RRGGBB colour. */
export function luminance(hex) {
  const [r, g, b] = (hex.replace('#', '').match(/../g) || []).map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of two #RRGGBB colours, 1 to 21. */
export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Tokens declared in one CSS block body: { name: '#RRGGBB' }. */
export function tokensIn(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2].toUpperCase()]));
}

/** Light tokens from the first :root block; dark ones override them from the prefers-color-scheme block. */
export function themes(css) {
  const light = tokensIn(css.match(/:root\s*\{([^}]*)\}/)?.[1] || '');
  const darkBody = css.match(/prefers-color-scheme:\s*dark\)\s*\{[^{]*\{([^}]*)\}/)?.[1] || '';
  return { light, dark: { ...light, ...tokensIn(darkBody) } };
}

/** Table rows for every pair in both themes. */
export function check(css) {
  const rows = [];
  for (const [theme, t] of Object.entries(themes(css))) {
    for (const [fg, bg, min, use] of PAIRS) {
      if (!t[fg] || !t[bg]) continue;
      const r = ratio(t[fg], t[bg]);
      rows.push({ theme, fg, bg, use, ratio: Math.round(r * 100) / 100, min, pass: r >= min });
    }
  }
  return rows;
}

function main() {
  const rows = check(readFileSync(process.argv[2] || 'public/styles.css', 'utf8'));
  console.log('| Theme | Pair | Use | Ratio | Needs | Result |\n| --- | --- | --- | --- | --- | --- |');
  for (const r of rows) console.log(`| ${r.theme} | ${r.fg} on ${r.bg} | ${r.use} | ${r.ratio.toFixed(2)}:1 | ${r.min}:1 | ${r.pass ? 'pass' : 'FAIL'} |`);
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${rows.length} pairs checked, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() || '')) main();
