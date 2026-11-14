// @ts-check
/** "Use my location": geolocation or city search, then Open-Meteo hourly air into the table box. */
import { $, el } from './dom.js';
import { t } from './i18n.js';
import { fetchAirQuality, searchCity, toTable, hourlySeries } from '../lib/geo.js';
import { showExposure } from './exposure-view.js';

/** Local time at the location, from the response's UTC offset. */
function localNow(json) {
  return new Date(Date.now() + (json.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 16);
}

/**
 * Fetch modelled air for a point and load it as a table. Coordinates are rounded and never stored.
 * @param {number} lat
 * @param {number} lon
 * @param {string} place
 * @param {(msg: string, kind?: string) => void} status
 */
export async function loadPlace(lat, lon, place, status) {
  status(t('locFetching', { place }));
  try {
    const json = await fetchAirQuality(lat, lon);
    const now = localNow(json);
    $('table').value = toTable(json, place, now);
    const note = $('source-note');
    note.textContent = t('modelled');
    note.hidden = false;
    status(t('locLoaded', { n: $('table').value.split('\n').length - 1, place }), 'ok');
    showExposure(hourlySeries(json), now);
    $('table').focus();
  } catch (err) {
    status(err.message, 'err');
  }
}

/** Show the city search with a polite message. */
function showCitySearch() {
  $('city-form').hidden = false;
  $('city').focus();
}

/**
 * Ask the browser for a position; fall back to city search on denial or error.
 * @param {(msg: string, kind?: string) => void} status
 */
export function useMyLocation(status) {
  if (!navigator.geolocation) { showCitySearch(); return; }
  status(t('locAsk'));
  navigator.geolocation.getCurrentPosition(
    (pos) => loadPlace(pos.coords.latitude, pos.coords.longitude, 'My area', status),
    () => { status(''); showCitySearch(); },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
}

/**
 * City search submit: list up to 5 matches as buttons.
 * @param {SubmitEvent} e
 * @param {(msg: string, kind?: string) => void} status
 */
export async function onCitySearch(e, status) {
  e.preventDefault();
  try {
    const found = await searchCity($('city').value);
    if (!found.length) { status(t('noCity'), 'err'); return; }
    $('city-results').replaceChildren(...found.map((c) => el('li', {}, el('button', {
      type: 'button', class: 'btn quiet', onclick: () => loadPlace(c.latitude, c.longitude, c.name, status),
    }, [c.name, c.admin1, c.country].filter(Boolean).join(', ')))));
  } catch (err) {
    status(err.message, 'err');
  }
}
