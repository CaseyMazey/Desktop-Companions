// Reine Logik ohne Electron (wird in test/ geprueft): Daten pruefen, Erinnerungen faellig?, Nachbarn finden.
const { APPS, SPECIES, NAMES, DEFAULT_SPECIES, speciesName } = require('./presets');
const { normalizeTalent } = require('./talents');

const KINDS = Object.keys(APPS);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX = /^#[0-9a-f]{6}$/i;

const str = (v, max, fb = '') => (typeof v === 'string' ? v.slice(0, max) : fb);
const num = (v, min, max, fb) => (Number.isFinite(+v) ? Math.min(max, Math.max(min, Math.round(+v))) : fb);
const newId = () => Math.random().toString(36).slice(2, 10);

function normalizeReminders(r, kind) {
  const d = APPS[kind].reminders;
  r = r && typeof r === 'object' ? r : {};
  const messages = (Array.isArray(r.messages) ? r.messages : d.messages)
    .map((m) => str(m, 200).trim()).filter(Boolean).slice(0, 100);
  const timed = (Array.isArray(r.timed) ? r.timed : d.timed)
    .filter((t) => t && TIME.test(t.time) && str(t.text, 200).trim())
    .map((t) => ({ time: t.time, text: str(t.text, 200).trim() })).slice(0, 30);
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    intervalMin: num(r.intervalMin, 5, 600, d.intervalMin),
    onlyWorkdays: typeof r.onlyWorkdays === 'boolean' ? r.onlyWorkdays : d.onlyWorkdays,
    from: TIME.test(r.from) ? r.from : d.from,
    to: TIME.test(r.to) ? r.to : d.to,
    messages: messages.length ? messages : d.messages.slice(),
    timed,
  };
}

// Ein neues Pet mit den Voreinstellungen seiner App
function createPet(kind = 'none', extra = {}) {
  if (!KINDS.includes(kind)) kind = 'none';
  // Name kommt vom Tier (Buh, Mauz …), nicht von der App – ein Pet heisst nicht "Nexi", nur weil es mit NEXUS verbunden ist
  const species = SPECIES[extra.species] ? extra.species : DEFAULT_SPECIES[kind];
  return normalizePet({ id: newId(), kind, name: speciesName(species), species, target: APPS[kind].target(), ...extra });
}

// Neues Pet aus der Auswahl "erst das Tier, dann die Verbindung": Name vom Tier, Rest vom Preset
function createChosenPet(kind, species, name) {
  if (!KINDS.includes(kind)) kind = 'none';
  if (!SPECIES[species]) species = DEFAULT_SPECIES[kind];
  return createPet(kind, { species, color: SPECIES[species].color, name: str(name, 24).trim() || speciesName(species) || NAMES[kind] });
}

// Welche Pets bekommen eine Meldung? Gezielt (pet) oder alle, die auf diese App hoeren (eigene Art oder listens)
function petsForEvent(pets, ev) {
  return pets.filter((p) => p.events && !p.hidden
    && (ev.pet ? p.id === ev.pet : p.kind === ev.app || (APPS[p.kind].listens || []).includes(ev.app)));
}

function normalizePet(p) {
  p = p && typeof p === 'object' ? p : {};
  const kind = KINDS.includes(p.kind) ? p.kind : 'none';
  const species = SPECIES[p.species] ? p.species : DEFAULT_SPECIES[kind];
  const prof = p.profile && typeof p.profile === 'object' ? p.profile : {};
  return {
    id: /^[a-z0-9]{4,16}$/.test(p.id) ? p.id : newId(),
    kind,
    name: str(p.name, 24).trim() || speciesName(species) || NAMES[kind],
    species,
    // Steckbrief: leer = Standard des Tiers (Charakter, Mag, Mag nicht); pro Pet aenderbar und exportierbar
    profile: { character: str(prof.character, 200).trim(), likes: str(prof.likes, 200).trim(), dislikes: str(prof.dislikes, 200).trim() },
    // eigene Sprueche des Charakters (leer = die Sprueche des Tiers)
    lines: (Array.isArray(p.lines) ? p.lines : []).map((l) => str(l, 200).trim()).filter(Boolean).slice(0, 60),
    created: /^\d{4}-\d{2}-\d{2}$/.test(p.created) ? p.created : new Date().toISOString().slice(0, 10), // "Dabei seit"
    appName: str(p.appName, 80).trim(), // Name einer installierten App (z. B. "Rechner"), wenn so verbunden
    color: HEX.test(p.color) ? p.color : SPECIES[species].color,
    target: str(p.target, 1000).trim(),
    size: num(p.size, 70, 160, 100),
    wander: typeof p.wander === 'boolean' ? p.wander : false, // Standard: bleibt an seinem Platz (2026-11-18)
    events: typeof p.events === 'boolean' ? p.events : APPS[kind].events,
    muted: !!p.muted,
    hidden: !!p.hidden, // auf dem Desktop ausgeblendet (Auge in der Liste), Einstellungen bleiben
    x: Number.isFinite(p.x) ? Math.round(p.x) : null,
    y: Number.isFinite(p.y) ? Math.round(p.y) : null,
    homeX: Number.isFinite(p.homeX) ? Math.round(p.homeX) : null, // wo es abgesetzt wurde (fuer "nicht frei wandern")
    reminders: normalizeReminders(p.reminders, kind),
    talent: normalizeTalent(species, p.talent), // Talent des Tiers (an/aus und Optionen), siehe talents.js
  };
}

