// @ts-check
/** Going-out helper: indicative inhaled dose, band, best 2-hour window. All numbers from code. */
import { $, el, svg } from './dom.js';
import { t } from './i18n.js';
import { GROUPS, ACTIVITIES, inhaledDose, doseRatio, pm25Band, bestWindow, advice } from '../lib/exposure.js';

let series = [];
let nowIso = '';

/** Latest hour with a PM2.5 value at or before now. */
function currentPm25() {
  const past = series.filter((s) => s.time.slice(0, 13) <= nowIso.slice(0, 13) && s.pm25 != null);
  return past.length ? past[past.length - 1].pm25 : null;
}

/** Gauge across the 6 CPCB bands with a marker at the current band. */
function gauge(index) {
  const cells = [0, 1, 2, 3, 4, 5].map((i) => svg('rect', { x: i * 50, y: 4, width: 48, height: 12, class: `b${i}${i === index ? ' on' : ''}` }));
  return svg('svg', { viewBox: '0 0 300 24', class: 'gauge', role: 'img', 'aria-hidden': 'true' }, ...cells, svg('rect', { x: index * 50 + 20, y: 0, width: 8, height: 24, class: 'mark-b' }));
}

/** Best 2 hours from now to 21:00 local. */
function windowLine() {
  const day = nowIso.slice(0, 10);
  const best = bestWindow(series, { hours: 2, from: `${nowIso.slice(0, 13)}:00`, to: `${day}T21:00` });
  return best ? t('expBest', { start: best.start.slice(11, 16), end: best.end.slice(11, 16), v: best.meanPm25 }) : t('expNoBest');
}

/** Recompute and render the result block. */
function update() {
  const pm = currentPm25();
  const out = $('exp-result');
  if (pm == null) { out.replaceChildren(el('p', {}, t('expNoBest'))); return; }
  const group = $('exp-group').value;
  const activity = $('exp-activity').value;
  const minutes = Math.min(Math.max(Number($('exp-minutes').value) || 0, 0), 720);
  const band = pm25Band(pm);
  const tips = advice(band.index, group);
  out.replaceChildren(
    el('p', { class: 'big-sm' }, t('expDose', { dose: inhaledDose(pm, group, activity, minutes) })),
    el('p', {}, t('expRatio', { r: doseRatio(group, activity, minutes) })),
    gauge(band.index), el('p', {}, t('expBand', { band: band.band, v: pm })),
    el('p', { class: 'best' }, windowLine()),
    tips.watchFor.length ? el('div', { class: 'tips' }, el('h3', {}, t('watch')), el('ul', {}, tips.watchFor.map((x) => el('li', {}, x))), el('h3', {}, t('reduce')), el('ul', {}, tips.reduce.map((x) => el('li', {}, x)))) : null);
}

/** Fill the selects once. */
function fillSelects() {
  if ($('exp-group').options.length) return;
  for (const g of Object.keys(GROUPS)) $('exp-group').append(el('option', { value: g }, t(`group_${g}`)));
  for (const a of ACTIVITIES) $('exp-activity').append(el('option', { value: a }, t(`act_${a}`)));
  $('exp-group').value = 'child';
  for (const id of ['exp-group', 'exp-activity', 'exp-minutes']) $(id).addEventListener('input', update);
}

/**
 * Show the helper for an hourly series from Open-Meteo.
 * @param {{time: string, pm25: number|null}[]} s
 * @param {string} now local ISO time at the location
 */
export function showExposure(s, now) {
  series = s;
  nowIso = now;
  fillSelects();
  $('exposure').hidden = false;
  update();
}
