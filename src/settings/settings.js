// Einstellungsfenster: Pets anlegen, Steckbrief, Funktion (App) waehlen, Einstellungen fuer alle.
// Aenderungen werden sofort gespeichert.
/* global window, document */
const api = window.pets;
const $ = (id) => document.getElementById(id);
let data = null;       // { state, apps, species, talents, companion, … }
let current = null;    // id des gewaehlten Pets
let view = 'pet';      // 'pet' (Steckbrief eines Pets) oder 'settings' (Einstellungen fuer alle)
let saveTimer = null;
let installed = null;  // installierte Apps (fuer die Suche), einmal geladen

function darker(hex, f = 0.68) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f)).join(',')})`;
}
function drawPet(el, p) {
  el.innerHTML = window.renderSpecies(p.species);
  el.style.setProperty('--c', p.color);
  el.style.setProperty('--c-dark', darker(p.color));
}
const speciesName = (sp) => (data.species[sp] || '').replace(/\s*\(.*\)$/, '');      // "Fips"
const animalName = (sp) => (data.species[sp] || '').replace(/^(.*?)\s*\((.*)\)$/, '$2'); // "Fuchs"
const fnLabel = (p) => (p.kind === 'custom' && p.appName ? p.appName : p.kind === 'none' ? 'Keine – reiner Begleiter' : (data.apps[p.kind] || {}).label || p.kind);
const fill = (text, p) => String(text || '').replaceAll('{name}', p.name);

const EYE_ON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

// ---------- Seitenleiste ----------
function renderList() {
  const ul = $('list');
  ul.replaceChildren();
  for (const p of data.state.pets) {
    const li = document.createElement('li');
    li.className = view === 'pet' && p.id === current ? 'active' : '';
    li.tabIndex = 0;
    const mini = document.createElement('div');
    mini.className = 'mini';
    drawPet(mini, p);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const b = document.createElement('strong'); b.textContent = p.name;
    const s = document.createElement('small'); s.textContent = (p.kind === 'none' ? animalName(p.species) : `${animalName(p.species)} · ${fnLabel(p)}`) + (p.hidden ? ' · ausgeblendet' : p.muted ? ' · schläft' : '');
    meta.append(b, s);
    const eye = document.createElement('button');
    eye.className = 'eye-btn';
    eye.type = 'button';
    eye.title = p.hidden ? 'Auf dem Desktop einblenden' : 'Auf dem Desktop ausblenden';
    eye.setAttribute('aria-label', `${p.name} ${p.hidden ? 'einblenden' : 'ausblenden'}`);
    eye.setAttribute('aria-pressed', String(!p.hidden));
    eye.innerHTML = p.hidden ? EYE_OFF : EYE_ON;
    eye.onclick = async (ev) => {
      ev.stopPropagation();
      const saved = await api.setHidden(p.id, !p.hidden);
      if (saved) { data.state.pets[data.state.pets.findIndex((x) => x.id === saved.id)] = saved; renderList(); }
    };
    eye.onkeydown = (ev) => ev.stopPropagation();
    li.classList.toggle('is-hidden', p.hidden);
    li.append(mini, meta, eye);
    li.onclick = () => select(p.id);
    li.onkeydown = (e) => { if (e.key === 'Enter') select(p.id); };
    ul.appendChild(li);
  }
  $('nav-settings').classList.toggle('active', view === 'settings');
  $('side-version').textContent = `Version ${data.version}`;
}
function select(id) {
  current = id;
  view = 'pet';
  renderList();
  renderEditor();
}
const pet = () => data.state.pets.find((p) => p.id === current);

// ---------- Pet-Seite ----------
function renderEditor() {
  const main = $('editor');
  if (view === 'settings') { $('topbar-title').textContent = '⚙️ Einstellungen'; renderSettings(); return; }
  const p = pet();
  $('topbar-title').textContent = p ? p.name : '';
  if (!p) { main.innerHTML = '<p class="empty">Wähle links ein Pet aus oder leg ein neues an.</p>'; return; }
  main.replaceChildren($('tpl-editor').content.cloneNode(true));
  const info = (data.talents || {})[p.species] || {};
  // Steckbrief
  $('f-name').value = p.name;
  drawPet($('preview'), p);
  renderProfile(p);
  // Aussehen
  const sp = $('f-species');
  for (const k of Object.keys(data.species)) sp.add(new window.Option(`${speciesName(k)} (${animalName(k)})`, k));
  sp.value = p.species;
  sp.dataset.last = p.species;
  $('f-color').value = p.color;
  $('f-size').value = p.size;
  $('f-wander').checked = p.wander;
  $('f-muted').checked = p.muted;
  $('f-color').closest('label').hidden = p.species === 'beau'; // Beau: Fell und Hut sind fest
  // Funktion
  $('f-target').value = p.target;
  $('f-events').checked = p.events;
  $('events-label').textContent = (data.apps[p.kind] || {}).eventsLabel || 'Meldungen anzeigen';
  renderFunction(p);
  showHook(p.kind);
  // Talent und Charakter-Extras
  renderTalent(p.species, p.talent, p);
  // Erweitert: eigene Sprueche und Erinnerungen der Funktion
  $('f-lines').value = (p.lines.length ? p.lines : defaultLines(p.species)).join('\n');
  $('lines-reset').onclick = () => { $('f-lines').value = defaultLines($('f-species').value).join('\n'); scheduleSave(); };
  const r = p.reminders;
  $('r-enabled').checked = r.enabled;
  $('r-interval').value = r.intervalMin;
  $('r-from').value = r.from;
  $('r-to').value = r.to;
  $('r-workdays').checked = r.onlyWorkdays;
  $('r-messages').value = r.messages.join('\n');
  for (const el of main.querySelectorAll('.pet-name')) el.textContent = p.name;
  void info;

  main.querySelectorAll('input, select, textarea').forEach((el) => {
    if (el.id === 'fn-search') return;
    el.addEventListener('input', scheduleSave);
    el.addEventListener('change', scheduleSave);
  });
  $('pick').onclick = async () => { const f = await api.pickFile(); if (f) { $('f-target').value = f; scheduleSave(); } };
  $('open').onclick = async () => { await flush(); api.openApp(current); };
  $('say').onclick = async () => { await flush(); api.testPet(current); };
  $('export').onclick = async () => { await flush(); const r2 = await api.exportPets(current); if (r2 && r2.ok) flashSaved(`Exportiert ✓ (${r2.file.split(/[\\/]/).pop()})`); };
  $('go-settings').onclick = (ev) => { ev.preventDefault(); openSettingsView(); };
  $('remove').onclick = async () => {
    if (!window.confirm(`${p.name} wirklich entfernen?`)) return;
    await api.removePet(current);
  };
}
const defaultLines = (sp) => ((data.companion || {})[sp] || []).slice();

// Steckbrief: Art, Charakter, Mag, Mag nicht (Standard je Tier, pro Pet aenderbar), Talent kurz, Dabei seit
function renderProfile(p) {
  const info = (data.talents || {})[p.species] || {};
  const prof = info.profile || {};
  $('p-art').textContent = animalName(p.species) + (p.species === 'beau' ? ' mit Hexenhut' : '');
  for (const [id, key, def] of [['p-character', 'character', info.character], ['p-likes', 'likes', prof.likes], ['p-dislikes', 'dislikes', prof.dislikes]]) {
    $(id).value = p.profile[key] || def || '';
    $(id).dataset.def = def || '';
  }
  $('p-talent').textContent = info.title || '';
  $('p-talent-what').textContent = info.help ? fill(info.help.what, p) : info.desc || '';
  $('p-created').textContent = new Date(`${p.created}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const q = (p.lines.length ? p.lines[0] : (data.samples || {})[p.species]) || '';
  $('p-quote').textContent = q ? `„${q.replace(/^[„"]|[“"]$/g, '')}“` : '';
  $('p-quote').hidden = !q;
  $('p-special').hidden = p.species !== 'beau';
}

