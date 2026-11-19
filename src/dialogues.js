// Szenen zwischen Pets, die nebeneinander stehen: Gespraeche und kleine Aktionen, zu zweit oder in der Gruppe.
//
// Eine Szene besteht aus Zeilen [Wer, Text, Stimmung?]:
//   Wer      0, 1, 2 … (Rolle) oder 'all' (alle gleichzeitig)
//   Text     Sprechblase; {0} {1} {2} … werden durch Namen ersetzt; null = nur die Aktion, keine Blase
//   Stimmung talk (Standard) | happy (huepfen) | greet (winken) | sleep | alert | sad
// need: Bedingungen je Rolle, z. B. [{ kind: 'nexus' }, { species: 'beau' }]; Rollen ohne Bedingung nimmt jedes Pet.
// Zweier-Szenen haben zwei Rollen, Gruppen-Szenen so viele, wie sie Rollen brauchen (3, 4 …).

const PAIR = [
  // ---------- allgemein ----------
  { lines: [[0, 'Hey {1}! 👋'], [1, 'Hey {0}! Na, alles gut?'], [0, 'Jap. Ich pass hier auf.'], [1, 'Ich auch. Team! ✨']] },
  { lines: [[0, 'Weißt du, was ich mag?'], [1, 'Was denn?'], [0, 'Wenn hier Ruhe ist.'], [1, '…'], [0, '…'], [1, 'Schön. 😌']] },
  { lines: [[0, 'Psst, {1}…'], [1, 'Ja?'], [0, 'Wir sind die besten Pets auf diesem Bildschirm.'], [1, 'Wir sind die EINZIGEN Pets auf diesem Bildschirm.'], [0, 'Eben! 😎']] },
  { lines: [[0, 'Hast du Hunger?'], [1, 'Ich esse nur Pixel.'], [0, 'Ich auch! 🍪'], [1, 'Lecker, so ein knuspriges Icon.']] },
  { lines: [[0, 'Wie spät ist es eigentlich?'], [1, 'Unten rechts steht die Uhr.'], [0, 'Da komm ich nicht hin, zu weit. 😩']] },
  { lines: [[0, 'Wollen wir ein Rennen machen?'], [1, 'Bis zum Papierkorb?'], [0, 'Lieber nicht, da kommt man nicht zurück. 😬']] },
  { lines: [[0, 'Ich glaub, unser Mensch arbeitet gerade richtig gut.'], [1, 'Find ich auch.'], [0, 'Sollen wir es sagen?'], ['all', 'DU SCHAFFST DAS! 💪', 'happy']] },
  { lines: [[0, 'Ich hab heute schon 3 Mal geblinzelt.'], [1, 'Angeber.'], [0, '4 Mal! 😉']] },

  // ---------- Aktionen zu zweit ----------
  { lines: [[0, 'High five? ✋'], [1, '✋'], ['all', '🙌', 'happy']] },
  { lines: [[0, '*gähn* 🥱'], [1, 'Steckt an… *gääähn*'], [0, 'Kurzes Nickerchen?'], ['all', null, 'sleep'], [1, 'Okay, genug. Weiter geht’s! ☀️', 'happy']] },
  { lines: [[0, 'Musik an! 🎵'], ['all', '🎶', 'happy'], [1, 'Nochmal!'], ['all', '🎶🎶', 'happy']] },
  { lines: [[0, 'Ich hab Kekse dabei 🍪'], [1, 'Für mich?!', 'alert'], [0, 'Klar, einer für dich. 🍪'], [1, 'Mmmh 😋', 'happy']] },
  { lines: [[0, 'Buh!', 'alert'], [1, 'Aaah! 😱', 'alert'], [0, 'Hihi.', 'happy'], [1, 'Sehr witzig…', 'sad']] },
  { lines: [[0, 'Du bist toll, {1}. 💛'], [1, '😳💖', 'happy'], [1, 'Du aber auch!'], ['all', null, 'happy']] },
  { lines: [[0, 'Lass uns Verstecken spielen!'], [1, 'Ich zähl bis drei… 1… 2…'], [0, null, 'sleep'], [1, '…3! Gefunden! Du stehst direkt neben mir. 😄', 'happy']] },
  { lines: [[0, 'Was guckst du so?'], [1, 'Da war ein Mauszeiger!', 'alert'], [0, 'WO?!', 'alert'], [1, 'Weg. 😔', 'sad']] },
  { lines: [[0, 'Ich übe Kunststücke.'], [1, 'Zeig mal!'], [0, 'Tadaa! ✨', 'happy'], [1, 'Wow! 👏', 'happy']] },
  { lines: [[0, 'Kalt hier heute, oder?'], [1, 'Komm, wir kuscheln. 🤗'], ['all', '💞', 'happy']] },

  // ---------- passend zu den verbundenen Apps ----------
  { need: [{ kind: 'nexus' }, { kind: 'dan' }], lines: [[0, 'Claude hat gerade was Großes fertig gemacht!'], [1, 'Oh! Ab in den Wochenbericht damit 📝'], [0, '„Mit KI programmiert“ zählt doch, oder?'], [1, 'Klar, wenn man versteht, was man gebaut hat. 😉']] },
  { need: [{ kind: 'nexus' }, { kind: 'nook' }], lines: [[0, 'In 3C rattert es die ganze Zeit.'], [1, 'Dann ist jetzt die perfekte Zeit für einen Schluck Wasser 💧'], [0, 'Während Claude arbeitet, darf der Mensch Pause machen?'], [1, 'Genau so! 🌱', 'happy']] },
  { need: [{ kind: 'nexus' }, {}], lines: [[0, 'Ich bin mit NEXUS verbunden.'], [1, 'Was machst du da so?'], [0, 'Ich sag Bescheid, wenn Claude fertig ist.'], [1, 'Wie ein kleiner Wecker! ⏰']] },
  { need: [{ kind: 'nexus' }, { kind: 'nexus' }], lines: [[0, 'Dein Projekt oder meins zuerst?'], [1, 'Wer zuerst fertig ist, darf jubeln!'], [0, 'Deal. 🤝'], ['all', null, 'happy']] },
  { need: [{ kind: 'dan' }, { kind: 'nook' }], lines: [[0, 'Ich erinnere ans Aufschreiben.'], [1, 'Und ich ans Durchatmen.'], [0, 'Zusammen: ein entspannter Wochenbericht! ✨'], ['all', '🤝', 'happy']] },
  { need: [{ kind: 'dan' }, {}], lines: [[0, 'Weißt du, was im Ausbildungsnachweis fehlt?'], [1, 'Was?'], [0, '„Mit einem Pet geredet“ – 0,1 Stunden.'], [1, 'Haha, zählt als Teamarbeit! 😄', 'happy']] },
  { need: [{ kind: 'dan' }, { kind: 'dan' }], lines: [[0, 'Hast du schon erinnert?'], [1, 'Vor einer Stunde.'], [0, 'Dann bin ich jetzt dran! 📝']] },
  { need: [{ kind: 'nook' }, {}], lines: [[0, 'Ich hab einen Spruch für dich.'], [1, 'Oh, her damit!'], [0, '„Du bist genau richtig, so wie du bist.“'], [1, 'Hach. 🥹 Danke.', 'happy']] },
  { need: [{ kind: 'nook' }, { kind: 'nook' }], lines: [[0, 'Du bist ein tolles Pet.'], [1, 'Nein, DU bist ein tolles Pet!'], [0, 'Wir sind beide toll. 💛'], ['all', null, 'happy']] },

  // ---------- mit Beau ----------
  { need: [{}, { species: 'beau' }], lines: [[0, 'Beau, darf ich mal deinen Hut aufsetzen?'], [1, 'Nein. Niemals. 🎩', 'alert'], [0, 'Nur ganz kurz?'], [1, 'Der Hut bleibt, wo er ist.']] },
  { need: [{}, { species: 'beau' }], lines: [[0, 'Kannst du eigentlich zaubern, Beau?'], [1, 'Natürlich. Pass auf…'], [1, '✨ Mrrp! ✨', 'happy'], [0, 'Es ist nichts passiert.'], [1, 'Doch. Du lächelst. 😼']] },
  { need: [{ species: 'beau' }, {}], lines: [[0, '*schnurr*'], [1, 'Was machst du da?'], [0, 'Ich schnurre für deine Konzentration.'], [1, 'Oh, danke! 😌', 'happy']] },
];

