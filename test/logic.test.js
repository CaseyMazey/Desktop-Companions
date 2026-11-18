const test = require('node:test');
const assert = require('node:assert');
const { createPet, normalizeState, dueReminder, neighborPairs, inActiveWindow, overlaps, freeSpot, neighborGroups, strollTarget, HOME_RADIUS } = require('../src/logic');
const { pickScene, PAIR, GROUP, rolesOf } = require('../src/dialogues');
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

test('Szenen zu zweit: passend zu den Apps, Rollen richtig besetzt, Namen eingesetzt', () => {
  const nexus = { id: 'n', kind: 'nexus', species: 'ghost', name: 'Nexi' }, dan = { id: 'd', kind: 'dan', species: 'cat', name: 'Danny' };
  const i = PAIR.findIndex((s) => s.need && s.need[0].kind === 'nexus' && s.need[1].kind === 'dan');
  const recent = PAIR.map((_, k) => 'p' + k).filter((k) => k !== 'p' + i); // nur diese Szene frisch lassen
  const sc = pickScene([dan, nexus], () => 0, recent);
  assert.equal(sc.key, 'p' + i);
  assert.deepEqual(sc.lines[0].ids, ['n']);   // NEXUS-Pet faengt an, obwohl es rechts steht
  assert.deepEqual(sc.lines[1].ids, ['d']);
  for (let k = 0; k < 80; k++) {
    const g = pickScene([{ id: 'a', kind: 'none', species: 'blob', name: 'A' }, { id: 'b', kind: 'none', species: 'bird', name: 'B' }]);
    const s = PAIR[+g.key.slice(1)];
    assert.ok(!s.need || s.need.every((r) => !r.kind && !r.species), 'Pets ohne App bekommen nur allgemeine Szenen');
    assert.ok(g.lines.every((l) => !l.text || !/\{\d\}/.test(l.text)));
  }
});

test('Szenen in der Gruppe: drei und mehr Pets, "alle" heisst alle Beteiligten', () => {
  const pets = ['a', 'b', 'c', 'd'].map((id) => ({ id, kind: 'none', species: 'blob', name: id.toUpperCase() }));
  let sawGroup = false, sawFour = false;
  for (let k = 0; k < 200; k++) {
    const sc = pickScene(pets);
    if (sc.key[0] === 'g') {
      sawGroup = true;
      if (sc.ids.length === 4) sawFour = true;
      assert.ok(sc.ids.length >= 3 && sc.ids.length === rolesOf(GROUP[+sc.key.slice(1)]));
      const all = sc.lines.find((l) => l.ids.length > 1);
      if (all) assert.deepEqual([...all.ids].sort(), [...sc.ids].sort());
    } else {
      assert.equal(sc.ids.length, 2);
    }
    assert.ok(sc.lines.every((l) => ['talk', 'happy', 'sleep', 'alert', 'sad'].includes(l.mood)));
  }
  assert.ok(sawGroup && sawFour);
  // Beau-Szenen nur mit Beau
  for (let k = 0; k < 100; k++) {
    const sc = pickScene(pets.slice(0, 2));
    const s = PAIR[+sc.key.slice(1)];
    assert.ok(!(s.need || []).some((r) => r.species === 'beau'));
  }
});

test('Gruppen: Pets, die ueber Nachbarn verbunden sind, links nach rechts', () => {
  const b = (id, x) => ({ id, x, y: 300, width: 260, height: 110 });
  assert.deepEqual(neighborGroups([b('c', 500), b('a', 180), b('b', 340), b('weit', 1500), b('weit2', 1660)]), [['a', 'b', 'c'], ['weit', 'weit2']]);
  assert.deepEqual(neighborGroups([b('allein', 0)]), []);
});

test('Standard: Pets wandern nicht; alte Daten werden einmalig umgestellt, danach bleibt die Wahl', () => {
  assert.equal(createPet('nook').wander, false);
  const alt = normalizeState({ pets: [{ id: 'aaaa1111', kind: 'nook', wander: true, x: 300, y: 500 }], settings: {} });
  assert.equal(alt.pets[0].wander, false);
  assert.equal(alt.pets[0].homeX, 300);
  assert.equal(alt.settings.stayDefault, true);
  // spaeter bewusst eingeschaltet: bleibt an
  alt.pets[0].wander = true;
  assert.equal(normalizeState(alt).pets[0].wander, true);
});

test('Wandern aus: bleibt in der Naehe seines Platzes', () => {
  const pet = { wander: false, homeX: 500 };
  for (let k = 0; k < 200; k++) {
    const t = strollTarget(pet, 520, 0, 3000);
    assert.ok(Math.abs(t - 500) <= HOME_RADIUS, `zu weit weg: ${t}`);
  }
  let far = 0;
  for (let k = 0; k < 200; k++) if (Math.abs(strollTarget({ wander: true }, 1500, 0, 3000) - 1500) > HOME_RADIUS) far++;
  assert.ok(far > 100, 'frei wandernde Pets laufen auch weiter weg');
  assert.ok(strollTarget({ wander: true }, 10, 0, 3000) >= 0); // nie ueber den Rand
});

test('Schnittstelle: nur bekannte Ereignisse', () => {
  assert.equal(validEvent({ app: 'nexus', type: 'task-done', project: 'X' }).type, 'task-done');
  assert.equal(validEvent({ app: 'nexus', type: 'loeschen' }), null);
  assert.equal(validEvent({ type: 'say', text: 'hi' }), null);
  assert.equal(validEvent({ app: 'dan', type: 'say' }), null);
  assert.equal(validEvent({ app: 'dan', type: 'say', text: 'x'.repeat(500) }).text.length, 200);
});