// ---------- Talent & Charakter-Extras ----------
const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const CLICK = { axolotl: 'eine erledigte Aufgabe zählen', blob: 'ein getrunkenes Glas Wasser zählen', beau: 'die Tageskarte ziehen', robot: 'den Systembericht zeigen' };
function renderTalent(species, t = {}, p = pet()) {
  const info = (data.talents || {})[species];
  const box = $('talent-box');
  box.hidden = !info;
  if (!info) return;
  $('t-title').textContent = info.title;
  const help = info.help || { what: info.desc, when: '', you: '' };
  $('t-what').textContent = fill(help.what, p);
  $('t-when').textContent = fill(help.when, p);
  $('t-you').textContent = fill(help.you, p);
  $('t-companion').textContent = info.companion || '';
  const click = CLICK[species];
  $('p-click').textContent = click ? (p.kind === 'none' ? `Klick auf ${p.name}: ${click}.` : `Rechtsklick auf ${p.name}: ${click} (ein Klick öffnet die verbundene App).`) : `Ein Klick auf ${p.name} öffnet die verbundene App.`;
  if (!click && p.kind === 'none') $('p-click').textContent = '';
  $('t-enabled').checked = t.enabled !== false;
  const opts = $('t-options');
  opts.replaceChildren();
  for (const o of info.options) {
    const v = t[o.key] ?? o.def;
    const label = document.createElement('label');
    let input;
    if (o.type === 'day') {
      input = document.createElement('select');
      DAYS.forEach((d, i) => input.add(new window.Option(d, String(i))));
      input.value = String(v);
    } else {
      input = document.createElement('input');
      input.type = o.type === 'bool' ? 'checkbox' : o.type === 'time' ? 'time' : 'text';
      if (o.type === 'bool') input.checked = !!v; else input.value = v;
      if (o.type === 'text') { input.maxLength = 60; input.spellcheck = false; }
    }
    input.dataset.key = o.key;
    input.dataset.type = o.type;
    if (o.type === 'bool') { label.className = 'check'; label.append(input, ` ${o.label}`); }
    else { label.className = o.type === 'text' ? 'grow' : ''; label.append(o.label, input); }
    input.addEventListener('input', scheduleSave);
    input.addEventListener('change', scheduleSave);
    opts.appendChild(label);
  }
}
function collectTalent() {
  if (!$('talent-box') || $('talent-box').hidden) return undefined;
  const t = { enabled: $('t-enabled').checked };
  for (const el of $('t-options').querySelectorAll('[data-key]')) {
    t[el.dataset.key] = el.dataset.type === 'bool' ? el.checked : el.dataset.type === 'day' ? +el.value : el.value;
  }
  return t;
}

