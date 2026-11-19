const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { companionDue, companionInfo, COMPANION, FACTS, SCARED, TALENTS, normalizeTalent, moonOf, lockLine, lottiPraise, weatherLook } = require('../src/talents');
const { SPECIES } = require('../src/presets');
const { createChosenPet } = require('../src/logic');
const { snappyDecompress, cardsFromSubjects, readValue, decodeLocalStorage, loadNookCards } = require('../src/nookcards');

const at = (h, m = 0, day = 19) => new Date(2026, 10, day, h, m);
const pet = (kind, species, talent = {}) => ({ ...createChosenPet(kind, species), talent: normalizeTalent(species, talent) });
// Pet laeuft schon eine Weile (sonst kommt der erste Spruch absichtlich zu einer zufaelligen Zeit)
const fresh = () => ({ compAt: 1 });
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
  assert.equal(companionDue(pet('nook', 'dragon'), fresh(), ctx(at(10))), null, 'mit App: normal');
  const dragon = pet('none', 'dragon'); const mem = fresh();
  const r = companionDue(dragon, mem, ctx(at(10)), () => 0.9);
  assert.ok(r && r.text, 'ohne App: Energie-Spruch');
  assert.equal(companionDue(dragon, mem, ctx(at(10, 10)), () => 0.9), null, 'nicht gleich wieder');
  assert.ok(companionDue(dragon, mem, ctx(at(10, 40)), () => 0.9));
  assert.equal(companionDue(pet('none', 'dragon'), fresh(), ctx(at(23))), null, 'nachts still');
  assert.equal(companionDue(pet('none', 'dragon'), fresh(), ctx(at(10), { away: true })), null, 'niemand da');
  assert.equal(companionDue(pet('none', 'ghost'), fresh(), ctx(at(10)), () => 0.1).action, 'scare');
  assert.equal(companionDue(pet('none', 'cat'), fresh(), ctx(at(10)), () => 0.1).action, 'territory');
  assert.equal(companionDue(pet('none', 'cat'), fresh(), ctx(at(10)), () => 0.3).action, 'gift');
  assert.equal(companionDue(pet('none', 'cat'), fresh(), ctx(at(10)), () => 0.5).action, 'nap');
  assert.equal(companionDue(pet('none', 'penguin'), fresh(), ctx(at(10)), () => 0.2).action, 'slide');
  assert.equal(companionDue(pet('none', 'robot'), fresh(), ctx(at(10)), () => 0.2).action, 'sysreport');
  assert.equal(companionDue(pet('none', 'beau'), fresh(), ctx(at(10)), () => 0.2).action, 'trick');
  assert.doesNotMatch(companionDue(pet('none', 'bunny'), fresh(), ctx(at(14, 5)), () => 0.99).text || '', /\{time\}/);
});

test('Nicht alle auf einmal: der erste Begleiter-Spruch kommt zu einer zufaelligen Zeit', () => {
  // frisch gestartet: nicht sofort (zufaelliger Start bis ~35 Minuten), aber irgendwann schon
  assert.equal(companionDue(pet('none', 'dragon'), {}, ctx(at(10)), () => 0.99), null);
  const m = {};
  companionDue(pet('none', 'dragon'), m, ctx(at(10)), () => 0.99);
  assert.ok(companionDue(pet('none', 'dragon'), m, ctx(at(10, 30)), () => 0.99), '15 Minuten nach dem Start ist er dran');
});

test('Huhu: mit Nook Karteikarten, sonst Fakten', () => {
  const cards = [{ q: 'Auf welcher Schicht liegt MQTT?', a: 'Anwendungsschicht', subject: 'LF 9' }];
  const quiz = companionDue(pet('nook', 'owl'), fresh(), ctx(at(10), { cards }));
  assert.match(quiz.text, /MQTT/);
  assert.equal(quiz.quiz.a, 'Anwendungsschicht');
  const fact = companionDue(pet('none', 'owl'), fresh(), ctx(at(10)));
  assert.ok(FACTS.includes(fact.text) && !fact.quiz);
  assert.ok(companionDue(pet('dan', 'owl'), fresh(), ctx(at(10))).text, 'auch mit anderer App ab und zu Fakten');
  assert.ok(!companionDue(pet('nook', 'owl'), fresh(), ctx(at(10))).quiz, 'Nook ohne Karten: Fakten');
});

