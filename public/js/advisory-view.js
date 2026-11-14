// @ts-check
/** Citizen advisory card with language tabs, and the trees or green buffer letter. */
import { el, copyText } from './dom.js';
import { t } from './i18n.js';

const LANG_CODES = { English: 'en', Hindi: 'hi', Marathi: 'mr', Tamil: 'ta', Telugu: 'te', Bengali: 'bn', Kannada: 'kn', Gujarati: 'gu', Malayalam: 'ml', Punjabi: 'pa', Urdu: 'ur' };
const GROUPS = [['children', 'children'], ['olderAdults', 'older'], ['sensitiveGroups', 'sensitive'], ['outdoorWorkers', 'workers']];
const PORTAL = 'https://pgportal.gov.in/';

/** Plain text of one advisory, for WhatsApp. */
function advisoryText(a) {
  return [`*${a.headline}*`, a.general, ...GROUPS.map(([k, label]) => `${t(label)}: ${a[k]}`)].join('\n\n');
}

/** One tab panel. */
function panel(a, i) {
  const copy = el('button', { type: 'button', class: 'btn quiet' }, t('copyWa'));
  copy.addEventListener('click', () => copyText(advisoryText(a), copy, t('copied')));
  const groups = GROUPS.map(([k, label]) => el('div', { class: 'grp' }, el('h4', {}, t(label)), el('p', {}, a[k])));
  const printBtn = el('button', { type: 'button', class: 'btn quiet', onclick: () => window.print() }, t('print'));
  return el('div', {
    role: 'tabpanel', id: `adv-${i}`, 'aria-labelledby': `adv-${i}-tab`,
    lang: LANG_CODES[a.language] || 'en', dir: a.language === 'Urdu' ? 'rtl' : 'ltr',
    hidden: i !== 0, class: 'adv',
  }, el('h3', {}, a.headline), el('p', {}, a.general), el('div', { class: 'groups' }, groups), el('div', { class: 'row' }, copy, printBtn));
}

/** Move selection to a tab. */
function select(tabs, tab) {
  for (const x of tabs.children) {
    const on = x === tab;
    x.setAttribute('aria-selected', String(on));
    x.tabIndex = on ? 0 : -1;
    document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
  }
}

/** Arrow, Home and End keys between tabs. */
function onKey(tabs, e) {
  const all = [...tabs.children];
  const i = all.indexOf(document.activeElement);
  const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: all.length - 1 };
  if (!(e.key in map)) return;
  const next = all[(map[e.key] + all.length) % all.length];
  select(tabs, next);
  next.focus();
  e.preventDefault();
}

/**
 * Advisory card for every returned language.
 * @param {any[]} advisories
 * @returns {HTMLElement | null}
 */
export function advisoryView(advisories) {
  if (!advisories?.length) return null;
  const tab = (a, i) => el('button', {
    type: 'button', role: 'tab', id: `adv-${i}-tab`, 'aria-controls': `adv-${i}`,
    'aria-selected': String(i === 0), tabindex: i === 0 ? '0' : '-1',
    lang: LANG_CODES[a.language] || '',
  }, a.language);
  const tabs = el('div', { role: 'tablist', class: 'tabs', 'aria-label': t('advisory') }, advisories.map(tab));
  tabs.addEventListener('click', (e) => {
    const x = /** @type {HTMLElement} */ (e.target).closest('[role=tab]');
    if (x) select(tabs, x);
  });
  tabs.addEventListener('keydown', (e) => onKey(tabs, e));
  const heading = el('h2', { id: 'adv-t', class: 'tag' }, t('advisory'));
  return el('section', { class: 'folk', 'aria-labelledby': 'adv-t' }, heading, tabs, advisories.map(panel));
}

/**
 * Draft letter asking the ward office for trees or a green buffer, from Gemini's cited output.
 * @param {{subject: string, body: string, evidence: string[]} | null} g
 * @returns {HTMLElement | null}
 */
export function greenView(g) {
  if (!g) return null;
  const text = `${g.subject}\n\n${g.body}`;
  const copy = el('button', { type: 'button', class: 'btn quiet' }, t('copyWa'));
  copy.addEventListener('click', () => copyText(text, copy, t('copied')));
  return el('section', { class: 'green', 'aria-labelledby': 'g-t' }, el('h2', { id: 'g-t', class: 'tag' }, t('green')), el('p', { class: 'hint' }, t('greenD')),
    el('h3', {}, g.subject), el('p', { class: 'letter' }, g.body),
    el('div', { class: 'row' }, copy, el('button', { type: 'button', class: 'btn quiet', onclick: () => window.print() }, t('print'))),
    el('p', { class: 'hint' }, t('portal'), ' ', el('a', { href: PORTAL, rel: 'noopener', target: '_blank' }, 'pgportal.gov.in')));
}
