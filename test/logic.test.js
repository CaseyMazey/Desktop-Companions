const test = require('node:test');
const assert = require('node:assert');
const { createPet, normalizeState, dueReminder, neighborPairs, inActiveWindow, overlaps, freeSpot } = require('../src/logic');
const { pickDialogue, DIALOGUES } = require('../src/dialogues');
const { validEvent } = require('../src/bridge');

const at = (iso) => new Date(iso);

test('Voreinstellungen: DAN erinnert werktags, NEXUS nicht', () => {
  const dan = createPet('dan');
  assert.equal(dan.reminders.enabled, true);
  assert.equal(dan.reminders.onlyWorkdays, true);
  assert.match(dan.target, process.platform === 'win32' ? /DAN\.exe$/ : process.platform === 'darwin' ? /DAN\.app$/ : /dan$/);
  assert.equal(createPet('nexus').reminders.enabled, false);
  assert.equal(createPet('quatsch').kind, 'none');
});

test('kaputte Daten werden repariert, doppelte IDs neu vergeben', () => {
  const s = normalizeState({ pets: [{ id: 'aaaa1111', kind: 'nook', color: 'rot', size: 999 }, { id: 'aaaa1111', kind: 'dan' }], settings: { chatter: 'laut' } });
  assert.equal(s.pets.length, 2);
  assert.notEqual(s.pets[0].id, s.pets[1].id);
  assert.match(s.pets[0].color, /^#/);
  assert.equal(s.pets[0].size, 160);
  assert.equal(s.settings.chatter, 'normal');
});

test('Intervall-Erinnerung: nicht direkt beim Start, dann nach Ablauf', () => {
  const pet = createPet('dan', { reminders: { enabled: true, intervalMin: 60, onlyWorkdays: true, from: '07:00', to: '17:00', messages: ['A', 'B'], timed: [] } });
  const mem = {};
  assert.equal(dueReminder(pet, mem, at('2026-11-18T09:00:00')), null);           // Mittwoch, Start
  assert.equal(dueReminder(pet, mem, at('2026-11-18T09:30:00')), null);
  assert.ok(['A', 'B'].includes(dueReminder(pet, mem, at('2026-11-18T10:01:00'))));
  assert.equal(dueReminder(pet, mem, at('2026-11-18T10:05:00')), null);
});

test('nur werktags und nur im Zeitfenster', () => {
  const r = { onlyWorkdays: true, from: '07:00', to: '17:00' };
  assert.equal(inActiveWindow(r, at('2026-11-21T10:00:00')), false); // Samstag
  assert.equal(inActiveWindow(r, at('2026-11-18T18:00:00')), false);
  assert.equal(inActiveWindow(r, at('2026-11-18T08:00:00')), true);
  assert.equal(inActiveWindow({ onlyWorkdays: false, from: '22:00', to: '02:00' }, at('2026-11-18T23:30:00')), true);
});

test('feste Uhrzeit: einmal am Tag, auch ausserhalb des Fensters', () => {
  const pet = createPet('nook', { reminders: { enabled: true, intervalMin: 600, from: '08:00', to: '09:00', messages: ['x'], timed: [{ time: '12:30', text: 'Mittag' }] } });
  const mem = {};
  assert.equal(dueReminder(pet, mem, at('2026-11-18T12:31:00')), 'Mittag');
  assert.equal(dueReminder(pet, mem, at('2026-11-18T12:33:00')), null);
  assert.equal(dueReminder(pet, mem, at('2026-11-19T12:30:00')), 'Mittag');
});

test('schlafende Pets erinnern nicht', () => {
  const pet = createPet('nook', { muted: true });
  assert.equal(dueReminder(pet, { lastInterval: 1 }, at('2026-11-18T12:30:00')), null);
});

test('Nachbarn: nur Pets nah nebeneinander, links zuerst', () => {
  const b = (id, x, y) => ({ id, x, y, width: 260, height: 110 });
  assert.deepEqual(neighborPairs([b('r', 500, 300), b('l', 340, 310), b('weit', 1400, 300)]), [['l', 'r']]);
  assert.deepEqual(neighborPairs([b('a', 0, 0), b('b', 100, 500)]), []);
});

test('Platz: aufeinander gilt als belegt, nebeneinander nicht', () => {
  const others = [{ cx: 500, bottom: 800, size: 100 }];
  assert.equal(overlaps(510, 800, 100, others), true);
  assert.equal(overlaps(600, 800, 100, others), false);       // daneben
  assert.equal(overlaps(510, 400, 100, others), false);       // anderer Hoehe (z. B. anderes Fenster)
  assert.equal(freeSpot(520, 800, 100, others, 0, 2000, 1) > 540, true);   // nach rechts ausweichen
  assert.equal(freeSpot(520, 800, 100, others, 0, 2000, -1) < 460, true);  // nach links ausweichen
  assert.equal(freeSpot(520, 800, 100, others, 0, 540, 1) < 460, true);    // rechts kein Platz: links
  assert.equal(freeSpot(700, 800, 100, others, 0, 2000), 700);             // schon frei
});

test('Gespraeche: passend zu den Apps, Sprecher korrekt, Namen eingesetzt', () => {
  const nexus = { id: 'n', kind: 'nexus', name: 'Nexi' }, dan = { id: 'd', kind: 'dan', name: 'Danny' };
  const i = DIALOGUES.findIndex((d) => d.with && d.with.join() === 'nexus,dan');
  // nur das NEXUS-DAN-Gespraech frisch lassen
  const recent = DIALOGUES.map((_, k) => k).filter((k) => k !== i);
  const d = pickDialogue(dan, nexus, () => 0, recent);
  assert.equal(d.index, i);
  assert.equal(d.lines[0].id, 'n');   // NEXUS-Pet faengt an, obwohl es rechts steht
  assert.equal(d.lines[1].id, 'd');
  for (let k = 0; k < 50; k++) {
    const g = pickDialogue({ id: 'a', kind: 'none', name: 'A' }, { id: 'b', kind: 'none', name: 'B' });
    assert.ok(!DIALOGUES[g.index].with, 'Pets ohne App bekommen nur allgemeine Gespraeche');
    assert.ok(g.lines.every((l) => !/\{[01]\}/.test(l.text)));
  }
});

test('Schnittstelle: nur bekannte Ereignisse', () => {
  assert.equal(validEvent({ app: 'nexus', type: 'task-done', project: 'X' }).type, 'task-done');
  assert.equal(validEvent({ app: 'nexus', type: 'loeschen' }), null);
  assert.equal(validEvent({ type: 'say', text: 'hi' }), null);
  assert.equal(validEvent({ app: 'dan', type: 'say' }), null);
  assert.equal(validEvent({ app: 'dan', type: 'say', text: 'x'.repeat(500) }).text.length, 200);
});