// ---------- Funktion: aktuelle App, Suche ueber Vorschlaege und installierte Apps ----------
function capsBadges(caps) {
  const out = document.createElement('span');
  out.className = 'caps';
  for (const [k, label] of [['opens', 'öffnet'], ['reminds', 'erinnert'], ['reports', 'meldet']]) {
    if (!caps || !caps[k]) continue;
    const b = document.createElement('span'); b.className = `cap cap-${k}`; b.textContent = label; out.appendChild(b);
  }
  return out;
}
function statusFor(kind) {
  const a = data.apps[kind];
  if (!a || !a.github) return null;
  const s = document.createElement('span');
  if (a.installed) { s.className = 'status ok'; s.textContent = '✓ installiert'; return s; }
  s.className = 'status warn';
  s.append(`braucht ${a.needs} · `);
  const link = document.createElement('a'); link.href = '#'; link.textContent = 'auf GitHub holen';
  link.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); api.openLink(a.github); };
  s.appendChild(link);
  return s;
}
function renderFunction(p) {
  const box = $('fn-current');
  box.replaceChildren();
  const a = data.apps[p.kind] || {};
  const icon = document.createElement('span'); icon.className = 'fn-icon'; icon.textContent = p.kind === 'custom' && p.appName ? '🧩' : a.icon || '🐾';
  const main = document.createElement('div'); main.className = 'fn-main';
  const name = document.createElement('strong'); name.textContent = fnLabel(p);
  const row = document.createElement('div'); row.className = 'fn-row';
  row.append(name, capsBadges(p.kind === 'custom' ? { opens: !!p.target } : a.caps));
  const st = statusFor(p.kind); if (st) row.appendChild(st);
  const hint = document.createElement('small'); hint.className = 'hint';
  hint.textContent = p.kind === 'custom' && p.appName ? `Ein Klick auf ${p.name} öffnet ${p.appName}.` : a.hint || '';
  main.append(row, hint);
  box.append(icon, main);
  const search = $('fn-search');
  search.value = '';
  search.oninput = () => renderResults(search.value);
  search.onfocus = loadInstalled;
  renderResults('');
}
async function loadInstalled() {
  if (installed) return;
  installed = [];
  installed = await api.installedApps();
  if ($('fn-search')) renderResults($('fn-search').value);
}
function resultItem({ icon, label, hint, caps, status, onPick, active }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `fn-item${active ? ' active' : ''}`;
  b.setAttribute('role', 'option');
  const i = document.createElement('span'); i.className = 'fn-icon'; i.textContent = icon;
  const m = document.createElement('span'); m.className = 'fn-main';
  const row = document.createElement('span'); row.className = 'fn-row';
  const l = document.createElement('strong'); l.textContent = label;
  row.append(l, capsBadges(caps));
  if (status) row.appendChild(status);
  m.appendChild(row);
  if (hint) { const h = document.createElement('small'); h.className = 'hint'; h.textContent = hint; m.appendChild(h); }
  b.append(i, m);
  b.onclick = onPick;
  return b;
}
function renderResults(q) {
  const box = $('fn-results');
  if (!box) return;
  box.replaceChildren();
  const p = pet();
  const needle = q.trim().toLowerCase();
  const presets = Object.entries(data.apps).filter(([k, a]) => k !== 'custom' && (!needle || a.label.toLowerCase().includes(needle) || (a.hint || '').toLowerCase().includes(needle) || (k === 'none' && 'keine begleiter'.includes(needle))));
  if (!needle) {
    // ohne Suche: Vorschlaege nach Abschnitten
    for (const [g, title] of Object.entries(data.groups)) {
      const list = presets.filter(([, a]) => a.group === g);
      if (!list.length) continue;
      const h = document.createElement('h4'); h.textContent = g === 'other' ? 'Sonstiges' : title; box.appendChild(h);
      for (const [k, a] of list) box.appendChild(resultItem({ icon: a.icon || '•', label: k === 'none' ? 'Keine – reiner Begleiter' : a.label, caps: a.caps, status: statusFor(k), active: p.kind === k && !(k === 'custom' && p.appName), onPick: () => choosePreset(k) }));
    }
    const h = document.createElement('h4'); h.textContent = 'Installierte Apps'; box.appendChild(h);
    const t = document.createElement('p'); t.className = 'hint'; t.textContent = 'Tippe oben, um in deinen installierten Apps zu suchen (z. B. Rechner, Outlook, Kalender).'; box.appendChild(t);
    return;
  }
  for (const [k, a] of presets) box.appendChild(resultItem({ icon: a.icon || '•', label: k === 'none' ? 'Keine – reiner Begleiter' : a.label, caps: a.caps, status: statusFor(k), active: p.kind === k, onPick: () => choosePreset(k) }));
  const apps = (installed || []).filter((a) => a.name.toLowerCase().includes(needle)).slice(0, 25);
  if (apps.length) { const h = document.createElement('h4'); h.textContent = 'Installierte Apps'; box.appendChild(h); }
  for (const a of apps) box.appendChild(resultItem({ icon: '🧩', label: a.name, caps: { opens: true }, active: p.kind === 'custom' && p.target === a.target, onPick: () => chooseInstalled(a) }));
  if (installed === null || (installed && !installed.length && !presets.length)) {
    const t = document.createElement('p'); t.className = 'hint'; t.textContent = installed === null ? 'Installierte Apps werden geladen …' : 'Nichts gefunden.'; box.appendChild(t);
  } else if (!apps.length && !presets.length) {
    const t = document.createElement('p'); t.className = 'hint'; t.textContent = 'Nichts gefunden. Unter „Was beim Klick geöffnet wird“ kannst du auch eine Datei oder Webseite eintragen.'; box.appendChild(t);
  }
}
// Preset waehlen: Ziel, Erinnerungen und Meldungen kommen vom Preset – Name und Charakter bleiben
async function choosePreset(kind) {
  const p = pet();
  const preset = await api.preset(kind);
  const next = { ...collect(), kind, appName: '' };
  if (preset) Object.assign(next, { target: preset.target, reminders: preset.reminders, events: preset.events });
  const saved = await api.savePet(next);
  if (!saved) return;
  data.state.pets[data.state.pets.indexOf(p)] = saved;
  renderList();
  renderEditor();
}
async function chooseInstalled(app) {
  await flush();
  const saved = await api.connectApp(current, app);
  if (!saved) return;
  data.state.pets[data.state.pets.findIndex((x) => x.id === saved.id)] = saved;
  renderList();
  renderEditor();
}

