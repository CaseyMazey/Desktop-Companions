// Ein Pet im eigenen durchsichtigen Fenster: zeichnen, animieren, sprechen, ziehen.
/* global window, document */
const api = window.petApi;
const petEl = document.getElementById('pet');
const flip = document.getElementById('flip');
const sprite = document.getElementById('sprite');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
const bubbleHint = document.getElementById('bubble-hint');
const nameEl = document.getElementById('name');
const hearts = document.getElementById('hearts');

let pet = null;
let mood = 'idle';            // aktuelle Grundstimmung (idle | sleep)
let moodTimer = null;
let bubbleTimer = null;
let bubbleOpens = false;
let walking = 0;
let dragging = false;

// ---------- Aussehen ----------
function darker(hex, f = 0.68) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `rgb(${c.join(',')})`;
}
function applyPet(p) {
  const speciesChanged = !pet || pet.species !== p.species;
  pet = p;
  document.documentElement.style.setProperty('--c', p.color);
  document.documentElement.style.setProperty('--c-dark', darker(p.color));
  document.documentElement.style.setProperty('--size', `${p.size}px`);
  petEl.style.setProperty('--size', `${p.size}px`);
  if (speciesChanged) sprite.innerHTML = window.renderSpecies(p.species);
  showName();
  mood = p.muted ? 'sleep' : 'idle';
  if (!moodTimer) setMood(mood);
  const on = (sp) => p.species === sp && p.talent && p.talent.enabled;
  petEl.classList.toggle('shy', on('ghost'));   // Buh wird durchsichtig, wenn die Maus kommt
  updateNight();
  if (on('dragon')) watchBattery();              // Drache: Akku im Blick
  if (p.species !== 'mushroom') showGarden(0);
  if (p.species === 'panda') pandaWake();
}

// Namensschild beim Drueberfahren: Name, im Begleiter-Modus mit Info (z. B. "Funke · 🔋 78 %")
let info = '';
function showName() {
  nameEl.replaceChildren(document.createTextNode(pet ? pet.name : ''));
  if (info) { const s = document.createElement('span'); s.className = 'info'; s.textContent = info; nameEl.appendChild(s); }
}

// ---------- Talente im Fenster ----------
// Eule: nachts (22–6 Uhr) grosse Augen
function updateNight() {
  const h = new Date().getHours();
  petEl.classList.toggle('night', !!(pet && pet.species === 'owl' && pet.talent && pet.talent.enabled && (h >= 22 || h < 6)));
}
setInterval(updateNight, 60000);
// Drache: Akku melden (Chromium kennt den Laptop-Akku; ohne Akku passiert nichts)
let batteryWatched = false;
async function watchBattery() {
  if (batteryWatched || !navigator.getBattery) return;
  batteryWatched = true;
  try {
    const b = await navigator.getBattery();
    const report = () => api.battery({ level: b.level, charging: b.charging });
    b.addEventListener('levelchange', report);
    b.addEventListener('chargingchange', report);
    report();
  } catch { /* kein Akku */ }
}
// Timer ueber dem Pet (Erinnerung des Hasen); beim Roboter steht er unten auf seinem Bildschirm
const timerEl = document.getElementById('timer');
let timerTick = null;
function showTimer(t) {
  clearInterval(timerTick);
  const robot = pet && pet.species === 'robot';
  petEl.classList.toggle('timer-on', !!(t && robot));
  if (!t) { timerEl.classList.remove('show'); return; }
  const mini = sprite.querySelector('.screen-mini');
  const draw = () => {
    const s = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
    const mmss = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    timerEl.textContent = `${t.label} ${mmss}`;
    if (robot && mini) mini.textContent = mmss;
  };
  draw();
  timerEl.classList.toggle('show', !robot);
  timerTick = setInterval(draw, 1000);
}

