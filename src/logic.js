// Reine Logik ohne Electron (wird in test/ geprueft): Daten pruefen, Erinnerungen faellig?, Nachbarn finden.
const { APPS, SPECIES, NAMES, DEFAULT_SPECIES } = require('./presets');

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
  return normalizePet({ id: newId(), kind, name: NAMES[kind], species: DEFAULT_SPECIES[kind], target: APPS[kind].target(), ...extra });
}

function normalizePet(p) {
  p = p && typeof p === 'object' ? p : {};
  const kind = KINDS.includes(p.kind) ? p.kind : 'none';
  const species = SPECIES[p.species] ? p.species : DEFAULT_SPECIES[kind];
  return {
    id: /^[a-z0-9]{4,16}$/.test(p.id) ? p.id : newId(),
    kind,
    name: str(p.name, 24).trim() || NAMES[kind],
    species,
    color: HEX.test(p.color) ? p.color : SPECIES[species].color,
    target: str(p.target, 1000).trim(),
    size: num(p.size, 70, 160, 100),
    wander: typeof p.wander === 'boolean' ? p.wander : true,
    events: typeof p.events === 'boolean' ? p.events : APPS[kind].events,
    muted: !!p.muted,
    x: Number.isFinite(p.x) ? Math.round(p.x) : null,
    y: Number.isFinite(p.y) ? Math.round(p.y) : null,
    reminders: normalizeReminders(p.reminders, kind),
  };
}

function normalizeState(s) {
  s = s && typeof s === 'object' ? s : {};
  const pets = (Array.isArray(s.pets) ? s.pets : []).slice(0, 20).map(normalizePet);
  const seen = new Set();
  for (const p of pets) { while (seen.has(p.id)) p.id = newId(); seen.add(p.id); }
  const g = s.settings && typeof s.settings === 'object' ? s.settings : {};
  return {
    pets,
    settings: {
      chatter: ['aus', 'selten', 'normal', 'oft'].includes(g.chatter) ? g.chatter : 'normal',
      autostart: !!g.autostart,
      firstRun: g.firstRun !== false,
    },
  };
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

const CHATTER_MIN = { selten: [8, 15], normal: [3, 7], oft: [1, 3] };
function chatterDelay(level, rand = Math.random) {
  const r = CHATTER_MIN[level];
  if (!r) return null;
  return (r[0] + rand() * (r[1] - r[0])) * 60000;
}

module.exports = { createPet, normalizePet, normalizeState, dueReminder, inActiveWindow, pickMessage, neighborPairs, chatterDelay, KINDS };
