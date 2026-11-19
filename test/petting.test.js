const test = require('node:test');
const assert = require('node:assert');
const { createStroke, IDLE_MS } = require('../src/pet/stroke');
const { PETTED, pettedLine } = require('../src/dialogues');
const { SPECIES } = require('../src/presets');

// Maus von a nach b in kleinen Schritten bewegen
function sweep(s, from, to, t, step = 4, dt = 10) {
  const d = Math.sign(to - from);
  let on = false;
  for (let x = from; d > 0 ? x <= to : x >= to; x += d * step) { on = s.move(x, t); t += dt; }
  return [on, t];
}

test('Streicheln: hin und her ueber dem Pet startet es', () => {
  const s = createStroke();
  let t = 0, on;
  [on, t] = sweep(s, 0, 40, t);
  [on, t] = sweep(s, 40, 0, t);
  assert.equal(on, false, 'eine Umkehr reicht noch nicht');
  [on, t] = sweep(s, 0, 40, t);
  [on, t] = sweep(s, 40, 0, t);
  assert.equal(on, true);
  assert.equal(s.tick(t + 100), true);
  assert.equal(s.tick(t + IDLE_MS + 50), false, 'Maus steht still: Schluss');
});

test('Streicheln: einfach drueberfahren oder Zittern zaehlt nicht', () => {
  const s = createStroke();
  assert.equal(sweep(s, 0, 200, 0)[0], false);
  const z = createStroke();
  let on = false;
  for (let i = 0; i < 40; i++) on = z.move(i % 2 ? 2 : 0, i * 10); // 2-Pixel-Zittern
  assert.equal(on, false);
});

test('Streicheln: zu langsam (Striche weit auseinander) zaehlt nicht', () => {
  const s = createStroke();
  let t = 0, on;
  for (let i = 0; i < 6; i++) { [on, t] = sweep(s, i % 2 ? 40 : 0, i % 2 ? 0 : 40, t); t += 2000; }
  assert.equal(on, false);
});

test('Streicheln: jede Tierart hat eigene Sprueche', () => {
  for (const sp of Object.keys(SPECIES)) assert.ok((PETTED[sp] || []).length >= 3, `keine Sprueche fuer ${sp}`);
  assert.ok(PETTED.cat.includes(pettedLine('cat', () => 0)));
  assert.ok(pettedLine('unbekannt'));
});
