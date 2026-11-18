// Baut die Beispielszene fuer das README-Bild (scripts/screenshot.js)
/* global document, window */
for (const el of document.querySelectorAll('.pet')) {
  const n = parseInt(el.dataset.color.slice(1), 16);
  el.style.setProperty('--c', el.dataset.color);
  el.style.setProperty('--c-dark', `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.68)).join(',')})`);
  el.classList.remove('idle');
  el.classList.add(el.dataset.mood);
  const say = document.createElement('div');
  say.className = 'say';
  say.textContent = el.dataset.say;
  const sprite = document.createElement('div');
  sprite.className = 'sprite';
  sprite.innerHTML = window.renderSpecies(el.dataset.species);
  const shadow = document.createElement('div');
  shadow.className = 'shadow';
  el.prepend(say, sprite, shadow);
}