// Bip: Bildschirm zeigt kurz einen Wert ("RAM 63%") oder ein Herz
let screenTimer = null;
function showScreen({ label = '', value = '', heart = false, ms = 8000 } = {}) {
  if (!pet || pet.species !== 'robot') return;
  clearTimeout(screenTimer);
  const l = sprite.querySelector('.scr-label'); const v = sprite.querySelector('.scr-value');
  if (l) l.textContent = String(label).slice(0, 10);
  if (v) v.textContent = String(value).slice(0, 7);
  petEl.classList.toggle('scr-heart', !!heart);
  petEl.classList.toggle('scr-text', !heart);
  screenTimer = setTimeout(() => petEl.classList.remove('scr-heart', 'scr-text'), Math.min(30000, ms));
}

// Requisit neben dem Pet (🐭 Geschenk, 📰 Zeitung, 🥛 Glas, ☂️ Schirm, 🎉 Pompons, ⏱️ Taschenuhr)
const propEl = document.getElementById('prop');
let propTimer = null;
function showProp(p) {
  clearTimeout(propTimer);
  if (!p || !p.emoji) { propEl.classList.remove('show'); return; }
  propEl.textContent = String(p.emoji).slice(0, 4);
  propEl.classList.remove('show'); void propEl.offsetWidth; propEl.classList.add('show');
  if (p.ms) propTimer = setTimeout(() => propEl.classList.remove('show'), Math.min(p.ms, 4 * 3600000));
}
// kurze Effekte als Klasse (roll = Purzelbaum, sneak = Schleichen, split = Blubb teilt sich)
const fxTimers = {};
function fx({ name, ms = 1500 } = {}) {
  if (!['roll', 'sneak', 'split', 'eat'].includes(name)) return;
  clearTimeout(fxTimers[name]);
  petEl.classList.add(name);
  fxTimers[name] = setTimeout(() => petEl.classList.remove(name), Math.min(ms, 20000));
}

// ---------- Charakter-Verhalten direkt im Fenster (nur Begleiter-Modus) ----------
const companion = () => !!(pet && pet.kind === 'none' && pet.talent && pet.talent.enabled && !pet.muted);
let localSaidAt = {};
function localSay(key, text, gapMs) {
  const now = Date.now();
  if (bubble.classList.contains('show') || now - (localSaidAt[key] || 0) < gapMs) return false;
  localSaidAt[key] = now;
  showBubble({ text, ms: 3200, mood: 'talk', open: false });
  return true;
}
// Quak: Zunge schnappt nach dem Mauszeiger, wenn er nah am Maul ist
let tongueAt = 0;
function frogTongue(x, y) {
  const now = Date.now();
  if (now - tongueAt < 3500 || cuddling || dragging) return;
  const svg = sprite.querySelector('svg'); const tongue = sprite.querySelector('.tongue');
  if (!svg || !tongue) return;
  const r = svg.getBoundingClientRect();
  let sx = ((x - r.left) / r.width) * 120; const sy = ((y - r.top) / r.height) * 120;
  if (flip.classList.contains('left')) sx = 120 - sx;
  const dx = sx - 60; const dy = sy - 76; const d = Math.hypot(dx, dy);
  if (d > 70 || d < 18) return;
  tongueAt = now;
  const k = Math.min(1, 52 / d);
  tongue.setAttribute('x2', String(60 + dx * k)); tongue.setAttribute('y2', String(76 + dy * k));
  petEl.classList.remove('lick'); void petEl.offsetWidth; petEl.classList.add('lick');
  setTimeout(() => petEl.classList.remove('lick'), 320);
  if (Math.random() < 0.5) { api.fly(); if (Math.random() < 0.4) setTimeout(() => localSay('fly', 'Hab dich! 🪰 … ach, nur der Mauszeiger. Quak.', 60000), 350); }
}
// Watschel: hektische Maus in der Naehe -> "Ganz ruhig"
let lastMove = null; let speedAvg = 0;
function trackSpeed(x, y) {
  const now = performance.now();
  if (lastMove) {
    const dt = Math.max(1, now - lastMove.t);
    speedAvg = speedAvg * 0.8 + (Math.hypot(x - lastMove.x, y - lastMove.y) / dt) * 0.2;
  }
  lastMove = { x, y, t: now };
  if (speedAvg > 3.2) { speedAvg = 0; localSay('calm', 'Ganz ruhig … Die Maus läuft nicht weg. 🐧', 180000); }
}
// Mauz: haut nach dem Mauszeiger, wenn er zu lange ueber ihr schwebt (ohne Streicheln)
let hoverSince = 0;
function catSwat() {
  if (!over || cuddling || dragging) { hoverSince = 0; return; }
  if (!hoverSince) { hoverSince = Date.now(); return; }
  if (Date.now() - hoverSince > 3000 && localSay('swat', '*haut nach dem Mauszeiger* 🐾 … Zu nah.', 120000)) { flash('alert', 700); hoverSince = 0; }
}
// Bambus: doest ein, wenn eine Weile niemand in der Naehe ist; Maus oder Streicheln weckt ihn
let dozeTimer = null;
function pandaWake() {
  clearTimeout(dozeTimer);
  if (!(pet && pet.species === 'panda' && companion())) return;
  if (mood === 'sleep' && !pet.muted) { mood = 'idle'; if (!moodTimer) setMood(mood); }
  dozeTimer = setTimeout(() => { if (companion() && pet.species === 'panda' && !walking) { mood = 'sleep'; if (!moodTimer) setMood(mood); } }, 90000);
}
function companionMouse(e) {
  if (!companion()) return;
  if (pet.species === 'frog') frogTongue(e.clientX, e.clientY);
  else if (pet.species === 'penguin') trackSpeed(e.clientX, e.clientY);
  else if (pet.species === 'cat') catSwat();
  else if (pet.species === 'panda') pandaWake();
}
// Pilz: kleiner Garten neben dem Pet (waechst mit jeder Pause, jeden Tag neu)
const gardenEl = document.getElementById('garden');
const PLANTS = ['🌱', '🍄', '🌿', '🌼', '🍀', '🌱', '🍄', '🌸'];
function showGarden(n) {
  gardenEl.replaceChildren();
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.textContent = PLANTS[i % PLANTS.length];
    const side = i % 2 ? 1 : -1;               // abwechselnd links und rechts
    s.style.setProperty('--x', `${side * (58 + Math.floor(i / 2) * 18)}px`);
    s.style.animationDelay = `${i === n - 1 ? 0 : -1}s`;
    gardenEl.appendChild(s);
  }
}

