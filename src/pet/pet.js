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
  nameEl.textContent = p.name;
  mood = p.muted ? 'sleep' : 'idle';
  if (!moodTimer) setMood(mood);
}

const MOODS = ['idle', 'talk', 'happy', 'sad', 'alert', 'sleep', 'walk', 'drag'];
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
    h.textContent = ['💛', '✨', '💖'][i];
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
document.addEventListener('mousemove', (e) => updateHover(e.clientX, e.clientY));
document.addEventListener('mouseleave', () => { if (over && !dragging) { over = false; api.hover(false); } });

petEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  petEl.setPointerCapture(e.pointerId);
  api.dragStart();
});
petEl.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return;
  api.dragEnd();
});
petEl.addEventListener('contextmenu', (e) => { e.preventDefault(); api.context(); });

// ---------- Nachrichten vom Hauptprozess ----------
api.on('pet:update', applyPet);
api.on('pet:say', showBubble);
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
