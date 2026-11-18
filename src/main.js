// Desktop Companions – Hauptprozess: ein durchsichtiges, immer sichtbares Fenster pro Pet, Tray-Menue, Einstellungen,
// Erinnerungen, Gespraeche zwischen benachbarten Pets und der lokale Empfaenger fuer NEXUS & Co.
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, shell, dialog, desktopCapturer } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const { APPS, SPECIES, BEAU } = require('./presets');
const { createPet, normalizePet, normalizeState, dueReminder, pickMessage, neighborGroups, strollTarget, chatterDelay, freeSpot, KINDS } = require('./logic');
const { pickScene } = require('./dialogues');
const { startBridge, PORT } = require('./bridge');
const { Updater } = require('./updater');

const SMOKE = process.argv.includes('--smoke');
if (SMOKE) app.setPath('userData', path.join(os.tmpdir(), `pets-smoke-${Date.now()}`));
if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();

// Klicks neben dem Pet durchlassen geht nur unter Windows und macOS (Linux kennt kein "forward")
const CLICK_THROUGH = process.platform !== 'linux';
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');
const W = 260;                                 // Fensterbreite (Platz fuer die Sprechblase)
const BUBBLE_H = 120;                           // Hoehe ueber dem Pet fuer die Sprechblase
const winHeight = (pet) => BUBBLE_H + Math.round(pet.size * 1.15) + 8;
const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
const trayIcon = icon.resize({ width: 32, height: 32, quality: 'best' });

let state = null;
let tray = null;
let settingsWin = null;
let hidden = false;
let talking = false;                            // laeuft gerade ein Gespraech?
const live = new Map();                         // id -> { win, mem, busyUntil, dragging, walking, inTalk }
const groupNext = new Map();                    // Gruppe ("idA|idB|…") -> Zeitpunkt der naechsten Szene
const recentScenes = [];
const log = (...a) => console.log(...a);

// ---------- Speichern ----------
const file = () => path.join(app.getPath('userData'), 'pets.json');
// Umzug: bis 0.2.0 hiess die App "Pets" und speicherte in %APPDATA%\Pets (bzw. ~/Library/Application Support/Pets)
function migrateFromPets() {
  if (SMOKE || fs.existsSync(file())) return;
  const old = path.join(app.getPath('appData'), 'Pets', 'pets.json');
  try {
    if (!fs.existsSync(old)) return;
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.copyFileSync(old, file());
    log('[umzug] Pets-Daten uebernommen aus', old);
  } catch (e) { log('[umzug]', e.message); }
}
function load() {
  migrateFromPets();
  try { state = normalizeState(JSON.parse(fs.readFileSync(file(), 'utf8'))); } catch { state = normalizeState({}); }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(file()), { recursive: true });
      fs.writeFileSync(file() + '.tmp', JSON.stringify(state, null, 2));
      fs.renameSync(file() + '.tmp', file());
    } catch (e) { log('[save]', e.message); }
  }, 300);
}
const petById = (id) => state.pets.find((p) => p.id === id);

// ---------- Fenster ----------
function workAreaAt(x, y) { return screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea; }
function clampToScreen(pet, x, y) {
  const h = winHeight(pet);
  const a = workAreaAt(x + W / 2, y + h / 2);
  // das Pet (unterer Teil) muss sichtbar bleiben, die Blase darf oben ueberstehen
  return {
    x: Math.min(Math.max(x, a.x - W / 2 + 40), a.x + a.width - W / 2 - 40),
    y: Math.min(Math.max(y, a.y - BUBBLE_H), a.y + a.height - h),
  };
}
function defaultPos(pet) {
  const a = screen.getPrimaryDisplay().workArea;
  const i = state.pets.indexOf(pet);
  return { x: a.x + a.width - W - 40 - i * 150, y: a.y + a.height - winHeight(pet) };
}