const GROUP = [
  // ---------- zu dritt ----------
  { lines: [[0, 'Gruppenfoto! 📸'], [1, 'Moment, mein Fell!', 'alert'], [2, 'Alle lächeln!'], ['all', '📸✨', 'happy']] },
  { lines: [[0, 'Was machen wir heute?'], [1, 'Pause!'], [2, 'Arbeiten …'], [0, 'Erst arbeiten, dann Pause.'], ['all', 'Deal! 🤝', 'happy']] },
  { lines: [[0, 'La …'], [1, 'La la …'], [2, 'La la laaa! 🎵'], ['all', '🎶', 'happy']] },
  { lines: [[0, 'La Ola! 🌊', 'happy'], [1, null, 'happy'], [2, null, 'happy'], ['all', '🎉', 'happy']] },
  { lines: [[0, 'Kennt ihr den mit dem Mauszeiger?'], [1, 'Nein?'], [2, 'Der klickt sich überall rein. 🖱️'], ['all', '😂', 'happy']] },
  { lines: [[0, 'Psst, unser Mensch guckt.'], [1, 'Schnell, alle unauffällig!'], ['all', null, 'sleep'], [2, '… ist er weg?'], [0, 'Ja. 😅', 'happy']] },
  { lines: [[0, 'Wer hat meinen Keks gegessen? 🍪'], [1, 'Ich nicht!', 'alert'], [2, '…', 'sad'], [2, 'Okay, ich. Sorry. 🥺'], [0, 'Schon gut. Teilen ist schöner. 💛', 'happy']] },
  { lines: [[0, 'Ich bin müde.'], [1, 'Ich auch.'], [2, 'Ich auch.'], ['all', '💤', 'sleep'], [0, 'Okay, wieder wach! ☀️', 'happy']] },
  { lines: [[0, 'Wir sollten eine Band gründen.'], [1, 'Ich spiel Trommel! 🥁'], [2, 'Ich sing! 🎤'], [0, 'Und ich … klatsche. 👏'], ['all', '🎶', 'happy']] },
  { lines: [[0, 'Abstimmung: Pause jetzt?'], [1, 'Ja! ✋'], [2, 'Ja! ✋'], [0, 'Einstimmig. 🎉', 'happy']] },

  // ---------- passend zu den Apps ----------
  { need: [{ kind: 'nexus' }, { kind: 'dan' }, { kind: 'nook' }], lines: [[0, 'Claude ist fertig! ✅'], [1, 'Ich schreib’s in den Bericht! 📝'], [2, 'Und dann gibt’s eine Pause. 🌱'], ['all', 'Team! ✨', 'happy']] },
  { need: [{ species: 'beau' }, {}, {}], lines: [[0, 'Ich habe ein Treffen einberufen. 🎩'], [1, 'Worum geht’s?'], [0, 'Um … Leckerlis.'], [2, 'Bestes Treffen ever!', 'happy'], ['all', '🐟✨', 'happy']] },

  // ---------- zu viert und mehr ----------
  { lines: [[0, 'Wir sind ja richtig viele!'], [1, 'Party? 🎉'], [2, 'Party!'], [3, 'PARTY!', 'happy'], ['all', '🥳', 'happy']] },
  { lines: [[0, 'Alle mal herhören!'], [1, '?'], [2, '?'], [3, '?'], [0, 'Ihr seid die Besten. 💛'], ['all', '💛', 'happy']] },
  { lines: [[0, 'La …'], [1, 'La …'], [2, 'La …'], [3, 'Laaaa! 🎵'], ['all', '🎶🎶', 'happy']] },
  { lines: [[0, 'Welle! 🌊', 'happy'], [1, null, 'happy'], [2, null, 'happy'], [3, null, 'happy'], ['all', '🎉', 'happy']] },
];

