// Client for Air Briefing Studio. All rendering uses textContent (no innerHTML with data).
const LANGS = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Gujarati', 'Malayalam', 'Punjabi'];
const LANG_CODES = { English: 'en', Hindi: 'hi', Marathi: 'mr', Tamil: 'ta', Telugu: 'te', Bengali: 'bn', Kannada: 'kn', Gujarati: 'gu', Malayalam: 'ml', Punjabi: 'pa' };
const ROLE_NAMES = { ward_officer: 'Ward officer', housing_society: 'Housing society', school: 'School' };
const HISTORY_KEY = 'airbrief.history.v1';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return node;
};

const store = {
  read() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } },
  write(list) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 10))); } catch { /* storage unavailable */ } },
};

let facts = new Map();

function initLangs() {
  const box = $('langs');
  LANGS.forEach((l, i) => {
    box.append(el('label', { class: 'chip' }, el('input', { type: 'checkbox', name: 'lang', value: l, ...(i < 2 ? { checked: '' } : {}) }), ` ${l}`));
  });
  box.addEventListener('change', () => {
    const checked = [...box.querySelectorAll('input:checked')];
    box.querySelectorAll('input').forEach((i) => { i.disabled = !i.checked && checked.length >= 4; });
  });
}

function setStatus(msg, kind = '') {
  const s = $('status');
  s.textContent = msg;
  s.className = `status ${kind}`;
}

function evidenceLinks(ids, item = {}) {
  const warn = item.verified === false ? el('span', { class: 'badge warn' }, `Unverified: ${item.unverifiedReason || 'no data cited'}`) : null;
  if (!ids?.length) return warn || el('span', { class: 'badge warn' }, 'Unverified: no data cited');
  return el('span', { class: 'ev' }, warn, ' Evidence: ', ...ids.map((id) => el('button', { type: 'button', class: 'fact-link', 'aria-label': `Show fact ${id}`, onclick: () => showFact(id) }, id)));
}

function showFact(id) {
  const target = document.getElementById(`fact-${id}`);
  if (!target) return;
  document.querySelectorAll('.fact.hl').forEach((n) => n.classList.remove('hl'));
  target.classList.add('hl');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus();
}

function list(container, title, items, render) {
  container.replaceChildren(el('h3', {}, title));
  if (!items.length) { container.append(el('p', { class: 'muted' }, 'Nothing to report.')); return; }
  container.append(el('ul', { class: 'items' }, items.map((it) => el('li', {}, ...render(it)))));
}

function render(data) {
  const { brief, analysis, comparison, issues } = data;
  facts = new Map(analysis.facts.map((f) => [f.id, f]));
  $('out').hidden = false;

  const period = analysis.period ? `${analysis.period.from.slice(0, 10)} to ${analysis.period.to.slice(0, 10)}` : 'no dates found';
  $('summary-card').replaceChildren(
    el('div', { class: 'head' }, el('h3', {}, `Brief for ${ROLE_NAMES[data.role]}`), el('span', { class: 'muted' }, `${new Date(data.generatedAt).toLocaleString()} · ${data.model}`)),
    el('p', { class: 'summary' }, brief.summary),
    el('ul', { class: 'stats' },
      el('li', {}, el('strong', {}, analysis.rowCount), ' rows read'),
      el('li', {}, el('strong', {}, analysis.validReadings), ' valid readings'),
      el('li', {}, el('strong', {}, analysis.hotspots.length), ' hotspots'),
      el('li', {}, el('strong', {}, period))),
    data.unverifiedCount ? el('p', { class: 'badge warn' }, `${data.unverifiedCount} AI statement(s) did not cite data and are marked unverified.`) : null,
    data.unsupportedNumbers?.length ? el('p', { class: 'badge warn' }, `Check: the summary or note mentions numbers not found in your data (${data.unsupportedNumbers.join(', ')}).`) : null,
    data.missingLanguages?.length ? el('p', { class: 'badge warn' }, `Gemini did not return: ${data.missingLanguages.join(', ')}. Try again.`) : null,
  );

  const ch = $('changes');
  ch.replaceChildren(el('h3', {}, 'What changed since the last brief'));
  if (!comparison.hasPrevious) ch.append(el('p', { class: 'muted' }, 'First brief on this device. The next one will be compared with this.'));
  else {
    ch.append(el('p', {}, brief.changeNarrative));
    ch.append(el('ul', { class: 'items' },
      comparison.newHotspots.map((h) => el('li', { class: 'worse' }, `New hotspot: ${h}`)),
      comparison.resolvedHotspots.map((h) => el('li', { class: 'better' }, `No longer a hotspot: ${h}`)),
      comparison.changes.slice(0, 8).map((c) => el('li', { class: c.type === 'worse' ? 'worse' : c.type === 'better' ? 'better' : '' }, c.text)),
      el('li', {}, `Flagged data issues: ${comparison.issueDelta >= 0 ? '+' : ''}${comparison.issueDelta}`)));
  }

  const q = $('quality');
  const flagged = issues.filter((i) => i.type !== 'converted');
  q.replaceChildren(el('h3', {}, `Data gaps and unreliable readings (${flagged.length})`));
  q.append(el('ul', { class: 'items' }, brief.dataCaveats.map((c) => el('li', {}, c.text, ' ', evidenceLinks(c.evidence, c)))));
  if (issues.length) {
    const table = el('table', {}, el('caption', { class: 'sr-only' }, 'Flagged rows'),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Row'), el('th', { scope: 'col' }, 'Column'), el('th', { scope: 'col' }, 'Issue'), el('th', { scope: 'col' }, 'Raw'))),
      el('tbody', {}, issues.slice(0, 60).map((i) => el('tr', {}, el('td', {}, i.row), el('td', {}, i.column), el('td', {}, i.message), el('td', {}, i.rawValue)))));
    q.append(el('details', {}, el('summary', {}, 'Show flagged rows'), el('div', { class: 'scroll' }, table)));
  }

  list($('hotspots'), 'Likely hotspots', brief.hotspots, (h) => [el('strong', {}, h.location), ` ${h.why} `, evidenceLinks(h.evidence, h)]);
  list($('actions'), `Prioritised actions for ${ROLE_NAMES[data.role]}`, brief.actions, (a) => [
    el('span', { class: 'prio' }, `P${a.priority}`), ' ', el('strong', {}, a.action), el('span', { class: 'muted' }, ` · ${a.timeframe}`), el('br'), a.why, ' ', evidenceLinks(a.evidence, a)]);
  list($('trends'), 'Trends', brief.trends, (t) => [t.text, ' ', evidenceLinks(t.evidence, t)]);
  $('note').textContent = brief.internalNote;

  renderAdvisories(brief.advisories);

  $('facts').replaceChildren(el('h3', {}, 'Source facts (computed from your table)'),
    el('p', { class: 'muted' }, 'Each fact lists the table rows it comes from (header = row 1).'),
    el('ol', { class: 'facts' }, analysis.facts.map((f) => el('li', { id: `fact-${f.id}`, class: 'fact', tabindex: '-1' }, el('strong', {}, `${f.id} `), f.text, el('span', { class: 'muted' }, ` Rows: ${f.rows.join(', ')}`)))));
  $('summary-card').scrollIntoView({ behavior: 'smooth' });
}