function createPetWindow(pet) {
  if (pet.x == null || pet.y == null) Object.assign(pet, defaultPos(pet));
  if (pet.homeX == null) pet.homeX = pet.x;
  Object.assign(pet, clampToScreen(pet, pet.x, pet.y));
  const win = new BrowserWindow({
    x: pet.x, y: pet.y, width: W, height: winHeight(pet),
    transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true, hasShadow: false,
    focusable: false, show: false, alwaysOnTop: true, backgroundColor: '#00000000', icon,
    webPreferences: { preload: path.join(__dirname, 'pet', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  if (CLICK_THROUGH) win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'pet', 'pet.html'), { query: { id: pet.id } });
  win.webContents.on('did-finish-load', () => { const p = petById(pet.id); if (p) win.webContents.send('pet:update', publicPet(p)); });
  win.once('ready-to-show', () => { if (!hidden) win.showInactive(); });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const entry = { win, mem: {}, busyUntil: 0, dragging: null, walking: null, inTalk: false };
  live.set(pet.id, entry);
  win.on('closed', () => { if (live.get(pet.id) === entry) live.delete(pet.id); });
  return entry;
}
const send = (id, ch, ...args) => { const e = live.get(id); if (e && !e.win.isDestroyed()) e.win.webContents.send(ch, ...args); };
const entryOf = (wc) => { for (const [id, e] of live) if (!e.win.isDestroyed() && e.win.webContents === wc) return [id, e]; return [null, null]; };

function refreshPet(pet) {
  const e = live.get(pet.id);
  if (!e) return createPetWindow(pet);
  const [x, y] = e.win.getPosition();
  e.win.setBounds({ x, y, width: W, height: winHeight(pet) });
  send(pet.id, 'pet:update', publicPet(pet));
}
const publicPet = (p) => ({ id: p.id, name: p.name, species: p.species, color: p.color, size: p.size, muted: p.muted, kind: p.kind });

// ---------- Sprechen ----------
// mood: happy | sad | alert | talk | sleep; ms: wie lange die Blase steht; open: Klick auf die Blase oeffnet die App
function say(id, text, { ms, mood = 'talk', open = false } = {}) {
  const e = live.get(id);
  if (!e || !text) return;
  ms = ms || Math.min(14000, 2600 + text.length * 55);
  e.busyUntil = Date.now() + ms;
  send(id, 'pet:say', { text, ms, mood, open });
}

// ---------- App oeffnen ----------
async function openApp(pet) {
  const t = pet.target;
  if (!t) { send(pet.id, 'pet:mood', 'happy'); return; }
  if (/^https?:\/\//i.test(t)) { shell.openExternal(t); send(pet.id, 'pet:mood', 'happy'); return; }
  if (!fs.existsSync(t)) {
    say(pet.id, `Ich finde ${APPS[pet.kind].label === 'Keine' ? 'die App' : APPS[pet.kind].label} nicht 😿 Schau mal in die Einstellungen (Rechtsklick).`, { mood: 'sad', ms: 7000 });
    return;
  }
  const err = await shell.openPath(t);
  if (err) say(pet.id, `Das Öffnen hat nicht geklappt: ${err}`, { mood: 'sad', ms: 6000 });
  else send(pet.id, 'pet:mood', 'happy');
}

// ---------- Ziehen & Klicken ----------
ipcMain.on('pet:hover', (ev, over) => {
  const [, e] = entryOf(ev.sender);
  if (e && !e.dragging && CLICK_THROUGH) e.win.setIgnoreMouseEvents(!over, { forward: true });
});
ipcMain.on('pet:drag-start', (ev) => {
  const [id, e] = entryOf(ev.sender);
  if (!e) return;
  stopWalk(id);
  const c = screen.getCursorScreenPoint();
  const [wx, wy] = e.win.getPosition();
  e.dragging = { cx: c.x, cy: c.y, wx, wy, t: Date.now(), moved: 0 };
  e.win.setIgnoreMouseEvents(false);
  e.dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const d = e.dragging;
    if (!d || e.win.isDestroyed()) return;
    d.moved = Math.max(d.moved, Math.abs(p.x - d.cx) + Math.abs(p.y - d.cy));
    if (d.moved > 4) { send(id, 'pet:dragging', true); e.win.setPosition(Math.round(d.wx + p.x - d.cx), Math.round(d.wy + p.y - d.cy)); }
  }, 12);
});
ipcMain.on('pet:drag-end', (ev) => {
  const [id, e] = entryOf(ev.sender);
  if (!e || !e.dragging) return;
  clearInterval(e.dragTimer);
  const d = e.dragging;
  e.dragging = null;
  send(id, 'pet:dragging', false);
  const pet = petById(id);
  if (!pet) return;
  if (d.moved <= 4) { openApp(pet); return; }
  const [x, y] = e.win.getPosition();
  const c = clampToScreen(pet, x, y);
  e.win.setPosition(c.x, c.y);
  Object.assign(pet, c);
  pet.homeX = c.x; // hier wurde es abgesetzt
  save();
  // auf einem anderen Pet abgesetzt? nach dem Freudenhuepfer zur Seite rutschen (in Zugrichtung)
  setTimeout(() => makeRoom(pet, Math.sign(c.x - d.wx)), 750);
});
ipcMain.on('pet:bubble-click', (ev, open) => {
  const [id] = entryOf(ev.sender);
  const pet = id && petById(id);
  if (pet && open) openApp(pet);
});
ipcMain.on('pet:context', (ev) => {
  const [id, e] = entryOf(ev.sender);
  const pet = id && petById(id);
  if (!pet) return;
  Menu.buildFromTemplate([
    { label: pet.name, enabled: false },
    { type: 'separator' },
    ...(pet.target ? [{ label: `${APPS[pet.kind].label === 'Keine' ? 'App' : APPS[pet.kind].label} öffnen`, click: () => openApp(pet) }] : []),
    { label: 'Sag was!', click: () => speakNow(pet) },
    { label: pet.muted ? 'Aufwecken' : 'Schlafen legen (keine Erinnerungen)', click: () => { pet.muted = !pet.muted; save(); refreshPet(pet); if (!pet.muted) say(pet.id, 'Bin wieder wach! ☀️', { mood: 'happy' }); } },
    { label: 'Frei herumwandern', type: 'checkbox', checked: pet.wander, click: () => { pet.wander = !pet.wander; if (!pet.wander) pet.homeX = live.get(pet.id).win.getPosition()[0]; save(); updateTray(); sendSettings(); } },
    { type: 'separator' },
    { label: 'Einstellungen …', click: () => openSettings(pet.id) },
    { label: 'Pet entfernen', click: () => removePet(pet.id) },
  ]).popup({ window: e.win });
});

function speakNow(pet) {
  const e = live.get(pet.id);
  if (!e) return;
  say(pet.id, pickMessage(pet.reminders.messages, e.mem), { open: !!pet.target, mood: 'happy' });
}

// ---------- Herumlaufen ----------
function stopWalk(id) {
  const e = live.get(id);
  if (!e || !e.walking) return;
  clearInterval(e.walking);
  e.walking = null;
  e.walkTarget = null;
  send(id, 'pet:walk', 0);
}
// Wo stehen die anderen Pets (bzw. wo werden sie gleich stehen)? Fuer "nicht aufeinander stehen bleiben".
function othersOf(id) {
  const out = [];
  for (const p of state.pets) {
    const e = live.get(p.id);
    if (p.id === id || !e || e.dragging || e.win.isDestroyed()) continue;
    const [x, y] = e.win.getPosition();
    out.push({ cx: (e.walkTarget ?? x) + W / 2, bottom: y + winHeight(p), size: p.size });
  }
  return out;
}
// Erlaubte Fensterpositionen (x) auf dem Bildschirm, auf dem das Pet steht
function xRange(pet, x, y) {
  const a = workAreaAt(x + W / 2, y + winHeight(pet) / 2);
  return [a.x - W / 2 + 40, a.x + a.width - W / 2 - 40];
}
// Freier Platz fuer das Fenster bei x (prefer: Suchrichtung)
function freeX(pet, x, y, prefer = 0) {
  const [min, max] = xRange(pet, x, y);
  return Math.round(freeSpot(x + W / 2, y + winHeight(pet), pet.size, othersOf(pet.id), min + W / 2, max + W / 2, prefer) - W / 2);
}

// Gemuetlich nach targetX laufen. Unterwegs darf es an anderen vorbeigehen; ist das Ziel besetzt,
// laeuft es in derselben Richtung weiter bis zum naechsten freien Platz (am Rand: zurueck).
function walkTo(pet, targetX, speed = 1.5, { setHome = false } = {}) {
  const e = live.get(pet.id);
  if (!e) return;
  stopWalk(pet.id);
  const [x, y] = e.win.getPosition();
  let dir = Math.sign(targetX - x);
  targetX = freeX(pet, targetX, y, dir);
  dir = Math.sign(targetX - x);
  if (!dir) return;
  e.walkTarget = targetX;
  send(pet.id, 'pet:walk', dir);
  let cx = x;
  e.walking = setInterval(() => {
    if (e.win.isDestroyed()) return stopWalk(pet.id);
    cx += dir * speed;
    e.win.setPosition(Math.round(cx), y);
    if ((dir > 0 && cx >= e.walkTarget) || (dir < 0 && cx <= e.walkTarget)) {
      // ist inzwischen jemand anderes dort stehen geblieben? dann noch ein Stueck weiter
      e.walkTarget = null;
      const again = freeX(pet, Math.round(cx), y, dir);
      if (Math.abs(again - cx) > 2) { e.walkTarget = again; dir = Math.sign(again - cx); send(pet.id, 'pet:walk', dir); return; }
      stopWalk(pet.id);
      pet.x = Math.round(cx); pet.y = y;
      if (setHome) pet.homeX = pet.x;
      save();
    }
  }, 16);
}
// Steht ein Pet auf einem anderen? Dann zur Seite gehen.
function makeRoom(pet, prefer = 0) {
  const e = live.get(pet.id);
  if (!e || e.dragging || e.walking) return;
  const [x, y] = e.win.getPosition();
  const nx = freeX(pet, x, y, prefer);
  if (nx !== x) walkTo(pet, nx, 2.5, { setHome: true });
}

// Herumlaufen: frei wandernde Pets ueberall auf der Linie, die anderen nur ein paar Schritte um ihren Platz
function maybeWander() {
  if (hidden) return;
  for (const pet of state.pets) {
    const e = live.get(pet.id);
    if (!e || e.dragging || e.walking || e.inTalk) continue;
    if (pet.muted || Date.now() < e.busyUntil || Math.random() > (pet.wander ? 0.18 : 0.14)) { makeRoom(pet); continue; }
    const [x, y] = e.win.getPosition();
    const [min, max] = xRange(pet, x, y);
    const target = strollTarget(pet, x, min, max);
    if (Math.abs(target - x) < 8) continue;
    // in der Naehe bleiben: ist das Ziel besetzt, lieber stehen bleiben statt weit auszuweichen
    if (!pet.wander && freeX(pet, target, y, Math.sign(target - x)) !== target) continue;
    walkTo(pet, target);
  }
}

// ---------- Szenen: Gespraeche und Aktionen, zu zweit oder in der Gruppe ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lineMs = (l) => (l.text ? Math.min(6000, 1800 + l.text.length * 50) : l.mood === 'sleep' ? 3500 : 1400);
async function runScene(groupIds) {
  const pets = groupIds.map(petById).filter(Boolean);
  if (pets.length < 2) return;
  const scene = pickScene(pets, Math.random, recentScenes);
  recentScenes.push(scene.key); if (recentScenes.length > 8) recentScenes.shift();
  const cast = scene.ids.filter((id) => live.has(id));
  talking = true;
  // alle Beteiligten schauen zur Mitte der Gruppe
  const cx = (id) => live.get(id).win.getPosition()[0];
  const mid = cast.reduce((s, id) => s + cx(id), 0) / cast.length;
  for (const id of cast) { const e = live.get(id); e.inTalk = true; stopWalk(id); send(id, 'pet:face', Math.sign(mid - cx(id))); }
  try {
    for (const line of scene.lines) {
      if (!cast.every((id) => live.has(id))) break;
      const ms = lineMs(line);
      for (const id of line.ids) {
        if (line.text) say(id, line.text, { ms, mood: line.mood });
        else send(id, 'pet:mood', { mood: line.mood, ms });
      }
      await sleep(ms + 250);
    }
  } finally {
    for (const id of cast) { const e = live.get(id); if (e) e.inTalk = false; send(id, 'pet:face', 0); }
    talking = false;
  }
}
// Gruppen nebeneinander stehender Pets finden; jede Gruppe plaudert nach ihrer eigenen Wartezeit
function maybeChat(force = false) {
  if (talking || hidden || state.settings.chatter === 'aus') return null;
  const bounds = [];
  for (const pet of state.pets) {
    const e = live.get(pet.id);
    if (!e || pet.muted || e.dragging || Date.now() < e.busyUntil) continue;
    const [x, y] = e.win.getPosition();
    const h = winHeight(pet);
    bounds.push({ id: pet.id, x, y: y + BUBBLE_H, width: W, height: h - BUBBLE_H });
  }
  const groups = neighborGroups(bounds);
  const now = Date.now();
  const keys = groups.map((g) => [...g].sort().join('|'));
  for (const key of groupNext.keys()) if (!keys.includes(key)) groupNext.delete(key); // auseinandergegangen
  for (const i of groups.map((_, k) => k).sort(() => Math.random() - 0.5)) {
    const key = keys[i];
    if (!groupNext.has(key) && !force) { groupNext.set(key, now + 25000 + Math.random() * 40000); continue; } // frisch zusammen: bald
    if (force || now >= groupNext.get(key)) {
      groupNext.set(key, now + chatterDelay(state.settings.chatter));
      runScene(groups[i]);
      return groups[i];
    }
  }
  return null;
}

// ---------- Erinnerungen ----------
function checkReminders() {
  const now = new Date();
  for (const pet of state.pets) {
    const e = live.get(pet.id);
    if (!e) continue;
    const text = e.mem.pending || dueReminder(pet, e.mem, now);
    if (!text) continue;
    if (e.inTalk || e.dragging || Date.now() < e.busyUntil) { e.mem.pending = text; continue; } // gleich danach
    e.mem.pending = null;
    say(pet.id, text, { mood: 'alert', open: !!pet.target, ms: 12000 });
  }
}

// ---------- Meldungen anderer Apps ----------
function onAppEvent(ev) {
  const targets = state.pets.filter((p) => p.events && (ev.pet ? p.id === ev.pet : p.kind === ev.app));
  const where = ev.project ? ` (${ev.project})` : '';
  for (const pet of targets) {
    if (ev.type === 'task-done') say(pet.id, `✅ Fertig in 3C${where}! Klick mich zum Ansehen.`, { mood: 'happy', open: true, ms: 20000 });
    else if (ev.type === 'task-error') say(pet.id, `⚠️ In 3C ist etwas schiefgelaufen${where}.`, { mood: 'sad', open: true, ms: 20000 });
    else if (ev.type === 'decision') say(pet.id, `❓ Claude braucht deine Entscheidung${where}${ev.tool ? ': ' + ev.tool : ''}`, { mood: 'alert', open: true, ms: 30000 });
    else say(pet.id, ev.text, { mood: 'happy', open: !!pet.target });
  }
  return targets.length;
}

// ---------- Pets verwalten ----------
// Beau: Kater mit Hexenhut, verbunden mit Nook, eigene Sprueche
const beauExtra = () => {
  const base = createPet(BEAU.kind);
  return { name: BEAU.name, species: BEAU.species, reminders: { ...base.reminders, messages: BEAU.messages } };
};
function beauGreeting() {
  const h = new Date().getHours();
  return BEAU.greetings[h < 5 ? 'nacht' : h < 11 ? 'morgen' : h < 18 ? 'tag' : h < 23 ? 'abend' : 'nacht'];
}
function addPet(kind, extra) {
  if (kind === 'beau') { kind = BEAU.kind; extra = { ...beauExtra(), ...extra }; }
  const pet = createPet(kind, extra);
  state.pets.push(pet);
  createPetWindow(pet);
  save();
  updateTray();
  setTimeout(() => say(pet.id, pet.species === 'beau' ? 'Mrrp! Ich bin Beau. 🎩 *winkt*' : `Hallo, ich bin ${pet.name}! 👋`, { mood: 'happy' }), 900);
  return pet;
}
function removePet(id) {
  state.pets = state.pets.filter((p) => p.id !== id);
  const e = live.get(id);
  if (e) { stopWalk(id); e.win.destroy(); live.delete(id); }
  save();
  updateTray();
  sendSettings();
}

// ---------- Einstellungen ----------
function openSettings(focusId) {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); if (focusId) settingsWin.webContents.send('settings:focus', focusId); return; }
  settingsWin = new BrowserWindow({
    width: 940, height: 680, minWidth: 720, minHeight: 500, title: 'Desktop Companions – Einstellungen', icon, autoHideMenuBar: true, show: false,
    backgroundColor: '#1d1b26',
    webPreferences: { preload: path.join(__dirname, 'settings', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings', 'settings.html'), { query: focusId ? { focus: focusId } : {} });
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWin.webContents.on('will-navigate', (e) => e.preventDefault());
  settingsWin.on('closed', () => { settingsWin = null; });
}
const sendSettings = () => settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents.send('settings:state', settingsPayload());
function settingsPayload() {
  return {
    state,
    apps: Object.fromEntries(KINDS.map((k) => [k, { label: APPS[k].label, hint: APPS[k].hint, target: APPS[k].target() }])),
    species: Object.fromEntries(Object.entries(SPECIES).map(([k, v]) => [k, v.label])),
    port: PORT,
    packaged: app.isPackaged,
    version: app.getVersion(),
    update: updater ? updater.state : { status: 'off' },
  };
}
ipcMain.handle('settings:get', () => settingsPayload());
ipcMain.handle('settings:preset', (_e, kind) => {
  if (!KINDS.includes(kind)) return null;
  const p = createPet(kind);
  return { name: p.name, species: p.species, color: p.color, target: p.target, reminders: p.reminders, events: p.events };
});
ipcMain.handle('settings:save-pet', (_e, data) => {
  const old = petById(data && data.id);
  if (!old) return null;
  const pet = normalizePet({ ...old, ...data, id: old.id, x: old.x, y: old.y });
  // Wandern ausgeschaltet: ab jetzt in der Naehe des aktuellen Platzes bleiben
  if (old.wander && !pet.wander && live.get(pet.id)) pet.homeX = live.get(pet.id).win.getPosition()[0];
  state.pets[state.pets.indexOf(old)] = pet;
  save();
  refreshPet(pet);
  updateTray();
  return pet;
});
ipcMain.handle('settings:add-pet', (_e, kind) => addPet(KINDS.includes(kind) || kind === 'beau' ? kind : 'none'));
ipcMain.handle('settings:remove-pet', (_e, id) => { removePet(id); return true; });
ipcMain.handle('settings:test-pet', (_e, id) => { const p = petById(id); if (p) speakNow(p); });
ipcMain.handle('settings:open-app', (_e, id) => { const p = petById(id); if (p) openApp(p); });
ipcMain.handle('settings:chat-now', () => !!maybeChat(true));
ipcMain.handle('settings:save-global', (_e, g) => {
  state = normalizeState({ ...state, settings: { ...state.settings, ...g } });
  applyAutostart();
  save();
  return state.settings;
});
ipcMain.handle('settings:pick-file', async () => {
  const r = await dialog.showOpenDialog(settingsWin, { properties: ['openFile'], filters: [{ name: 'Programme', extensions: ['exe', 'lnk', 'bat', 'cmd'] }, { name: 'Alle Dateien', extensions: ['*'] }] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('settings:update-check', () => (updater ? updater.check(true) : { status: 'off' }));
ipcMain.handle('settings:update-install', () => { if (updater) updater.install(); });

// ---------- Updates (wie bei NEXUS) ----------
const RELEASES = 'https://github.com/CaseyMazey/Desktop-Companions/releases/latest';
let updater = null;
const asked = new Set(); // pro Version nur einmal fragen
function onUpdateState(s) {
  updateTray();
  sendSettings();
  if (s.status === 'ready' && !asked.has(s.version)) {
    asked.add(s.version);
    const first = state.pets.find((p) => !p.muted);
    if (first) say(first.id, `🎁 Update auf ${s.version} ist bereit!`, { mood: 'happy', ms: 9000 });
    dialog.showMessageBox({
      type: 'info', title: 'Desktop Companions', icon,
      message: `Desktop Companions ${s.version} ist bereit.`,
      detail: 'Jetzt neu starten, um das Update zu installieren? Sonst wird es beim nächsten Beenden installiert.',
      buttons: ['Jetzt neu starten', 'Später'], defaultId: 0, cancelId: 1, noLink: true,
    }).then((r) => { if (r.response === 0) updater.install(); });
  }
  if (s.status === 'available' && !asked.has(s.version)) {
    asked.add(s.version);
    dialog.showMessageBox({
      type: 'info', title: 'Desktop Companions', icon,
      message: `Desktop Companions ${s.version} ist da.`,
      detail: 'Auf diesem System kann sich die App nicht selbst aktualisieren. Die neue Version auf GitHub herunterladen?',
      buttons: ['Herunterladen', 'Später'], defaultId: 0, cancelId: 1, noLink: true,
    }).then((r) => { if (r.response === 0) updater.install(); });
  }
}
function updateMenuItem() {
  const s = updater ? updater.state : { status: 'off' };
  if (s.status === 'ready') return { label: `Update auf ${s.version} installieren (neu starten)`, click: () => updater.install() };
  if (s.status === 'available') return { label: `Version ${s.version} herunterladen …`, click: () => updater.install() };
  if (s.status === 'downloading') return { label: `Update wird geladen … ${s.percent || 0} %`, enabled: false };
  return { label: 'Nach Updates suchen', enabled: s.status !== 'off' && s.status !== 'checking', click: () => updater.check(true) };
}

function applyAutostart() {
  if (!app.isPackaged) return; // aus dem Quellcode gestartet: kein Autostart fuer electron.exe eintragen
  app.setLoginItemSettings({ openAtLogin: state.settings.autostart });
}

// ---------- Tray ----------
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: hidden ? 'Pets zeigen' : 'Pets verstecken', click: toggleHidden },
    { label: 'Neues Pet', submenu: [
      ...KINDS.map((k) => ({ label: k === 'none' ? 'Ohne App' : `Verbunden mit ${APPS[k].label}`, click: () => addPet(k) })),
      { type: 'separator' },
      { label: 'Beau 🎩 (mit Nook)', click: () => addPet('beau') },
    ] },
    { label: 'Plaudern lassen', enabled: state.pets.length > 1, click: () => maybeChat(true) },
    { label: 'Alle Pets frei wandern lassen', type: 'checkbox', checked: state.pets.length > 0 && state.pets.every((p) => p.wander), click: (item) => setAllWander(item.checked) },
    { label: 'Einstellungen …', click: () => openSettings() },
    { type: 'separator' },
    updateMenuItem(),
    { label: 'Beenden', click: () => app.quit() },
  ]));
}
function setAllWander(on) {
  for (const p of state.pets) {
    p.wander = on;
    const e = live.get(p.id);
    if (!on && e) p.homeX = e.win.getPosition()[0]; // ab jetzt in der Naehe des aktuellen Platzes bleiben
  }
  save();
  updateTray();
  sendSettings();
}
function toggleHidden() {
  hidden = !hidden;
  for (const e of live.values()) hidden ? e.win.hide() : e.win.showInactive();
  updateTray();
}

// ---------- Start ----------
app.on('second-instance', () => openSettings());
app.on('window-all-closed', () => { /* Pets laufen im Tray weiter */ });

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('io.github.caseymazey.pets');
  if (process.platform === 'darwin' && app.dock) app.dock.hide(); // lebt in der Menueleiste, nicht im Dock
  load();
  if (state.settings.firstRun && !state.pets.length) {
    // Erster Start: je ein Pet fuer jede gefundene App, nebeneinander (damit sie gleich plaudern koennen)
    const found = ['nexus', 'dan', 'nook'].filter((k) => SMOKE || fs.existsSync(APPS[k].target()));
    for (const k of found.length ? found : ['none']) state.pets.push(createPet(k));
    state.settings.firstRun = false;
    save();
  }
  for (const pet of state.pets) createPetWindow(pet);
  if (!SMOKE) setTimeout(() => state.pets.forEach((p) => makeRoom(p)), 1500);
  // Beau begruesst dich beim Start und hebt die Pfote (Wunsch aus dem Beau-Theme)
  if (!SMOKE) setTimeout(() => state.pets.filter((p) => p.species === 'beau' && !p.muted).forEach((p) => say(p.id, beauGreeting(), { mood: 'happy', ms: 6000 })), 2500);
  tray = new Tray(trayIcon);
  tray.setToolTip('Desktop Companions');
  tray.on('click', () => openSettings());
  updateTray();
  startBridge(onAppEvent, log);
  updater = new Updater({
    enabled: app.isPackaged && !SMOKE, releasesUrl: RELEASES, log,
    isEnabledSetting: () => state.settings.autoUpdate !== false, onState: onUpdateState,
  });
  updater.start();
  setInterval(checkReminders, 30000);
  setInterval(() => maybeChat(), 12000);
  setInterval(maybeWander, 9000);
  screen.on('display-removed', () => { for (const p of state.pets) refreshPet(Object.assign(p, clampToScreen(p, p.x, p.y))); });
  if (SMOKE) runSmoke();
});

