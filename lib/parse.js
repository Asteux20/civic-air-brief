// @ts-check
/**
 * Messy air-quality table parser.
 *
 * Turns pasted or uploaded text (CSV, TSV, semicolon, pipe or space aligned)
 * into normalised readings. Every reading and every issue keeps the source
 * row number so findings stay traceable to the data the user supplied.
 */

/** The 7 pollutants the app understands: display label, canonical unit and the highest plausible value. */
export const POLLUTANTS = {
  pm25: { label: 'PM2.5', unit: 'µg/m³', max: 1000 },
  pm10: { label: 'PM10', unit: 'µg/m³', max: 2000 },
  no2: { label: 'NO₂', unit: 'µg/m³', max: 1000 },
  o3: { label: 'O₃', unit: 'µg/m³', max: 1000 },
  so2: { label: 'SO₂', unit: 'µg/m³', max: 1000 },
  co: { label: 'CO', unit: 'mg/m³', max: 50 },
  aqi: { label: 'AQI', unit: 'index', max: 500 },
};

const NULL_TOKENS = new Set([
  '', 'na', 'n/a', 'nan', 'null', 'none', '-', '--', '---', 'missing', 'err',
  'error', '#n/a', '?', 'nil', 'offline', 'no data', 'nd',
]);

// Gas conversion factors at 25 °C, 1 atm (ppb -> µg/m³).
const PPB_TO_UG = { no2: 1.88, o3: 1.96, so2: 2.62 };
const CO_PPM_TO_MG = 1.145;

const MAX_ROWS = 5000;
const MAX_NAME = 200; // same cap lib/schema.js puts on saved snapshot site names

/** Normalise a header cell to a comparable token. */
function headerToken(raw) {
  return String(raw).toLowerCase().replace(/[^a-z0-9.%µμ/³]+/g, ' ').trim();
}

/**
 * Identify which field a header describes.
 * @param {string} raw header cell text
 * @returns {string|null} a POLLUTANTS key, 'time', 'location', or null when unrecognised
 */
export function classifyHeader(raw) {
  const h = headerToken(raw);
  const compact = h.replace(/[\s._]/g, '');
  if (/pm2\.?5|pm25|fine particulate/.test(compact) || /pm 2 5/.test(h)) return 'pm25';
  if (/pm10/.test(compact)) return 'pm10';
  if (/^no2|nitrogendioxide/.test(compact)) return 'no2';
  if (/^o3|ozone/.test(compact)) return 'o3';
  if (/^so2|sulphurdioxide|sulfurdioxide/.test(compact)) return 'so2';
  if (/^co(\b|mg|ppm|ppb|ug|µg|μg|$)|carbonmonoxide/.test(compact)) return 'co';
  if (/^aqi|airqualityindex/.test(compact)) return 'aqi';
  if (/date|time|timestamp|day|recorded|reading at|hour/.test(h)) return 'time';
  if (/station|location|site|ward|area|sensor|place|zone|locality|monitor|name|block|society|school/.test(h)) {
    return 'location';
  }
  return null;
}

/**
 * Detect the unit written in a header or a cell.
 * @param {string} text header or cell text
 * @returns {'mg/m3'|'ug/m3'|'ppb'|'ppm'|null} null when no unit is written
 */
export function detectUnit(text) {
  const t = String(text).toLowerCase();
  if (/mg\s*\/\s*m(3|³)/.test(t)) return 'mg/m3';
  if (/(µg|μg|ug|mcg)\s*\/?\s*m(3|³)?/.test(t)) return 'ug/m3';
  if (/\bppb\b/.test(t)) return 'ppb';
  if (/\bppm\b/.test(t)) return 'ppm';
  return null;
}

/**
 * Split one line respecting double quotes.
 * @param {string} line
 * @param {string} delimiter a single character, or 'spaces' to split on runs of 2 or more spaces
 * @returns {string[]} trimmed cells
 */
