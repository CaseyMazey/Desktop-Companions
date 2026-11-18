// Kleine Gespraeche zwischen zwei Pets, die nebeneinander stehen.
// with: die Apps der beiden Pets (Reihenfolge egal); ohne "with" passt das Gespraech zu jedem Paar.
// Zeilen: [Sprecher 0|1, Text]. {0} und {1} werden durch die Namen ersetzt.
const DIALOGUES = [
  // allgemein
  { lines: [[0, 'Hey {1}! 👋'], [1, 'Hey {0}! Na, alles gut?'], [0, 'Jap. Ich pass hier auf.'], [1, 'Ich auch. Team! ✨']] },
  { lines: [[0, 'Weißt du, was ich mag?'], [1, 'Was denn?'], [0, 'Wenn hier Ruhe ist.'], [1, '…'], [0, '…'], [1, 'Schön. 😌']] },
  { lines: [[0, 'Psst, {1}…'], [1, 'Ja?'], [0, 'Wir sind die besten Pets auf diesem Bildschirm.'], [1, 'Wir sind die EINZIGEN Pets auf diesem Bildschirm.'], [0, 'Eben! 😎']] },
  { lines: [[0, 'Hast du Hunger?'], [1, 'Ich esse nur Pixel.'], [0, 'Ich auch! 🍪'], [1, 'Lecker, so ein knuspriges Icon.']] },
  { lines: [[0, '*gähn* 🥱'], [1, 'Steckt an… *gääähn*'], [0, 'Kurzes Nickerchen?'], [1, 'Nur wenn unser Mensch auch Pause macht.']] },
  { lines: [[0, 'Wie spät ist es eigentlich?'], [1, 'Unten rechts steht die Uhr.'], [0, 'Da komm ich nicht hin, zu weit. 😩']] },
  { lines: [[0, 'Wollen wir ein Rennen machen?'], [1, 'Bis zum Papierkorb?'], [0, 'Lieber nicht, da kommt man nicht zurück. 😬']] },
  { lines: [[0, 'Ich glaub, unser Mensch arbeitet gerade richtig gut.'], [1, 'Find ich auch.'], [0, 'Sollen wir es sagen?'], [1, 'Gemeinsam: DU SCHAFFST DAS! 💪']] },
  { lines: [[0, 'Ich hab heute schon 3 Mal geblinzelt.'], [1, 'Angeber.'], [0, '4 Mal! 😉']] },

  // NEXUS
  { with: ['nexus', 'dan'], lines: [[0, 'Claude hat gerade was Großes fertig gemacht!'], [1, 'Oh! Ab in den Wochenbericht damit 📝'], [0, '„Mit KI programmiert“ zählt doch, oder?'], [1, 'Klar, wenn man versteht, was man gebaut hat. 😉']] },
  { with: ['nexus', 'nook'], lines: [[0, 'In 3C rattert es die ganze Zeit.'], [1, 'Dann ist jetzt die perfekte Zeit für einen Schluck Wasser 💧'], [0, 'Während Claude arbeitet, darf der Mensch Pause machen?'], [1, 'Genau so! 🌱']] },
  { with: ['nexus'], lines: [[0, 'Ich bin mit NEXUS verbunden.'], [1, 'Was machst du da so?'], [0, 'Ich sag Bescheid, wenn Claude fertig ist.'], [1, 'Wie ein kleiner Wecker! ⏰']] },
  { with: ['nexus', 'nexus'], lines: [[0, 'Dein Projekt oder meins zuerst?'], [1, 'Wer zuerst fertig ist, darf jubeln!'], [0, 'Deal. 🤝']] },

  // DAN
  { with: ['dan', 'nook'], lines: [[0, 'Ich erinnere ans Aufschreiben.'], [1, 'Und ich ans Durchatmen.'], [0, 'Zusammen: ein entspannter Wochenbericht! ✨'], [1, 'Perfekte Arbeitsteilung.']] },
  { with: ['dan'], lines: [[0, 'Weißt du, was im Ausbildungsnachweis fehlt?'], [1, 'Was?'], [0, '„Mit einem Pet geredet“ – 0,1 Stunden.'], [1, 'Haha, zählt als Teamarbeit! 😄']] },
  { with: ['dan', 'dan'], lines: [[0, 'Hast du schon erinnert?'], [1, 'Vor einer Stunde.'], [0, 'Dann bin ich jetzt dran! 📝']] },

  // Nook
  { with: ['nook'], lines: [[0, 'Ich hab einen Spruch für dich.'], [1, 'Oh, her damit!'], [0, '„Du bist genau richtig, so wie du bist.“'], [1, 'Hach. 🥹 Danke.']] },
  { with: ['nook', 'nook'], lines: [[0, 'Du bist ein tolles Pet.'], [1, 'Nein, DU bist ein tolles Pet!'], [0, 'Wir sind beide toll. 💛'], [1, 'Einverstanden.']] },
];

const fill = (text, names) => text.replace(/\{([01])\}/g, (_, i) => names[i]);

// a, b: { id, kind, name } – a steht links. Gibt { order: [idLinks0, id1], lines: [{ id, text }] } zurueck.
function pickDialogue(a, b, rand = Math.random, recent = []) {
  const kinds = [a.kind, b.kind];
  const fits = (d) => {
    if (!d.with) return true;
    if (d.with.length === 1) return kinds.includes(d.with[0]);
    const [x, y] = d.with;
    return (kinds[0] === x && kinds[1] === y) || (kinds[0] === y && kinds[1] === x);
  };
  let pool = DIALOGUES.map((d, i) => ({ d, i })).filter(({ d }) => fits(d));
  // passende Gespraeche zu den Apps bevorzugen, kuerzlich gefuehrte meiden
  const fresh = pool.filter(({ i }) => !recent.includes(i));
  if (fresh.length) pool = fresh;
  const special = pool.filter(({ d }) => d.with);
  if (special.length && rand() < 0.5) pool = special;
  const { d, i } = pool[Math.floor(rand() * pool.length)];
  // bei Gespraechen fuer zwei bestimmte Apps: Sprecher 0 ist das Pet der ersten App
  let first = a, second = b;
  if (d.with && d.with.length === 2 && a.kind !== d.with[0]) [first, second] = [b, a];
  if (d.with && d.with.length === 1 && a.kind !== d.with[0]) [first, second] = [b, a];
  const pets = [first, second];
  const names = [first.name, second.name];
  return { index: i, lines: d.lines.map(([who, text]) => ({ id: pets[who].id, text: fill(text, names) })) };
}

module.exports = { DIALOGUES, pickDialogue };
