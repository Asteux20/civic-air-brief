/**
 * Messy air-quality table parser.
 *
 * Turns pasted or uploaded text (CSV, TSV, semicolon, pipe or space aligned)
 * into normalised readings. Every reading and every issue keeps the source
 * row number so findings stay traceable to the data the user supplied.
 */

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

/** Normalise a header cell to a comparable token. */
function headerToken(raw) {
  return String(raw).toLowerCase().replace(/[^a-z0-9.%µμ/³]+/g, ' ').trim();
}

/** Identify which field a header describes. Returns a key or null. */
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

/** Detect the unit written in a header or a cell. */
export function detectUnit(text) {
  const t = String(text).toLowerCase();
  if (/mg\s*\/\s*m(3|³)/.test(t)) return 'mg/m3';
  if (/(µg|μg|ug|mcg)\s*\/?\s*m(3|³)?/.test(t)) return 'ug/m3';
  if (/\bppb\b/.test(t)) return 'ppb';
  if (/\bppm\b/.test(t)) return 'ppm';
  return null;
}

/** Split one line respecting double quotes. */
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

/** Pick the delimiter that splits the first lines most consistently. */
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

/** Parse a date in ISO, day-first (India) or free text. Returns ISO or null. */
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

/** Convert a value to the canonical unit for its pollutant. */
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

const round = (n) => Math.round(n * 10) / 10;

/**
 * Parse raw table text.
 * @param {string} text
 * @returns {{columns: object[], readings: object[], issues: object[], rowCount: number, delimiter: string}}
 */
export function parseTable(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('The table is empty. Paste or upload a table with a header row.');
  }
  // Keep the original 1-based line number so evidence points at the user's real rows.
  const numbered = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line, i) => ({ line, row: i + 1 }))
    .filter(({ line }) => line.trim() && !line.trim().startsWith('#'));
  if (numbered.length < 2) throw new Error('Need a header row and at least one data row.');
  if (numbered.length - 1 > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS}).`);
  const lines = numbered.map((n) => n.line);

  const delimiter = detectDelimiter(lines);
  const header = splitLine(lines[0], delimiter);
  const columns = header.map((raw, index) => ({ index, raw, key: classifyHeader(raw), unit: detectUnit(raw) }));

  const pollutantCols = columns.filter((c) => c.key && POLLUTANTS[c.key]);
  if (!pollutantCols.length) {
    throw new Error('No pollutant columns found. Expected headers such as PM2.5, PM10, NO2, O3, SO2, CO or AQI.');
  }
  const locationCol = columns.find((c) => c.key === 'location');
  const timeCol = columns.find((c) => c.key === 'time');

  const readings = [];
  const issues = [];
  const seen = new Set();

  numbered.slice(1).forEach(({ line, row }) => {
    const cells = splitLine(line, delimiter);
    const rowReadings = [];
    const key = cells.join('|').toLowerCase();
    if (seen.has(key)) {
      issues.push({ row, column: '*', type: 'duplicate', message: 'Duplicate row ignored', rawValue: '' });
      return;
    }
    seen.add(key);

    const location = (locationCol && cells[locationCol.index]) || 'Unspecified location';
    const rawTime = timeCol ? cells[timeCol.index] : '';
    const time = timeCol ? parseTime(rawTime) : null;
    if (timeCol && rawTime && !time) {
      issues.push({ row, column: timeCol.raw, type: 'bad_time', message: 'Date/time not understood', rawValue: rawTime });
    }

    const rowValues = {};
    for (const col of pollutantCols) {
      const raw = cells[col.index] ?? '';
      const token = raw.trim().toLowerCase();
      if (NULL_TOKENS.has(token)) {
        issues.push({ row, column: col.raw, type: 'missing', message: 'Missing reading', rawValue: raw, location });
        continue;
      }
      const num = parseNumber(token);
      if (Number.isNaN(num)) {
        issues.push({ row, column: col.raw, type: 'non_numeric', message: 'Not a number', rawValue: raw, location });
        continue;
      }
      if (num < 0) {
        issues.push({ row, column: col.raw, type: 'negative', message: 'Negative reading (sensor fault)', rawValue: raw, location });
        continue;
      }
      const unit = detectUnit(raw) || col.unit;
      const { value, converted } = toCanonical(col.key, num, unit);
      if (value > POLLUTANTS[col.key].max) {
        issues.push({ row, column: col.raw, type: 'implausible', message: `Implausibly high for ${POLLUTANTS[col.key].label}`, rawValue: raw, location });
        continue;
      }
      if (converted) {
        issues.push({ row, column: col.raw, type: 'converted', message: `Converted ${unit} to ${POLLUTANTS[col.key].unit}`, rawValue: raw, location });
      }
      rowValues[col.key] = round(value);
      const reading = { row, location, time, pollutant: col.key, value: round(value), rawValue: raw };
      readings.push(reading);
      rowReadings.push(reading);
    }

    if (rowValues.pm25 !== undefined && rowValues.pm10 !== undefined && rowValues.pm25 > rowValues.pm10) {
      issues.push({ row, column: 'PM2.5 vs PM10', type: 'inconsistent', message: 'PM2.5 above PM10 (physically unlikely)', rawValue: `${rowValues.pm25} > ${rowValues.pm10}`, location });
      for (const r of rowReadings) if (r.pollutant === 'pm25' || r.pollutant === 'pm10') r.suspect = true;
    }
  });

  flagFlatlines(readings, issues);

  return { columns, readings, issues, rowCount: numbered.length - 1, delimiter };
}

/**
 * Parse a numeric cell. "1,5" (1-2 digits after the comma) is a decimal comma,
 * "1,500" is a thousands separator. Leading <, >, ~ are tolerated.
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
          message: `Same value ${run[0].value} repeated ${run.length} times (possible stuck sensor), rows ${run[0].row}-${run[run.length - 1].row}`,
          rawValue: String(run[0].value),
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