const MOODS = ['idle', 'talk', 'happy', 'greet', 'sad', 'alert', 'sleep', 'walk', 'drag', 'stretch', 'cover', 'inhale', 'exhale'];
function setMood(m) {
  petEl.classList.remove(...MOODS);
  petEl.classList.add(dragging ? 'drag' : walking ? 'walk' : m);
}
// Stimmung fuer eine Weile, dann zurueck zur Grundstimmung
function flash(m, ms) {
  clearTimeout(moodTimer);
  setMood(m);
  if (m === 'happy') sprinkleHearts();
  moodTimer = setTimeout(() => { moodTimer = null; setMood(mood); }, ms);
}
function sprinkleHearts() {
  for (let i = 0; i < 3; i++) {
    const h = document.createElement('i');
    h.textContent = (pet && pet.species === 'dragon' ? ['✨', '🔥', '✨'] : ['💛', '✨', '💖'])[i]; // Drache pustet Funken
    h.style.left = `${20 + i * 28}%`;
    h.style.animationDelay = `${i * 0.18}s`;
    hearts.appendChild(h);
    setTimeout(() => h.remove(), 2200);
  }
}

// ---------- Leben: blinzeln, umschauen ----------
function blinkLoop() {
  setTimeout(() => {
    if (!petEl.classList.contains('sleep')) {
      petEl.classList.add('blink');
      setTimeout(() => petEl.classList.remove('blink'), 140);
      if (Math.random() < 0.2) setTimeout(() => { petEl.classList.add('blink'); setTimeout(() => petEl.classList.remove('blink'), 120); }, 300);
    }
    blinkLoop();
  }, 2500 + Math.random() * 4000);
}
function lookLoop() {
  setTimeout(() => {
    if (mood === 'idle' && !moodTimer && !walking) {
      petEl.classList.add('look');
      setTimeout(() => petEl.classList.remove('look'), 1200);
      if (Math.random() < 0.15) flash('happy', 900); // kleiner Freudenhuepfer zwischendurch
      else if (pet && pet.species === 'beau' && Math.random() < 0.08) flash('greet', 1500); // Beau winkt ab und zu einfach so
    }
    lookLoop();
  }, 6000 + Math.random() * 9000);
}