function renderAdvisories(advisories) {
  const tabs = $('adv-tabs');
  const panels = $('adv-panels');
  tabs.replaceChildren();
  panels.replaceChildren();
  advisories.forEach((a, i) => {
    const id = `adv-${i}`;
    const tab = el('button', { type: 'button', role: 'tab', id: `${id}-tab`, 'aria-controls': id, 'aria-selected': String(i === 0), tabindex: i === 0 ? '0' : '-1', class: 'tab' }, a.language);
    const panel = el('div', { role: 'tabpanel', id, 'aria-labelledby': `${id}-tab`, lang: LANG_CODES[a.language] || '', class: 'adv' },
      el('h4', {}, a.headline), el('p', {}, a.general),
      el('h5', {}, 'Children'), el('p', {}, a.children),
      el('h5', {}, 'Older adults'), el('p', {}, a.olderAdults),
      el('h5', {}, 'Asthma, heart or lung conditions, pregnancy'), el('p', {}, a.sensitiveGroups));
    if (i !== 0) panel.hidden = true;
    tabs.append(tab);
    panels.append(panel);
  });
  tabs.onclick = (e) => { const t = e.target.closest('[role=tab]'); if (t) selectTab(t); };
  tabs.onkeydown = (e) => {
    const all = [...tabs.children];
    const i = all.indexOf(document.activeElement);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
      selectTab(next);
      next.focus();
    }
  };
}

function selectTab(tab) {
  for (const t of $('adv-tabs').children) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !on;
  }
}

function renderHistory() {
  const items = store.read();
  $('history').replaceChildren(...(items.length ? items.map((h) => el('li', {}, `${new Date(h.at).toLocaleString()} · ${ROLE_NAMES[h.role]} · hotspots: ${h.snapshot.hotspots.join(', ') || 'none'}`)) : [el('li', { class: 'muted' }, 'No briefs yet.')]));
}

async function submit(e) {
  e.preventDefault();
  const table = $('table').value;
  const role = document.querySelector('input[name=role]:checked').value;
  const languages = [...document.querySelectorAll('input[name=lang]:checked')].map((i) => i.value);
  const readingLevel = document.querySelector('input[name=level]:checked').value;
  if (!table.trim()) { setStatus('Paste or upload a table first.', 'err'); $('table').focus(); return; }
  if (!languages.length) { setStatus('Choose at least one language.', 'err'); return; }
  const previous = $('compare').checked ? store.read()[0]?.snapshot || null : null;

  $('go').disabled = true;
  setStatus('Cleaning the table and asking Gemini... this takes 10 to 40 seconds.');
  try {
    const res = await fetch('/api/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-code': $('code').value },
      body: JSON.stringify({ table, role, languages, readingLevel, previous }),
    });
    const data = await res.json().catch(() => ({ error: 'Unexpected server response.' }));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    render(data);
    store.write([{ at: data.generatedAt, role, snapshot: data.snapshot }, ...store.read()]);
    renderHistory();
    setStatus('Brief ready.', 'ok');
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    $('go').disabled = false;
  }
}

$('form').addEventListener('submit', submit);
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 300000) { setStatus('File too large (max 300 KB).', 'err'); return; }
  $('table').value = await f.text();
  setStatus(`Loaded ${f.name}.`);
});
$('sample').addEventListener('click', async () => {
  const res = await fetch('sample-messy.csv');
  $('table').value = await res.text();
  setStatus('Sample loaded: 4 Pune sites with missing, negative, stuck, duplicated and mixed-unit readings.');
});
$('clear').addEventListener('click', () => { store.write([]); renderHistory(); });
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (btn) navigator.clipboard?.writeText($(btn.dataset.copy).textContent).then(() => setStatus('Copied.', 'ok'));
});

initLangs();
renderHistory();
