const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { companionDue, companionInfo, COMPANION, FACTS, SCARED, TALENTS, normalizeTalent, moonOf } = require('../src/talents');
const { SPECIES } = require('../src/presets');
const { createChosenPet } = require('../src/logic');
const { snappyDecompress, cardsFromSubjects, readValue, decodeLocalStorage, loadNookCards } = require('../src/nookcards');

const at = (h, m = 0, day = 19) => new Date(2026, 10, day, h, m);
const pet = (kind, species, talent = {}) => ({ ...createChosenPet(kind, species), talent: normalizeTalent(species, talent) });
const ctx = (now, extra = {}) => ({ now, activeMin: 30, away: false, battery: null, weather: {}, cards: [], ...extra });

test('Begleiter-Modus: jedes Tier hat Sprüche, Beschreibung und Schreck-Reaktion', () => {
  for (const sp of Object.keys(SPECIES)) {
    assert.ok(TALENTS[sp].companion, `${sp}: Begleiter-Beschreibung fehlt`);
    assert.ok(SCARED[sp], `${sp}: Schreck-Reaktion fehlt`);
    if (sp !== 'owl') assert.ok(COMPANION[sp].length >= 5, `${sp}: zu wenige Sprüche`);
  }
  assert.ok(FACTS.length >= 15);
});

test('Begleiter-Modus nur ohne App, mit Pause dazwischen', () => {
  assert.equal(companionDue(pet('nook', 'dragon'), {}, ctx(at(10))), null, 'mit App: normal');
  const dragon = pet('none', 'dragon'); const mem = {};
  const r = companionDue(dragon, mem, ctx(at(10)), () => 0.9);
  assert.ok(r && r.text, 'ohne App: Energie-Spruch');
  assert.equal(companionDue(dragon, mem, ctx(at(10, 10)), () => 0.9), null, 'nicht gleich wieder');
  assert.ok(companionDue(dragon, mem, ctx(at(10, 40)), () => 0.9));
  assert.equal(companionDue(pet('none', 'dragon'), {}, ctx(at(23))), null, 'nachts still');
  assert.equal(companionDue(pet('none', 'dragon'), {}, ctx(at(10), { away: true })), null, 'niemand da');
  assert.equal(companionDue(pet('none', 'ghost'), {}, ctx(at(10)), () => 0.1).action, 'scare');
  assert.equal(companionDue(pet('none', 'cat'), {}, ctx(at(10)), () => 0.1).action, 'nap');
  assert.doesNotMatch(companionDue(pet('none', 'bunny'), {}, ctx(at(14, 5)), () => 0.99).text || '', /\{time\}/);
});

test('Huhu: mit Nook Karteikarten, sonst Fakten', () => {
  const cards = [{ q: 'Auf welcher Schicht liegt MQTT?', a: 'Anwendungsschicht', subject: 'LF 9' }];
  const quiz = companionDue(pet('nook', 'owl'), {}, ctx(at(10), { cards }));
  assert.match(quiz.text, /MQTT/);
  assert.equal(quiz.quiz.a, 'Anwendungsschicht');
  const fact = companionDue(pet('none', 'owl'), {}, ctx(at(10)));
  assert.ok(FACTS.includes(fact.text) && !fact.quiz);
  assert.ok(companionDue(pet('dan', 'owl'), {}, ctx(at(10))).text, 'auch mit anderer App ab und zu Fakten');
  assert.ok(!companionDue(pet('nook', 'owl'), {}, ctx(at(10))).quiz, 'Nook ohne Karten: Fakten');
});

test('Info am Namensschild', () => {
  assert.equal(companionInfo(pet('none', 'dragon'), {}, ctx(at(10), { battery: { level: 0.78, charging: true } })), '🔋 78 % ⚡');
  assert.equal(companionInfo(pet('nook', 'dragon'), {}, ctx(at(10))), '', 'mit App keine Info');
  assert.equal(companionInfo(pet('none', 'bunny'), {}, ctx(at(14, 5))), '⏰ 14:05');
  assert.match(companionInfo(pet('none', 'fox', { endTime: '17:00' }), {}, ctx(at(15, 30))), /1:30 bis Feierabend/);
  assert.equal(companionInfo(pet('nook', 'owl'), {}, ctx(at(10), { cards: [{}, {}] })), '🗂️ 2 Karteikarten');
  assert.equal(companionInfo(pet('none', 'ghost'), { pets: 2 }, ctx(at(10))), '👻 Mut: 17 %');
  assert.match(moonOf(new Date(Date.UTC(2026, 10, 24))), /Vollmond/);
});

test('Nook-Karten: Snappy, LevelDB-Log und Karten aus den Fächern', () => {
  // Snappy: Literal "abcd" + Kopie (Laenge 4, Abstand 4) = "abcdabcd"
  assert.equal(snappyDecompress(Buffer.from([8, 0x0c, 0x61, 0x62, 0x63, 0x64, 0x01, 0x04])).toString(), 'abcdabcd');
  const subjects = [
    { name: 'LF 9', groups: [{ name: 'OSI', cards: [{ front: 'Wie viele OSI-Schichten?', back: 'Sieben' }, { front: 'leer', back: '' }] }] },
    { name: 'Alt', archived: true, groups: [{ cards: [{ front: 'x', back: 'y' }] }] },
  ];
  assert.deepEqual(cardsFromSubjects(subjects), [{ q: 'Wie viele OSI-Schichten?', a: 'Sieben', subject: 'LF 9' }]);

  // kleine LevelDB-Logdatei bauen: zwei Batches, der neuere gewinnt
  const key = Buffer.from('_app://nook\u0000\u0001subjects', 'latin1');
  const val = (s) => Buffer.concat([Buffer.from([0]), Buffer.from(s, 'utf16le')]); // 0 = UTF-16LE
  const vint = (n) => { const b = []; while (n >= 0x80) { b.push((n & 0x7f) | 0x80); n >>>= 7; } b.push(n); return Buffer.from(b); };
  const batch = (seq, v) => { const h = Buffer.alloc(12); h.writeBigUInt64LE(BigInt(seq), 0); h.writeUInt32LE(1, 8); return Buffer.concat([h, Buffer.from([1]), vint(key.length), key, vint(v.length), v]); };
  const record = (data) => { const h = Buffer.alloc(7); h.writeUInt16LE(data.length, 4); h[6] = 1; return Buffer.concat([h, data]); };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-nook-'));
  const db = path.join(dir, 'Local Storage', 'leveldb');
  fs.mkdirSync(db, { recursive: true });
  fs.writeFileSync(path.join(db, '000003.log'), Buffer.concat([record(batch(5, val('[]'))), record(batch(9, val(JSON.stringify(subjects))))]));
  assert.equal(decodeLocalStorage(readValue(db, '_app://nook\u0000\u0001subjects')), JSON.stringify(subjects));
  assert.equal(loadNookCards(dir).length, 1);
  assert.deepEqual(loadNookCards(path.join(dir, 'gibtsnicht')), []);
});