test('Charakter-Momente mit echtem Bezug', () => {
  // Hoppel: Sperrzeit wird beim Entsperren gemeldet (lockLine), nicht mehr ueber "weg vom Rechner"
  assert.doesNotMatch((companionDue(pet('none', 'bunny'), fresh(), ctx(at(10, 20), { backFromBreak: 47 })) || {}).text || '', /47/);
  assert.match(lockLine(47, 83, 'lock', () => 0), /47 Minuten gesperrt.*Heute insgesamt: 1:23/);
  assert.match(lockLine(95, 95, 'sleep', () => 0), /1 Std\. 35 Min\. im Ruhezustand/);
  // Piep: Zeitung am Morgen, einmal
  const bm = fresh();
  assert.equal(companionDue(pet('none', 'bird'), bm, ctx(at(8))).action, 'paper');
  assert.notEqual((companionDue(pet('none', 'bird'), bm, ctx(at(8, 5))) || {}).action, 'paper');
  // Fips: Plan des Tages morgens, Nachfrage vor Feierabend (Mittwoch)
  assert.match(companionDue(pet('none', 'fox'), fresh(), ctx(at(9, 30))).text, /Plan des Tages/);
  assert.match(companionDue(pet('none', 'fox', { endTime: '17:00' }), { moments: { day: '2026-11-19', plan: true } }, ctx(at(16))).text, /geschafft/);
  // Lotti: zaehlt keine Stunden mehr, sondern Klicks – und freut sich immer mehr
  assert.doesNotMatch((companionDue(pet('none', 'axolotl'), fresh(), ctx(at(11), { activeMin: 62 }), () => 0.9) || {}).text || '', /Stunde/);
  assert.match(lottiPraise(1, () => 0), /Erste Aufgabe/);
  assert.match(lottiPraise(4, () => 0), /4 Aufgaben/);
  assert.match(lottiPraise(7, () => 0), /7 Aufgaben/);
  assert.match(lottiPraise(12, () => 0), /12 AUFGABEN.*LEGENDE/);
  // Pilzi: Wetter seines Orts – Sonne = Sonnenbrille, Regen = Freund, Wind = klein, Schnee, Kaelte
  const wx = (w) => ctx(at(9), { weather: { berlin: w } });
  assert.match(companionDue(pet('none', 'mushroom', { place: 'Berlin' }), {}, wx({ min: 12, max: 22, rain: 0, code: 0, wind: 10 })).text, /Sonnenbrille/);
  assert.match(companionDue(pet('none', 'mushroom', { place: 'Berlin' }), {}, wx({ min: 6, max: 9, rain: 90, code: 63, wind: 10 })).text, /Pilzfreund/);
  assert.doesNotMatch((companionDue(pet('none', 'mushroom'), {}, wx({ min: 6, max: 9, rain: 90, code: 63 }), () => 0.9) || {}).text || '', /Pilzfreund/, 'ohne Ort kein Wetter');
  assert.deepEqual(weatherLook({ min: 2, max: 9, rain: 10, code: 3, wind: 45 }), { sky: 'cloud', windy: true, cold: false, hot: false });
  assert.equal(weatherLook({ min: -4, max: 1, rain: 70, code: 73, wind: 5 }).sky, 'snow');
  assert.equal(weatherLook({ min: -4, max: 1, rain: 0, code: 1, wind: 5 }).cold, true);
  // Mauz: beleidigt nach Stunden ohne Streicheln
  assert.match(companionDue(pet('none', 'cat'), { lastPetAt: at(8).getTime() }, ctx(at(13), { activeMin: 150 })).text, /beleidigt/);
  // Quak hat kein Wetter mehr (das macht Pilzi): auch bei Regen kein Schirm
  assert.equal(((companionDue(pet('none', 'frog'), fresh(), ctx(at(9), { weather: { berlin: { min: 4, max: 8, rain: 90, code: 63 } } }), () => 0.9) || {}).action || {}).prop, undefined);
});

test('Info am Namensschild', () => {
  assert.equal(companionInfo(pet('none', 'dragon'), fresh(), ctx(at(10), { battery: { level: 0.78, charging: true } })), '🔋 78 % ⚡');
  assert.equal(companionInfo(pet('nook', 'dragon'), fresh(), ctx(at(10))), '', 'mit App keine Info');
  assert.equal(companionInfo(pet('none', 'bunny'), fresh(), ctx(at(14, 5))), '⏰ 14:05');
  assert.equal(companionInfo(pet('none', 'bunny'), { lockDay: '2026-11-19', lockTotal: 83 }, ctx(at(14, 5))), '⏰ 14:05 · 🔒 1:23 gesperrt');
  assert.equal(companionInfo(pet('none', 'mushroom', { place: 'Berlin' }), { garden: 2 }, ctx(at(9), { weather: { berlin: { min: 1, max: 9, rain: 0, code: 0, wind: 40 } } })), '☀️ sonnig, windig · 🌱 2');
  assert.match(companionInfo(pet('none', 'fox', { endTime: '17:00' }), fresh(), ctx(at(15, 30))), /1:30 bis Feierabend/);
  assert.equal(companionInfo(pet('nook', 'owl'), fresh(), ctx(at(10), { cards: [{}, {}] })), '🗂️ 2 Karteikarten');
  assert.equal(companionInfo(pet('none', 'ghost'), { pets: 2 }, ctx(at(10))), '👻 Mut: 17 %');
  assert.equal(companionInfo(pet('none', 'cat'), { lastPetAt: at(9, 50).getTime() }, ctx(at(10))), '😽 Laune: gnädig');
  assert.equal(companionInfo(pet('none', 'blob'), { glasses: 3 }, ctx(at(10))), '🥛 3 Gläser · Stimmung SUPER');
  assert.equal(companionInfo(pet('none', 'robot'), { focusMin: 25 }, ctx(at(10), { sys: { ram: 63, cpu: 10 } })), 'RAM 63 % · 🎯 Fokus 25 Min');
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
