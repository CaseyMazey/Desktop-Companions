const test = require('node:test');
const assert = require('node:assert');
const { createPet, createChosenPet, normalizePet, exportFile, importFile } = require('../src/logic');
const { COMPANION, PROFILE, TALENT_HELP } = require('../src/characters');
const { SPECIES } = require('../src/presets');
const { TALENTS, companionDue } = require('../src/talents');

test('Namen kommen vom Tier – nie automatisch "Nexi"', () => {
  assert.equal(createPet('nexus').name, 'Buh', 'NEXUS-Pet (Geist) heisst Buh, nicht Nexi');
  assert.equal(createPet('dan').name, 'Mauz');
  assert.equal(createChosenPet('nexus', 'fox').name, 'Fips');
  // Funktion wechseln: Name bleibt
  const p = createChosenPet('none', 'ghost', 'Gustav');
  assert.equal(normalizePet({ ...p, kind: 'nexus' }).name, 'Gustav');
});

test('Charaktere: je Tier ~20 eigene Sprueche, Steckbrief und verstaendliches Talent', () => {
  for (const sp of Object.keys(SPECIES)) {
    assert.ok(COMPANION[sp].length >= 20, `${sp}: nur ${COMPANION[sp].length} Sprüche`);
    assert.ok(PROFILE[sp].likes && PROFILE[sp].dislikes, `${sp}: Mag/Mag nicht fehlt`);
    const h = TALENT_HELP[sp];
    assert.ok(h.what && h.when && h.you, `${sp}: Talent-Erklärung unvollständig`);
    assert.equal(TALENTS[sp].help, h);
  }
  assert.ok(COMPANION.robot.every((l) => { const t = l.replace(/\{\w+\}/g, ''); return t === t.toUpperCase(); }), 'Bip spricht in Großbuchstaben');
});

test('Eigene Sprueche und Steckbrief pro Pet', () => {
  const p = normalizePet({ ...createChosenPet('none', 'cat'), lines: ['  Meins.  ', '', 'Pff.'], profile: { likes: 'Thunfisch' } });
  assert.deepEqual(p.lines, ['Meins.', 'Pff.']);
  assert.equal(p.profile.likes, 'Thunfisch');
  assert.equal(p.profile.character, '', 'leer = Standard des Tiers');
  assert.match(p.created, /^\d{4}-\d{2}-\d{2}$/);
  // Begleiter-Spruch kommt aus den eigenen Spruechen
  const r = companionDue({ ...p, talent: { enabled: true } }, { compAt: 1 }, { now: new Date(2026, 10, 19, 10), activeMin: 30, weather: {} }, () => 0.99);
  assert.ok(['Meins.', 'Pff.'].includes(r.text));
});

test('Pets exportieren und importieren (.dcpet)', () => {
  const p = normalizePet({ ...createChosenPet('custom', 'frog', 'Kermito'), target: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', appName: 'Rechner', lines: ['QUAK!'], profile: { likes: 'Fliegen' }, x: 500, hidden: true });
  const file = exportFile([p]);
  assert.equal(file.format, 'desktop-companions-pet');
  assert.ok(!('x' in file.pets[0]) && !('id' in file.pets[0]) && !('hidden' in file.pets[0]), 'keine Position/ID/Ausgeblendet');
  const [back] = importFile(JSON.parse(JSON.stringify(file)));
  assert.equal(back.name, 'Kermito');
  assert.equal(back.appName, 'Rechner');
  assert.deepEqual(back.lines, ['QUAK!']);
  assert.equal(back.profile.likes, 'Fliegen');
  assert.notEqual(back.id, p.id, 'neue ID');
  assert.equal(back.hidden, false);
  assert.throws(() => importFile({ hallo: 'welt' }), /keine Pet-Datei/);
});
