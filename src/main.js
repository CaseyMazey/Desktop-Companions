// Desktop Companions – Hauptprozess: ein durchsichtiges, immer sichtbares Fenster pro Pet, Tray-Menue, Einstellungen,
// Erinnerungen, Gespraeche zwischen benachbarten Pets und der lokale Empfaenger fuer NEXUS & Co.
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, shell, dialog, desktopCapturer, clipboard, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const { APPS, SPECIES, BEAU, GROUPS } = require('./presets');
const { displayKey, exportFile, importFile, userIsBack, dueShared, takePresetTimed, createPet, createChosenPet, petsForEvent, normalizePet, normalizeState, dueReminder, pickMessage, neighborGroups, strollTarget, chatterDelay, freeSpot, KINDS } = require('./logic');
const { pickScene, pettedLine } = require('./dialogues');
const { startBridge, PORT } = require('./bridge');
const { settingsFile, hookJson, hasHook, installHook } = require('./claudehook');
const { COMPANION, FACTS, lockLine, lottiPraise, weatherLook, TALENTS, LINES, moonOf, talentDue, companionDue, companionInfo, SCARED, shortEvent, BREATH, FOCUS, FOCUS_LINES, TIMER_LINES } = require('./talents');
const { loadNookCards } = require('./nookcards');
const { startWatch } = require('./watch-win');
const { Updater } = require('./updater');

