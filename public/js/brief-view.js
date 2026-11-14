// @ts-check
/** Renders the brief: alerts, worst site, summary, actions, hotspots, then quiet side panels. */
import { el, svg } from './dom.js';
import { t } from './i18n.js';
import { advisoryView, greenView } from './advisory-view.js';

const MAX_ALERTS_SHOWN = 3;
let factMap = new Map();

/**
 * Evidence chips for a list of fact ids, or an Uncertain tag when nothing traces.
 * @param {string[]} ids
 * @param {{verified?: boolean}} [item]
 * @returns {HTMLElement}
 */
export function chips(ids = [], item = {}) {
  const known = ids.filter((id) => factMap.has(id));
  if (!known.length || item.verified === false) return el('span', { class: 'unc' }, t('uncertain'));
  return el('span', { class: 'chips-ev', 'aria-label': t('evidence') }, known.map((id) => el('button', { type: 'button', class: 'fact-chip', 'data-fact': id, 'aria-label': `${t('evidence')} ${id}` }, id)));
}

/** Alerts, 3 shown, the rest behind "show all". */
function alertsView(alerts) {
  if (!alerts.length) return null;
  const item = (a) => el('li', { class: `alert ${a.severity}` }, el('b', {}, a.location), ' ', a.text, ' ', el('span', { class: 'next' }, a.nextStep), ' ', chips(a.factIds));
  const list = el('ul', { class: 'alerts plain' }, alerts.slice(0, MAX_ALERTS_SHOWN).map(item));
  const rest = alerts.slice(MAX_ALERTS_SHOWN);
  const more = rest.length ? el('details', { class: 'more' }, el('summary', {}, t('showAll', { n: alerts.length })), el('ul', { class: 'alerts plain' }, rest.map(item))) : null;
  return el('section', { 'aria-labelledby': 'al-t' }, el('h2', { id: 'al-t', class: 'tag' }, t('alerts')), list, more);
}

/** The worst site as one big number with a scale bar to 4× the limit. */
function worstView(loc) {
  if (!loc) return null;
  const ratio = loc.worstRatio;
  const pct = Math.min(ratio / 4, 1) * 100;
  const bar = svg('svg', { viewBox: '0 0 100 6', class: 'scale', 'aria-hidden': 'true', preserveAspectRatio: 'none' },
    svg('rect', { x: 0, y: 2, width: 100, height: 2, class: 'track' }), svg('rect', { x: 0, y: 1, width: pct, height: 4, class: 'fill' }), svg('rect', { x: 25, y: 0, width: 0.6, height: 6, class: 'limit' }));
  return el('section', { class: 'worst', 'aria-labelledby': 'w-t' }, el('h2', { id: 'w-t', class: 'tag' }, t('worst')),
    el('p', { class: 'big' }, `${ratio.toFixed(1)}×`), el('p', {}, el('b', {}, loc.name), ` ${loc.worstPollutant.toUpperCase().replace('PM25', 'PM2.5')} ${t('limitTimes')}, ${loc.worstBand}`), bar, chips([loc.worstFactId]));
}

/** Ratio bar; width set through CSSOM so the CSP needs no inline styles. */
function bar(ratio) {
  const node = el('span', { class: 'hs-bar', 'aria-hidden': 'true' });
  node.style.setProperty('--w', `${Math.min(ratio / 4, 1) * 100}%`);
  return node;
}

/** Hotspot ranking as code-drawn bars from the computed ratios, with a text table for screen readers. */
function hotspotsView(analysis, brief) {
  const locs = analysis.locations.filter((l) => Number.isFinite(l.worstRatio)).slice(0, 6);
  const why = new Map(brief.hotspots.map((h) => [h.location, h]));
  const row = (l) => el('li', { class: 'hs' }, el('span', { class: 'hs-name' }, l.name, l.confidence === 'low' ? el('small', {}, ` (${t('gConf')}: low)`) : null),
    bar(l.worstRatio), el('span', { class: 'hs-v' }, `${l.worstRatio.toFixed(1)}×`),
    why.get(l.name) ? el('p', { class: 'hs-why' }, why.get(l.name).why, ' ', chips(why.get(l.name).evidence, why.get(l.name))) : null);
  return el('section', { 'aria-labelledby': 'hs-t' }, el('h2', { id: 'hs-t', class: 'tag' }, t('hotspots')), el('ol', { class: 'plain hotspots' }, locs.map(row)));
}

