const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TALENTS, normalizeTalent, talentDue, JOKES, shortEvent } = require('../src/talents');
const { SPECIES } = require('../src/presets');
const { createChosenPet } = require('../src/logic');
const { installHook, hasHook, eventFromHook, hookCommand } = require('../src/claudehook');
const { PETTED } = require('../src/dialogues');

// Mittwoch, 19.11.2026 um hh:mm
const at = (h, m = 0, day = 19) => new Date(2026, 10, day, h, m);
const pet = (species, talent = {}) => ({ ...createChosenPet('none', species), talent: normalizeTalent(species, talent) });
const ctx = (now, extra = {}) => ({ now, activeMin: 0, away: false, backFromBreak: 0, missed: [], done: 0, battery: null, weather: {}, ...extra });

test('Talente: jedes Tier hat eines, mit Charakter und Beschreibung', () => {
  for (const sp of Object.keys(SPECIES)) {
    const t = TALENTS[sp];
    assert.ok(t && t.title && t.character && t.desc, `${sp}: Talent fehlt`);
    assert.ok((PETTED[sp] || []).length >= 3, `${sp}: Streichel-Sprüche fehlen`);
  }
  assert.equal(normalizeTalent('fox', { endTime: '25:00' }).endTime, '17:00');
  assert.equal(normalizeTalent('fox', { endTime: '16:15' }).endTime, '16:15');
  assert.equal(normalizeTalent('ghost', {}).hideMeeting, true);
  assert.equal(normalizeTalent('cat', { enabled: false }).enabled, false);
  assert.deepEqual(Object.keys(normalizeTalent('cat', { quatsch: 1 })), ['enabled']);
});

test('Katze und Panda: erst nach genug Zeit am Stück, dann mit Pause', () => {
  const cat = pet('cat'); const mem = {};
  assert.equal(talentDue(cat, mem, ctx(at(10), { activeMin: 30 })), null);
  const r = talentDue(cat, mem, ctx(at(10), { activeMin: 95 }));
  assert.equal(r.action, 'stretch');
  assert.equal(talentDue(cat, mem, ctx(at(10, 30), { activeMin: 125 })), null, 'nicht gleich nochmal');
  const panda = pet('panda'); const pm = {};
  assert.equal(talentDue(panda, pm, ctx(at(10), { activeMin: 21 })).action, 'cover');
  assert.equal(talentDue(panda, pm, ctx(at(10), { activeMin: 21, away: true })), null, 'niemand da: nichts sagen');
});

test('Fuchs: 30 Minuten vorher und pünktlich, nur werktags', () => {
  const fox = pet('fox', { endTime: '17:00' }); const mem = {};
  assert.match(talentDue(fox, mem, ctx(at(16, 32))).text, /30 Minuten/);
  assert.equal(talentDue(fox, mem, ctx(at(16, 35))), null);
  const end = talentDue(fox, mem, ctx(at(17, 2)));
  assert.equal(end.action, 'sleep');
  assert.equal(talentDue(pet('fox'), {}, ctx(at(16, 32, 22))), null, 'Sonntag');
});

test('Bote, Lob, Garten, Akku, Wetter', () => {
  const bird = pet('bird');
  const missed = [{ short: shortEvent({ type: 'task-done', project: 'Pets' }, 'Claude Code') }];
  assert.match(talentDue(bird, {}, ctx(at(11), { backFromBreak: 12, missed })).text, /Claude Code fertig \(Pets\)/);
  assert.equal(talentDue(bird, {}, ctx(at(11), { missed })), null, 'nur direkt nach der Rückkehr');

  const axo = pet('axolotl', { summary: '17:30' }); const am = {};
  assert.ok(talentDue(axo, am, ctx(at(14), { done: 1 })));
  talentDue(axo, am, ctx(at(14, 1), { done: 2 }));
  assert.match(talentDue(axo, am, ctx(at(17, 35))).text, /3 Sachen/);

  const mush = pet('mushroom'); const mm = {};
  assert.deepEqual(talentDue(mush, mm, ctx(at(12), { backFromBreak: 8 })).action, { garden: 1 });
  assert.equal(talentDue(mush, mm, ctx(at(12), { backFromBreak: 2 })), null, 'zu kurze Pause');

  const dragon = pet('dragon'); const dm = {};
  assert.match(talentDue(dragon, dm, ctx(at(12), { battery: { level: 0.18, charging: false } })).text, /18 %|Ladekabel/);
  assert.equal(talentDue(dragon, dm, ctx(at(12, 5), { battery: { level: 0.17, charging: false } })), null, 'nicht dauernd');

  // Quak: Witz des Tages – einmal vormittags, einmal nachmittags, nie zweimal derselbe hintereinander
  const frog = pet('frog'); const fm = {};
  assert.equal(talentDue(frog, fm, ctx(at(8), { activeMin: 20 })), null, 'vor 9 Uhr kein Witz');
  const j1 = talentDue(frog, fm, ctx(at(10), { activeMin: 20 }), () => 0);
  assert.ok(JOKES.includes(j1.text));
  assert.equal(talentDue(frog, fm, ctx(at(11), { activeMin: 20 }), () => 0), null, 'vormittags nur einmal');
  const j2 = talentDue(frog, fm, ctx(at(15), { activeMin: 20 }), () => 0);
  assert.ok(j2 && j2.text !== j1.text, 'nachmittags ein anderer Witz');
  assert.ok(!('place' in normalizeTalent('frog', { place: 'Berlin' })), 'Quak braucht keinen Ort mehr');
  assert.ok(JOKES.length >= 15);
  // Mauz: konkrete Streckuebung
  assert.match(talentDue(pet('cat'), {}, ctx(at(10), { activeMin: 80 }), () => 0).text, /Arme über den Kopf/);
});

test('Claude-Code-Hook: eintragen, ohne Fremdes zu verlieren, und Meldungen lesen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-hook-'));
  const file = path.join(dir, 'settings.json');
  const old = `curl -s -X POST http://127.0.0.1:47811/event -d '{"app":"claude-code","type":"task-done"}'`;
  fs.writeFileSync(file, JSON.stringify({ model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo eigenes' }, { type: 'command', command: old }] }] } }));
  assert.equal(hasHook(file, 47811), false);
  installHook(file, 47811);
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(s.model, 'opus');
  const stop = s.hooks.Stop.flatMap((m) => m.hooks.map((h) => h.command));
  assert.deepEqual(stop, ['echo eigenes', hookCommand(47811)]); // alter eigener Hook ersetzt, fremder bleibt
  assert.equal(hasHook(file, 47811), true);
  installHook(file, 47811); // zweimal: nichts doppelt
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).hooks.Notification.length, 1);
  assert.ok(fs.existsSync(`${file}.bak`));
  fs.writeFileSync(file, '{ kaputt');
  assert.throws(() => installHook(file, 47811)); // kaputtes JSON nie ueberschreiben
  assert.equal(fs.readFileSync(file, 'utf8'), '{ kaputt');

  assert.deepEqual(eventFromHook({ hook_event_name: 'Stop', cwd: 'C:\\Users\\x\\Projekt\\Pets' }), { app: 'claude-code', type: 'task-done', project: 'Pets' });
  assert.equal(eventFromHook({ hook_event_name: 'Notification', cwd: '/a/b', message: 'Claude needs your permission to use Bash' }).tool, 'Bash');
  assert.equal(eventFromHook({ hook_event_name: 'Notification', message: 'Claude is waiting for your input' }), null);
});