export function splitLine(line, delimiter) {
  if (delimiter === 'spaces') return line.trim().split(/\s{2,}/);
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Pick the delimiter that splits the first 10 lines most consistently.
 * @param {string[]} lines non-blank table lines, header first
 * @returns {string} ',', tab, ';', '|' or 'spaces' when none splits into 2 or more cells
 */
export function detectDelimiter(lines) {
  const sample = lines.slice(0, 10);
  let best = { delimiter: 'spaces', score: 0 };
  for (const d of [',', '\t', ';', '|']) {
    const counts = sample.map((l) => splitLine(l, d).length);
    const first = counts[0];
    if (first < 2) continue;
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * first;
    if (score > best.score) best = { delimiter: d, score };
  }
  return best.delimiter;
}

/**
 * Parse a date in ISO, day-first (India) or free text.
 * @param {unknown} raw cell text
 * @returns {string|null} ISO timestamp, or null when empty or not understood
 */
export function parseTime(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // Explicit timezone (Z or +05:30): trust the full timestamp.
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return toIso(+m[1], +m[2], +m[3], m[4], m[5]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return toIso(year, +m[2], +m[1], m[4], m[5]);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function toIso(y, mo, d, hh, mm) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, Number(hh ?? 0), Number(mm ?? 0)));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Convert a value to the canonical unit for its pollutant.
 * @param {string} pollutant key of POLLUTANTS
 * @param {number} value value as written
 * @param {string|null} unit unit from detectUnit, null leaves the value as is
 * @returns {{value: number, converted: boolean}} converted is true when the value changed unit
 */
export function toCanonical(pollutant, value, unit) {
  if (!unit) return { value, converted: false };
  if (pollutant === 'co') {
    if (unit === 'ppm') return { value: value * CO_PPM_TO_MG, converted: true };
    if (unit === 'ppb') return { value: (value / 1000) * CO_PPM_TO_MG, converted: true };
    if (unit === 'ug/m3') return { value: value / 1000, converted: true };
    return { value, converted: false };
  }
  if (pollutant === 'aqi') return { value, converted: false };
  if (unit === 'mg/m3') return { value: value * 1000, converted: true };
  if (unit === 'ppb' && PPB_TO_UG[pollutant]) return { value: value * PPB_TO_UG[pollutant], converted: true };
  if (unit === 'ppm' && PPB_TO_UG[pollutant]) {
    return { value: value * 1000 * PPB_TO_UG[pollutant], converted: true };
  }
  return { value, converted: false };
}

/**
 * One decimal place, for display text only. Comparisons always use raw values.
 * @param {number} n
 * @returns {number}
 */
export const fmt = (n) => Math.round(n * 10) / 10;

/**
 * Split text into non-blank, non-comment lines, keeping the 1-based source line number.
 * @param {string} text
 * @returns {{line: string, row: number}[]}
 * @throws {Error} when the text is empty, has no data row or has too many rows
 */
export function numberLines(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('The table is empty. Paste or upload a table with a header row.');
  }
  const numbered = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line, i) => ({ line, row: i + 1 }))
    .filter(({ line }) => line.trim() && !line.trim().startsWith('#'));
  if (numbered.length < 2) throw new Error('Only a header row was found. Add at least one row of readings under it.');
  if (numbered.length - 1 > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS}). Split the table by month or by site and try again.`);
  return numbered;
}

/**
 * Classify the header row into pollutant, location and time columns.
 * @param {string} line
 * @param {string} delimiter
 * @returns {{columns: object[], pollutantCols: object[], locationCol?: object, timeCol?: object}}
 * @throws {Error} when no pollutant column is recognised
 */
export function readHeader(line, delimiter) {
  const columns = splitLine(line, delimiter).map((raw, index) => ({ index, raw, key: classifyHeader(raw), unit: detectUnit(raw) }));
  const pollutantCols = columns.filter((c) => c.key && POLLUTANTS[c.key]);
  if (!pollutantCols.length) {
    throw new Error('No pollutant columns found. Check the header row: use names such as PM2.5, PM10, NO2, O3, SO2, CO or AQI.');
  }
  return {
    columns,
    pollutantCols,
    locationCol: columns.find((c) => c.key === 'location'),
    timeCol: columns.find((c) => c.key === 'time'),
  };
}

/**
 * Read one pollutant cell into a canonical value, or say why it cannot be used.
 * @param {string} raw cell text
 * @param {{key: string, unit: string|null}} col
 * @returns {{value: number, converted: boolean, unit: string|null} | {issue: [string, string]}}
 */
export function parseCell(raw, col) {
  const token = raw.trim().toLowerCase();
  if (NULL_TOKENS.has(token)) return { issue: ['missing', 'Missing reading'] };
  const num = parseNumber(token);
  if (Number.isNaN(num)) return { issue: ['non_numeric', 'Not a number'] };
  if (num < 0) return { issue: ['negative', 'Negative reading (sensor fault)'] };
  const unit = detectUnit(raw) || col.unit;
  const { value, converted } = toCanonical(col.key, num, unit);
  if (value > POLLUTANTS[col.key].max) return { issue: ['implausible', `Implausibly high for ${POLLUTANTS[col.key].label}`] };
  return { value, converted, unit };
}

/** Flag PM2.5 above PM10 in the same row, compared on raw values, and mark both readings suspect. */
function markInconsistent(rowReadings, row, location, issues) {
  const pm25 = rowReadings.find((r) => r.pollutant === 'pm25');
  const pm10 = rowReadings.find((r) => r.pollutant === 'pm10');
  if (!pm25 || !pm10 || pm25.value <= pm10.value) return;
  issues.push({ row, column: 'PM2.5 vs PM10', type: 'inconsistent', message: 'PM2.5 above PM10 (physically unlikely)', rawValue: `${fmt(pm25.value)} > ${fmt(pm10.value)}`, location });
  pm25.suspect = true;
  pm10.suspect = true;
}

/** Read the time cell, recording an issue when a date is present but not understood. */
function readTime(cells, row, timeCol, issues) {
  if (!timeCol) return null;
  const rawTime = cells[timeCol.index] || '';
  const time = parseTime(rawTime);
  if (rawTime && !time) issues.push({ row, column: timeCol.raw, type: 'bad_time', message: 'Date/time not understood', rawValue: rawTime });
  return time;
}

/**
 * Turn one data row into readings and issues. Values stay unrounded.
 * @param {string[]} cells
 * @param {number} row source line number
 * @param {ReturnType<typeof readHeader>} header
 * @returns {{readings: import('./types.js').Reading[], issues: import('./types.js').Issue[]}}
 */
export function parseRow(cells, row, header) {
  // Site names reach the prompt and the UI: drop control characters and cap at the snapshot limit.
  const name = header.locationCol ? String(cells[header.locationCol.index] || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME) : '';
  const location = name || 'Unspecified location';
  const issues = [];
  const readings = [];
  const time = readTime(cells, row, header.timeCol, issues);
  for (const col of header.pollutantCols) {
    const raw = cells[col.index] ?? '';
    const cell = parseCell(raw, col);
    if ('issue' in cell) {
      issues.push({ row, column: col.raw, type: cell.issue[0], message: cell.issue[1], rawValue: raw, location });
      continue;
    }
    if (cell.converted) {
      issues.push({ row, column: col.raw, type: 'converted', message: `Converted ${cell.unit} to ${POLLUTANTS[col.key].unit}`, rawValue: raw, location });
    }
    readings.push({ row, location, time, pollutant: col.key, value: cell.value, rawValue: raw });
  }
  markInconsistent(readings, row, location, issues);
  return { readings, issues };
}

/**
 * Parse raw table text into readings with source rows and data-quality issues.
 * @param {string} text pasted or uploaded table
 * @returns {import('./types.js').ParseResult}
 * @throws {Error} with a message that says how to fix the table
 */
export function parseTable(text) {
  const numbered = numberLines(text);
  const delimiter = detectDelimiter(numbered.map((n) => n.line));
  const header = readHeader(numbered[0].line, delimiter);
  const readings = [];
  const issues = [];
  const seen = new Set();
  for (const { line, row } of numbered.slice(1)) {
    const cells = splitLine(line, delimiter);
    const key = cells.join('|').toLowerCase();
    if (seen.has(key)) {
      issues.push({ row, column: '*', type: 'duplicate', message: 'Duplicate row ignored', rawValue: '' });
      continue;
    }
    seen.add(key);
    const parsed = parseRow(cells, row, header);
    readings.push(...parsed.readings);
    issues.push(...parsed.issues);
  }
  flagFlatlines(readings, issues);
  return { columns: header.columns, readings, issues, rowCount: numbered.length - 1, delimiter };
}

/**
 * Parse a numeric cell. "1,5" (1-2 digits after the comma) is a decimal comma,
 * "1,500" is a thousands separator. Leading <, >, ~ are tolerated.
 * @param {string} token lower-case cell text
 * @returns {number} the number, or NaN when the text has none
 */
export function parseNumber(token) {
  let t = String(token).trim();
  if (/^-?\d+,\d{1,2}(\D|$)/.test(t)) t = t.replace(',', '.');
  t = t.replace(/,/g, '');
  const match = t.match(/^[<>~≈]?\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)/i);
  return match ? Number(match[1]) : NaN;
}

/** Flag 4+ identical consecutive readings from one sensor as a likely stuck sensor. */
function flagFlatlines(readings, issues) {
  const groups = new Map();
  for (const r of readings) {
    const k = `${r.location}::${r.pollutant}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const list of groups.values()) {
    let run = [list[0]];
    const flush = () => {
      if (run.length >= 4) {
        for (const r of run) r.suspect = true;
        issues.push({
          row: run[0].row,
          column: POLLUTANTS[run[0].pollutant].label,
          type: 'flatline',
          message: `Same value ${fmt(run[0].value)} repeated ${run.length} times (possible stuck sensor), rows ${run[0].row}-${run[run.length - 1].row}`,
          rawValue: String(fmt(run[0].value)),
          location: run[0].location,
        });
      }
    };
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].value === run[0].value) run.push(list[i]);
      else {
        flush();
        run = [list[i]];
      }
    }
    flush();
  }
}
