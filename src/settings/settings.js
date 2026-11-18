// Einstellungsfenster: Pets anlegen, anpassen, verbinden. Aenderungen werden sofort gespeichert.
/* global window, document */
const api = window.pets;
const $ = (id) => document.getElementById(id);
let data = null;       // { state, apps, species, port, packaged }
let current = null;    // id des gewaehlten Pets
let saveTimer = null;

const EVENT_LABEL = {
  nexus: 'Melden, wenn ein Auftrag in 3C fertig ist oder Claude eine Entscheidung braucht',
  dan: 'Meldungen von DAN anzeigen (sobald DAN welche schickt)',
  nook: 'Meldungen von Nook anzeigen (sobald Nook welche schickt)',
  custom: 'Meldungen der App anzeigen (über die lokale Schnittstelle)',
  none: 'Meldungen anzeigen',
};

function darker(hex, f = 0.68) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f)).join(',')})`;
}
function drawPet(el, p) {
  el.innerHTML = window.renderSpecies(p.species);
  el.style.setProperty('--c', p.color);
  el.style.setProperty('--c-dark', darker(p.color));
}

const EYE_ON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

function renderList() {
  const ul = $('list');
  ul.replaceChildren();
  for (const p of data.state.pets) {
    const li = document.createElement('li');
    li.className = p.id === current ? 'active' : '';
    li.tabIndex = 0;
    const mini = document.createElement('div');
    mini.className = 'mini';
    drawPet(mini, p);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const b = document.createElement('strong'); b.textContent = p.name;
    const s = document.createElement('small'); s.textContent = (p.kind === 'none' ? 'ohne App' : `mit ${data.apps[p.kind].label}`) + (p.hidden ? ' · ausgeblendet' : p.muted ? ' · schläft' : '');
    meta.append(b, s);
    // Auge: auf dem Desktop aus- und einblenden, ohne das Pet zu entfernen
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
  $('chat-now').disabled = data.state.pets.length < 2;
}

function select(id) {
  current = id;
  renderList();
  renderEditor();
}

const pet = () => data.state.pets.find((p) => p.id === current);

function renderEditor() {
  const main = $('editor');
  const p = pet();
  if (!p) { main.innerHTML = '<p class="empty">Wähle links ein Pet aus oder leg ein neues an.</p>'; return; }
  main.replaceChildren($('tpl-editor').content.cloneNode(true));
  const sp = $('f-species');
  for (const [k, label] of Object.entries(data.species)) sp.add(new window.Option(label, k));
  $('f-name').value = p.name;
  sp.value = p.species;
  $('f-color').value = p.color;
  $('f-size').value = p.size;
  $('f-wander').checked = p.wander;
  $('f-muted').checked = p.muted;
  $('f-kind').value = p.kind;
  $('f-target').value = p.target;
  $('f-events').checked = p.events;
  $('events-label').textContent = EVENT_LABEL[p.kind];
  $('kind-hint').textContent = data.apps[p.kind].hint;
  const r = p.reminders;
  $('r-enabled').checked = r.enabled;
  $('r-interval').value = r.intervalMin;
  $('r-from').value = r.from;
  $('r-to').value = r.to;
  $('r-workdays').checked = r.onlyWorkdays;
  $('r-messages').value = r.messages.join('\n');
  $('r-timed').value = r.timed.map((t) => `${t.time} ${t.text}`).join('\n');
  drawPet($('preview'), p);
  $('f-color').closest('label').hidden = p.species === 'beau'; // Beau: Fell und Hut sind fest

  main.querySelectorAll('input, select, textarea').forEach((el) => {
    if (el.id === 'f-kind') return;
    el.addEventListener('input', scheduleSave);
    el.addEventListener('change', scheduleSave);
  });
  $('f-kind').addEventListener('change', changeKind);
  $('pick').onclick = async () => { const f = await api.pickFile(); if (f) { $('f-target').value = f; scheduleSave(); } };
  $('open').onclick = async () => { await flush(); api.openApp(current); };
  $('say').onclick = async () => { await flush(); api.testPet(current); };
  $('remove').onclick = async () => {
    if (!window.confirm(`${p.name} wirklich entfernen?`)) return;
    await api.removePet(current);
  };
}

function collect() {
  const timed = $('r-timed').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
    return m ? { time: `${m[1].padStart(2, '0')}:${m[2]}`, text: m[3] } : null;
  }).filter(Boolean);
  return {
    id: current,
    name: $('f-name').value,
    species: $('f-species').value,
    color: $('f-color').value,
    size: +$('f-size').value,
    wander: $('f-wander').checked,
    muted: $('f-muted').checked,
    kind: $('f-kind').value,
    target: $('f-target').value,
    events: $('f-events').checked,
    reminders: {
      enabled: $('r-enabled').checked,
      intervalMin: +$('r-interval').value,
      from: $('r-from').value,
      to: $('r-to').value,
      onlyWorkdays: $('r-workdays').checked,
      messages: $('r-messages').value.split('\n').map((s) => s.trim()).filter(Boolean),
      timed,
    },
  };
}

function scheduleSave() {
  const p = pet();
  if (p) {
    const c = collect();
    drawPet($('preview'), { ...p, species: c.species, color: c.color });
    $('f-color').closest('label').hidden = c.species === 'beau';
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 350);
}
async function flush() {
  clearTimeout(saveTimer);
  if (!pet()) return;
  const saved = await api.savePet(collect());
  if (!saved) return;
  data.state.pets[data.state.pets.findIndex((p) => p.id === saved.id)] = saved;
  renderList();
  $('saved').textContent = 'Gespeichert ✓';
  setTimeout(() => { if ($('saved')) $('saved').textContent = ''; }, 1500);
}

// App gewechselt: Voreinstellungen der neuen App anbieten
async function changeKind() {
  const kind = $('f-kind').value;
  const p = pet();
  const preset = await api.preset(kind);
  const label = data.apps[kind].label;
  const take = window.confirm(`Voreinstellungen für ${label} übernehmen?\n(Programmpfad, Erinnerungen und Sprüche werden ersetzt. Name und Aussehen bleiben.)`);
  const next = { ...collect(), kind };
  if (take && preset) Object.assign(next, { target: preset.target, reminders: preset.reminders, events: preset.events });
  const saved = await api.savePet(next);
  data.state.pets[data.state.pets.indexOf(p)] = saved;
  renderList();
  renderEditor();
}

// ---------- Updates ----------
function renderUpdate() {
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
  const q = new URLSearchParams(window.location.search).get('focus');
  current = q || (data.state.pets[0] && data.state.pets[0].id) || null;
  $('chatter').value = data.state.settings.chatter;
  $('autostart').checked = data.state.settings.autostart;
  $('autostart-row').hidden = !data.packaged;
  $('chatter').onchange = () => api.saveGlobal({ chatter: $('chatter').value });
  $('autostart').onchange = () => api.saveGlobal({ autostart: $('autostart').checked });
  $('chat-now').onclick = async () => {
    const ok = await api.chatNow();
    if (!ok) window.alert('Stell zwei Pets nebeneinander (höchstens etwa eine Pet-Breite Abstand), dann plaudern sie.');
  };
  $('add').onclick = async () => {
    const p = await api.addPet($('add-kind').value);
    data = await api.get();
    select(p.id);
  };
  $('auto-update').checked = data.state.settings.autoUpdate;
  $('auto-update').disabled = !data.packaged;
  $('auto-update').onchange = () => api.saveGlobal({ autoUpdate: $('auto-update').checked });
  $('update-btn').onclick = () => {
    const s = (data.update || {}).status;
    if (s === 'ready' || s === 'available') api.updateInstall(); else api.updateCheck();
  };
  renderUpdate();
  renderList();
  renderEditor();
}

api.onState((s) => {
  data = s;
  renderUpdate();
  if (!pet()) current = data.state.pets[0] ? data.state.pets[0].id : null;
  renderList();
  renderEditor();
});
api.onFocus((id) => select(id));
init();