const rolesOf = (s) => s.lines.reduce((n, [w]) => (typeof w === 'number' ? Math.max(n, w + 1) : n), 0);
const fits = (pet, need) => !need || ((!need.kind || pet.kind === need.kind) && (!need.species || pet.species === need.species));
const fill = (text, names) => text && text.replace(/\{(\d)\}/g, (_, i) => names[i] || '');

// Rollen besetzen: erst die mit Bedingung, dann die freien (in zufaelliger Reihenfolge). null = passt nicht.
function cast(scene, pets, rand) {
  const roles = rolesOf(scene);
  if (pets.length < roles) return null;
  const need = scene.need || [];
  const free = [...pets].sort(() => rand() - 0.5);
  const cast = new Array(roles).fill(null);
  for (let r = 0; r < roles; r++) {
    if (!need[r] || !(need[r].kind || need[r].species)) continue;
    const i = free.findIndex((p) => fits(p, need[r]));
    if (i < 0) return null;
    cast[r] = free.splice(i, 1)[0];
  }
  for (let r = 0; r < roles; r++) if (!cast[r]) cast[r] = free.shift();
  return cast;
}

// pets: alle Pets einer Gruppe ({ id, kind, species, name }), links nach rechts.
// Gibt { key, ids, lines: [{ ids, text, mood }] } zurueck: ids = alle Beteiligten.
function pickScene(pets, rand = Math.random, recent = []) {
  const group = pets.length >= 3 && rand() < 0.7;
  let list = (group ? GROUP.map((s, i) => ({ s, key: 'g' + i })) : PAIR.map((s, i) => ({ s, key: 'p' + i })));
  // Zu zweit in einer grossen Gruppe: zwei Nachbarn nehmen
  let who = pets;
  if (!group && pets.length > 2) { const i = Math.floor(rand() * (pets.length - 1)); who = [pets[i], pets[i + 1]]; }
  let options = list.map((o) => ({ ...o, cast: cast(o.s, who, rand) })).filter((o) => o.cast);
  const fresh = options.filter((o) => !recent.includes(o.key));
  if (fresh.length) options = fresh;
  const special = options.filter((o) => o.s.need);
  if (special.length && rand() < 0.45) options = special;
  const { s, key, cast: c } = options[Math.floor(rand() * options.length)];
  const names = c.map((p) => p.name);
  return {
    key,
    ids: c.map((p) => p.id),
    lines: s.lines.map(([w, text, mood]) => ({ ids: w === 'all' ? c.map((p) => p.id) : [c[w].id], text: fill(text, names), mood: mood || 'talk' })),
  };
}

module.exports = { PAIR, GROUP, pickScene, rolesOf };
