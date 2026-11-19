const test = require('node:test');
const assert = require('node:assert');
const { normalizeState, dueShared, takePresetTimed, createPet, normalizeShared } = require('../src/logic');

test('Feste Uhrzeiten gelten jetzt fuer alle: einmalige Uebernahme aus den Pets', () => {
  const nook = createPet('nook'); // Voreinstellung: 12:30 Mittagspause
  const dan = createPet('dan');   // Voreinstellung: 15:45 Feierabend-Erinnerung
  const s = normalizeState({ pets: [nook, dan], settings: {} });
  assert.deepEqual(s.settings.timed.map((t) => t.time), ['12:30', '15:45']);
  assert.equal(s.settings.timed[0].pet, nook.id, 'das Pet bleibt der Sprecher');
  assert.equal(s.pets[0].reminders.timed.length, 0, 'nicht mehr beim Pet');
  assert.equal(s.settings.timedShared, true);
  // zweites Laden: nichts doppelt, nichts zurueck zum Pet
  const again = normalizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(again.settings.timed.length, 2);
  assert.equal(again.settings.theme, 'dark');
  assert.equal(normalizeState({ settings: { theme: 'light' } }).settings.theme, 'light');
  assert.equal(normalizeState({ settings: { theme: 'pink' } }).settings.theme, 'dark');
});

test('Gemeinsame Uhrzeiten: pruefen, sortieren, einmal am Tag faellig', () => {
  const list = normalizeShared([{ time: '25:00', text: 'x' }, { time: '12:30', text: ' Mittag ' }, { time: '12:30', text: 'Mittag' }, { time: '09:00', text: 'Morgen', pet: 'gibtsnicht' }]);
  assert.deepEqual(list, [{ time: '09:00', text: 'Morgen', pet: '' }, { time: '12:30', text: 'Mittag', pet: '' }]);
  const mem = {};
  const at = (h, m) => new Date(2026, 10, 19, h, m);
  assert.deepEqual(dueShared(list, mem, at(12, 29)), []);
  assert.equal(dueShared(list, mem, at(12, 33))[0].text, 'Mittag');
  assert.deepEqual(dueShared(list, mem, at(12, 35)), [], 'nur einmal');
  assert.equal(dueShared(list, mem, new Date(2026, 10, 20, 12, 31)).length, 1, 'am naechsten Tag wieder');
});

test('Neues Pet bringt seine Uhrzeiten in die gemeinsamen mit', () => {
  const st = normalizeState({ pets: [], settings: { timedShared: true } });
  const dan = createPet('dan');
  takePresetTimed(dan, st);
  assert.equal(dan.reminders.timed.length, 0);
  assert.deepEqual(st.settings.timed.map((t) => [t.time, t.pet]), [['15:45', dan.id]]);
});