function normalizeState(s) {
  s = s && typeof s === 'object' ? s : {};
  const pets = (Array.isArray(s.pets) ? s.pets : []).slice(0, 20).map(normalizePet);
  const seen = new Set();
  for (const p of pets) { while (seen.has(p.id)) p.id = newId(); seen.add(p.id); }
  const g = s.settings && typeof s.settings === 'object' ? s.settings : {};
  // Einmalig (2026-11-18): bisher wanderten alle Pets standardmaessig frei – jetzt bleiben sie an ihrem Platz
  if (g.stayDefault !== true) for (const p of pets) { p.wander = false; if (p.homeX == null) p.homeX = p.x; }
  // Einmalig (0.8.0): "Claude"-Pets hoeren jetzt auch auf Claude Code – in 0.7.0 waren ihre Meldungen aus
  if (g.claudeEvents !== true) for (const p of pets) if (p.kind === 'claude') p.events = true;
  // Einmalig (0.11.0): feste Uhrzeiten (z. B. 12:30 Mittagspause) gelten jetzt fuer alle und stehen in den Einstellungen;
  // was bisher bei einzelnen Pets stand, wird uebernommen – das Pet bleibt der "Sprecher"
  let timed = Array.isArray(g.timed) ? g.timed : [];
  if (g.timedShared !== true) {
    timed = timed.slice();
    for (const p of pets) { timed.push(...p.reminders.timed.map((t) => ({ ...t, pet: p.id }))); p.reminders.timed = []; }
  }
  return {
    pets,
    settings: {
      stayDefault: true,
      claudeEvents: true,
      timedShared: true,
      chatter: ['aus', 'selten', 'normal', 'oft'].includes(g.chatter) ? g.chatter : 'normal',
      autostart: !!g.autostart,
      autoUpdate: g.autoUpdate !== false,
      firstRun: g.firstRun !== false,
      theme: ['dark', 'light', 'system'].includes(g.theme) ? g.theme : 'dark',
      timed: normalizeShared(timed, pets),
    },
  };
}

