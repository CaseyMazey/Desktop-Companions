const test = require('node:test');
const assert = require('node:assert');
const { APPS, SPECIES, NAMES, DEFAULT_SPECIES, GROUPS, speciesName } = require('../src/presets');
const { createPet, createChosenPet, petsForEvent, KINDS } = require('../src/logic');

test('Presets: jedes hat alles, was die Auswahl braucht', () => {
  for (const k of KINDS) {
    const a = APPS[k];
    assert.ok(a.label && a.hint && a.icon && a.eventsLabel, `${k}: Text fehlt`);
    assert.ok(GROUPS[a.group], `${k}: unbekannter Abschnitt ${a.group}`);
    assert.ok(NAMES[k], `${k}: kein Name`);
    assert.ok(SPECIES[DEFAULT_SPECIES[k]], `${k}: kein Standard-Tier`);
    assert.equal(typeof a.target(), 'string');
    assert.ok(createPet(k).reminders.messages.length, `${k}: keine Sprüche`);
  }
  for (const k of ['c3', 'claude', 'claudecode', 'chatgpt', 'gmail']) assert.ok(KINDS.includes(k), `${k} fehlt`);
  assert.equal(APPS.gmail.target(), 'https://mail.google.com');
});

test('Neues Pet: Tier und Verbindung getrennt gewählt', () => {
  const p = createChosenPet('gmail', 'fox');
  assert.equal(p.kind, 'gmail');
  assert.equal(p.species, 'fox');
  assert.equal(p.name, 'Fips');                       // Name vom Tier
  assert.equal(p.color, SPECIES.fox.color);           // Farbe vom Tier
  assert.equal(p.target, 'https://mail.google.com');  // Ziel und Erinnerungen vom Preset
  assert.equal(p.reminders.enabled, true);
  assert.equal(createChosenPet('nook', 'beau', '  Hutträger ').name, 'Hutträger');
  assert.equal(speciesName('beau'), 'Beau');
  const bad = createChosenPet('quatsch', 'einhorn');
  assert.equal(bad.kind, 'none');
  assert.ok(SPECIES[bad.species]);
});

test('Meldungen: 3C hört auf NEXUS, Claude Code auf seinen Hook', () => {
  const pets = ['nexus', 'c3', 'claudecode', 'gmail'].map((k) => createPet(k));
  const kinds = (ev) => petsForEvent(pets, ev).map((p) => p.kind).sort();
  assert.deepEqual(kinds({ app: 'nexus', type: 'task-done' }), ['c3', 'nexus']);
  assert.deepEqual(kinds({ app: 'claude-code', type: 'decision' }), ['claudecode']);
  assert.deepEqual(kinds({ app: 'gmail', type: 'say' }), []);            // Gmail-Pets: Meldungen standardmaessig aus
  pets[1].hidden = true;
  assert.deepEqual(kinds({ app: 'nexus', type: 'task-done' }), ['nexus']); // ausgeblendet: keine Meldung
  assert.deepEqual(petsForEvent(pets, { pet: pets[2].id, type: 'say' }).map((p) => p.kind), ['claudecode']);
});