// ---------- Rauchtest (npm run smoke): Fenster abfotografieren, Meldung und Gespraech pruefen ----------
async function runSmoke() {
  const out = process.env.PETS_SMOKE_OUT || app.getPath('userData');
  fs.mkdirSync(out, { recursive: true });
  addPet('beau');
  const report = { pets: state.pets.map((p) => `${p.name}/${p.kind}/${p.species}`) };
  // zwei Pets nebeneinander, das dritte weit weg
  const a = screen.getPrimaryDisplay().workArea;
  state.pets.forEach((p, i) => { const e = live.get(p.id); const x = i < 2 ? a.x + 300 + i * 170 : a.x + 1000; e.win.setPosition(x, a.y + 200); p.x = x; p.y = a.y + 200; });
  await sleep(1500);
  const post = (body, type = 'application/json') => new Promise((res) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: '/event', method: 'POST', headers: { 'Content-Type': type } }, (rs) => { let d = ''; rs.on('data', (c) => { d += c; }); rs.on('end', () => res(`${rs.statusCode} ${d}`)); });
    r.on('error', (e) => res('ERR ' + e.message));
    r.end(body);
  });
  report.eventNexus = await post(JSON.stringify({ app: 'nexus', type: 'task-done', project: 'Portfolio', seconds: 42 }));
  report.eventTextPlain = await post(JSON.stringify({ app: 'nexus', type: 'say', text: 'x' }), 'text/plain');
  report.eventBad = await post('{"app":"nexus","type":"rm -rf"}');
  await sleep(1200);
  await shot('1-nexus-fertig');
  report.dom = [];
  for (const e of live.values()) {
    report.dom.push(await e.win.webContents.executeJavaScript(`({ sprite: document.getElementById('sprite').innerHTML.length, cls: document.getElementById('pet').className, bubble: document.getElementById('bubble').className + ' ' + document.getElementById('bubble-text').textContent, size: innerWidth + 'x' + innerHeight, vis: document.visibilityState })`));
    report.bounds = (report.bounds || []).concat([e.win.getBounds(), e.win.isVisible()]);
  }
  for (const e of live.values()) e.busyUntil = 0;
  // Erinnerung (DAN) und Gespraech erzwingen
  const dan = state.pets.find((p) => p.kind === 'dan');
  if (dan) { live.get(dan.id).win.setPosition(a.x + 1400, a.y + 200); say(dan.id, dan.reminders.messages[0], { mood: 'alert', open: true }); }
  await sleep(300);
  for (const e of live.values()) if (!dan || e !== live.get(dan.id)) e.busyUntil = 0;
  // Nook neben NEXUS stellen
  const nook = state.pets.find((p) => p.kind === 'nook');
  if (nook) live.get(nook.id).win.setPosition(a.x + 470, a.y + 200);
  report.chatPair = maybeChat(true);
  await sleep(1300);
  await shot('2-gespraech-und-erinnerung');
  // zwei Pets aufeinander: eins muss zur Seite gehen
  await sleep(6000);
  const [p1, p2] = state.pets;
  const [x1, y1] = live.get(p1.id).win.getPosition();
  live.get(p2.id).win.setPosition(x1 + 15, y1);
  makeRoom(p2, 1);
  await sleep(2500);
  report.platz = { vorher: 15, nachher: live.get(p2.id).win.getPosition()[0] - live.get(p1.id).win.getPosition()[0] };
  await shot('2b-platz-gemacht');
  // alle vier nebeneinander: Gruppenszene
  await sleep(4000);
  talking = false;
  state.pets.forEach((p, i) => { const e = live.get(p.id); stopWalk(p.id); e.busyUntil = 0; e.win.setPosition(a.x + 300 + i * 170, a.y + 200); });
  await sleep(300);
  report.gruppe = maybeChat(true);
  await sleep(2200);
  report.szene = recentScenes[recentScenes.length - 1];
  await shot('2c-gruppe');
  openSettings();
  await sleep(1800);
  const img = await settingsWin.webContents.capturePage();
  fs.writeFileSync(path.join(out, '3-einstellungen.png'), img.toPNG());
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  log('[smoke]', JSON.stringify(report));
  app.exit(0);

  // durchsichtige Fenster lassen sich nicht einzeln abfotografieren: Bildschirmausschnitt um die Pets
  async function shot(name) {
    const d = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: d.size.width * d.scaleFactor, height: d.size.height * d.scaleFactor } });
    const img2 = sources[0].thumbnail;
    const f = d.scaleFactor;
    const crop = img2.crop({ x: Math.round((a.x + 200) * f), y: Math.round((a.y + 150) * f), width: Math.round(1500 * f), height: Math.round(330 * f) });
    fs.writeFileSync(path.join(out, `${name}.png`), crop.toPNG());
  }
}
