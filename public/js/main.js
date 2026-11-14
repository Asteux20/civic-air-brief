// @ts-check
/** Page wiring: home paths, form, progress stages, history and display settings. */
import { $, el } from './dom.js';
import { t, setLanguage } from './i18n.js';
import { renderBrief } from './brief-view.js';
import { useMyLocation, onCitySearch } from './location.js';

const LANGS = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Gujarati', 'Malayalam', 'Punjabi', 'Urdu'];
const HISTORY_KEY = 'airbrief.history.v1';
const STAGES = ['send', 'parse', 'facts', 'write', 'verify'];

const history = {
  read() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } },
  write(list) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 10))); } catch { /* storage blocked */ } },
};

/** Status line under the home paths. */
function status(msg, kind = '') {
  $('data-status').textContent = msg;
  $('data-status').className = `status ${kind}`;
}

/** Language chips, 4 at most, English and Hindi on by default. */
function initLangs() {
  const box = $('langs');
  box.replaceChildren(...LANGS.map((l, i) => el('label', { class: 'chip' }, el('input', { type: 'checkbox', name: 'lang', value: l, checked: i < 2 }), ` ${l}`)));
  box.addEventListener('change', () => {
    const n = box.querySelectorAll('input:checked').length;
    box.querySelectorAll('input').forEach((i) => { i.disabled = !i.checked && n >= 4; });
  });
}

/** Progress list; done stages carry real counts from the response. */
function setStages(state, data) {
  const s = $('stages');
  s.hidden = false;
  const lines = {
    send: t('stSend', { n: $('table').value.trim().split('\n').length }),
    parse: data ? t('stParse', { rows: data.analysis.rowCount, flagged: data.issues.filter((i) => i.type !== 'converted').length }) : t('stWait'),
    facts: data ? t('stFacts', { facts: data.analysis.facts.length, alerts: (data.alerts || []).length }) : t('stWait'),
    write: t('stWrite'),
    verify: data ? t('stVerify', { v: data.traced?.verified ?? 0, t: data.traced?.total ?? 0 }) : t('stWait'),
  };
  s.replaceChildren(...STAGES.map((k, i) => el('li', { class: i < state ? 'done' : i === state ? 'now' : '', 'aria-current': i === state ? 'step' : null }, lines[k])));
}

/** Show a server error next to the field it names. */
function showError(data) {
  const target = { table: 'table-err', code: 'code-err', languages: 'langs-err' }[data.field] || 'form-err';
  $(target).textContent = data.error;
  if (data.field === 'table' || data.field === 'code') $(data.field).setAttribute('aria-invalid', 'true');
}

/** Clear field errors. */
function clearErrors() {
  for (const id of ['table-err', 'code-err', 'langs-err', 'form-err']) $(id).textContent = '';
  for (const id of ['table', 'code']) $(id).removeAttribute('aria-invalid');
}

/** Read the form into a request body, or return null after showing what is missing. */
function readForm() {
  const table = $('table').value;
  const languages = [...document.querySelectorAll('input[name=lang]:checked')].map((i) => /** @type {HTMLInputElement} */ (i).value);
  if (!table.trim()) { showError({ field: 'table', error: t('errTable') }); $('table').focus(); return null; }
  if (!languages.length) { showError({ field: 'languages', error: t('errLangs') }); return null; }
  const role = /** @type {HTMLInputElement} */ (document.querySelector('input[name=role]:checked')).value;
  const readingLevel = /** @type {HTMLInputElement} */ (document.querySelector('input[name=level]:checked')).value;
  const previous = $('compare').checked ? history.read()[0]?.snapshot || null : null;
  return { table, role, languages, readingLevel, previous };
}

/** POST the brief request; returns parsed JSON and ok flag. */
async function requestBrief(body) {
  const res = await fetch('/api/brief', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-access-code': $('code').value }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: 'The server sent an unexpected reply. Reload the page and try again.' }));
  return { ok: res.ok, data };
}

/** Form submit: validate, show stages, call the API, render. */
async function submit(e) {
  e.preventDefault();
  clearErrors();
  const body = readForm();
  if (!body) return;
  $('go').disabled = true;
  setStages(3);
  try {
    const { ok, data } = await requestBrief(body);
    if (!ok) { $('stages').hidden = true; showError(data); return; }
    setStages(5, data);
    renderBrief($('out'), data)?.focus();
    history.write([{ at: data.generatedAt, role: body.role, snapshot: data.snapshot }, ...history.read()]);
    renderHistory();
  } catch {
    $('stages').hidden = true;
    showError({ error: 'Could not reach the server. Check your connection and try again.' });
  } finally {
    $('go').disabled = false;
  }
}

/** Past briefs list. */
function renderHistory() {
  const items = history.read();
  $('history').replaceChildren(...(items.length ? items.map((h) => el('li', {}, `${new Date(h.at).toLocaleString()} · ${h.snapshot.hotspots.join(', ') || '-'}`)) : [el('li', { class: 'muted' }, t('noHistory'))]));
}

/** Text size buttons and the guide toggle. */
function initDisplay() {
  document.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
    document.documentElement.style.fontSize = `${b.getAttribute('data-size')}%`;
    document.querySelectorAll('[data-size]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('help-btn').addEventListener('click', () => { $('guide').open = true; $('guide').scrollIntoView({ block: 'start' }); $('guide').querySelector('summary').focus(); });
  $('guide').addEventListener('toggle', () => $('help-btn').setAttribute('aria-expanded', String($('guide').open)));
  $('ui-lang').addEventListener('change', () => { setLanguage($('ui-lang').value); renderHistory(); });
}

/** Load the sample table. */
async function loadSample() {
  const res = await fetch('sample-messy.csv');
  $('table').value = await res.text();
  $('source-note').hidden = true;
  status(t('loadedSample'), 'ok');
  $('setup-title').scrollIntoView({ block: 'start' });
}

/** Read an uploaded file into the table box (300 KB cap). */
async function loadFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 300000) { showError({ field: 'table', error: 'That file is over 300 KB. Split it by month or by site and upload again.' }); return; }
  $('table').value = await f.text();
  $('source-note').hidden = true;
}

/** Fact chips open the facts drawer at that fact. */
function onFactChip(e) {
  const chip = /** @type {HTMLElement} */ (e.target).closest('[data-fact]');
  if (!chip) return;
  const target = $(`fact-${chip.getAttribute('data-fact')}`);
  if (!target) return;
  $('facts').open = true;
  document.querySelectorAll('.hl').forEach((n) => n.classList.remove('hl'));
  target.classList.add('hl');
  target.focus();
}

initLangs();
initDisplay();
renderHistory();
$('sample-btn').addEventListener('click', loadSample);
$('loc-btn').addEventListener('click', () => useMyLocation(status));
$('city-form').addEventListener('submit', (e) => onCitySearch(e, status));
$('file').addEventListener('change', loadFile);
$('form').addEventListener('submit', submit);
$('clear').addEventListener('click', () => { history.write([]); renderHistory(); });
document.addEventListener('click', onFactChip);