// ---------- Sprechblase ----------
function showBubble({ text, ms, mood: m, open }) {
  clearTimeout(bubbleTimer);
  bubbleText.textContent = text;
  bubbleOpens = !!open;
  bubbleHint.textContent = open ? 'Klick zum Öffnen' : '';
  bubble.classList.toggle('open', bubbleOpens);
  bubble.classList.add('show');
  flash(m === 'talk' ? 'talk' : m, m === 'talk' ? ms : Math.min(ms, 2600));
  if (m !== 'talk') setTimeout(() => { if (bubble.classList.contains('show') && !moodTimer) setMood(mood); }, 2700);
  bubbleTimer = setTimeout(hideBubble, ms);
}
function hideBubble() { bubble.classList.remove('show'); clearTimeout(bubbleTimer); }
bubble.addEventListener('click', () => { api.bubbleClick(bubbleOpens); hideBubble(); });

// ---------- Maus: nur das Pet und die Blase sind anklickbar, der Rest laesst Klicks durch ----------
let over = false;
function updateHover(x, y) {
  const el = document.elementFromPoint(x, y);
  const now = !!(el && el.closest('.hit') && (el.closest('#pet') || bubble.classList.contains('show')));
  if (now !== over) { over = now; api.hover(now); }
}
document.addEventListener('mousemove', (e) => {
  updateHover(e.clientX, e.clientY);
  watchCursor(e.clientX, e.clientY);
  strokeMove(e);
  companionMouse(e);
});
document.addEventListener('mouseleave', () => {
  if (over && !dragging) { over = false; api.hover(false); }
  if (cuddling) stopCuddle();
});

// ---------- Augen folgen der Maus (solange sie in der Naehe ist) ----------
let watchTimer = null;
const clamp = (v) => Math.max(-1, Math.min(1, v));
function watchCursor(x, y) {
  if (dragging) return;
  const r = petEl.getBoundingClientRect();
  let dx = x - (r.left + r.width / 2);
  const dy = y - (r.top + r.height * 0.55);
  if (flip.classList.contains('left')) dx = -dx; // Pet ist gespiegelt: Augen andersherum schieben
  petEl.style.setProperty('--lx', `${(clamp(dx / 70) * 3.5).toFixed(2)}px`);
  petEl.style.setProperty('--ly', `${(clamp(dy / 70) * 2.5).toFixed(2)}px`);
  petEl.classList.add('watch');
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => petEl.classList.remove('watch'), 1400);
}

// ---------- Streicheln: Maus ohne Taste ueber dem Pet hin und her ----------
const stroke = window.Stroke.createStroke();
let cuddling = false;
let cuddleStart = 0;
let cuddleSaid = false;
let cuddleTimer = null;
function strokeMove(e) {
  const onPet = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('#pet');
  if (!onPet || e.buttons || dragging) {
    if (cuddling) stopCuddle(); else stroke.reset();
    return;
  }
  if (stroke.move(e.clientX, performance.now()) && !cuddling) startCuddle();
}
function startCuddle() {
  cuddling = true;
  cuddleStart = performance.now();
  cuddleSaid = false;
  // Pilzi reagiert als Begleiter gemaechlich: erst nach gut zwei Sekunden
  if (pet && pet.species === 'mushroom' && companion()) setTimeout(() => { if (cuddling) petEl.classList.add('cuddle'); }, 2200);
  else petEl.classList.add('cuddle');
  if (pet && pet.species === 'panda') pandaWake();
  api.petting(true);
  let n = 0;
  cuddleTimer = setInterval(() => {
    const now = performance.now();
    if (!stroke.tick(now)) { stopCuddle(); return; }
    if (++n % 4 === 0) oneHeart();
    // eine Weile gestreichelt: das Pet sagt etwas dazu (der Hauptprozess entscheidet, ob es gerade passt)
    if (!cuddleSaid && now - cuddleStart > 2500) { cuddleSaid = true; api.petted(); }
  }, 160);
}
function stopCuddle() {
  if (!cuddling) return;
  cuddling = false;
  clearInterval(cuddleTimer);
  stroke.reset();
  petEl.classList.remove('cuddle');
  api.petting(false);
  if (mood !== 'sleep' && !moodTimer) flash('happy', 900); // zufriedener Huepfer zum Schluss
}
function oneHeart() {
  const h = document.createElement('i');
  h.textContent = (pet && pet.species === 'dragon' ? ['✨', '🔥', '✨'] : ['💖', '💕', '💗'])[Math.floor(Math.random() * 3)];
  h.style.left = `${25 + Math.random() * 45}%`;
  hearts.appendChild(h);
  setTimeout(() => h.remove(), 1800);
}

petEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (cuddling) stopCuddle();
  petEl.setPointerCapture(e.pointerId);
  api.dragStart();
});
petEl.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return;
  api.dragEnd();
});
// Maus "verloren" (z. B. losgelassen ausserhalb, Monitorwechsel): Ziehen sicher beenden
petEl.addEventListener('lostpointercapture', () => api.dragEnd());
petEl.addEventListener('contextmenu', (e) => { e.preventDefault(); api.context(); });

// ---------- Nachrichten vom Hauptprozess ----------
api.on('pet:update', applyPet);
// Hauptprozess hat die Klick-Sperre geloest (Maus war nicht mehr ueber dem Fenster)
api.on('pet:hover-reset', () => { over = false; });
api.on('pet:say', showBubble);
api.on('pet:timer', showTimer);
api.on('pet:screen', showScreen);
api.on('pet:prop', showProp);
api.on('pet:fx', fx);
api.on('pet:slide', (on) => petEl.classList.toggle('sliding', !!on));
// Pilzi: Wetter-Aussehen (wx-sun, wx-rain, wx-snow, wx-fog, wx-cloud, dazu wx-windy, wx-cold, wx-hot)
api.on('pet:weather', (look) => {
  petEl.classList.remove('wx-sun', 'wx-rain', 'wx-snow', 'wx-fog', 'wx-cloud', 'wx-windy', 'wx-cold', 'wx-hot');
  if (!look || !['sun', 'rain', 'snow', 'fog', 'cloud'].includes(look.sky)) return;
  petEl.classList.add(`wx-${look.sky}`);
  if (look.windy) petEl.classList.add('wx-windy');
  if (look.cold) petEl.classList.add('wx-cold');
  if (look.hot) petEl.classList.add('wx-hot');
});
api.on('pet:info', (t) => { info = typeof t === 'string' ? t.slice(0, 60) : ''; showName(); });
api.on('pet:garden', (n) => showGarden(Math.max(0, Math.min(8, +n || 0))));
// Stimmung kurz zeigen: 'happy' oder { mood: 'sleep', ms: 3500 } (Aktionen in Szenen)
api.on('pet:mood', (m) => (typeof m === 'object' ? flash(m.mood, m.ms || 1600) : flash(m, 1600)));
api.on('pet:walk', (dir) => {
  walking = dir;
  if (dir) flip.classList.toggle('left', dir < 0);
  if (!moodTimer) setMood(mood);
});
api.on('pet:face', (dir) => { if (dir) flip.classList.toggle('left', dir < 0); else flip.classList.remove('left'); });
api.on('pet:dragging', (d) => {
  if (d === dragging) return;
  dragging = d;
  if (!d) flash('happy', 700); else setMood(mood);
});

// Start: Daten kommen ueber die URL (id) – das Aussehen schickt der Hauptprozess gleich nach
const params = new URLSearchParams(window.location.search);
document.title = `Pet ${params.get('id')}`;
blinkLoop();
lookLoop();