// Gemeinsame feste Uhrzeiten: [{ time: '12:30', text: 'Mittagspause!', pet: '<id>' | '' }] – doppelte fallen weg
function normalizeShared(list, pets = []) {
  const ids = new Set(pets.map((p) => p.id));
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    if (!t || !TIME.test(t.time)) continue;
    const text = str(t.text, 200).trim();
    if (!text) continue;
    const key = `${t.time}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ time: t.time, text, pet: ids.has(t.pet) ? t.pet : '' });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 30);
}

// Welche gemeinsamen Uhrzeiten sind jetzt dran? (innerhalb von 10 Minuten danach, einmal am Tag)
function dueShared(timed, mem, now = new Date()) {
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const cur = now.getHours() * 60 + now.getMinutes();
  mem.shared = mem.shared && mem.shared.day === day ? mem.shared : { day };
  return timed.filter((t) => {
    const m = minutesOf(t.time);
    const key = `${t.time}|${t.text}`;
    if (cur < m || cur >= m + 10 || mem.shared[key]) return false;
    mem.shared[key] = true;
    return true;
  });
}

// ---------- Pets exportieren / importieren (.dcpet) ----------
// Nur das, was ein Pet ausmacht – keine Position, keine ID, kein "ausgeblendet"
const PET_FORMAT = 'desktop-companions-pet';
function petToExport(p) {
  const { name, species, color, size, profile, lines, talent, kind, target, appName, events, reminders, wander } = p;
  return { name, species, color, size, profile, lines, talent, kind, target, appName, events, reminders, wander };
}
function exportFile(pets) {
  return { format: PET_FORMAT, version: 1, exported: new Date().toISOString().slice(0, 10), pets: pets.map(petToExport) };
}
// Datei lesen -> Liste gepruefter Pets (neue IDs); wirft bei fremden/kaputten Dateien
function importFile(data) {
  const list = data && data.format === PET_FORMAT && Array.isArray(data.pets) ? data.pets : null;
  if (!list || !list.length) throw new Error('Das ist keine Pet-Datei von Desktop Companions.');
  return list.slice(0, 20).map((raw) => {
    const p = normalizePet({ ...raw, id: undefined, x: null, y: null, homeX: null, hidden: false, muted: false, created: undefined });
    return p;
  });
}

// Nach dem Entsperren: Ist der Mensch wirklich zurueck? (waited = ms seit dem Entsperren, idleMs = ms seit der
// letzten Eingabe). Ja, wenn es NACH der Mindestwartezeit eine Eingabe gab – oder spaetestens nach maxWait.
function userIsBack(waited, idleMs, minWait = 5000, maxWait = 30000) {
  if (waited >= maxWait) return true;
  return waited >= minWait && idleMs < waited - minWait + 1000;
}

// Neues Pet: seine voreingestellten Uhrzeiten (z. B. DAN 15:45) wandern in die gemeinsamen Uhrzeiten
function takePresetTimed(pet, st) {
  const moved = pet.reminders.timed.map((t) => ({ ...t, pet: pet.id }));
  pet.reminders.timed = [];
  st.settings.timed = normalizeShared([...st.settings.timed, ...moved], [...st.pets, pet]);
}

// ---------- Erinnerungen ----------
const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function inActiveWindow(r, now) {
  const day = now.getDay();
  if (r.onlyWorkdays && (day === 0 || day === 6)) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = minutesOf(r.from), b = minutesOf(r.to);
  return a <= b ? cur >= a && cur <= b : cur >= a || cur <= b; // ueber Mitternacht
}

// mem: { lastInterval: ms, lastTimed: { 'HH:MM': 'YYYY-MM-DD' } } – pro Pet, nur im Speicher
// Gibt den Text zurueck, der jetzt gesagt werden soll, oder null.
function dueReminder(pet, mem, now = new Date(), rand = Math.random) {
  const r = pet.reminders;
  if (!r.enabled || pet.muted) return null;
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`; // lokaler Tag
  const cur = now.getHours() * 60 + now.getMinutes();
  mem.lastTimed = mem.lastTimed || {};
  for (const t of r.timed) {
    const m = minutesOf(t.time);
    // feste Uhrzeit: innerhalb von 10 Minuten danach, einmal am Tag
    if (cur >= m && cur < m + 10 && mem.lastTimed[t.time] !== day) {
      mem.lastTimed[t.time] = day;
      return t.text;
    }
  }
  if (!inActiveWindow(r, now)) return null;
  if (!mem.lastInterval) { mem.lastInterval = now.getTime(); return null; } // nicht sofort nach dem Start
  if (now.getTime() - mem.lastInterval < r.intervalMin * 60000) return null;
  mem.lastInterval = now.getTime();
  return pickMessage(r.messages, mem, rand);
}

// Zufaellig, aber nicht zweimal hintereinander dasselbe
function pickMessage(list, mem, rand = Math.random) {
  if (!list.length) return null;
  let i = Math.floor(rand() * list.length);
  if (list.length > 1 && i === mem.lastIndex) i = (i + 1) % list.length;
  mem.lastIndex = i;
  return list[i];
}

// ---------- Nachbarn ----------
// bounds: [{ id, x, y, width, height }] – Paare, deren Pets nah nebeneinander stehen
function neighborPairs(bounds, maxDx = 300, maxDy = 140) {
  const pairs = [];
  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i], b = bounds[j];
      const ax = a.x + a.width / 2, bx = b.x + b.width / 2;
      const ay = a.y + a.height, by = b.y + b.height; // Fuesse
      const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
      if (dx <= maxDx && dy <= maxDy && dx > 20) pairs.push(ax <= bx ? [a.id, b.id] : [b.id, a.id]); // links, rechts
    }
  }
  return pairs;
}