// Claude / Claude Code: Hook in ~/.claude/settings.json
async function showHook(kind) {
  const box = $('hook-box');
  box.hidden = kind !== 'claudecode' && kind !== 'claude';
  if (box.hidden) return;
  const st = await api.hookStatus();
  if (!$('hook-box')) return;
  const show = (s) => {
    $('hook-status').textContent = s.installed ? '✓ Ist eingetragen – Claude meldet sich bei diesem Pet.' : 'Noch nicht eingetragen.';
    $('hook-install').textContent = s.installed ? 'Erneut eintragen' : 'In Claude Code eintragen';
    $('hook-install').className = s.installed ? '' : 'primary';
  };
  show(st);
  $('hook-code').textContent = st.json;
  $('hook-install').onclick = async () => {
    const r = await api.hookInstall();
    if (r.ok) show(r);
    else $('hook-status').textContent = `Hat nicht geklappt: ${r.error}. Du kannst den Eintrag unten kopieren und selbst einfügen.`;
  };
  $('hook-copy').onclick = async () => {
    await api.copy(st.json);
    $('hook-copied').textContent = 'Kopiert ✓';
    setTimeout(() => { if ($('hook-copied')) $('hook-copied').textContent = ''; }, 1500);
  };
}

// ---------- Speichern ----------
const sameAsDefault = (id) => $(id).value.trim() === ($(id).dataset.def || '').trim();
function collect() {
  const p = pet();
  const linesText = $('f-lines').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const isDefault = linesText.join('\n') === defaultLines($('f-species').value).join('\n');
  return {
    id: current,
    name: $('f-name').value,
    species: $('f-species').value,
    color: $('f-color').value,
    size: +$('f-size').value,
    wander: $('f-wander').checked,
    muted: $('f-muted').checked,
    kind: p.kind,
    appName: p.appName,
    target: $('f-target').value,
    events: $('f-events').checked,
    talent: collectTalent(),
    profile: {
      character: sameAsDefault('p-character') ? '' : $('p-character').value,
      likes: sameAsDefault('p-likes') ? '' : $('p-likes').value,
      dislikes: sameAsDefault('p-dislikes') ? '' : $('p-dislikes').value,
    },
    lines: isDefault ? [] : linesText,
    reminders: {
      enabled: $('r-enabled').checked,
      intervalMin: +$('r-interval').value,
      from: $('r-from').value,
      to: $('r-to').value,
      onlyWorkdays: $('r-workdays').checked,
      messages: $('r-messages').value.split('\n').map((s) => s.trim()).filter(Boolean),
      timed: [],
    },
  };
}
function scheduleSave() {
  const p = pet();
  if (p) {
    const sp = $('f-species');
    if (sp.dataset.last && sp.dataset.last !== sp.value) {
      // anderes Tier: Farbe, Talent, Steckbrief und Standard-Sprueche des neuen Tiers (Name bleibt)
      const wasDefaultLines = $('f-lines').value.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') === defaultLines(sp.dataset.last).join('\n');
      if (data.speciesColors) $('f-color').value = data.speciesColors[sp.value] || $('f-color').value;
      const tmp = { ...p, species: sp.value, profile: { character: '', likes: '', dislikes: '' }, lines: [] };
      renderTalent(sp.value, {}, tmp);
      renderProfile(tmp);
      if (wasDefaultLines) $('f-lines').value = defaultLines(sp.value).join('\n');
    }
    sp.dataset.last = sp.value;
    const c = collect();
    drawPet($('preview'), { ...p, species: c.species, color: c.color });
    $('f-color').closest('label').hidden = c.species === 'beau';
    for (const el of document.querySelectorAll('.pet-name')) el.textContent = c.name || p.name;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
function flashSaved(text) {
  if (!$('saved')) return;
  $('saved').textContent = text;
  setTimeout(() => { if ($('saved')) $('saved').textContent = ''; }, 2500);
}
async function flush() {
  clearTimeout(saveTimer);
  if (!pet() || !$('f-name')) return;
  const saved = await api.savePet(collect());
  if (!saved) return;
  data.state.pets[data.state.pets.findIndex((p) => p.id === saved.id)] = saved;
  renderList();
  $('topbar-title').textContent = saved.name;
  flashSaved('Gespeichert ✓');
}

// ---------- Neues Pet: erst das Tier, dann die Funktion ----------
const choice = { species: null, kind: null, nameTouched: false };
function card(cls, label, selected, onPick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `card ${cls}`;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(selected));
  b.onclick = onPick;
  b.ondblclick = () => { onPick(); (choice.kind ? $('create-ok') : $('create-next')).click(); };
  const t = document.createElement('span');
  t.className = 'card-label';
  t.textContent = label;
  b.appendChild(t);
  return b;
}
function renderAnimals() {
  const box = $('animal-cards');
  box.replaceChildren();
  for (const sp of Object.keys(data.species)) {
    // Name gross, Tierart klein darunter (jedes Pet hat seinen Namen)
    const b = card('animal', speciesName(sp), choice.species === sp, () => { choice.species = sp; renderAnimals(); updateCreate(); });
    const art = document.createElement('div');
    art.className = 'art';
    drawPet(art, { species: sp, color: data.speciesColors[sp] });
    b.prepend(art);
    const s = document.createElement('small'); s.className = 'card-sub'; s.textContent = animalName(sp); b.appendChild(s);
    if (sp === 'beau') { b.classList.add('special'); const x = document.createElement('small'); x.className = 'special-badge'; x.textContent = '✨ aus Storybound'; b.appendChild(x); }
    box.appendChild(b);
  }
}
function renderPresets() {
  const box = $('preset-groups');
  box.replaceChildren();
  for (const [g, title] of Object.entries(data.groups)) {
    const kinds = Object.entries(data.apps).filter(([, a]) => a.group === g);
    if (!kinds.length) continue;
    const h = document.createElement('h3'); h.textContent = title;
    const grid = document.createElement('div'); grid.className = 'cards presets'; grid.setAttribute('role', 'radiogroup'); grid.setAttribute('aria-label', title);
    for (const [k, a] of kinds) {
      const b = card('preset', k === 'none' ? 'Ohne App' : a.label, choice.kind === k, () => { choice.kind = k; renderPresets(); updateCreate(); });
      const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = a.icon || '•';
      const hint = document.createElement('small'); hint.textContent = a.hint;
      b.prepend(icon); b.appendChild(hint);
      const st = statusFor(k); if (st) b.appendChild(st);
      grid.appendChild(b);
    }
    box.append(h, grid);
  }
}
function showStep(n) {
  $('pane-1').hidden = n !== 1; $('pane-2').hidden = n !== 2;
  $('step-1').className = n === 1 ? 'on' : 'done'; $('step-2').className = n === 2 ? 'on' : '';
  $('create-back').hidden = n !== 2; $('create-next').hidden = n !== 1; $('create-ok').hidden = n !== 2;
  if (n === 2) { $('chosen-animal').textContent = $('create-name').value || speciesName(choice.species); renderPresets(); }
}
function updateCreate() {
  if (choice.species && !choice.nameTouched) $('create-name').value = speciesName(choice.species);
  if (choice.species) drawPet($('create-preview'), { species: choice.species, color: data.speciesColors[choice.species] });
  else $('create-preview').replaceChildren();
  const a = choice.kind && data.apps[choice.kind];
  $('create-summary').textContent = a ? (choice.kind === 'none' ? 'ohne App' : `mit ${a.label}`) : '';
  $('create-next').disabled = !choice.species;
  $('create-ok').disabled = !(choice.species && choice.kind);
}
function openCreate() {
  Object.assign(choice, { species: null, kind: null, nameTouched: false });
  $('create-name').value = '';
  renderAnimals();
  showStep(1);
  updateCreate();
  if (!$('create').open) $('create').showModal();
}
async function importPets(statusEl) {
  const r = await api.importPets();
  if (!r || (!r.ok && !r.error)) return null;
  if (!r.ok) { if (statusEl) statusEl.textContent = r.error; else window.alert(r.error); return null; }
  data = await api.get();
  const msg = `${r.count} ${r.count === 1 ? 'Pet' : 'Pets'} importiert ✓${r.missing.length ? ` – bei ${r.missing.join(', ')} fehlt die App auf diesem PC (unter „Funktion“ neu wählen).` : ''}`;
  if (statusEl) statusEl.textContent = msg;
  return r;
}
function initCreate() {
  $('create-name').oninput = () => { choice.nameTouched = !!$('create-name').value; };
  $('create-next').onclick = () => { if (choice.species) showStep(2); };
  $('create-back').onclick = () => showStep(1);
  $('create-close').onclick = () => $('create').close();
  $('create-import').onclick = async () => {
    const r = await importPets(null);
    if (!r) return;
    $('create').close();
    select(r.ids[0]);
    if (r.missing.length) window.alert(`Bei ${r.missing.join(', ')} fehlt die App auf diesem PC – unter „Funktion“ einfach neu wählen.`);
  };
  $('create-ok').onclick = async () => {
    if (!(choice.species && choice.kind)) return;
    const p = await api.addPet({ kind: choice.kind, species: choice.species, name: $('create-name').value });
    $('create').close();
    data = await api.get();
    select(p.id);
  };
}

// ---------- Einstellungen fuer alle Pets ----------
function openSettingsView() {
  view = 'settings';
  renderList();
  renderEditor();
}
function renderSettings() {
  const main = $('editor');
  main.replaceChildren($('tpl-settings').content.cloneNode(true));
  const g = data.state.settings;
  for (const b of main.querySelectorAll('#g-theme button')) {
    b.setAttribute('aria-checked', String(b.dataset.value === g.theme));
    b.onclick = () => setTheme(b.dataset.value);
  }
  $('g-export').onclick = async () => { const r = await api.exportPets(null); if (r && r.ok) $('g-io-status').textContent = `${r.count} Pets gesichert ✓ (${r.file.split(/[\\/]/).pop()})`; };
  $('g-import').onclick = async () => { const r = await importPets($('g-io-status')); if (r) renderList(); };
  $('chatter').value = g.chatter;
  $('chatter').onchange = () => api.saveGlobal({ chatter: $('chatter').value });
  $('chat-now').disabled = data.state.pets.length < 2;
  $('chat-now').onclick = async () => {
    const ok = await api.chatNow();
    if (!ok) window.alert('Stell zwei Pets nebeneinander (höchstens etwa eine Pet-Breite Abstand), dann plaudern sie.');
  };
  $('autostart-row').hidden = !data.packaged;
  $('autostart').checked = g.autostart;
  $('autostart').onchange = () => api.saveGlobal({ autostart: $('autostart').checked });
  $('auto-update').checked = g.autoUpdate;
  $('auto-update').disabled = !data.packaged;
  $('auto-update').onchange = () => api.saveGlobal({ autoUpdate: $('auto-update').checked });
  $('update-btn').onclick = () => {
    const st = (data.update || {}).status;
    if (st === 'ready' || st === 'available') api.updateInstall(); else api.updateCheck();
  };
  renderUpdate();
  renderTimed(g.timed);
  $('g-timed-add').onclick = () => { renderTimed([...collectTimed(), { time: '12:00', text: '', pet: '' }]); $('g-timed').querySelector('.timed-row:last-child input[type=text]').focus(); };
}
function renderTimed(list) {
  const box = $('g-timed');
  box.replaceChildren();
  if (!list.length) { const e = document.createElement('p'); e.className = 'hint'; e.textContent = 'Noch keine festen Uhrzeiten.'; box.appendChild(e); }
  for (const t of list) {
    const row = document.createElement('div');
    row.className = 'timed-row';
    const time = document.createElement('input'); time.type = 'time'; time.value = t.time; time.setAttribute('aria-label', 'Uhrzeit');
    const text = document.createElement('input'); text.type = 'text'; text.value = t.text; text.maxLength = 200; text.placeholder = 'Mittagspause! 🍜 Weg vom Bildschirm.'; text.setAttribute('aria-label', 'Was das Pet sagt');
    const who = document.createElement('select'); who.setAttribute('aria-label', 'Welches Pet sagt es');
    who.add(new window.Option('irgendein Pet', ''));
    for (const p of data.state.pets) who.add(new window.Option(p.name, p.id));
    who.value = t.pet || '';
    const del = document.createElement('button'); del.type = 'button'; del.className = 'icon-btn'; del.textContent = '✕'; del.title = 'Entfernen'; del.setAttribute('aria-label', 'Uhrzeit entfernen');
    del.onclick = () => { row.remove(); saveTimed(); };
    for (const el of [time, text, who]) { el.addEventListener('change', saveTimed); el.addEventListener('input', saveTimedSoon); }
    row.append(time, text, who, del);
    box.appendChild(row);
  }
}
const collectTimed = () => [...$('g-timed').querySelectorAll('.timed-row')].map((r) => {
  const [time, text, who] = r.querySelectorAll('input, select');
  return { time: time.value, text: text.value.trim(), pet: who.value };
});
let timedTimer = null;
function saveTimedSoon() { clearTimeout(timedTimer); timedTimer = setTimeout(saveTimed, 600); }
async function saveTimed() {
  clearTimeout(timedTimer);
  const saved = await api.saveGlobal({ timed: collectTimed().filter((t) => t.time && t.text) });
  if (saved) data.state.settings = saved;
}

// ---------- Hell / Dunkel ----------
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = (data && data.state.settings.theme) || 'dark';
  const actual = t === 'system' ? (prefersDark.matches ? 'dark' : 'light') : t;
  document.documentElement.dataset.theme = actual;
  const btn = $('theme-toggle');
  btn.textContent = actual === 'dark' ? '☀️' : '🌙';
  btn.title = actual === 'dark' ? 'Auf Hell umschalten' : 'Auf Dunkel umschalten';
}
async function setTheme(t) {
  data.state.settings.theme = t;
  applyTheme();
  for (const b of document.querySelectorAll('#g-theme button')) b.setAttribute('aria-checked', String(b.dataset.value === t));
  const saved = await api.saveGlobal({ theme: t });
  if (saved) data.state.settings = saved;
}
prefersDark.addEventListener('change', applyTheme);

