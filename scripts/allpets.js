// Baut das "Familienfoto" aller Pets fuer das README (scripts/screenshot.js -> docs/screenshots/all-pets.png)
/* global document, window */
const PETS = [
  ['ghost', 'Buh', 'Geist', '#c4b5fd', 'Diskret'],
  ['cat', 'Mauz', 'Katze', '#f4a261', 'Streck-Pause'],
  ['blob', 'Blubb', 'Schleim', '#7dd3a8', 'Trink-Erinnerung'],
  ['bird', 'Piep', 'Vogel', '#7cc6f2', 'Bote'],
  ['beau', 'Beau', 'Kater mit Hexenhut', '#d99a36', 'Tageszauber'],
  ['fox', 'Fips', 'Fuchs', '#f28c38', 'Feierabend-Fuchs'],
  ['owl', 'Huhu', 'Eule', '#b08463', 'Lernbegleiterin'],
  ['frog', 'Quak', 'Frosch', '#7cc97a', 'Wetterfrosch'],
  ['penguin', 'Watschel', 'Pinguin', '#475569', 'Atem-Pause'],
  ['bunny', 'Hoppel', 'Hase', '#e9d8c8', 'Zeit & Timer'],
  ['panda', 'Bambus', 'Panda', '#f5f3ef', 'Augenpause'],
  ['axolotl', 'Lotti', 'Axolotl', '#f9a8c9', 'Lob'],
  ['dragon', 'Funke', 'Drache', '#6fcf97', 'Hüter'],
  ['mushroom', 'Pilzi', 'Pilz', '#e5534b', 'Pausen-Garten'],
  ['robot', 'Bip', 'Roboter', '#9fb4c7', 'Fokus-Timer'],
];
const dark = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.68)).join(',')})`; };
const grid = document.getElementById('grid');
for (const [sp, name, animal, color, talent] of PETS) {
  const cell = document.createElement('div');
  cell.className = 'cell idle';
  cell.style.setProperty('--c', color);
  cell.style.setProperty('--c-dark', dark(color));
  const art = document.createElement('div');
  art.className = 'art';
  art.innerHTML = window.renderSpecies(sp);
  const shadow = document.createElement('div'); shadow.className = 'shadow';
  const b = document.createElement('b'); b.textContent = name;
  const s = document.createElement('small'); s.textContent = animal;
  const t = document.createElement('span'); t.className = 'talent'; t.textContent = talent;
  cell.append(art, shadow, b, s, t);
  grid.appendChild(cell);
}