/** Summary, numbered actions and trends: the 1-column reading body. */
function bodyView(data) {
  const { brief } = data;
  const act = (a) => el('li', {}, el('b', {}, a.action), el('span', { class: 'when' }, ` ${a.timeframe}`), el('p', {}, a.why, ' ', chips(a.evidence, a)));
  return [
    el('section', { 'aria-labelledby': 'sum-t' }, el('h2', { id: 'sum-t', class: 'tag', tabindex: '-1' }, t('summary')), el('p', { class: 'lead' }, brief.summary),
      el('p', { class: 'traced' }, t('traced', { v: data.traced?.verified ?? 0, t: data.traced?.total ?? 0 }))),
    el('section', { 'aria-labelledby': 'act-t' }, el('h2', { id: 'act-t', class: 'tag' }, t('actions')), el('ol', { class: 'actions' }, brief.actions.map(act))),
    brief.trends.length ? el('section', { 'aria-labelledby': 'tr-t' }, el('h2', { id: 'tr-t', class: 'tag' }, t('trends')), el('ul', { class: 'plain lines' }, brief.trends.map((x) => el('li', {}, x.text, ' ', chips(x.evidence, x))))) : null,
  ];
}

/** Compare, caveats, flagged rows and the internal note, all quiet and collapsible. */
function sideView(data) {
  const { brief, comparison, issues } = data;
  const flagged = issues.filter((i) => i.type !== 'converted');
  const changeLines = [
    ...comparison.newHotspots.map((h) => `+ ${h}`),
    ...comparison.changes.slice(0, 6).map((c) => c.text),
  ];
  const cmp = comparison.hasPrevious
    ? [el('p', {}, brief.changeNarrative), el('ul', { class: 'plain lines' }, changeLines.map((x) => el('li', {}, x)))]
    : [el('p', { class: 'muted' }, t('firstBrief'))];
  const headers = [t('colRow'), t('colColumn'), t('colIssue')];
  const headRow = el('tr', {}, headers.map((h) => el('th', { scope: 'col' }, h)));
  const bodyRows = flagged.slice(0, 60).map((i) => el('tr', {}, el('td', {}, i.row), el('td', {}, i.column), el('td', {}, i.message)));
  const rows = el('table', {}, el('thead', {}, headRow), el('tbody', {}, bodyRows));
  return el('aside', { class: 'side', 'aria-label': t('compareT') },
    el('section', {}, el('h2', { class: 'tag' }, t('compareT')), ...cmp),
    el('section', {}, el('h2', { class: 'tag' }, t('caveats')), el('ul', { class: 'plain lines' }, brief.dataCaveats.map((c) => el('li', {}, c.text, ' ', chips(c.evidence, c))))),
    el('details', {}, el('summary', {}, `${t('flagged')} (${flagged.length})`), el('div', { class: 'scroll' }, rows)),
    el('details', {}, el('summary', {}, t('note')), el('p', { class: 'note' }, brief.internalNote)));
}

/** Facts drawer: every fact with its source rows. */
function factsView(analysis) {
  return el('details', { class: 'facts', id: 'facts' }, el('summary', {}, `${t('facts')} (${analysis.facts.length})`),
    el('ol', { class: 'plain' }, analysis.facts.map((f) => el('li', { id: `fact-${f.id}`, tabindex: '-1' }, el('b', {}, f.id), ` ${f.text} `, el('span', { class: 'muted' }, `${t('rows')}: ${f.rows.join(', ')}`)))));
}

/** Banner when part of the AI output was missing. */
function banners(data) {
  return [
    data.aiStatus && data.aiStatus !== 'complete' ? el('p', { class: 'banner', role: 'note' }, t('partial')) : null,
  ];
}

/**
 * Render a brief response into the container and return the heading to focus.
 * @param {HTMLElement} out
 * @param {any} data /api/brief response
 * @returns {HTMLElement | null}
 */
export function renderBrief(out, data) {
  factMap = new Map(data.analysis.facts.map((f) => [f.id, f]));
  const main = el('div', { class: 'body' }, ...banners(data), alertsView(data.alerts || []), worstView(data.analysis.locations[0]), ...bodyView(data), hotspotsView(data.analysis, data.brief),
    advisoryView(data.brief.advisories), greenView(data.brief.greenRequest), factsView(data.analysis));
  out.replaceChildren(el('div', { class: 'result' }, main, sideView(data)));
  out.hidden = false;
  return out.querySelector('#sum-t');
}
