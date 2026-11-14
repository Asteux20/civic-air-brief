// @ts-check
/**
 * Open-Meteo air quality and geocoding helpers.
 * Shared by the browser (ES module import) and node tests: pure functions, no node: imports.
 * Coordinates are rounded to 2 decimals (about 1 km) before they leave the device and never
 * appear in the table text handed to the rest of the app.
 */

export const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const HOURLY = 'pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide';
const HEADER = 'Site,Date,PM2.5 (ug/m3),PM10 (ug/m3),NO2 (ug/m3),O3 (ug/m3),CO (mg/m3)';
const MAX_SITE = 200;

/**
 * Validate one coordinate and round it to 2 decimals.
 * @param {unknown} value
 * @param {number} limit largest allowed absolute value
 * @param {string} label name used in the error message
 * @returns {string} the value with exactly 2 decimals
 */
function coordinate(value, limit, label) {
  const ok = (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;
  if (!ok) throw new Error(`${label} must be a number between -${limit} and ${limit}.`);
  const text = (Math.round(Number(value) * 100) / 100).toFixed(2);
  return text === '-0.00' ? '0.00' : text;
}

/**
 * Build the Open-Meteo air quality URL for a place.
 * @param {number|string} lat latitude in degrees, -90 to 90
 * @param {number|string} lon longitude in degrees, -180 to 180
 * @returns {string} request URL with coordinates rounded to 2 decimals
 * @throws {Error} when a coordinate is missing or out of range
 */
export function airQualityUrl(lat, lon) {
  const la = coordinate(lat, 90, 'Latitude');
  const lo = coordinate(lon, 180, 'Longitude');
  return `${AQ_URL}?latitude=${la}&longitude=${lo}&hourly=${HOURLY}&timezone=auto&past_days=1&forecast_days=1`;
}

/**
 * Fetch hourly air quality for a place.
 * @param {number|string} lat
 * @param {number|string} lon
 * @param {typeof fetch} [fetchImpl] injectable fetch for tests
 * @returns {Promise<any>} parsed Open-Meteo JSON
 * @throws {Error} with a plain message when the service does not answer
 */
export async function fetchAirQuality(lat, lon, fetchImpl = fetch) {
  const res = await fetchImpl(airQualityUrl(lat, lon));
  if (!res.ok) throw new Error(`The air quality service did not answer (status ${res.status}). Try again in a minute.`);
  return res.json();
}

/**
 * Make a site name safe for one CSV cell.
 * @param {unknown} name
 * @returns {string}
 */
function cleanSite(name) {
  const text = String(name ?? '').replace(/[,\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || 'Site').slice(0, MAX_SITE);
}

/**
 * Format one hourly cell: null or non-finite becomes empty, CO is converted to mg/m3.
 * @param {unknown} v
 * @param {boolean} [isCo] true when the value is carbon monoxide in ug/m3
 * @returns {string}
 */
function cell(v, isCo = false) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  return isCo ? (v / 1000).toFixed(3) : String(v);
}

/**
 * Convert an Open-Meteo hourly response into CSV text the table parser reads.
 * @param {any} json response from fetchAirQuality
 * @param {string} siteName label for the Site column (commas and newlines are removed)
 * @param {string} [now] optional local ISO time such as 2026-11-14T10:00; later hours are dropped
 * @returns {string} CSV with one row per hour and no coordinates
 * @throws {Error} when the response has no hourly data
 */
export function toTable(json, siteName, now) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error('The air quality response had no hourly readings.');
  const site = cleanSite(siteName);
  const cutoff = now ? String(now).slice(0, 13) : null;
  const rows = [HEADER];
  h.time.forEach((t, i) => {
    if (cutoff && String(t).slice(0, 13) > cutoff) return;
    const date = `${String(t).slice(0, 10)} ${String(t).slice(11, 13)}:00`;
    rows.push([site, date, cell(h.pm2_5?.[i]), cell(h.pm10?.[i]), cell(h.nitrogen_dioxide?.[i]),
      cell(h.ozone?.[i]), cell(h.carbon_monoxide?.[i], true)].join(','));
  });
  return rows.join('\n');
}

/**
 * Search Open-Meteo geocoding for a city.
 * @param {string} name city name typed by the user
 * @param {typeof fetch} [fetchImpl] injectable fetch for tests
 * @returns {Promise<{name: string, admin1: string, country: string, latitude: number, longitude: number}[]>}
 * @throws {Error} when the name is blank or the service does not answer
 */
export async function searchCity(name, fetchImpl = fetch) {
  const q = String(name ?? '').trim();
  if (!q) throw new Error('Type a city name first.');
  const res = await fetchImpl(`${GEO_URL}?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
  if (!res.ok) throw new Error(`The city search did not answer (status ${res.status}). Try again in a minute.`);
  const data = await res.json();
  return (data?.results ?? []).map((r) => ({
    name: r.name, admin1: r.admin1 ?? '', country: r.country ?? '',
    latitude: r.latitude, longitude: r.longitude,
  }));
}

/**
 * Pull the PM series out of an Open-Meteo response for the exposure helpers.
 * @param {any} json
 * @returns {{time: string, pm25: number|null, pm10: number|null}[]}
 */
export function hourlySeries(json) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return h.time.map((time, i) => ({ time, pm25: num(h.pm2_5?.[i]), pm10: num(h.pm10?.[i]) }));
}