const SMOKE = process.argv.includes('--smoke');
if (SMOKE) app.setPath('userData', path.join(os.tmpdir(), `pets-smoke-${Date.now()}`));
// Fuer Tests: eigener Datenordner, damit eine installierte Desktop-Companions-Instanz unberuehrt bleibt
else if (process.env.PETS_USERDATA) app.setPath('userData', process.env.PETS_USERDATA);
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
let hidden = false;                             // von Hand versteckt (Tray)
let autoHidden = false;                         // von Buh versteckt (Meeting/Vollbild)
const allHidden = () => hidden || autoHidden;
let talking = false;                            // laeuft gerade ein Gespraech?
const live = new Map();                         // id -> { win, mem, busyUntil, dragging, walking, inTalk }
const groupNext = new Map();                    // Gruppe ("idA|idB|…") -> Zeitpunkt der naechsten Szene
const recentScenes = [];
const log = (...a) => console.log(...a);
// Sicherheitsnetz: ein unerwarteter Fehler soll nie eine Flut von Fehlerfenstern ausloesen, sondern nur ins Protokoll
// (error.log im Datenordner, wird bei 200 KB neu angefangen).
let errorCount = 0;
function logError(kind, err) {
  errorCount++;
  const line = `[${new Date().toISOString()}] ${kind}: ${(err && err.stack) || err}
`;
  console.error(line);
  try {
    const f = path.join(app.getPath('userData'), 'error.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 200 * 1024) fs.writeFileSync(f, '');
    fs.appendFileSync(f, line);
  } catch { /* Protokoll ist nur ein Extra */ }
}
process.on('uncaughtException', (err) => logError('Fehler', err));
process.on('unhandledRejection', (err) => logError('Promise', err));

// ---------- Speichern ----------
const file = () => path.join(app.getPath('userData'), 'pets.json');
// Umzug: bis 0.2.0 hiess die App "Pets" und speicherte in %APPDATA%\Pets (bzw. ~/Library/Application Support/Pets)
function migrateFromPets() {
  if (SMOKE || process.env.PETS_USERDATA || fs.existsSync(file())) return;
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
  // Fenster kann beim Neuaufbau schon wieder zu sein, bevor es fertig geladen hat
  const wc = win.webContents;
  wc.on('did-finish-load', () => { const p = petById(pet.id); if (p && !win.isDestroyed() && !wc.isDestroyed()) wc.send('pet:update', publicPet(p)); });
  // bei Skalierung (125 %, 150 %) legt Windows das Fenster schon ein paar Pixel zu gross an: einmal richtig setzen
  win.once('ready-to-show', () => { placeWin(pet.id, pet.x, pet.y); if (!allHidden() && !pet.hidden && !hiddenByFullscreen(pet.id)) win.showInactive(); });
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  const entry = { win, mem: {}, busyUntil: 0, dragging: null, walking: null, inTalk: false, petting: false, pettedAt: 0, pos: { x: pet.x, y: pet.y }, capturing: false };
  live.set(pet.id, entry);
  win.on('closed', () => { if (live.get(pet.id) === entry) live.delete(pet.id); });
  return entry;
}
// Position immer selbst merken und Groesse mitsetzen: Windows rundet bei Skalierung (z. B. 125 %) sonst bei
// jedem Verschieben anders, die Fenster wachsen oder sinken, und die Pets landen woanders als gewollt.
function placeWin(id, x, y) {
  const e = live.get(id);
  const pet = petById(id);
  if (!e || !pet || e.win.isDestroyed()) return;
  e.pos = { x: Math.round(x), y: Math.round(y) };
  e.win.setBounds({ x: e.pos.x, y: e.pos.y, width: W, height: winHeight(pet) });
}
const posOf = (id) => { const e = live.get(id); return e ? [e.pos.x, e.pos.y] : [0, 0]; };
const send = (id, ch, ...args) => { const e = live.get(id); if (e && !e.win.isDestroyed()) e.win.webContents.send(ch, ...args); };
const entryOf = (wc) => { for (const [id, e] of live) if (!e.win.isDestroyed() && e.win.webContents === wc) return [id, e]; return [null, null]; };

function refreshPet(pet) {
  const e = live.get(pet.id);
  if (!e) return createPetWindow(pet);
  placeWin(pet.id, e.pos.x, e.pos.y);
  send(pet.id, 'pet:update', publicPet(pet));
}
const publicPet = (p) => ({ id: p.id, name: p.name, species: p.species, color: p.color, size: p.size, muted: p.muted, kind: p.kind, talent: p.talent });

// ---------- Sprechen ----------
// mood: happy (huepfen) | greet (winken) | sad | alert | talk | sleep; ms: wie lange die Blase steht; open: Klick auf die Blase oeffnet die App
function say(id, text, { ms, mood = 'talk', open = false } = {}) {
  const e = live.get(id);
  if (!e || !text) return;
  // Bip spricht immer in Grossbuchstaben – auch in Szenen, beim Streicheln und bei Meldungen
  if (petById(id)?.species === 'robot') text = text.toLocaleUpperCase('de-DE');
  ms = ms || Math.min(14000, 2600 + text.length * 55);
  e.busyUntil = Date.now() + ms;
  send(id, 'pet:say', { text, ms, mood, open });
}

// ---------- App oeffnen ----------
async function openApp(pet) {
  const t = pet.target;
  if (!t) { send(pet.id, 'pet:mood', 'happy'); return; }
  if (/^https?:\/\//i.test(t)) { shell.openExternal(t); send(pet.id, 'pet:mood', 'happy'); return; }
  // installierte App aus der Windows-App-Liste (auch Store-Apps wie der Rechner): wie aus dem Startmenue starten
  if (/^shell:AppsFolder\\/i.test(t) && process.platform === 'win32') {
    require('node:child_process').spawn('explorer.exe', [t], { detached: true, stdio: 'ignore' }).unref();
    send(pet.id, 'pet:mood', 'happy');
    return;
  }
  if (!fs.existsSync(t)) {
    const label = pet.appName || (APPS[pet.kind].label === 'Keine' ? 'die App' : APPS[pet.kind].label);
    say(pet.id, `Ich finde ${label} nicht 😿 Schau mal in die Einstellungen (Rechtsklick).`, { mood: 'sad', ms: 7000 });
    return;
  }
  const err = await shell.openPath(t);
  if (err) say(pet.id, `Das Öffnen hat nicht geklappt: ${err}`, { mood: 'sad', ms: 6000 });
  else send(pet.id, 'pet:mood', 'happy');
}

// ---------- Ziehen & Klicken ----------
ipcMain.on('pet:hover', (ev, over) => {
  const [, e] = entryOf(ev.sender);
  if (e && !e.dragging && CLICK_THROUGH) { e.win.setIgnoreMouseEvents(!over, { forward: true }); e.capturing = over; }
});
ipcMain.on('pet:drag-start', (ev) => {
  const [id, e] = entryOf(ev.sender);
  if (!e) return;
  stopWalk(id);
  const c = screen.getCursorScreenPoint();
  const [wx, wy] = posOf(id);
  e.dragging = { cx: c.x, cy: c.y, wx, wy, t: Date.now(), moved: 0 };
  e.win.setIgnoreMouseEvents(false);
  e.capturing = true;
  e.dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const d = e.dragging;
    if (!d || e.win.isDestroyed()) return;
    d.moved = Math.max(d.moved, Math.abs(p.x - d.cx) + Math.abs(p.y - d.cy));
    if (d.moved > 4) { send(id, 'pet:dragging', true); placeWin(id, d.wx + p.x - d.cx, d.wy + p.y - d.cy); }
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
  if (d.moved <= 4) { if (!companionClick(pet)) openApp(pet); return; }
  const [x, y] = posOf(id);
  const c = clampToScreen(pet, x, y);
  placeWin(id, c.x, c.y);
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
// Streicheln: solange es dauert, laeuft das Pet nicht weg, und Szenen/Erinnerungen warten
ipcMain.on('pet:petting', (ev, on) => {
  const [id, e] = entryOf(ev.sender);
  if (!e) return;
  e.petting = !!on;
  if (on) stopWalk(id);
  else e.busyUntil = Math.max(e.busyUntil, Date.now() + 2500); // kurz nachgeniessen
});
// eine Weile gestreichelt: hoechstens alle 30 Sekunden ein Spruch, nicht im Schlaf und nicht mitten in einer Szene
ipcMain.on('pet:petted', (ev) => {
  const [id, e] = entryOf(ev.sender);
  const pet = id && petById(id);
  if (pet) { e.tmem = e.tmem || {}; e.tmem.pets = (e.tmem.pets || 0) + 1; e.tmem.lastPetAt = Date.now(); } // Buh wird mutiger, Mauz gnaediger
  // Bip lernt Gefuehle durch Streicheln
  if (pet && pet.species === 'robot' && isCompanion(pet) && [3, 10, 25].includes(e.tmem.pets)) {
    const feel = { 3: 'GEMOCHT', 10: 'GEBORGEN', 25: 'GLÜCKLICH' }[e.tmem.pets];
    say(id, `BIP! NEUES GEFÜHL FREIGESCHALTET: „${feel}“. SPEICHERE … GESPEICHERT. 💙🤖`, { mood: 'happy', ms: 6000 });
    send(id, 'pet:screen', { heart: true, ms: 6000 });
    return;
  }
  if (!pet || pet.muted || e.inTalk || Date.now() - e.pettedAt < 30000) return;
  e.pettedAt = Date.now();
  say(id, pettedLine(pet.species), { mood: 'talk', ms: 3200 });
});
ipcMain.on('pet:context', (ev) => {
  const [id, e] = entryOf(ev.sender);
  const pet = id && petById(id);
  if (!pet) return;
  Menu.buildFromTemplate([
    { label: pet.name, enabled: false },
    { type: 'separator' },
    ...(pet.target ? [{ label: `${APPS[pet.kind].label === 'Keine' ? 'App' : APPS[pet.kind].label} öffnen`, click: () => openApp(pet) }] : []),
    ...talentMenu(pet),
    ...characterMenu(pet),
    { label: 'Sag was!', click: () => speakNow(pet) },
    { label: 'Ausblenden (in den Einstellungen wieder einblenden)', click: () => setPetHidden(pet.id, true) },
    { label: pet.muted ? 'Aufwecken' : 'Schlafen legen (keine Erinnerungen)', click: () => { pet.muted = !pet.muted; save(); refreshPet(pet); if (!pet.muted) say(pet.id, 'Bin wieder wach! ☀️', { mood: 'happy' }); } },
    { label: 'Frei herumwandern', type: 'checkbox', checked: pet.wander, click: () => { pet.wander = !pet.wander; if (!pet.wander) pet.homeX = posOf(pet.id)[0]; save(); updateTray(); sendSettings(); } },
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
    if (p.id === id || p.hidden || !e || e.dragging || e.win.isDestroyed()) continue;
    const [x, y] = posOf(p.id);
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
  const [x, y] = posOf(pet.id);
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
    placeWin(pet.id, cx, y); // nur waagerecht: y bleibt fest
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
  if (!e || e.dragging || e.walking || e.petting) return;
  const [x, y] = posOf(pet.id);
  const nx = freeX(pet, x, y, prefer);
  if (nx !== x) walkTo(pet, nx, 2.5, { setHome: true });
}

// Herumlaufen: frei wandernde Pets ueberall auf der Linie, die anderen nur ein paar Schritte um ihren Platz
function maybeWander() {
  if (allHidden()) return;
  for (const pet of state.pets) {
    const e = live.get(pet.id);
    if (!e || pet.hidden || e.dragging || e.walking || e.inTalk || e.petting) continue;
    if (pet.muted || Date.now() < e.busyUntil || Math.random() > (pet.wander ? 0.18 : 0.14)) { makeRoom(pet); continue; }
    const [x, y] = posOf(pet.id);
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
  const cx = (id) => posOf(id)[0];
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
  if (talking || allHidden() || state.settings.chatter === 'aus') return null;
  const bounds = [];
  for (const pet of state.pets) {
    const e = live.get(pet.id);
    if (!e || pet.muted || pet.hidden || e.dragging || e.petting || Date.now() < e.busyUntil) continue;
    const [x, y] = posOf(pet.id);
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
    if (!e || pet.hidden) continue;
    const text = e.mem.pending || dueReminder(pet, e.mem, now);
    if (!text) continue;
    if (e.inTalk || e.dragging || e.petting || Date.now() < e.busyUntil) { e.mem.pending = text; continue; } // gleich danach
    e.mem.pending = null;
    say(pet.id, text, { mood: 'alert', open: !!pet.target, ms: 12000 });
  }
  // Gemeinsame feste Uhrzeiten (Einstellungen, z. B. 12:30 Mittagspause): das gewaehlte Pet sagt es,
  // sonst (oder wenn es schlaeft/ausgeblendet ist) das erste sichtbare, wache Pet
  for (const t of dueShared(state.settings.timed, sharedMem, now)) {
    const ok = (p) => p && !p.hidden && !p.muted && live.has(p.id) && !hiddenByFullscreen(p.id);
    const p = ok(petById(t.pet)) ? petById(t.pet) : state.pets.find(ok);
    if (!p || allHidden()) continue;
    say(p.id, t.text, { mood: 'alert', open: !!p.target, ms: 12000 });
  }
}
const sharedMem = {};

// ---------- Meldungen anderer Apps ----------
function onAppEvent(ev) {
  noteEventForTalents(ev);
  const targets = petsForEvent(state.pets, ev);
  const where = ev.project ? ` (${ev.project})` : '';
  for (const pet of targets) {
    const src = APPS[pet.kind].source || (['custom', 'none'].includes(pet.kind) ? 'der App' : APPS[pet.kind].label); // "3C", "Claude Code", …
    if (ev.type === 'task-done') say(pet.id, `✅ Fertig in ${src}${where}! Klick mich zum Ansehen.`, { mood: 'happy', open: true, ms: 20000 });
    else if (ev.type === 'task-error') say(pet.id, `⚠️ In ${src} ist etwas schiefgelaufen${where}.`, { mood: 'sad', open: true, ms: 20000 });
    else if (ev.type === 'decision') say(pet.id, `❓ Claude braucht deine Entscheidung${where}${ev.tool ? ': ' + ev.tool : ''}`, { mood: 'alert', open: true, ms: 30000 });
    else say(pet.id, ev.text, { mood: 'happy', open: !!pet.target });
  }
  return targets.length;
}

// ---------- Talente (Plan vom 2026-11-19): jedes Tier hilft auf seine Art ----------
// Aktivitaet: weg = 5 Minuten ohne Maus/Tastatur; zurueck = Pause vorbei (zaehlt fuer Garten, Bote, Streck-Pause …)
const activity = { away: false, awaySince: 0, activeSince: Date.now(), backFromBreak: 0 };
const missed = [];          // Meldungen, waehrend du weg warst (fuer den Boten)
let doneCount = 0;          // neu erledigte Auftraege seit dem letzten Takt (fuer das Lob)
let battery = null;         // { level, charging } aus einem Drachen-Fenster
const weather = {};         // ort -> { day, min, max, rain, code }
const weatherBusy = new Set();
const talentOn = (p, sp) => p.species === sp && p.talent && p.talent.enabled && !p.hidden;

function sampleActivity() {
  const idle = powerMonitor.getSystemIdleTime(); // Sekunden ohne Eingabe
  const now = Date.now();
  if (!activity.away && idle >= 300) { activity.away = true; activity.awaySince = now - idle * 1000; }
  else if (activity.away && idle < 30) {
    activity.away = false;
    activity.backFromBreak = Math.max(1, Math.round((now - activity.awaySince) / 60000));
    activity.activeSince = now;
  }
}

async function fetchWeather(place) {
  const key = place.toLowerCase();
  if (weatherBusy.has(key)) return;
  weatherBusy.add(key);
  try {
    const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name=${encodeURIComponent(place)}`)).json();
    const loc = g.results && g.results[0];
    if (!loc) { weather[key] = { day: new Date().toDateString(), missing: true }; return; }
    const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_speed_10m_max&timezone=auto&forecast_days=1`)).json();
    const d = f.daily;
    weather[key] = { day: new Date().toDateString(), max: d.temperature_2m_max[0], min: d.temperature_2m_min[0], rain: d.precipitation_probability_max[0] ?? 0, code: d.weather_code[0], wind: (d.wind_speed_10m_max || [0])[0] ?? 0 };
  } catch (e) { log('[wetter]', e.message); } finally { weatherBusy.delete(key); }
}

function applyTalentAction(pet, action) {
  if (action === 'sleep') send(pet.id, 'pet:mood', { mood: 'sleep', ms: 15000 });       // Fuchs rollt sich ein
  else if (action === 'cover') send(pet.id, 'pet:mood', { mood: 'cover', ms: 20000 });  // Panda haelt sich die Augen zu
  else if (action === 'stretch') send(pet.id, 'pet:mood', { mood: 'stretch', ms: 4000 }); // Katze streckt sich
  else if (action && action.garden) send(pet.id, 'pet:garden', action.garden);           // Pilz: Garten waechst
  else if (action && action.prop) send(pet.id, 'pet:prop', { emoji: action.prop, ms: action.ms || 6000 }); // Requisit neben dem Pet
  else if (action === 'nap') setTimeout(() => send(pet.id, 'pet:mood', { mood: 'sleep', ms: 25000 }), 3000); // Katze/Panda: Nickerchen
}

// Nooks Karteikarten fuer Huhu (nur lesend, hoechstens alle 30 Minuten neu, nur wenn eine Eule mit Nook da ist)
let cardsCache = { at: 0, cards: [] };
function nookCards() {
  if (!state.pets.some((p) => p.species === 'owl' && p.kind === 'nook' && p.talent.enabled)) return [];
  if (Date.now() - cardsCache.at > 30 * 60000) {
    cardsCache.at = Date.now();
    try { cardsCache.cards = loadNookCards(path.join(app.getPath('appData'), 'Nook')); } catch (e) { log('[karteikarten]', e.message); cardsCache.cards = []; }
  }
  return cardsCache.cards;
}

// ----- Charakter-Aktionen im Begleiter-Modus -----
// Charakter-Aktionen laufen immer (auch mit verbundener App) – nur Talent aus, schlafend oder ausgeblendet stoppt sie
const isCompanion = (p) => p.talent && p.talent.enabled && !p.hidden && !p.muted;
const free = (p) => { const e = live.get(p.id); return e && !p.hidden && !e.inTalk && !e.dragging && !e.petting && !e.breath; };
// naechstes freies Pet neben pet (gleiche Hoehe, hoechstens maxDx Pixel weg)
function neighborOf(pet, maxDx = W * 1.2) {
  const [px, py] = posOf(pet.id);
  let best = null; let bd = Infinity;
  for (const p of state.pets) {
    if (p.id === pet.id || !free(p)) continue;
    const [x, y] = posOf(p.id);
    const d = Math.abs(x - px);
    if (d < maxDx && Math.abs(y - py) < 160 && d < bd) { bd = d; best = p; }
  }
  return best;
}
// fuer den Rauchtest: wen hat Beau gerade verschwinden lassen? (naechstes Pet, auch wenn es "in einer Szene" ist)
function neighborOfAny(pet) {
  const [px, py] = posOf(pet.id);
  let best = null; let bd = Infinity;
  for (const p of state.pets) {
    if (p.id === pet.id || !live.has(p.id)) continue;
    const [x, y] = posOf(p.id);
    const d = Math.abs(x - px);
    if (Math.abs(y - py) < 160 && d < bd) { bd = d; best = p.id; }
  }
  return best;
}
const memOf = (p) => { const e = live.get(p.id); if (!e) return {}; e.tmem = e.tmem || {}; return e.tmem; };
const speciesName = (sp) => (SPECIES[sp] ? SPECIES[sp].label.replace(/\s*\(.*\)$/, '') : sp);
// Systemwerte fuer Bip (nur lokal gelesen): RAM-Belegung und CPU-Last seit der letzten Messung
let cpuLast = null;
function systemStats() {
  const cpus = os.cpus();
  const t = cpus.reduce((a, c) => { const s = Object.values(c.times).reduce((x, y) => x + y, 0); return { idle: a.idle + c.times.idle, total: a.total + s }; }, { idle: 0, total: 0 });
  let cpu = 0;
  if (cpuLast && t.total > cpuLast.total) cpu = Math.round(100 * (1 - (t.idle - cpuLast.idle) / (t.total - cpuLast.total)));
  cpuLast = t;
  return { ram: Math.round(100 * (1 - os.freemem() / os.totalmem())), cpu: Math.max(0, Math.min(100, cpu)) };
}
function screenShow(pet, label, value, ms = 8000) { send(pet.id, 'pet:screen', { label, value, ms }); }
// Lotti feuert mit, wenn andere etwas schaffen
function cheer(text, exceptId) {
  for (const p of state.pets) if (p.species === 'axolotl' && p.id !== exceptId && isCompanion(p) && free(p)) setTimeout(() => say(p.id, text, { mood: 'happy', ms: 4500 }), 2200);
}

function companionAction(pet, r) {
  const mem = memOf(pet);
  const [x] = posOf(pet.id);
  switch (r.action) {
    case 'territory': { // Mauz: "Mein Platz." – der Nachbar rutscht ein Stueck weg
      const n = neighborOf(pet, 150);
      if (!n) { say(pet.id, 'Alles meins hier. Gut so. 😼', { mood: 'talk', ms: 4000 }); return; }
      say(pet.id, 'Mein Platz. 😾', { mood: 'alert', ms: 3000 });
      setTimeout(() => {
        say(n.id, n.species === 'dragon' ? 'Ich gehe … aber nur, weil ICH will! 🐉' : 'Okay, okay … ich geh ja schon. 😅', { mood: 'sad', ms: 3500 });
        const [nx, ny] = posOf(n.id);
        walkTo(n, freeX(n, nx + Math.sign(nx - x || 1) * 150, ny, Math.sign(nx - x || 1)), 2, { setHome: true });
      }, 1200);
      return;
    }
    case 'gift': // Mauz bringt dir etwas
      say(pet.id, 'Ich hab dir was mitgebracht. Gern geschehen. 😼', { mood: 'talk', ms: 5000 });
      send(pet.id, 'pet:prop', { emoji: '🐭', ms: 120000 });
      return;
    case 'yawn': { // Bambus gaehnt – und steckt die Nachbarn an
      say(pet.id, '*gääähn* 🥱', { mood: 'sleep', ms: 3000 });
      const [px, py] = posOf(pet.id);
      for (const p of state.pets) {
        if (p.id === pet.id || !free(p)) continue;
        const [nx, ny] = posOf(p.id);
        if (Math.abs(nx - px) < W * 1.6 && Math.abs(ny - py) < 160) setTimeout(() => say(p.id, '*gähn* … das steckt an. 🥱', { mood: 'sleep', ms: 2600 }), 1300 + Math.random() * 800);
      }
      return;
    }
    case 'gossip': { // Piep: Klatsch ueber die anderen Pets
      const news = [];
      for (const p of state.pets) {
        if (p.id === pet.id) continue;
        const m = memOf(p);
        if (m.scares) news.push(`${p.name} hat heute schon ${m.scares}× versucht, jemanden zu erschrecken!`);
        if (m.naps) news.push(`${p.name} hat heute ${m.naps} Nickerchen gemacht. Skandal!`);
        if (m.focusMin) news.push(`${p.name} meldet ${m.focusMin} Minuten Fokus! Rekordverdächtig!`);
        if (m.flies) news.push(`${p.name} hat ${m.flies} Fliegen gefangen! Die Fliegen sind empört!`);
        if (m.glasses) news.push(`${p.name} meldet: ${m.glasses} ${m.glasses === 1 ? 'Glas' : 'Gläser'} Wasser getrunken!`);
        if (m.tricks) news.push(`${p.name} hat heute ${m.tricks}× gezaubert! Augenzeugen sind verwirrt!`);
      }
      const others = state.pets.filter((p) => p.id !== pet.id && !p.hidden);
      if (!news.length && others.length) news.push(`${others[Math.floor(Math.random() * others.length)].name} wurde heute beim Blinzeln gesichtet! Mehr in Kürze!`);
      if (!news.length) news.push('Exklusiv: Hier passiert gerade … nichts. Ich bleibe dran!');
      say(pet.id, `📰 Klatsch & Tratsch: ${news[Math.floor(Math.random() * news.length)]}`, { mood: 'alert', ms: 8000 });
      send(pet.id, 'pet:prop', { emoji: '📰', ms: 8000 });
      return;
    }
    case 'paper': { // Piep: Tageszeitung am Morgen
      const now = new Date();
      const date = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
      const w = Object.entries(weather).find(([, v]) => v && !v.missing);
      const wx = w ? ` Wetter in ${w[0][0].toUpperCase()}${w[0].slice(1)}: ${Math.round(w[1].min)}–${Math.round(w[1].max)} °C.` : '';
      say(pet.id, `📰 Guten Morgen! Die Zeitung von heute: ${date}. Mond: ${moonOf(now)}.${wx} Schlagzeile: „Toller Mensch startet in den Tag“!`, { mood: 'happy', ms: 12000 });
      send(pet.id, 'pet:prop', { emoji: '📰', ms: 12000 });
      return;
    }
    case 'trick': { // Beau laesst ein Nachbar-Pet kurz verschwinden
      mem.tricks = (mem.tricks || 0) + 1;
      const n = neighborOf(pet);
      const e = live.get(pet.id);
      say(pet.id, 'Abrakadabra … ✨🎩', { mood: 'greet', ms: 2200 });
      if (!n) { setTimeout(() => say(pet.id, '… es sollte jemand verschwinden. Aber es ist niemand da. Dann eben ein Funkeln. ✨', { mood: 'happy', ms: 5000 }), 2000); return; }
      const ne = live.get(n.id);
      e.inTalk = true; ne.inTalk = true;
      setTimeout(() => { if (!ne.win.isDestroyed()) ne.win.hide(); say(pet.id, 'Simsalabim! ✨', { mood: 'greet', ms: 2500 }); }, 1600);
      setTimeout(() => { if (!ne.win.isDestroyed() && !allHidden() && !n.hidden && !hiddenByFullscreen(n.id)) ne.win.showInactive(); say(n.id, 'W-was ist passiert?! Wo war ich?! 😵', { mood: 'alert', ms: 3500 }); }, 4600);
      setTimeout(() => { say(pet.id, 'Tadaa! 🎩✨ Danke, danke.', { mood: 'happy', ms: 3500 }); e.inTalk = false; ne.inTalk = false; }, 6800);
      return;
    }
    case 'sneak': { // Fips schleicht davon, wenn die Maus weit weg ist
      const c = screen.getCursorScreenPoint();
      const [px, py] = posOf(pet.id);
      if (Math.abs(c.x - px - W / 2) < 500 && Math.abs(c.y - py) < 400) { say(pet.id, 'Psst. Ich hab nichts vor. Gar nichts. 🦊', { mood: 'talk', ms: 4000 }); return; }
      send(pet.id, 'pet:fx', { name: 'sneak', ms: 6000 });
      walkTo(pet, px + (Math.random() < 0.5 ? -70 : 70), 0.7);
      return;
    }
    case 'slide': { // Watschel rutscht auf dem Bauch
      const [px, py] = posOf(pet.id);
      const dir = Math.random() < 0.5 ? -1 : 1;
      send(pet.id, 'pet:slide', true);
      walkTo(pet, freeX(pet, px + dir * 120, py, dir), 2.6);
      setTimeout(() => send(pet.id, 'pet:slide', false), 1900);
      return;
    }
    case 'sprint': { // Hoppel sprintet hin und zurueck
      const [px] = posOf(pet.id);
      const dir = Math.random() < 0.5 ? -1 : 1;
      walkTo(pet, px + dir * 90, 4.2);
      setTimeout(() => walkTo(pet, px, 4.2), 1400);
      return;
    }
    case 'roll': send(pet.id, 'pet:fx', { name: 'roll', ms: 1600 }); return;
    case 'eat': send(pet.id, 'pet:fx', { name: 'eat', ms: 6000 }); return; // Bambus mampft
    case 'pompom': send(pet.id, 'pet:prop', { emoji: '🎉', ms: 4500 }); return;
    case 'sysreport': { // Bip: Systembericht mit echten Werten, gross auf dem Bildschirm
      const s = systemStats();
      if (Math.random() < 0.6) {
        say(pet.id, `BIP. SYSTEMBERICHT: RAM ${s.ram} % BELEGT. CPU ${s.cpu} %. ${s.ram >= 80 ? 'LÜFTER: VERMUTLICH LAUT. EMPFEHLUNG: TABS SCHLIESSEN.' : 'ALLES IM GRÜNEN BEREICH.'} 🤖`, { mood: 'talk', ms: 8000 });
        screenShow(pet, 'RAM', `${s.ram}%`);
      } else {
        const m = Math.round((Date.now() - activity.activeSince) / 60000);
        say(pet.id, `BIP. SITZUNG LÄUFT SEIT ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} STUNDEN. ${m >= 90 ? 'EMPFEHLUNG: PAUSE. AUCH ROBOTER LADEN AUF.' : 'LEISTUNG: OPTIMAL.'} 🤖`, { mood: 'talk', ms: 8000 });
        screenShow(pet, 'ZEIT', `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
      }
      return;
    }
    default: break;
  }
}

// ----- Hoppel: zaehlt, wie lange der PC gesperrt war oder im Ruhezustand (solange er an ist) -----
let lockedAt = null;
let lockHow = 'lock';
function onLocked(how) { if (!lockedAt) { lockedAt = Date.now(); lockHow = how; } }
function onUnlocked() {
  if (!lockedAt) return;
  const min = Math.round((Date.now() - lockedAt) / 60000);
  const how = lockHow;
  lockedAt = null;
  if (min < 1) return;
  const d = new Date();
  const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  for (const p of state.pets) {
    if (p.species !== 'bunny' || !p.talent.enabled || p.hidden || p.muted || !live.has(p.id)) continue;
    const m = memOf(p);
    if (m.lockDay !== day) { m.lockDay = day; m.lockTotal = 0; }
    m.lockTotal += min;
    const total = m.lockTotal;
    whenUserIsBack(() => {
      if (!live.has(p.id)) return;
      say(p.id, lockLine(min, total, how), { mood: 'alert', ms: 25000 }); // lang genug zum Lesen
      send(p.id, 'pet:prop', { emoji: '⏱️', ms: 25000 });
    });
  }
}
// Nach dem Entsperren/Aufwachen erst reden, wenn man wirklich wieder etwas sieht: Bildschirme brauchen oft
// ein paar Sekunden. Wir warten auf eine neue Eingabe (Maus/Tastatur) fruehestens 5 s nach dem Entsperren –
// das Tippen der PIN zaehlt also nicht. Ohne Eingabe spaetestens nach 30 s.
function whenUserIsBack(fn, { minWait = 5000, maxWait = 30000 } = {}) {
  const start = Date.now();
  const timer = setInterval(() => {
    const waited = Date.now() - start;
    if (userIsBack(waited, powerMonitor.getSystemIdleTime() * 1000, minWait, maxWait)) { clearInterval(timer); fn(); }
  }, 1000);
}
// Info am Namensschild sofort aktualisieren (z. B. nach Lottis Klick)
function e2update(pet) {
  const e = live.get(pet.id);
  if (!e) return;
  const ctx = { now: new Date(), activeMin: (Date.now() - activity.activeSince) / 60000, battery, weather, cards: [], sys: null };
  e.lastInfo = companionInfo(pet, memOf(pet), ctx);
  send(pet.id, 'pet:info', e.lastInfo);
}

// Klick auf ein Begleiter-Pet: Blubb zaehlt ein Glas, Beau zieht eine Karte, Bip zeigt den Systembericht
// Mit verbundener App: die Klick-Aktionen des Charakters stehen im Rechtsklick-Menue
function characterMenu(pet) {
  if (pet.kind === 'none' || !isCompanion(pet)) return [];
  const label = { axolotl: '🎉 Aufgabe erledigt', blob: '💧 Glas Wasser getrunken', beau: '🎴 Tageskarte ziehen', robot: '📊 Systembericht' }[pet.species];
  return label ? [{ label, click: () => companionClick(pet, true) }] : [];
}

// Ohne App per Klick; mit App ueber das Rechtsklick-Menue (force), damit der Klick die App oeffnen kann
function companionClick(pet, force = false) {
  if (!isCompanion(pet) || (!force && pet.kind !== 'none')) return false;
  const mem = memOf(pet);
  if (pet.species === 'blob') {
    mem.glasses = (mem.glasses || 0) + 1;
    say(pet.id, `GLUCK GLUCK! Glas Nummer ${mem.glasses} heute! Du bist GROSSARTIG! 💧💚`, { mood: 'happy', ms: 5000 });
    send(pet.id, 'pet:fx', { name: 'split', ms: 1600 });
    send(pet.id, 'pet:prop', { emoji: '🥛', ms: 5000 });
    cheer('Getrunken! Ich bin so stolz auf dich! 🩷💧', pet.id);
    return true;
  }
  if (pet.species === 'beau') {
    const day = new Date().toDateString();
    if (mem.cardDay === day) { say(pet.id, 'Mrrp. Die nächste Karte gibt’s morgen. Der Hut braucht Ruhe. 🎩', { mood: 'talk', ms: 4000 }); return true; }
    mem.cardDay = day;
    say(pet.id, LINES.beau[Math.floor(Math.random() * LINES.beau.length)], { mood: 'greet', ms: 9000 });
    return true;
  }
  if (pet.species === 'robot') { companionAction(pet, { action: 'sysreport' }); return true; }
  if (pet.species === 'axolotl') {
    const d = new Date();
    const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (mem.winsDay !== day) { mem.winsDay = day; mem.wins = 0; }
    mem.wins = (mem.wins || 0) + 1;
    say(pet.id, lottiPraise(mem.wins), { mood: 'happy', ms: 5000 });
    send(pet.id, 'pet:prop', { emoji: mem.wins >= 10 ? '🎊' : '🎉', ms: 4500 });
    if (mem.wins >= 5) send(pet.id, 'pet:fx', { name: 'roll', ms: 1100 }); // ab 5 vor Freude ein Purzelbaum
    e2update(pet);
    return true;
  }
  return false;
}

// Buh will jemanden erschrecken: das naechste Pet daneben (sonst dich)
function ghostScare(ghost) {
  memOf(ghost).scares = (memOf(ghost).scares || 0) + 1;
  const [gx, gy] = posOf(ghost.id);
  let target = null;
  let best = Infinity;
  for (const p of state.pets) {
    const e = live.get(p.id);
    if (p.id === ghost.id || p.hidden || !e || e.inTalk || e.dragging || e.petting || e.breath) continue;
    const [x, y] = posOf(p.id);
    const d = Math.abs(x - gx);
    if (d < W * 1.2 && Math.abs(y - gy) < 160 && d < best) { best = d; target = p; }
  }
  const ge = live.get(ghost.id);
  if (!target) { say(ghost.id, 'Buh! … Hab ich dich erschreckt? Oh nein. Entschuldigung. 👻', { mood: 'alert', ms: 5000 }); return; }
  const te = live.get(target.id);
  ge.inTalk = true; te.inTalk = true;
  const dir = Math.sign(posOf(target.id)[0] - gx);
  send(ghost.id, 'pet:face', dir); send(target.id, 'pet:face', -dir);
  say(ghost.id, 'Buh! 👻', { mood: 'alert', ms: 1800 });
  setTimeout(() => say(target.id, SCARED[target.species] || 'Aaah! 😱', { mood: target.species === 'panda' ? 'sleep' : 'alert', ms: 3500 }), 1000);
  setTimeout(() => say(ghost.id, 'Hihi … Entschuldigung! 👻', { mood: 'happy', ms: 3000 }), 4200);
  // Watschel troestet den Erschreckten
  const calm = state.pets.find((p) => p.species === 'penguin' && p.id !== target.id && isCompanion(p) && free(p));
  if (calm) setTimeout(() => say(calm.id, `Alles gut, ${target.name}. Einatmen … ausatmen. 🐧`, { mood: 'talk', ms: 4000 }), 5200);
  setTimeout(() => {
    for (const id of [ghost.id, target.id]) { const e = live.get(id); if (e) e.inTalk = false; send(id, 'pet:face', 0); }
  }, 7400);
}

let lastChatterAt = 0; // wann sich zuletzt ein Pet von selbst gemeldet hat
function talentTick() {
  sampleActivity();
  const today = new Date().toDateString();
  for (const p of state.pets) {
    const place = talentOn(p, 'mushroom') && p.talent.place; // Wetter nur noch fuer Pilzi (Wetter-Pilz)
    if (place && (!weather[place.toLowerCase()] || weather[place.toLowerCase()].day !== today)) fetchWeather(place);
  }
  const ctx = { now: new Date(), activeMin: (Date.now() - activity.activeSince) / 60000, away: activity.away, backFromBreak: activity.backFromBreak, missed: missed.slice(), done: doneCount, battery, weather, cards: nookCards(), sys: state.pets.some((p) => p.species === 'robot' && isCompanion(p)) ? systemStats() : null };
  // Nicht alle auf einmal: pro Takt meldet sich hoechstens EIN Pet von selbst (in zufaelliger Reihenfolge),
  // Begleiter-Sprueche zusaetzlich mit mindestens 2 Minuten Abstand. Meldungen von Apps und Reaktionen
  // (Streicheln, Klicks, Erschrecken) sind davon nicht betroffen.
  let spoke = false;
  const chatterOk = Date.now() - lastChatterAt >= 2 * 60000;
  for (const pet of [...state.pets].sort(() => Math.random() - 0.5)) {
    const e = live.get(pet.id);
    if (!e) continue;
    e.tmem = e.tmem || {};
    // Info am Namensschild (Begleiter-Modus, Huhu mit Nook) aktuell halten
    // Pilzi: Aussehen passend zum Wetter seines Orts (Sonnenbrille, Pilzfreund, klein im Wind, Schnee, Schal)
    if (pet.species === 'mushroom') {
      const look = pet.talent.enabled && pet.talent.place ? weatherLook(weather[pet.talent.place.toLowerCase()]) : null;
      const key = JSON.stringify(look);
      if (key !== e.lastLook) { e.lastLook = key; send(pet.id, 'pet:weather', look); }
    }
    const info = companionInfo(pet, e.tmem, ctx);
    if (info !== e.lastInfo) { e.lastInfo = info; send(pet.id, 'pet:info', info); }
    if (spoke || pet.hidden || allHidden() || e.inTalk || e.dragging || e.petting || e.breath) continue;
    if (Date.now() < e.busyUntil && pet.species !== 'axolotl') continue;
    const r = talentDue(pet, e.tmem, ctx) || (chatterOk ? companionDue(pet, e.tmem, ctx) : null);
    if (!r) continue;
    spoke = true;
    lastChatterAt = Date.now();
    if (r.action === 'scare') { ghostScare(pet); continue; }
    if (r.text) say(pet.id, r.text, { mood: r.mood, ms: r.ms, open: !!(r.open && pet.target) });
    else if (r.mood) send(pet.id, 'pet:mood', { mood: r.mood, ms: 1600 });
    // was der Text sagt, soll man auch sehen: Bambus kaut -> Fress-Animation, purzelt -> Purzelbaum
    if (pet.species === 'panda' && r.text && !r.action) { if (/kaut|mampf|Bambus\*/.test(r.text)) send(pet.id, 'pet:fx', { name: 'eat', ms: 5000 }); else if (/purzel|roll mich/i.test(r.text)) send(pet.id, 'pet:fx', { name: 'roll', ms: 1600 }); }
    if (typeof r.action === 'string' && COMPANION_ACTIONS.has(r.action)) companionAction(pet, r);
    else if (r.action) applyTalentAction(pet, r.action);
    // Huhus Quiz: die Antwort kommt 10 Sekunden spaeter
    if (r.quiz) setTimeout(() => { if (live.has(pet.id)) say(pet.id, `Antwort: ${r.quiz.a} 🦉`, { mood: 'happy', ms: Math.min(14000, 5000 + r.quiz.a.length * 45) }); }, 10500);
  }
  doneCount = 0;
  if (activity.backFromBreak) { activity.backFromBreak = 0; missed.length = 0; }
}

// Was eine Meldung fuer die Talente bedeutet (Bote sammelt, Axolotl zaehlt)
function noteEventForTalents(ev) {
  const src = { nexus: '3C', 'claude-code': 'Claude Code' }[ev.app] || (APPS[ev.app] && APPS[ev.app].label) || ev.app || 'App';
  if (ev.type === 'task-done') doneCount++;
  // Blubb troestet bei Fehlermeldungen
  if (ev.type === 'task-error') for (const p of state.pets) if (p.species === 'blob' && isCompanion(p) && free(p)) setTimeout(() => say(p.id, 'Hey! Fehler sind nur Umwege! Du schaffst das trotzdem! 💚', { mood: 'happy', ms: 5000 }), 3500);
  for (const e of live.values()) { e.tmem = e.tmem || {}; e.tmem.events = (e.tmem.events || 0) + 1; } // Piep zaehlt mit
  if (activity.away || powerMonitor.getSystemIdleTime() >= 300) { missed.push({ short: shortEvent(ev, src) }); if (missed.length > 20) missed.shift(); }
}

// ----- Timer: Fokus (Roboter), Erinnerung (Hase), Atem-Pause (Pinguin) -----
function clearTimer(e) { if (e && e.timer) { clearTimeout(e.timer.handle); e.timer = null; } }
function showTimer(id, t) { send(id, 'pet:timer', t ? { label: t.label, endsAt: t.endsAt } : null); }
function startFocus(pet, phase = 'work') {
  const e = live.get(pet.id);
  if (!e) return;
  clearTimer(e);
  const mins = FOCUS[phase];
  const endsAt = Date.now() + mins * 60000;
  e.timer = { kind: 'focus', phase, endsAt, label: phase === 'work' ? 'Fokus' : 'Pause' };
  e.timer.handle = setTimeout(() => {
    if (phase === 'work') { e.tmem = e.tmem || {}; e.tmem.focusMin = (e.tmem.focusMin || 0) + FOCUS.work; say(pet.id, FOCUS_LINES.rest, { mood: 'happy', ms: 12000 }); cheer(`${pet.name} hat 25 Minuten Fokus geschafft – und DU auch! 🎉`); startFocus(pet, 'rest'); }
    else { clearTimer(e); showTimer(pet.id, null); say(pet.id, FOCUS_LINES.again, { mood: 'alert', ms: 12000 }); }
  }, mins * 60000);
  showTimer(pet.id, e.timer);
  if (phase === 'work') say(pet.id, FOCUS_LINES.start, { mood: 'happy', ms: 6000 });
}
function stopTimer(pet, line) {
  const e = live.get(pet.id);
  if (!e || !e.timer) return;
  clearTimer(e);
  showTimer(pet.id, null);
  if (line) say(pet.id, line, { mood: 'talk', ms: 4000 });
}
function startReminderTimer(pet, mins) {
  const e = live.get(pet.id);
  if (!e) return;
  clearTimer(e);
  e.timer = { kind: 'remind', endsAt: Date.now() + mins * 60000, label: `${mins} Min` };
  e.timer.handle = setTimeout(() => { clearTimer(e); showTimer(pet.id, null); say(pet.id, TIMER_LINES.done(mins), { mood: 'alert', ms: 30000 }); }, mins * 60000);
  showTimer(pet.id, e.timer);
  say(pet.id, TIMER_LINES.set(mins), { mood: 'happy', ms: 4000 });
}
async function breathe(pet) {
  const e = live.get(pet.id);
  if (!e || e.breath) return;
  e.breath = true;
  stopWalk(pet.id);
  try {
    for (const step of BREATH) {
      if (!live.has(pet.id) || !e.breath) break;
      say(pet.id, step.text, { mood: 'talk', ms: step.ms });
      send(pet.id, 'pet:mood', { mood: step.mood, ms: step.ms });
      await sleep(step.ms);
    }
    e.tmem = e.tmem || {}; e.tmem.breaths = (e.tmem.breaths || 0) + 1;
  } finally { e.breath = false; }
}
// Rechtsklick-Eintraege je Talent
function talentMenu(pet) {
  if (!pet.talent || !pet.talent.enabled) return [];
  const e = live.get(pet.id);
  const t = e && e.timer;
  if (pet.species === 'robot') return t && t.kind === 'focus' ? [{ label: '⏹ Fokus beenden', click: () => stopTimer(pet, FOCUS_LINES.stop) }] : [{ label: '🤖 Fokus starten (25 + 5 Min)', click: () => startFocus(pet) }];
  if (pet.species === 'bunny') {
    const items = [5, 10, 15, 30, 60].map((m) => ({ label: `in ${m} Minuten`, click: () => startReminderTimer(pet, m) }));
    return [{ label: '⏰ Erinnere mich …', submenu: items }, ...(t ? [{ label: '⏹ Timer abbrechen', click: () => stopTimer(pet, 'Okay, Timer gestoppt! Puh. 🐰') }] : [])];
  }
  if (pet.species === 'penguin') return e && e.breath ? [{ label: '⏹ Atem-Pause beenden', click: () => { e.breath = false; } }] : [{ label: '🫧 Atem-Pause (1 Minute)', click: () => breathe(pet) }];
  return [];
}

// ----- Buh: Diskret (Meeting/Vollbild -> alle Pets verstecken) -----
let stopWatch = null;
let watchState = { mic: false, cam: false, full: null };
let fullDisplayId = null;   // Monitor mit echtem Vollbild: nur die Pets dort verstecken (nicht alle)
let backLineAt = 0;
// Auf welchem Monitor steht ein Pet? (Mitte unten im Fenster, wo das Pet sitzt)
function displayIdOf(id) {
  const e = live.get(id); const p = petById(id);
  if (!e || !p) return null;
  return screen.getDisplayNearestPoint({ x: Math.round(e.pos.x + W / 2), y: Math.round(e.pos.y + winHeight(p) - 30) }).id;
}
const hiddenByFullscreen = (id) => fullDisplayId != null && displayIdOf(id) === fullDisplayId;
function applyVisibility() {
  for (const [id, e] of live) (allHidden() || petById(id)?.hidden || hiddenByFullscreen(id)) ? e.win.hide() : e.win.showInactive();
  updateTray();
}
function onWatch(s) {
  watchState = s;
  const ghosts = state.pets.filter((p) => talentOn(p, 'ghost'));
  // Meeting (Mikrofon/Kamera): ALLE Pets verstecken (Entscheidung 2026-11-19)
  const meeting = ghosts.some((g) => g.talent.hideMeeting && (s.mic || s.cam));
  // Vollbild: nur den Monitor, auf dem es laeuft (das Rechteck kommt in Bildschirm-Pixeln, Electron rechnet in DIP)
  let fullId = null;
  if (s.full && ghosts.some((g) => g.talent.hideFullscreen)) {
    const c = { x: Math.round(s.full.x + s.full.w / 2), y: Math.round(s.full.y + s.full.h / 2) };
    const dip = typeof screen.screenToDipPoint === 'function' ? screen.screenToDipPoint(c) : c;
    fullId = screen.getDisplayNearestPoint(dip).id;
  }
  if (meeting === autoHidden && fullId === fullDisplayId) return;
  const meetingEnded = autoHidden && !meeting;
  if (fullId !== fullDisplayId) log('[diskret]', fullId != null ? `Vollbild auf Monitor ${fullId} (${s.full.cls || '?'}) – Pets dort versteckt` : 'Vollbild vorbei');
  if (meeting !== autoHidden) log('[diskret]', meeting ? 'Meeting (Mikrofon/Kamera) – alle Pets versteckt' : 'Meeting vorbei');
  autoHidden = meeting;
  fullDisplayId = fullId;
  for (const id of live.keys()) stopWalk(id);
  applyVisibility();
  // Buh meldet sich nur nach einem Meeting zurueck – und hoechstens alle 15 Minuten
  if (meetingEnded && !hidden && ghosts[0] && Date.now() - backLineAt > 15 * 60000) {
    backLineAt = Date.now();
    setTimeout(() => say(ghosts[0].id, 'Psst … ist das Meeting vorbei? Wir sind wieder da. 👻', { mood: 'talk', ms: 4000 }), 600);
  }
}
// Waechter nur laufen lassen, solange ein Buh mit Talent da ist
function updateWatch() {
  const need = state.pets.some((p) => talentOn(p, 'ghost') && (p.talent.hideMeeting || p.talent.hideFullscreen));
  if (need && !stopWatch && !SMOKE) stopWatch = startWatch(onWatch, log);
  if (!need && stopWatch) { stopWatch(); stopWatch = null; if (autoHidden || fullDisplayId != null) { autoHidden = false; fullDisplayId = null; applyVisibility(); } }
}
const COMPANION_ACTIONS = new Set(['territory', 'gift', 'yawn', 'gossip', 'paper', 'trick', 'sneak', 'slide', 'sprint', 'roll', 'eat', 'pompom', 'sysreport']);
// Quak hat mit der Zunge eine "Fliege" (den Mauszeiger) erwischt
ipcMain.on('pet:fly', (ev) => { const [id] = entryOf(ev.sender); const p = id && petById(id); if (p) { const m = memOf(p); m.flies = (m.flies || 0) + 1; } });
ipcMain.on('pet:battery', (_ev, b) => { if (b && typeof b.level === 'number') battery = { level: Math.max(0, Math.min(1, b.level)), charging: !!b.charging }; });

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
  return placeNewPet(createPet(kind, extra));
}
// Auswahl aus den Einstellungen: erst das Tier, dann die Verbindung (Preset)
function addChosenPet({ kind, species, name } = {}) {
  const pet = createChosenPet(kind, species, name);
  // Beau mit Nook bekommt seine eigenen Sprueche (wie bisher "Beau 🎩 (mit Nook)")
  if (pet.species === 'beau' && pet.kind === BEAU.kind) pet.reminders.messages = BEAU.messages.slice();
  return placeNewPet(pet);
}
function placeNewPet(pet) {
  takePresetTimed(pet, state); // voreingestellte Uhrzeiten (z. B. DAN 15:45) -> gemeinsame Uhrzeiten in den Einstellungen
  state.pets.push(pet);
  createPetWindow(pet);
  save();
  updateTray();
  updateWatch();
  setTimeout(() => say(pet.id, pet.species === 'beau' ? 'Mrrp! Ich bin Beau. 🎩 *winkt*' : `Hallo, ich bin ${pet.name}! 👋`, { mood: pet.species === 'beau' ? 'greet' : 'happy' }), 900);
  return pet;
}
function removePet(id) {
  state.pets = state.pets.filter((p) => p.id !== id);
  const e = live.get(id);
  if (e) { stopWalk(id); clearTimer(e); e.breath = false; e.win.destroy(); live.delete(id); }
  save();
  updateTray();
  updateWatch();
  sendSettings();
}

// ---------- Einstellungen ----------
function openSettings(focusId, { create = false } = {}) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show(); settingsWin.focus();
    if (focusId) settingsWin.webContents.send('settings:focus', focusId);
    if (create) settingsWin.webContents.send('settings:create');
    return;
  }
  settingsWin = new BrowserWindow({
    width: 940, height: 680, minWidth: 720, minHeight: 500, title: 'Desktop Companions – Einstellungen', icon, autoHideMenuBar: true, show: false,
    backgroundColor: state.settings.theme === 'light' ? '#f6f4fb' : '#1d1b26', // passend zu Hell/Dunkel, kein Aufblitzen
    webPreferences: { preload: path.join(__dirname, 'settings', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings', 'settings.html'), { query: { ...(focusId ? { focus: focusId } : {}), ...(create ? { create: '1' } : {}) } });
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWin.webContents.on('will-navigate', (e) => e.preventDefault());
  settingsWin.on('closed', () => { settingsWin = null; });
}
const sendSettings = () => settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents.send('settings:state', settingsPayload());
function settingsPayload() {
  return {
    state,
    apps: Object.fromEntries(KINDS.map((k) => { const a = APPS[k]; const t = a.target(); return [k, { label: a.label, hint: a.hint, target: t, group: a.group, icon: a.icon, eventsLabel: a.eventsLabel,
      github: a.github || '', needs: a.needs || a.label, installed: a.github ? !!t && fs.existsSync(t) : true,
      caps: { opens: !!t || k === 'custom', reminds: !!(a.reminders.enabled || a.reminders.timed.length), reports: !!(a.listens || ['nexus', 'dan', 'nook'].includes(k)) } }]; })),
    groups: GROUPS,
    species: Object.fromEntries(Object.entries(SPECIES).map(([k, v]) => [k, v.label])),
    speciesColors: Object.fromEntries(Object.entries(SPECIES).map(([k, v]) => [k, v.color])),
    talents: TALENTS,
    // eine typische Zeile je Tier fuer den Steckbrief (so klingt es)
    samples: Object.fromEntries(Object.keys(SPECIES).map((sp) => [sp, sp === 'owl' ? FACTS[0] : (COMPANION[sp] || [])[0] || ''])),
    companion: COMPANION, // die ~20 Standard-Sprueche je Tier (fuer "Eigene Sprueche")
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
  if (old.wander && !pet.wander && live.get(pet.id)) pet.homeX = posOf(pet.id)[0];
  state.pets[state.pets.indexOf(old)] = pet;
  // anderes Tier oder Talent aus: laufenden Timer (Fokus, Erinnerung) beenden
  if (old.species !== pet.species || !pet.talent.enabled) { const e = live.get(pet.id); if (e && e.timer) { clearTimer(e); showTimer(pet.id, null); } }
  save();
  refreshPet(pet);
  updateTray();
  updateWatch();
  return pet;
});
ipcMain.handle('settings:add-pet', (_e, choice) => (typeof choice === 'object' && choice
  ? addChosenPet({ kind: String(choice.kind || ''), species: String(choice.species || ''), name: String(choice.name || '') })
  : addPet(KINDS.includes(choice) || choice === 'beau' ? choice : 'none')));
// ---------- Installierte Apps (fuer die Funktions-Suche) ----------
// Windows: die Liste des Startmenues (auch Store-Apps wie der Rechner) – gestartet wird ueber shell:AppsFolder\<AppID>.
// macOS: die Programme in /Applications. Nur lokal gelesen, alle 10 Minuten neu.
let appsCache = { at: 0, list: [] };
async function installedApps() {
  if (Date.now() - appsCache.at < 10 * 60000 && appsCache.list.length) return appsCache.list;
  let list = [];
  try {
    if (process.platform === 'win32') {
      const ps = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress';
      const out = await new Promise((res) => {
        require('node:child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => res(err ? '' : stdout));
      });
      const raw = out.trim() ? JSON.parse(out) : [];
      list = (Array.isArray(raw) ? raw : [raw])
        .filter((a) => a && a.Name && a.AppID && !/deinstall|uninstall|readme|hilfe|help|website|documentation/i.test(a.Name))
        .map((a) => ({ name: String(a.Name).slice(0, 80), target: `shell:AppsFolder\\${a.AppID}` }));
    } else if (process.platform === 'darwin') {
      list = fs.readdirSync('/Applications').filter((n) => n.endsWith('.app')).map((n) => ({ name: n.replace(/\.app$/, ''), target: path.join('/Applications', n) }));
    }
  } catch (e) { log('[apps]', e.message); }
  const seen = new Set();
  list = list.filter((a) => (seen.has(a.name.toLowerCase()) ? false : seen.add(a.name.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  appsCache = { at: Date.now(), list };
  return list;
}
ipcMain.handle('settings:installed-apps', () => installedApps());
// Link im Browser oeffnen (nur die GitHub-Seiten der eigenen Apps)
ipcMain.handle('settings:open-link', (_e, url) => { if (/^https:\/\/github\.com\/CaseyMazey\/[\w-]+$/.test(url)) shell.openExternal(url); });
// Pet mit einer installierten App verbinden (Funktion "Eigene App" mit Name und Startpfad)
ipcMain.handle('settings:connect-app', (_e, id, app) => {
  const old = petById(id);
  if (!old || !app || typeof app.target !== 'string') return null;
  const pet = normalizePet({ ...old, kind: 'custom', target: app.target, appName: String(app.name || ''), events: false });
  state.pets[state.pets.indexOf(old)] = pet;
  save(); refreshPet(pet); updateTray();
  return pet;
});

// ---------- Pets exportieren / importieren (.dcpet) ----------
ipcMain.handle('settings:export-pets', async (_e, id) => {
  const pets = id ? state.pets.filter((p) => p.id === id) : state.pets;
  if (!pets.length) return { ok: false };
  const name = id ? `${pets[0].name}.dcpet` : `Desktop-Companions-Pets-${new Date().toISOString().slice(0, 10)}.dcpet`;
  const r = await dialog.showSaveDialog(settingsWin, { defaultPath: name, filters: [{ name: 'Desktop-Companions-Pet', extensions: ['dcpet'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, JSON.stringify(exportFile(pets), null, 2));
  return { ok: true, file: r.filePath, count: pets.length };
});
ipcMain.handle('settings:import-pets', async () => {
  const r = await dialog.showOpenDialog(settingsWin, { properties: ['openFile'], filters: [{ name: 'Desktop-Companions-Pet', extensions: ['dcpet', 'json'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try {
    const pets = importFile(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8').replace(/^﻿/, '')));
    const free = 20 - state.pets.length;
    if (free <= 0) return { ok: false, error: 'Es sind schon 20 Pets da – mehr gehen nicht.' };
    const added = pets.slice(0, free).map((p) => placeNewPet(p));
    // Hinweis, wenn eine App fehlt (z. B. Pfad von einem anderen PC)
    const missing = added.filter((p) => p.target && !/^https?:|^shell:AppsFolder/i.test(p.target) && !fs.existsSync(p.target)).map((p) => p.name);
    return { ok: true, count: added.length, ids: added.map((p) => p.id), missing };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Claude-Code-Hook: Status und Eintragen per Knopf (schreibt ~/.claude/settings.json, vorher Sicherung .bak)
ipcMain.handle('settings:hook-status', () => ({ installed: hasHook(settingsFile(), PORT), file: settingsFile(), json: hookJson(PORT) }));
ipcMain.handle('settings:hook-install', () => {
  try { installHook(settingsFile(), PORT); return { ok: true, installed: hasHook(settingsFile(), PORT) }; }
  catch (e) { log('[claude-hook]', e.message); return { ok: false, error: e.message }; }
});
ipcMain.handle('settings:copy', (_e, text) => { clipboard.writeText(String(text).slice(0, 4000)); return true; });
ipcMain.handle('settings:remove-pet', (_e, id) => { removePet(id); return true; });
ipcMain.handle('settings:test-pet', (_e, id) => { const p = petById(id); if (p) speakNow(p); });
ipcMain.handle('settings:open-app', (_e, id) => { const p = petById(id); if (p) openApp(p); });
ipcMain.handle('settings:chat-now', () => !!maybeChat(true));
ipcMain.handle('settings:save-global', (_e, g) => {
  state = normalizeState({ ...state, settings: { ...state.settings, ...g } });
  applyAutostart();
  save();
  sendSettings(); // z. B. Hell/Dunkel sofort im Fenster
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
    { label: 'Neues Pet …', click: () => openSettings(null, { create: true }) }, // erst Tier, dann Verbindung
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
    if (!on && e) p.homeX = e.pos.x; // ab jetzt in der Naehe des aktuellen Platzes bleiben
  }
  save();
  updateTray();
  sendSettings();
}
// Ein einzelnes Pet aus- oder einblenden, ohne es zu entfernen (Auge in der Liste der Einstellungen)
function setPetHidden(id, on) {
  const pet = petById(id);
  const e = live.get(id);
  if (!pet) return null;
  pet.hidden = !!on;
  updateWatch();
  if (e) {
    stopWalk(id);
    if (pet.hidden) { e.win.hide(); e.capturing = false; }
    else if (!allHidden() && !hiddenByFullscreen(id)) { e.win.showInactive(); setTimeout(() => say(id, 'Da bin ich wieder! 👋', { mood: 'happy', ms: 3500 }), 300); }
  }
  save();
  updateTray();
  sendSettings();
  return pet;
}
ipcMain.handle('settings:set-hidden', (_e, id, on) => setPetHidden(id, on));
function toggleHidden() {
  hidden = !hidden;
  applyVisibility();
  updateTray();
}

// ---------- Monitore ----------
// Nach dem Ab- oder Anstecken eines Monitors (oder anderer Skalierung) verschiebt Windows die Fenster selbst und
// rechnet sie um; danach lassen durchsichtige Fenster Klicks oft nicht mehr richtig durch. Deshalb: kurz warten,
// bis Windows fertig ist, dann jedes Pet auf einen vorhandenen Bildschirm setzen und sein Fenster neu bauen.
// Windows meldet Monitor-Aenderungen manchmal staendig (z. B. Taskleiste, Energiesparen). Neu gebaut wird nur, wenn
// sich die Monitore wirklich geaendert haben, und hoechstens alle 5 s – sonst nur die Pets zurueck auf den Bildschirm.
let rebuildTimer = null;
let lastDisplays = '';
let lastRebuildAt = 0;
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  const wait = Math.max(800, lastRebuildAt + 5000 - Date.now());
  rebuildTimer = setTimeout(onDisplaysChanged, wait);
}
function onDisplaysChanged() {
  const key = displayKey(screen.getAllDisplays());
  if (key === lastDisplays) { keepPetsOnScreen(); return; }
  lastDisplays = key;
  rebuildAll();
}
function keepPetsOnScreen() {
  for (const pet of state.pets) {
    const e = live.get(pet.id);
    if (!e || e.win.isDestroyed() || e.dragging) continue;
    const c = clampToScreen(pet, e.pos.x, e.pos.y);
    if (c.x !== e.pos.x || c.y !== e.pos.y) { Object.assign(pet, c); placeWin(pet.id, c.x, c.y); }
  }
}
function rebuildAll() {
  lastRebuildAt = Date.now();
  for (const pet of state.pets) {
    const e = live.get(pet.id);
    if (e) {
      stopWalk(pet.id);
      clearInterval(e.dragTimer);
      Object.assign(pet, { x: e.pos.x, y: e.pos.y });
      live.delete(pet.id);
      e.win.destroy();
    }
    Object.assign(pet, clampToScreen(pet, pet.x, pet.y));
    if (!pet.wander) pet.homeX = pet.x;
    createPetWindow(pet);
  }
  talking = false;
  save();
  log('[monitore] Pet-Fenster neu aufgebaut:', screen.getAllDisplays().map((d) => `${d.bounds.width}x${d.bounds.height}@${d.scaleFactor}`).join(', '));
}
// Sicherheitsnetz: faengt ein Pet-Fenster Klicks, obwohl die Maus gar nicht darueber ist, wieder durchlassen
function releaseStuckClicks() {
  const c = screen.getCursorScreenPoint();
  for (const [id, e] of live) {
    // gewachsen oder verrutscht (Windows-Skalierung)? zurueck auf gemerkte Position und Groesse
    if (!e.win.isDestroyed() && !e.dragging) {
      const b = e.win.getBounds();
      const p = petById(id);
      if (p && (Math.abs(b.width - W) > 2 || Math.abs(b.height - winHeight(p)) > 2 || Math.abs(b.x - e.pos.x) > 2 || Math.abs(b.y - e.pos.y) > 2)) placeWin(id, e.pos.x, e.pos.y);
    }
    if (!CLICK_THROUGH) continue;
    if (!e.capturing || e.dragging || e.win.isDestroyed()) continue;
    const pet = petById(id);
    const inside = pet && c.x >= e.pos.x && c.x < e.pos.x + W && c.y >= e.pos.y && c.y < e.pos.y + winHeight(pet);
    if (inside) continue;
    e.win.setIgnoreMouseEvents(true, { forward: true });
    e.capturing = false;
    send(id, 'pet:hover-reset');
  }
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
  lastDisplays = displayKey(screen.getAllDisplays());
  for (const pet of state.pets) createPetWindow(pet);
  if (!SMOKE) setTimeout(() => state.pets.forEach((p) => makeRoom(p)), 1500);
  // Beau begruesst dich beim Start und hebt die Pfote (Wunsch aus dem Beau-Theme)
  if (!SMOKE) setTimeout(() => state.pets.filter((p) => p.species === 'beau' && !p.muted).forEach((p) => say(p.id, beauGreeting(), { mood: 'greet', ms: 6000 })), 2500);
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
  setInterval(talentTick, 30000);
  powerMonitor.on('lock-screen', () => onLocked('lock'));
  powerMonitor.on('suspend', () => onLocked('sleep'));
  powerMonitor.on('unlock-screen', onUnlocked);
  powerMonitor.on('resume', onUnlocked);
  updateWatch();
  setInterval(() => maybeChat(), 12000);
  setInterval(maybeWander, 9000);
  for (const ev of ['display-removed', 'display-added', 'display-metrics-changed']) screen.on(ev, scheduleRebuild);
  setInterval(releaseStuckClicks, 300);
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
  state.pets.forEach((p, i) => { const e = live.get(p.id); const x = i < 2 ? a.x + 300 + i * 170 : a.x + 1000; placeWin(p.id, x, a.y + 200); p.x = x; p.y = a.y + 200; });
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
  if (dan) { placeWin(dan.id, a.x + 1400, a.y + 200); say(dan.id, dan.reminders.messages[0], { mood: 'alert', open: true }); }
  await sleep(300);
  for (const e of live.values()) if (!dan || e !== live.get(dan.id)) e.busyUntil = 0;
  // Nook neben NEXUS stellen
  const nook = state.pets.find((p) => p.kind === 'nook');
  if (nook) placeWin(nook.id, a.x + 470, a.y + 200);
  report.chatPair = maybeChat(true);
  await sleep(1300);
  await shot('2-gespraech-und-erinnerung');
  // zwei Pets aufeinander: eins muss zur Seite gehen
  await sleep(6000);
  const [p1, p2] = state.pets;
  const [x1, y1] = posOf(p1.id);
  placeWin(p2.id, x1 + 15, y1);
  makeRoom(p2, 1);
  await sleep(2500);
  report.platz = { vorher: 15, nachher: posOf(p2.id)[0] - posOf(p1.id)[0] };
  await shot('2b-platz-gemacht');
  // alle vier nebeneinander: Gruppenszene
  await sleep(4000);
  talking = false;
  state.pets.forEach((p, i) => { const e = live.get(p.id); stopWalk(p.id); e.busyUntil = 0; placeWin(p.id, a.x + 300 + i * 170, a.y + 200); });
  await sleep(300);
  report.gruppe = maybeChat(true);
  await sleep(2200);
  report.szene = recentScenes[recentScenes.length - 1];
  await shot('2c-gruppe');
  // Monitorwechsel nachstellen: alle Fenster neu aufbauen, Groesse und Position muessen stimmen
  // Fenster mitten im Laden wieder zerstoeren (so kam die Fehlerflut zustande) – darf keinen Fehler werfen
  const errBefore = errorCount;
  for (let i = 0; i < 25; i++) { rebuildAll(); await sleep(20 + (i * 37) % 300); }
  await sleep(1500);
  report.neuaufbauFehler = errorCount - errBefore;
  await sleep(1500);
  report.neuaufbau = [...live].map(([id, e]) => { const b = e.win.getBounds(); return `${b.width}x${b.height}@${b.x},${b.y}=${e.pos.x},${e.pos.y}`; });
  // Begleiter-Modus und Huhus Quiz: Eule mit Nook, Drache ohne App, Buh erschreckt seinen Nachbarn
  talking = false;
  for (const e of live.values()) { e.inTalk = false; e.busyUntil = 0; }
  const owl = addChosenPet({ kind: 'nook', species: 'owl', name: 'Huhu' });
  const dragon = addChosenPet({ kind: 'none', species: 'dragon', name: 'Funke' });
  const buh = state.pets.find((p) => p.species === 'ghost');
  placeWin(owl.id, a.x + 300, a.y + 520); placeWin(dragon.id, a.x + 470, a.y + 520);
  cardsCache = { at: Date.now(), cards: [{ q: 'Auf welcher Schicht liegt MQTT?', a: 'Anwendungsschicht', subject: 'LF 9' }] };
  battery = { level: 0.42, charging: false };
  await sleep(1500);
  for (const e of live.values()) e.busyUntil = 0;
  activity.activeSince = Date.now() - 10 * 60000;
  talentTick();
  await sleep(600);
  const bubble = async (p) => live.get(p.id).win.webContents.executeJavaScript(`document.getElementById('bubble-text').textContent + ' | ' + document.getElementById('name').textContent`);
  report.begleiter = { huhu: await bubble(owl), funke: await bubble(dragon) };
  if (buh) { const [bx, by] = posOf(buh.id); placeWin(dragon.id, bx + 170, by); ghostScare(buh); await sleep(1400); report.begleiter.schreck = [await bubble(buh), await bubble(dragon)]; }
  await sleep(10500);
  report.begleiter.antwort = await bubble(owl);
  // staerkere Charaktere: Bip, Watschel, Beau, Blubb, Mauz, Piep als Begleiter nebeneinander
  const chars = ['robot', 'penguin', 'beau', 'blob', 'cat', 'bird'].map((sp, i) => {
    const p = addChosenPet({ kind: 'none', species: sp });
    placeWin(p.id, a.x + 200 + i * 175, a.y + 820);
    return p;
  });
  await sleep(1600);
  for (const e of live.values()) { e.busyUntil = 0; e.inTalk = false; }
  const [bip, wat, beauC, blubb, mauz, piep] = chars;
  const cls = async (p) => live.get(p.id).win.webContents.executeJavaScript(`document.getElementById('pet').className`);
  companionAction(bip, { action: 'sysreport' });
  const watX = posOf(wat.id)[0];
  companionAction(wat, { action: 'slide' });
  await sleep(500);
  report.charaktere = { bip: await bubble(bip), bipKlasse: await cls(bip), watschelKlasse: await cls(wat) };
  await sleep(2200);
  report.charaktere.watschelGerutscht = posOf(wat.id)[0] - watX;
  companionClick(blubb);
  companionAction(mauz, { action: 'territory' });
  companionAction(piep, { action: 'gossip' });
  companionAction(beauC, { action: 'trick' });
  await sleep(2200);
  report.charaktere.blubb = await bubble(blubb);
  report.charaktere.mauz = await bubble(mauz);
  report.charaktere.piep = await bubble(piep);
  report.charaktere.beauNachbarVersteckt = !live.get(neighborOfAny(beauC)).win.isVisible();
  await sleep(5000);
  report.charaktere.beau = await bubble(beauC);
  // Hoppel zaehlt die Sperrzeit, Lotti zaehlt Aufgaben per Klick
  const hoppel = addChosenPet({ kind: 'none', species: 'bunny' });
  const lotti = addChosenPet({ kind: 'none', species: 'axolotl' });
  placeWin(hoppel.id, a.x + 300, a.y + 1000); placeWin(lotti.id, a.x + 500, a.y + 1000);
  await sleep(1500);
  lockedAt = Date.now() - 47 * 60000; lockHow = 'lock';
  onUnlocked();
  companionClick(lotti); companionClick(lotti); companionClick(lotti);
  await sleep(3200);
  report.charaktere.hoppel = await bubble(hoppel);
  report.charaktere.lotti = await bubble(lotti);
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