// ---------- Updates ----------
function renderUpdate() {
  if (!$('version')) return;
  const u = data.update || { status: 'off' };
  $('version').textContent = `Version ${data.version}`;
  const text = {
    off: data.packaged ? 'Updates sind aus.' : 'Updates gibt es nur in der installierten App.',
    idle: '', checking: 'Suche nach Updates …', none: 'Du hast die neueste Version.',
    downloading: `Update ${u.version || ''} wird geladen … ${u.percent || 0} %`,
    ready: `Update ${u.version} ist bereit.`,
    available: `Version ${u.version} ist da (zum Herunterladen).`,
    error: 'Update-Suche fehlgeschlagen. Später nochmal probieren.',
  }[u.status] ?? '';
  $('update-status').textContent = text;
  const btn = $('update-btn');
  btn.textContent = u.status === 'ready' ? 'Jetzt neu starten und installieren' : u.status === 'available' ? 'Herunterladen …' : 'Nach Updates suchen';
  btn.className = u.status === 'ready' ? 'primary' : '';
  btn.disabled = u.status === 'off' || u.status === 'checking' || u.status === 'downloading';
}

async function init() {
  data = await api.get();
  applyTheme();
  const q = new URLSearchParams(window.location.search).get('focus');
  current = q || (data.state.pets[0] && data.state.pets[0].id) || null;
  initCreate();
  $('add').onclick = openCreate;
  $('nav-settings').onclick = openSettingsView;
  $('theme-toggle').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  renderList();
  renderEditor();
  if (new URLSearchParams(window.location.search).get('create')) openCreate();
}

api.onState((s) => {
  data = s;
  applyTheme();
  if (!pet()) current = data.state.pets[0] ? data.state.pets[0].id : null;
  renderList();
  // nicht neu aufbauen, waehrend man gerade tippt (Pet-Seite oder Einstellungen)
  if (document.activeElement && $('editor').contains(document.activeElement) && document.activeElement.matches('input, textarea, select')) { renderUpdate(); return; }
  renderEditor();
});
api.onFocus((id) => select(id));
api.onCreate(() => openCreate());
init();