// ---------- Platz zum Stehen ----------
// others: [{ cx, bottom, size }] – Mitte und Fussposition der anderen Pets (in Bildschirm-Pixeln)
// Zwei Pets ueberlappen, wenn sie auf etwa gleicher Hoehe stehen und sich ihre Koerper beruehren.
function overlaps(cx, bottom, size, others, gap = 8) {
  return others.some((o) => Math.abs(o.bottom - bottom) < (size + o.size) * 0.45
    && Math.abs(o.cx - cx) < (size + o.size) * 0.46 + gap);
}

// Naechste freie Mitte neben cx; prefer = -1 | 1 sucht zuerst in diese Richtung. min/max: erlaubte Mitten.
function freeSpot(cx, bottom, size, others, min, max, prefer = 0) {
  if (!overlaps(cx, bottom, size, others)) return cx;
  const search = (dir) => {
    for (let x = cx + dir * 4; x >= min && x <= max; x += dir * 4) if (!overlaps(x, bottom, size, others)) return x;
    return null;
  };
  if (prefer) { // erst ganz in Laufrichtung suchen, dann in die andere
    const a = search(prefer);
    return a ?? search(-prefer) ?? cx;
  }
  const r = search(1), l = search(-1); // ohne Vorgabe: der naechste freie Platz
  if (r == null) return l ?? cx; // kein Platz (Bildschirm voller Pets): stehen lassen
  if (l == null) return r;
  return r - cx <= cx - l ? r : l;
}

// ---------- Herumlaufen ----------
// Frei wandern: irgendwo auf der Linie. Sonst nur ein paar Schritte um den Absetzpunkt (homeX),
// damit Pets, die man nebeneinander gestellt hat, auch nebeneinander bleiben.
const HOME_RADIUS = 40;
function strollTarget(pet, x, min, max, rand = Math.random) {
  if (pet.wander) {
    let dir = rand() < 0.5 ? -1 : 1;
    const dist = 30 + rand() * 90;
    if (x + dir * dist < min || x + dir * dist > max) dir = -dir;
    return Math.round(Math.min(max, Math.max(min, x + dir * dist)));
  }
  const home = pet.homeX ?? x;
  const t = home + (rand() * 2 - 1) * HOME_RADIUS;
  return Math.round(Math.min(max, Math.max(min, t)));
}

// Gruppen: alle Pets, die ueber Nachbarn verbunden sind (A neben B neben C = eine Gruppe), links nach rechts
function neighborGroups(bounds, maxDx = 300, maxDy = 140) {
  const pairs = neighborPairs(bounds, maxDx, maxDy);
  const parent = new Map(bounds.map((b) => [b.id, b.id]));
  const find = (a) => (parent.get(a) === a ? a : find(parent.get(a)));
  for (const [a, b] of pairs) parent.set(find(a), find(b));
  const groups = new Map();
  for (const b of bounds) {
    const r = find(b.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(b);
  }
  return [...groups.values()].filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2)).map((b) => b.id));
}

const CHATTER_MIN = { selten: [8, 15], normal: [3, 7], oft: [1, 3] };
function chatterDelay(level, rand = Math.random) {
  const r = CHATTER_MIN[level];
  if (!r) return null;
  return (r[0] + rand() * (r[1] - r[0])) * 60000;
}

// Kennung der Monitor-Anordnung: nur wenn sich Groesse, Lage, Skalierung, Drehung oder die Anzahl der Monitore
// aendert, muessen die Pet-Fenster neu gebaut werden. Eine andere Arbeitsflaeche (Taskleiste) zaehlt nicht.
function displayKey(displays) {
  return (displays || []).map((d) => [d.id, d.bounds.x, d.bounds.y, d.bounds.width, d.bounds.height, d.scaleFactor, d.rotation || 0].join(':')).sort().join('|');
}

module.exports = { displayKey, exportFile, importFile, petToExport, userIsBack, normalizeShared, dueShared, takePresetTimed, createPet, createChosenPet, petsForEvent, normalizePet, normalizeState, dueReminder, inActiveWindow, pickMessage, neighborPairs, neighborGroups, strollTarget, HOME_RADIUS, chatterDelay, overlaps, freeSpot, KINDS };
