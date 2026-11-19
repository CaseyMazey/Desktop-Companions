// Talente: jedes Tier hat einen eigenen Charakter und ein hilfreiches Talent (Plan vom 2026-11-19, siehe MIND).
// Reine Logik ohne Electron (getestet): Wann meldet sich welches Talent, was sagt es, wie oft am Tag.
// Leitlinie: hilfreich und niedlich, nichts zum Kuemmern, pro Pet abschaltbar, hoechstens ein paar Mal am Tag.
//
// ctx (vom Hauptprozess): { now: Date, activeMin, away, backFromBreak (Minuten, nur im Takt direkt danach),
//   missed: [Meldungen waehrend du weg warst], done: Anzahl neu erledigter Auftraege, battery: { level, charging },
//   weather: { [ort]: { temp, max, min, rain, code } } }
// Rueckgabe: null oder { text, mood, ms, action } – action z. B. 'sleep', 'cover', 'stretch', { garden: n }

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const pick = (list, rnd = Math.random) => list[Math.floor(rnd() * list.length)];
const dayOf = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const minOfDay = (d) => d.getHours() * 60 + d.getMinutes();
const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const workday = (d) => d.getDay() !== 0 && d.getDay() !== 6;
const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
// ISO-Woche (fuer "einmal pro Woche")
const weekOf = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-${Math.ceil(((t - y) / 86400000 + 1) / 7)}`; };

// ---------- Beschreibung fuer die Einstellungen (Titel, Text, Optionen) ----------
const TALENTS = {
  ghost: {
    title: 'Diskret', character: 'schüchtern, sanft, entschuldigt sich ständig',
    desc: 'Wird durchsichtig, wenn die Maus kommt. Im Meeting (Mikrofon oder Kamera an) oder bei Vollbild versteckt Buh alle Pets – und holt sie danach zurück.',
    options: [
      { key: 'hideMeeting', type: 'bool', label: 'Im Meeting alle Pets verstecken (Mikrofon oder Kamera an)', def: true },
      { key: 'hideFullscreen', type: 'bool', label: 'Bei Vollbild alle Pets verstecken (Präsentation, Video, Spiel)', def: true },
    ],
  },
  cat: { title: 'Streck-Pause', character: 'Diva, unbeeindruckt, heimlich fürsorglich', desc: 'Etwa alle 75 Minuten am Stück gibt Mauz dir eine konkrete Streckübung (Nacken, Schultern, Handgelenke, Rücken …), macht sie vor – und besteht darauf, dass du mitmachst.', options: [] },
  blob: { title: 'Trink-Erinnerung', character: 'überschwänglicher Optimist, alles ist toll', desc: 'Etwa alle 75 Minuten (8–21 Uhr) erinnert Blubb dich ans Trinken – jedes Mal begeistert.', options: [] },
  bird: { title: 'Bote', character: 'neugierig, Plaudertasche, kleiner Reporter', desc: 'Sammelt alle Meldungen, während du weg bist, und erzählt dir, was passiert ist, sobald du zurück bist.', options: [] },
  beau: { title: 'Tageszauber', character: 'mystisch, würdevoll, etwas theatralisch, herzlich', desc: 'Einmal am Tag zieht Beau eine Karte aus dem Hut: ein kleiner Zauberspruch für deinen Tag.', options: [] },
  fox: {
    title: 'Feierabend-Fuchs', character: 'schlau, verschmitzt, Planer und Schlitzohr',
    desc: 'Sagt werktags 30 Minuten vor Feierabend, was sich noch lohnt, und wünscht dir dann einen schönen Abend – und rollt sich ein.',
    options: [{ key: 'endTime', type: 'time', label: 'Feierabend um', def: '17:00' }],
  },
  owl: { title: 'Lernbegleiterin', character: 'weise, ruhig, Professorin, etwas altmodisch', desc: 'Schlägt nach etwa 50 Minuten eine Lernpause vor, fragt abends, was du gelernt hast, und bekommt nachts große Augen.', options: [] },
  frog: {
    title: 'Witz des Tages', character: 'energiegeladen, gut gelaunt, laut, liebt Kalauer',
    desc: 'Erzählt dir einmal am Vormittag und einmal am Nachmittag einen Witz oder Kalauer – für gute Laune zwischendurch. Lacht am lautesten über seine eigenen Witze.',
    options: [],
  },
  penguin: { title: 'Atem-Pause', character: 'tiefenentspannt, cool, durch nichts aus der Ruhe zu bringen', desc: 'Rechtsklick → „Atem-Pause“: eine Minute zusammen atmen, Watschel atmet sichtbar mit. Schlägt das ab und zu auch selbst vor.', options: [] },
  bunny: {
    title: 'Zeitwächter', character: 'nervös, immer in Eile, besessen von Pünktlichkeit',
    desc: 'Zählt mit, wie lange der PC gesperrt war oder schlief (z. B. wenn du den Arbeitsplatz verlässt), und sagt es dir beim Entsperren. Rechtsklick → „Erinnere mich in …“: ein schneller Timer. Auf Wunsch sagt Hoppel zur vollen Stunde die Uhrzeit an.',
    options: [{ key: 'hourly', type: 'bool', label: 'Zur vollen Stunde die Uhrzeit ansagen (8–20 Uhr)', def: true }],
  },
  panda: { title: 'Augenpause (20-20-20)', character: 'faul, gemütlich, Genießer', desc: 'Alle 20 Minuten am Bildschirm: 20 Sekunden in die Ferne schauen. Bambus hält sich solange selbst die Augen zu.', options: [] },
  axolotl: {
    title: 'Aufgaben-Fan', character: 'dein größter Fan, unendlich positiv, Cheerleader',
    desc: 'Klick auf Lotti, wenn du eine Aufgabe erledigt hast: Sie zählt mit, sagt jedes Mal etwas Liebes und freut sich immer mehr, je mehr du schaffst. Freut sich auch über fertige Aufträge (3C, Claude) und zählt abends zusammen.',
    options: [{ key: 'summary', type: 'time', label: 'Tagesrückblick um', def: '17:30' }],
  },
  dragon: {
    title: 'Hüter', character: 'stolz, beschützend, dramatisch, innen ganz weich',
    desc: 'Warnt, wenn der Laptop-Akku schwach wird, und erinnert einmal pro Woche an die Datensicherung.',
    options: [
      { key: 'backupDay', type: 'day', label: 'Datensicherung am', def: 5 },
      { key: 'backupTime', type: 'time', label: 'um', def: '15:00' },
    ],
  },
  mushroom: {
    title: 'Wetter-Pilz', character: 'still, geduldig, naturverbunden, philosophisch',
    desc: 'Pilzi zeigt dir das Wetter, indem er sich anzieht: Sonne = Sonnenbrille, Regen = ein Pilzfreund kommt und es tropft, Wind = er macht sich klein, Schnee = weißer Hut, Kälte = Schal. Dafür einen Ort eintragen (geht an open-meteo.com). Nebenbei wächst mit jeder echten Pause etwas neben ihm.',
    options: [{ key: 'place', type: 'text', label: 'Ort fürs Wetter (z. B. Berlin) – leer lassen, wenn du das nicht willst', def: '' }],
  },
  robot: { title: 'Fokus-Timer', character: 'logisch, nimmt alles wörtlich, lernt Gefühle', desc: 'Rechtsklick → „Fokus starten“: 25 Minuten Arbeit, 5 Minuten Pause, der Countdown steht über Bip.', options: [] },
};

// Was das Tier im Begleiter-Modus (ohne App) zusaetzlich macht – steht in den Einstellungen beim Talent
const COMPANION_DESC = {
  ghost: 'Versucht ab und zu, die Pets neben sich zu erschrecken (und entschuldigt sich sofort). Info: wie mutig Buh heute ist – Streicheln macht mutig.',
  cat: 'Mehr Diva-Sprüche, schubst Dinge vom Desktop und hält ab und zu ein Nickerchen. Info: ihre Laune.',
  blob: 'Überschüttet dich mit guter Laune und hüpft vor Freude. Info: Stimmung SUPER.',
  bird: 'Bringt „Eilmeldungen“ über deinen Tag (wie lange du schon dran bist, wie viele Meldungen kamen). Info: Meldungen heute.',
  beau: 'Zaubert öfter, liest den Mond und sieht Pausen in deiner Zukunft. Info: die heutige Mondphase.',
  fox: 'Schmiedet Pläne und gibt schlaue Arbeitstipps. Info: wie lange noch bis Feierabend.',
  owl: 'Erzählt ab und zu interessante Fakten – auch mit anderen Apps, dann seltener. Mit Nook verbunden: fragt sie Karteikarten aus Nook ab und sagt 10 Sekunden später die Antwort. Info: Fakten heute bzw. Anzahl der Karten.',
  frog: 'Schnappt mit der Zunge nach deinem Mauszeiger (zählt die „Fliegen“), noch mehr Kalauer und Hüpfer. Info: Witze und Fliegen heute.',
  penguin: 'Gibt öfter ruhige Sätze zum Durchatmen. Info: Atem-Pausen heute.',
  bunny: 'Sagt nervös die Uhrzeit, sprintet herum und hat Panik vor der vollen Stunde. Info: Uhrzeit und wie lange der PC heute gesperrt war.',
  panda: 'Hält öfter ein Nickerchen und kaut Bambus. Info: Nickerchen heute.',
  axolotl: 'Lobt dich öfter, einfach so, und schwenkt Pompons. Ohne App ist ein Klick auf Lotti „Aufgabe erledigt“. Info: was du heute geschafft hast.',
  dragon: 'Gibt öfter Energie-Tipps (Schlaf, Wasser, Pausen, frische Luft). Info: dein Akkustand.',
  mushroom: 'Sagt öfter stille Naturweisheiten, erzählt morgens, wie er sich ans Wetter angepasst hat, und Pilzfreunde kommen nach langen Pausen. Info: Wetter und Garten.',
  robot: 'Erzählt Technik-Fakten und lernt Gefühle. Info: Fokus-Minuten heute.',
};
for (const [sp, d] of Object.entries(COMPANION_DESC)) if (TALENTS[sp]) TALENTS[sp].companion = d;

// Talent-Einstellungen eines Pets pruefen (unbekannte Optionen weg, fehlende mit Standard)
function normalizeTalent(species, t) {
  t = t && typeof t === 'object' ? t : {};
  const out = { enabled: typeof t.enabled === 'boolean' ? t.enabled : true };
  for (const o of (TALENTS[species] || { options: [] }).options) {
    const v = t[o.key];
    if (o.type === 'bool') out[o.key] = typeof v === 'boolean' ? v : o.def;
    else if (o.type === 'time') out[o.key] = TIME.test(v) ? v : o.def;
    else if (o.type === 'day') out[o.key] = Number.isInteger(v) && v >= 0 && v <= 6 ? v : o.def;
    else out[o.key] = typeof v === 'string' ? v.trim().slice(0, 60) : o.def;
  }
  return out;
}

// ---------- Was die Tiere sagen (jedes mit eigener Stimme) ----------
const LINES = {
  // Mauz: regelmaessig eine konkrete Streckuebung – vorgemacht, im Diva-Ton
  cat: [
    'Pff. Streckübung: Arme über den Kopf, Hände verschränken, 10 Sekunden ganz lang machen. Wie ich. 🐱',
    'Nacken: Kopf langsam nach rechts zur Schulter, 10 Sekunden. Dann links. Ich warte. *gähnt*',
    'Schultern bis zu den Ohren hochziehen … halten … fallen lassen. Dreimal. Ich schau zu. 😼',
    'Schultern kreisen: fünfmal nach hinten, fünfmal nach vorn. Elegant, bitte.',
    'Handgelenke! Arm nach vorn, Finger mit der anderen Hand sanft zurückziehen. 10 Sekunden je Seite. Deine Pfoten danken es dir.',
    'Katzenbuckel im Sitzen: Rücken rund machen, Kinn zur Brust … dann aufrichten und Brust raus. Dreimal. Das ist MEINE Übung. 🐱',
    'Aufstehen, auf die Zehenspitzen, ganz lang machen … und runter. Fünfmal. *streckt sich mit*',
    'Oberkörper im Sitzen nach rechts drehen, an der Lehne festhalten, 10 Sekunden. Dann links. Ich hab Zeit. Viel Zeit.',
  ],
  blob: ['JUHU! Wasser! Wasser ist so toll! Trink einen Schluck! 💧', 'Blubb blubb! Zeit für ein Glas Wasser! 🥤', 'Weißt du, was super ist? Wasser! Und du! Trink was! 💚', 'Schluck Wasser = glücklicher Blubb! 💧✨'],
  beau: [
    'Ich ziehe eine Karte aus dem Hut … ✨ „Heute gelingt dir etwas, das du gestern noch schwer fandest.“',
    'Die Sterne haben gesprochen … 🌙 „Eine kleine Pause bringt dir heute eine große Idee.“',
    '✨ Die Karte des Tages: „Du musst nicht alles schaffen. Das Wichtige reicht.“',
    'Mrrp. Mein Hut flüstert … 🎩 „Jemand freut sich heute über dich.“',
    '🔮 „Wer kleine Schritte geht, kommt auch an.“ – so steht es auf der Karte.',
    '✨ Heute im Zauberhut: „Mut. Nicht viel. Gerade genug.“',
    '🌟 „Was du heute anfängst, wird morgen leichter.“ Die Karte lügt nie.',
    'Ich habe in die Kristallkugel geschaut … 🔮 Da war ein Tee. Trink einen.',
  ],
  owlBreak: ['Interessant … du lernst seit fast einer Stunde. Zeit für eine kleine Pause. 🦉', 'Fürwahr, ein fleißiger Kopf! Fünf Minuten Pause – das Gehirn sortiert dann von selbst.', 'Huhu! Kurz aufstehen, kurz durchatmen. Wissen braucht Luft.'],
  owlEvening: ['Huhu … Was hast du heute gelernt? Schreib es auf, dann bleibt es. 📖', 'Ein Tag voller Wissen! Was war heute das Interessanteste?'],
  owlNight: ['Es ist spät … Schlaf ist auch Lernen. 🌙', 'Huhu … Eulen sind nachts wach. Du musst das nicht. 🌙'],
  penguin: ['Ganz ruhig. Lust auf eine Atem-Pause? Rechtsklick auf mich → Atem-Pause. 🐧', 'Chill. Eine Minute atmen wirkt Wunder. Rechtsklick → Atem-Pause.'],
  bunnyHour: ['Schon {t} Uhr?! Wo ist die Zeit hin?! 🐰', '{t} Uhr! {t} Uhr! Nur damit du’s weißt! ⏰', 'Oh nein, schon {t} Uhr! … Alles gut, ich wollte es nur sagen. 🐰'],
  panda: ['Mmmh … 20 Sekunden in die Ferne gucken. Ich halt mir solang die Augen zu. 🐼', 'Augenpause! Schau mal aus dem Fenster. Kein Stress. 🎋', '*hält sich die Augen zu* … Du guckst jetzt weit weg, ja? 20 Sekunden.'],
  axolotlWin: ['Fertig!! Du bist so toll! 🎉', 'Wieder was geschafft! Ich bin so stolz auf dich! 💗', 'YAY! Noch ein Auftrag erledigt! 🩷✨', 'Du rockst das heute! 🎉'],
  dragonLow: ['Mein Feuer wird schwach … und deins auch! Ladekabel! 🔋', 'Fürchtet euch … der Akku ist bei {p} %! Ladekabel, schnell! 🐉'],
  dragonEmpty: ['ALARM! Nur noch {p} % Akku! Ich beschütze dich – aber das Kabel musst du holen! 🔥'],
  dragonBackup: ['Ich bin der Hüter deines Schatzes! Zeit für die wöchentliche Datensicherung. 🐉💾', 'Ein Drache sichert seinen Schatz. Du deine Daten? Heute ist Sicherungstag! 💾'],
  mushroom: ['… Pausen lassen Dinge wachsen. 🌱', 'Schön, dass du weg warst. Sieh mal, was gewachsen ist. 🍄', '… Ein neues Pflänzchen. Danke für die Pause. 🌿'],
  robotHello: ['BIP. GUTEN MORGEN, MENSCH. BEREIT FÜR FOKUS? RECHTSKLICK → FOKUS STARTEN. 🤖'],
};

// Quaks Witz des Tages: Kalauer, Frage und Pointe in einer Blase – er lacht selbst am lautesten
const JOKES = [
  'Was macht ein Frosch im Büro? Er hüpft von Meeting zu Meeting! QUAK-QUAK-QUAK! 🐸',
  'Warum können Frösche so gut Probleme lösen? Sie springen einfach drüber! *lacht sich kaputt*',
  'Was sagt ein Frosch, wenn er etwas nicht versteht? „Quak-tisch unmöglich!“ 🐸😂',
  'Wie nennt man einen Frosch mit Krone? Einen Prinzen in der Probezeit! HAHA!',
  'Was ist grün und klopft an die Tür? Ein Klopfrosch! … Ich bin so lustig. 🐸',
  'Treffen sich zwei Kerzen. Sagt die eine: „Ist Wasser gefährlich?“ – „Davon kannst du ausgehen!“ QUAK! 😂',
  'Warum nehmen Programmierer ihre Brille ab, wenn sie Hunger haben? Weil sie nicht C#! Ich meine … sehen scharf! 🐸',
  'Was ist ein Keks unter einem Baum? Ein schattiges Plätzchen! *quakt vor Lachen*',
  'Wie nennt man einen Bumerang, der nicht zurückkommt? Einen Stock! 😂🐸',
  'Was sitzt auf dem Baum und schreit „Aha“? Ein Uhu mit Sprachfehler! Huhu ist beleidigt. 🦉😂',
  'Was liegt am Strand und spricht undeutlich? Eine Nuschel! QUAK!',
  'Warum ging der Computer zum Arzt? Er hatte einen Virus! … und ein bisschen Fieber-Bytes. 🐸',
  'Was ist orange und läuft durch den Wald? Eine Wanderine! 🍊😂',
  'Ich hab einen Witz über Treppen … der geht steil! *hüpft vor Lachen*',
  'Warum sind Fische so schlecht in Tennis? Sie haben Angst vor dem Netz! 🐟😂',
  'Sagt der Frosch zum Kellner: „Eine Fliege, bitte.“ – „Gern, zum Mitnehmen?“ – „Nein, zum Fangen!“ QUAK!',
  'Was macht ein Pirat am Computer? Er drückt die Enter-Taste! Arrr! 🏴‍☠️🐸',
  'Wie nennt man ein verschwundenes Rind? Oxford! … Okay, der war hoch. 😂',
  'Warum hat der Mathebuch-Frosch so viele Probleme? Weil er voller Aufgaben ist! 🐸📘',
  'Was ist grün und hüpft durchs Gras? Ein Grashüpfer! … Und ich. Hauptsächlich ich! QUAK!',
];

// ---------- Wann meldet sich ein Talent? ----------

// ---------- Wann meldet sich ein Talent? ----------
// mem: Gedaechtnis pro Pet (lastAt, count je Tag, ...), wird hier veraendert
function talentDue(pet, mem, ctx, rnd = Math.random) {
  const t = pet.talent;
  if (!t || !t.enabled || pet.muted) return null;
  const now = ctx.now;
  const day = dayOf(now);
  const min = minOfDay(now);
  if (mem.day !== day) {
    mem.day = day; mem.count = 0; mem.once = {};
    if (pet.species === 'mushroom') mem.garden = 0;
    Object.assign(mem, { naps: 0, facts: 0, events: 0, focusMin: 0, breaths: 0, pets: 0, glasses: 0, flies: 0, scares: 0, panics: 0, tricks: 0, jokes: 0 }); // Tageszaehler
  }
  const sinceMin = (k) => (mem[k] ? (now - mem[k]) / 60000 : Infinity);
  const onceToday = (k) => { if (mem.once[k]) return false; mem.once[k] = true; return true; };
  const say = (text, mood = 'talk', extra = {}) => { mem.lastAt = now.getTime(); mem.count++; return { text, mood, ...extra }; };
  const hours = (a, b) => min >= a * 60 && min < b * 60;
  if (ctx.away) return null; // niemand da: nichts sagen (der Vogel sammelt im Hauptprozess)

  switch (pet.species) {
    case 'cat': // Streck-Pause: 90 Minuten am Stueck aktiv
      if (hours(8, 22) && mem.count < 6 && ctx.activeMin >= 75 && sinceMin('lastAt') >= 75) return say(pick(LINES.cat, rnd), 'stretch', { action: 'stretch', ms: 11000 });
      return null;
    case 'blob': // Trinken: alle 75 Minuten
      if (hours(8, 21) && mem.count < 8 && ctx.activeMin >= 10 && sinceMin('lastAt') >= 75) return say(pick(LINES.blob, rnd), 'happy');
      return null;
    case 'bird': { // Bote: Zusammenfassung nach der Rueckkehr
      const missed = ctx.backFromBreak && ctx.missed && ctx.missed.length ? ctx.missed : null;
      if (!missed) return null;
      const items = missed.slice(0, 3).map((m) => m.short).join(' · ');
      const more = missed.length > 3 ? ` – und ${missed.length - 3} mehr!` : '';
      return say(`Eilmeldung! Während du weg warst: ${items}${more} 🐦`, 'alert', { ms: 15000, open: true });
    }
    case 'beau': // Tageszauber: einmal am Tag ab 9 Uhr
      if (min >= 9 * 60 && ctx.activeMin >= 2 && onceToday('card')) return say(pick(LINES.beau, rnd), 'greet', { ms: 9000 });
      return null;
    case 'fox': { // Feierabend: 30 Minuten vorher und puenktlich
      if (!workday(now)) return null;
      const end = minutesOf(t.endTime);
      if (min >= end - 30 && min < end - 20 && onceToday('plan')) return say(`Psst. Noch 30 Minuten bis Feierabend (${t.endTime}). Was ist das Eine, das du heute noch schaffen willst? 🦊`, 'talk', { ms: 9000 });
      if (min >= end && min < end + 15 && onceToday('end')) return say('Feierabend! 🦊 Klapp den Laptop zu, der Rest kann warten. Schönen Abend! *rollt sich ein*', 'happy', { ms: 9000, action: 'sleep' });
      return null;
    }
    case 'owl': // Lernpause, Abendfrage, Nacht
      if ((min >= 23 * 60 || min < 4 * 60) && onceToday('night')) return say(pick(LINES.owlNight, rnd), 'talk');
      if (min >= 20 * 60 && min < 22 * 60 && onceToday('evening')) return say(pick(LINES.owlEvening, rnd), 'talk', { ms: 9000 });
      if (hours(8, 20) && mem.count < 5 && ctx.activeMin >= 50 && sinceMin('lastAt') >= 50) return say(pick(LINES.owlBreak, rnd), 'talk');
      return null;
    case 'frog': // Witz des Tages: einmal am Vormittag, einmal am Nachmittag (nicht zweimal derselbe)
      if (ctx.activeMin >= 5 && ((hours(9, 12) && onceToday('jokeAm')) || (hours(14, 17) && onceToday('jokePm')))) {
        let j = pick(JOKES, rnd);
        if (j === mem.lastJoke) j = JOKES[(JOKES.indexOf(j) + 1) % JOKES.length];
        mem.lastJoke = j; mem.jokes = (mem.jokes || 0) + 1;
        return say(j, 'happy', { ms: 11000 });
      }
      return null;
    case 'penguin': // schlaegt ab und zu eine Atem-Pause vor
      if (hours(10, 18) && mem.count < 2 && ctx.activeMin >= 120 && sinceMin('lastAt') >= 180) return say(pick(LINES.penguin, rnd), 'talk');
      return null;
    case 'bunny': // volle Stunde
      if (t.hourly && hours(8, 21) && now.getMinutes() < 2 && mem.hour !== `${day}-${now.getHours()}`) {
        mem.hour = `${day}-${now.getHours()}`;
        return say(pick(LINES.bunnyHour, rnd).replaceAll('{t}', String(now.getHours())), 'alert', { ms: 5000 });
      }
      return null;
    case 'panda': // 20-20-20
      if (hours(8, 20) && mem.count < 24 && ctx.activeMin >= 20 && sinceMin('lastAt') >= 20) return say(pick(LINES.panda, rnd), 'cover', { ms: 20000, action: 'cover' });
      return null;
    case 'axolotl': // Lob fuer Erledigtes und Tagesrueckblick
      if (ctx.done > 0) {
        mem.wins = (mem.winsDay === day ? mem.wins || 0 : 0) + ctx.done;
        mem.winsDay = day;
        if (sinceMin('lastAt') >= 2) return say(pick(LINES.axolotlWin, rnd), 'happy');
        return null;
      }
      if (min >= minutesOf(t.summary) && min < minutesOf(t.summary) + 60 && mem.winsDay === day && mem.wins > 0 && onceToday('summary')) {
        return say(`Heute geschafft: ${mem.wins} ${mem.wins === 1 ? 'Sache' : 'Sachen'}! Ich bin sooo stolz auf dich! 🎉🩷`, 'happy', { ms: 10000 });
      }
      return null;
    case 'dragon': { // Akku und woechentliche Sicherung
      const b = ctx.battery;
      if (b && b.charging) { mem.warned = 0; }
      else if (b && typeof b.level === 'number') {
        const p = Math.round(b.level * 100);
        if (p <= 10 && (mem.warned || 100) > 10) { mem.warned = 10; return say(pick(LINES.dragonEmpty, rnd).replaceAll('{p}', p), 'alert', { ms: 15000 }); }
        if (p <= 20 && (mem.warned || 100) > 20) { mem.warned = 20; return say(pick(LINES.dragonLow, rnd).replaceAll('{p}', p), 'alert', { ms: 12000 }); }
      }
      const week = weekOf(now);
      const bt = minutesOf(t.backupTime);
      if (now.getDay() === t.backupDay && min >= bt && min < bt + 120 && mem.backupWeek !== week) { mem.backupWeek = week; return say(pick(LINES.dragonBackup, rnd), 'talk', { ms: 10000 }); }
      return null;
    }
    case 'mushroom': // Pausen-Garten
      if (ctx.backFromBreak >= 5 && (mem.garden || 0) < 8) {
        mem.garden = (mem.garden || 0) + 1;
        const r = { action: { garden: mem.garden } };
        return mem.garden % 2 === 1 ? say(pick(LINES.mushroom, rnd), 'happy', r) : { ...r, text: '', mood: 'happy' };
      }
      return null;
    case 'robot': // morgens einmal Hallo
      if (hours(8, 11) && ctx.activeMin >= 5 && onceToday('hello')) return say(pick(LINES.robotHello, rnd), 'talk');
      return null;
    default:
      return null;
  }
}

// ---------- Begleiter-Modus (2026-11-19): ohne App zeigt jedes Tier seinen Charakter staerker ----------
// Oefter Sprueche zu seinem Thema, eigene Aktionen und beim Drueberfahren eine Info am Namensschild.
// Huhu ist die Ausnahme: mit Nook fragt sie Karteikarten ab, sonst (auch mit anderen Apps) erzaehlt sie Fakten.
const COMPANION = {
  ghost: ['Ich hab heute schon dreimal „Buh“ geübt. Leise. Damit keiner erschrickt. 👻', 'Entschuldigung, dass ich so durchsichtig bin.', 'Ich bin ein Gespenst. Aber ein nettes. Versprochen.', 'Wenn du mich brauchst … ich schwebe hier. Unauffällig.', 'Ich hab mich vorhin selbst im Spiegel erschreckt. Also … nicht gesehen. Das war das Problem.'],
  cat: ['Ich ignoriere dich. Nur damit du Bescheid weißt. 😼', '*schubst ein Icon vom Desktop* … Ups.', 'Dein Stuhl wäre ein guter Schlafplatz. Nur so.', 'Ich könnte dir helfen. Aber ich bin beschäftigt. Mit Sein.', 'Streicheln wäre jetzt … akzeptabel.', 'Pff. Arbeiten. Typisch Mensch.'],
  blob: ['Du bist mein Lieblingsmensch! 💚', 'Heute ist ein SUPER Tag! Ich weiß es einfach!', 'Weißt du, was du kannst? ALLES! Na gut, vieles!', 'Blubb! Ich hab mich gerade so gefreut, dass ich gewabbelt hab!', 'Fun Fact: Lächeln steckt an. Probier’s! 😊', 'Ich bin so stolz auf dich, dass ich platzen könnte! (Keine Sorge, tu ich nicht.)'],
  bird: ['Eilmeldung: {active}! 📰', 'Neuigkeiten vom Bildschirmrand: Alles ruhig. Verdächtig ruhig. 🐦', 'Breaking News: Du machst das gut. Mehr in Kürze.', 'Exklusiv: Heute schon {events} Meldungen. Ich bleibe dran!', 'Wetter in Pet-Hausen: sonnig mit Aussicht auf Kekse. 🍪', 'Gerücht: Der Mauszeiger soll heute besonders flink sein.'],
  beau: ['✨ *zaubert ein kleines Funkeln* – für deine Konzentration.', 'Der Mond steht heute als {moon}. Ein guter Tag für kleine Wunder. 🌙', 'Mrrp. Mein Hut sagt, du schaffst das. Mein Hut irrt nie. 🎩', '🔮 Ich sehe … eine Pause in deiner Zukunft. Eine baldige.', 'Abrakadabra … Stress, verschwinde! ✨ Hat’s geklappt?'],
  fox: ['Psst. Ich hab einen Plan: erst das Wichtigste, dann Feierabend. 🦊', 'Kleiner Trick: Die schwerste Aufgabe zuerst – dann ist der Rest ein Spaziergang.', '{feierabend} Ich zähle mit. 🦊', 'Ich hab die To-do-Liste nicht versteckt. Ehrlich nicht. *schaut weg*', 'Schlau ist, wer Pausen macht, bevor er muss.'],
  frog: ['Was quakt im Büro? Der Drucker! QUAK! 🐸', 'Warum sind Frösche so glücklich? Sie fressen, was sie stört! 🪰', 'Ich bin kein Prinz. Aber küssen musst du mich trotzdem nicht. 🐸', 'Kennst du den? Ein Frosch geht in die Bar … und bestellt eine Fliege. Quak!', 'Ich hab heute schon drei Witze erzählt. Gelacht hab nur ich. Perfekt! 🐸😂'],
  penguin: ['Atme ein. Atme aus. Fertig ist der Tag nicht – aber du bist okay. 🐧', 'Kein Stress. Eis schmilzt auch nicht schneller, wenn man es anschreit.', 'Ganz ruhig. Ein Schritt nach dem anderen. Watschel, watschel.', 'Schultern runter. Kiefer locker. So ist gut.', 'Das Leben ist wie Rutschen: Am besten entspannt.'],
  bunny: ['Es ist {time}! Schon {time}! Wo ist die Zeit hin?! 🐰', 'Ich hab das Gefühl, wir sind zu spät. Wofür, weiß ich nicht. Aber zu spät!', 'Tick, tack, tick, tack … 🐰⏰', 'Soll ich dir einen Timer stellen? Rechtsklick! Schnell! Bevor es zu spät ist!', 'Ich hoppel mal kurz eine Runde. Zur Beruhigung. 🐰'],
  panda: ['Mmmh … Nickerchen? Ein kleines? 🐼', '*kaut genüsslich Bambus* … Willst du auch? Nein? Mehr für mich.', 'Kein Stress. Morgen ist auch noch ein Tag. Und übermorgen.', 'Ich hab heute schon viel geschafft. Ich hab gesessen. Sehr gut gesessen.', 'Gemütlichkeit ist eine Kunst. Ich bin Künstler. 🎋'],
  axolotl: ['Du bist toll! Einfach so! 🩷', 'Weißt du, was ich an dir mag? Alles! 💗', 'Heute schon gelobt worden? Jetzt schon: Du machst das super! 🎉', 'Ich glaub an dich! Ganz doll! 🩷✨', 'Fun Fact: Axolotl können Körperteile nachwachsen lassen. Du kannst neue Kraft tanken – mit einer Pause! 💗'],
  dragon: ['Denk daran, genug zu schlafen – das hält deine persönliche Energie hoch! 🔥', 'Ein Drache ohne Schlaf spuckt nur Rauch. Geh heute nicht zu spät ins Bett. 🐉', 'Wasser löscht kein Drachenfeuer – aber es füllt deine Energie auf. Trink was! 💧', 'Mein Akku-Blick sagt: {battery}. Und deiner? Kurze Pause? ⚡', 'Kleine Pausen sind wie Holz fürs Feuer. Leg nach! 🔥', 'Frische Luft weckt das Feuer! Fenster auf, einmal tief durchatmen. 🐉', 'Energie-Tipp vom Hüter: Ein Snack mit Nüssen statt Zucker. Hält länger! 🔥'],
  mushroom: ['… Alles wächst. Auch du. 🌱', '… Im Wald ist niemand in Eile. Und trotzdem wird alles fertig.', '… Wurzeln brauchen Zeit. Gute Dinge auch.', '… Schau mal raus. Ist da was Grünes?', '… Regen ist kein schlechtes Wetter. Nur Wachswetter. 🍄'],
  robot: ['BIP. FAKT: DER ERSTE COMPUTER-„BUG“ WAR EINE ECHTE MOTTE. 1947. 🤖', 'BIP BOP. ICH LERNE GEFÜHLE. HEUTE: „GEMÜTLICH“. FORTSCHRITT: 37 %.', 'SYSTEMCHECK: MENSCH FUNKTIONIERT. EMPFEHLUNG: WASSER. 💧', 'BIP. FRAGE: WARUM SAGEN MENSCHEN „GLEICH“, WENN SIE „SPÄTER“ MEINEN?', 'FOKUS-STATISTIK HEUTE: {focus} MINUTEN. BIP. STOLZ.EXE GESTARTET.'],
  owl: [], // Huhu: Fakten (unten) bzw. Quiz mit Nook
};
const FACTS = [
  'Wusstest du? Ein Tag auf der Venus dauert länger als ein Jahr auf der Venus. 🦉',
  'Fürwahr: Honig verdirbt nicht. In ägyptischen Gräbern fand man 3000 Jahre alten, noch essbaren Honig.',
  'Interessant: Kraken haben drei Herzen und blaues Blut.',
  'Wusstest du? Das Wort „Computer“ bezeichnete früher Menschen, die beruflich rechneten.',
  'Ein Blitz ist etwa fünfmal heißer als die Oberfläche der Sonne. ⚡',
  'Bananen sind botanisch Beeren – Erdbeeren dagegen nicht. 🍌',
  'Eulen können ihren Kopf um etwa 270 Grad drehen. Ich übe noch. 🦉',
  'Die erste E-Mail wurde 1971 verschickt. Ihr Inhalt war vermutlich „QWERTYUIOP“.',
  'Wusstest du? Faultiere können die Luft länger anhalten als Delfine – bis zu 40 Minuten.',
  'Es gibt mehr mögliche Schachpartien als Atome im beobachtbaren Universum. ♟️',
  'Schnecken können bis zu drei Jahre schlafen. Beneidenswert.',
  'Die Eiffelturm-Spitze ist im Sommer bis zu 15 cm höher – Metall dehnt sich bei Wärme aus.',
  'Wusstest du? Das Gehirn verbraucht etwa 20 % deiner Energie – Pausen sind also Wartung! 🧠',
  'Wombats machen würfelförmige Häufchen. Die Natur ist erstaunlich. Und seltsam.',
  'Licht von der Sonne braucht etwa 8 Minuten bis zur Erde. Du siehst die Sonne also immer in der Vergangenheit.',
  'Wer etwas laut erklärt, behält es besser. Das nennt man den Protégé-Effekt. 📖',
  'Das Passwort „123456“ ist seit Jahren eines der häufigsten der Welt. Bitte nicht verwenden. 🔐',
  'Wusstest du? Tintenfische können ihre Farbe ändern, obwohl sie selbst farbenblind sind.',
  'Der kürzeste Krieg der Geschichte dauerte etwa 38 Minuten (England gegen Sansibar, 1896).',
  'Wenn man lernt und danach schläft, sortiert das Gehirn das Gelernte im Schlaf neu. Fürwahr praktisch. 🌙',
];
// Reaktionen der anderen, wenn Buh sie erschrecken will (je Tierart)
const SCARED = {
  cat: 'Pff. Netter Versuch. 😼', blob: 'AAAH! … Hihi, nochmal! 💚', bird: 'EILMELDUNG! GEIST GESICHTET! 😱', beau: 'Mrrp. Ich bin ein Zauberer. Mich erschreckt nichts. … Fast nichts.',
  fox: 'Haha, den Trick kenn ich! 🦊', owl: 'Huhu! … Interessant. Mein Puls ist gestiegen.', frog: 'QUAAAK! *springt meterhoch* 🐸', penguin: '… Nein. 🐧',
  bunny: 'AAAAAH! 🐰💨', panda: '… *schläft weiter* 💤', axolotl: 'Oh! Du bist so süß, wenn du gruselig sein willst! 🩷', dragon: 'ICH FÜRCHTE MICH NICHT! … *versteckt sich hinter dem Schwanz*',
  mushroom: '… Oh. Ein Gespenst. … Hallo.', robot: 'BIP?! SCHRECK.EXE WIRD AUSGEFÜHRT. 🤖', ghost: 'AAAH! … Ach, du bist’s. Entschuldigung! 👻',
};
const MOONS = ['Neumond 🌑', 'zunehmende Sichel 🌒', 'Halbmond 🌓', 'zunehmender Mond 🌔', 'Vollmond 🌕', 'abnehmender Mond 🌖', 'Halbmond 🌗', 'abnehmende Sichel 🌘'];
const moonOf = (d) => { const days = (d - Date.UTC(2000, 0, 6, 18, 14)) / 86400000; return MOONS[Math.floor((((days % 29.53) + 29.53) % 29.53) / 29.53 * 8 + 0.5) % 8]; };
const companionMode = (pet) => pet.kind === 'none';

// Platzhalter in Begleiter-Spruechen fuellen
function fillCompanion(text, pet, mem, ctx) {
  const end = pet.talent && pet.talent.endTime ? minutesOf(pet.talent.endTime) : 17 * 60;
  const left = end - minOfDay(ctx.now);
  const b = ctx.battery;
  return text
    .replaceAll('{time}', `${ctx.now.getHours()}:${String(ctx.now.getMinutes()).padStart(2, '0')}`)
    .replaceAll('{active}', ctx.activeMin >= 60 ? `Du bist seit ${Math.floor(ctx.activeMin / 60)} Std. ${Math.round(ctx.activeMin % 60)} Min. am Rechner` : 'Unser Mensch ist frisch dabei')
    .replaceAll('{events}', String(mem.events || 0))
    .replaceAll('{moon}', moonOf(ctx.now))
    .replaceAll('{feierabend}', !workday(ctx.now) ? 'Heute ist Wochenende – Feierabend den ganzen Tag!' : left > 0 ? `Noch ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} bis Feierabend.` : 'Feierabend war schon!')
    .replaceAll('{battery}', b && typeof b.level === 'number' ? `${Math.round(b.level * 100)} %${b.charging ? ' und lädt' : ''}` : 'Steckdose, alles gut')
    .replaceAll('{focus}', String(mem.focusMin || 0));
}

// Begleiter-Spruch, Fakt, Quiz oder Aktion faellig? (zusaetzlich zum Talent; nur wenn jemand da ist)
// Rueckgabe wie talentDue, dazu evtl. { quiz: { q, a } } oder action 'scare' | 'nap' | 'hop'
function companionDue(pet, mem, ctx, rnd = Math.random) {
  if (pet.muted || ctx.away || !(pet.talent && pet.talent.enabled)) return null;
  const now = ctx.now;
  const min = minOfDay(now);
  if (min < 8 * 60 || min >= 22 * 60) return null;
  // erster Begleiter-Spruch nach dem Start zu einer zufaelligen Zeit – sonst reden alle Pets gleichzeitig los
  if (!mem.compAt) { mem.compAt = now.getTime() - rnd() * 20 * 60000; mem.compGap = 20 + rnd() * 15; }
  const sinceMin = (now - mem.compAt) / 60000;
  // Huhu: mit Nook Quiz (alle ~35 Min), sonst Fakten (Begleiter alle ~30, mit anderer App alle ~90 Min)
  if (pet.species === 'owl') {
    const cards = pet.kind === 'nook' ? ctx.cards || [] : [];
    const every = cards.length ? 35 : companionMode(pet) ? 30 : 90;
    if (sinceMin < (mem.compGap || every) || ctx.activeMin < 3) return null;
    mem.compAt = now.getTime(); mem.compGap = every * (0.8 + rnd() * 0.4);
    if (cards.length) { const c = cards[Math.floor(rnd() * cards.length)]; return { text: `Huhu! Quizfrage${c.subject ? ` (${c.subject})` : ''}: ${c.q} 🦉`, mood: 'talk', ms: 10000, quiz: c }; }
    mem.facts = (mem.facts || 0) + 1;
    return { text: pick(FACTS, rnd), mood: 'talk', ms: 9000 };
  }
  if (!companionMode(pet)) return null;
  // besondere Momente, die an etwas Echtem haengen (Rueckkehr, Uhrzeit, Meilensteine, Wetter) – unabhaengig vom Takt
  const moment = characterMoment(pet, mem, ctx, rnd);
  if (moment) return moment;
  if (sinceMin < (mem.compGap || 25) || ctx.activeMin < 3) return null;
  mem.compAt = now.getTime(); mem.compGap = 20 + rnd() * 15; // alle 20–35 Minuten
  const r = rnd();
  const sp = pet.species;
  // eigene Aktionen je Tier (den Text dazu baut der Hauptprozess, weil er die Nachbarn und Systemwerte kennt)
  if (sp === 'ghost' && r < 0.35) return { action: 'scare' };
  if (sp === 'cat') { if (r < 0.25) return { action: 'territory' }; if (r < 0.4) return { action: 'gift' }; }
  if ((sp === 'cat' || sp === 'panda') && r < 0.6 && r >= (sp === 'cat' ? 0.4 : 0.35)) { mem.naps = (mem.naps || 0) + 1; return { text: sp === 'cat' ? '*rollt sich zusammen* Nicht stören. 😼💤' : 'Mmmh … nur fünf Minuten … 🐼💤', mood: 'sleep', ms: 4000, action: 'nap' }; }
  if (sp === 'panda') { if (r < 0.15) return { action: 'roll', text: '*purzelt* … Hoppla. Absicht. 🐼', mood: 'happy', ms: 4000 }; if (r < 0.35) return { action: 'yawn' }; }
  if (sp === 'bird' && r < 0.45) return { action: 'gossip' };
  if (sp === 'beau' && r < 0.3) return { action: 'trick' };
  if (sp === 'fox' && r < 0.3) return { action: 'sneak' };
  if (sp === 'penguin' && r < 0.45) return { action: 'slide', text: 'Wiiiii! 🐧💨', mood: 'happy', ms: 2500 };
  if (sp === 'bunny' && r < 0.3) return { action: 'sprint', text: 'Keine Zeit, keine Zeit! 🐰💨', mood: 'alert', ms: 2500 };
  if (sp === 'robot' && r < 0.5) return { action: 'sysreport' };
  if (sp === 'axolotl' && r < 0.2) return { action: 'pompom', text: 'Tschakka! Du schaffst das! 🎉🩷', mood: 'happy', ms: 4000 };
  if ((sp === 'frog' || sp === 'blob') && r < 0.3) return { text: '', mood: 'happy', action: 'hop' };
  const list = COMPANION[sp];
  if (!list || !list.length) return null;
  return { text: fillCompanion(pick(list, rnd), pet, mem, ctx), mood: pet.species === 'beau' ? 'greet' : 'talk', ms: 8000 };
}

// ---------- Hoppel: zaehlt, wie lange der PC gesperrt war oder schlief ----------
const fmtDur = (min) => (min < 60 ? `${min} ${min === 1 ? 'Minute' : 'Minuten'}` : `${Math.floor(min / 60)} Std. ${min % 60} Min.`);
const fmtClock = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
// min: diese Sperre in Minuten, total: heute insgesamt, how: 'lock' (gesperrt) oder 'sleep' (Ruhezustand)
function lockLine(min, total, how = 'lock', rnd = Math.random) {
  const what = how === 'sleep' ? 'im Ruhezustand' : 'gesperrt';
  const intro = min >= 60 ? pick(['DA BIST DU JA!!', 'ENDLICH!!', 'Ich dachte schon, du kommst nie wieder!!'], rnd)
    : min >= 15 ? pick(['Da bist du ja!', 'Wieder da!', 'Puh, endlich!'], rnd) : pick(['Schon zurück?', 'Oh, hallo!', 'Wieder da!'], rnd);
  return `${intro} Der PC war ${fmtDur(min)} ${what} – ich hab mitgezählt! Jede Sekunde! Heute insgesamt: ${fmtClock(total)}. 🐰⏱️`;
}

// ---------- Lotti: Klick = Aufgabe erledigt, je mehr, desto groesser die Freude ----------
function lottiPraise(n, rnd = Math.random) {
  const tier = n >= 10 ? [
    `${n} AUFGABEN!!! DU BIST EINE LEGENDE! Ich werde Lieder über dich schreiben! 🎉👑🩷`,
    `${n}! ${n}!! Ich hab keine Worte mehr! Nur noch Konfetti! 🎊🎊🎊`,
    `Aufgabe Nummer ${n}! Ist das überhaupt legal, so produktiv zu sein?! 🩷🔥`,
  ] : n >= 5 ? [
    `Schon ${n} Aufgaben! Du bist nicht zu stoppen! 🎉🎉`,
    `${n} geschafft! Ich hüpfe vor Freude! Hüpf! Hüpf! 🩷🎉`,
    `Nummer ${n}! Heute ist DEIN Tag! 🌟🎉`,
  ] : n >= 3 ? [
    `${n} Aufgaben erledigt! Du bist so gut! 🎉`,
    `Und noch eine! Das sind schon ${n}! Ich bin so stolz! 🩷`,
    `${n}! Du läufst dich richtig warm! ✨`,
  ] : n === 2 ? [
    'Zwei! Schon zwei! Du bist großartig! 🩷',
    'Noch eine geschafft! Weiter so! ✨',
  ] : [
    'Erste Aufgabe erledigt! Ich wusste, dass du das kannst! 🩷',
    'Geschafft! Das war super! 🎉',
    'Yay! Die erste! Jetzt bist du warm gelaufen! 🩷',
  ];
  return pick(tier, rnd);
}

// ---------- Pilzi: passt sich dem Wetter an ----------
// Wetter (Tagesvorhersage) -> Aussehen: Sonne = Sonnenbrille, Regen = Pilzfreund, Wind = kleiner, Schnee = Schneemuetze, kalt = Schal
function weatherLook(w) {
  if (!w || w.missing) return null;
  const rain = w.rain >= 50 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(w.code);
  const snow = [71, 73, 75, 77, 85, 86].includes(w.code);
  const sky = snow ? 'snow' : rain ? 'rain' : [0, 1].includes(w.code) ? 'sun' : [45, 48].includes(w.code) ? 'fog' : 'cloud';
  return { sky, windy: (w.wind || 0) >= 30, cold: w.max <= 3, hot: w.max >= 27 };
}
const SKY = { sun: '☀️ sonnig', rain: '🌧️ Regen', snow: '❄️ Schnee', fog: '🌫️ Nebel', cloud: '⛅ bewölkt' };
function weatherSay(look) {
  if (!look) return '';
  if (look.sky === 'sun') return '… Sonne. *setzt die Sonnenbrille auf* 😎';
  if (look.sky === 'rain') return '… Regen. Wachswetter. Mein Pilzfreund ist auch gekommen. 🌧️🍄';
  if (look.sky === 'snow') return '… Schnee. Mein Hut ist ganz weiß. Schön still heute. ❄️';
  if (look.windy) return '… Wind. Ich mach mich klein. *duckt sich* 🍃';
  if (look.cold) return '… Kalt heute. Gut, dass ich meinen Schal habe. 🧣';
  if (look.sky === 'fog') return '… Nebel. Der Wald schläft noch.';
  return '… Wolken. Ein ruhiger Tag zum Wachsen. ⛅';
}

// Momente mit echtem Bezug (Begleiter-Modus): einmal am Tag oder an Ereignisse gebunden
function characterMoment(pet, mem, ctx, rnd) {
  const now = ctx.now;
  const min = minOfDay(now);
  mem.moments = mem.moments && mem.moments.day === dayOf(now) ? mem.moments : { day: dayOf(now) };
  const once = (k) => { if (mem.moments[k]) return false; mem.moments[k] = true; return true; };
  const w = Object.values(ctx.weather || {}).find((x) => x && !x.missing);
  const rainy = w && (w.rain >= 50 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(w.code));
  switch (pet.species) {
    case 'bunny':
      // (wie lange der PC gesperrt war, meldet Hoppel direkt beim Entsperren – siehe lockLine)
      if (now.getMinutes() >= 55 && now.getMinutes() < 57 && min >= 8 * 60 && min < 20 * 60 && (mem.panics || 0) < 3 && once(`panic${now.getHours()}`)) {
        mem.panics = (mem.panics || 0) + 1;
        return { text: 'Gleich ist volle Stunde!! Gleich! GLEICH! … Was passiert dann eigentlich? 🐰', mood: 'alert', ms: 5000 };
      }
      return null;
    case 'bird':
      if (min >= 7 * 60 && min < 11 * 60 && ctx.activeMin >= 2 && once('paper')) return { action: 'paper' };
      return null;
    case 'fox':
      if (!workday(now)) return null;
      if (min >= 9 * 60 && min < 11 * 60 + 30 && ctx.activeMin >= 2 && once('plan')) return { text: 'Psst. Plan des Tages: Was ist heute das EINE, das du schaffen willst? Merk’s dir – ich frag heute Abend nach. 🦊', mood: 'talk', ms: 10000 };
      {
        const end = minutesOf((pet.talent && pet.talent.endTime) || '17:00');
        if (min >= end - 75 && min < end - 45 && once('check')) return { text: 'Und? Hast du dein EINES geschafft? Wenn ja: Ich bin beeindruckt. Wenn nein: Morgen ist auch noch ein Plan. 🦊', mood: 'talk', ms: 10000 };
      }
      return null;
    case 'axolotl': // Lotti zaehlt Aufgaben per Klick (siehe lottiPraise) – hier nichts Zeitgesteuertes
      return null;
    case 'mushroom': {
      // Wetter des eigenen Orts: einmal am Tag sagt Pilzi, wie er sich angepasst hat (das Aussehen setzt der Hauptprozess)
      const look = weatherLook(pet.talent && pet.talent.place && ctx.weather ? ctx.weather[pet.talent.place.toLowerCase()] : null);
      if (look && min >= 8 * 60 && once('weather')) return { text: weatherSay(look), mood: 'happy', ms: 7000 };
      return null;
    }
    case 'cat':
      if (ctx.activeMin >= 120 && (!mem.lastPetAt || now - mem.lastPetAt > 3 * 3600000) && once('offended')) return { text: 'Seit Stunden streichelt mich niemand. Ich bin beleidigt. 😾 … Das war ein Hinweis.', mood: 'sad', ms: 7000 };
      return null;
    default:
      return null;
  }
}

// Info am Namensschild beim Drueberfahren (nur Begleiter-Modus; Huhu mit Nook zeigt die Kartenzahl)
function companionInfo(pet, mem, ctx) {
  if (!(pet.talent && pet.talent.enabled)) return '';
  if (pet.species === 'owl' && pet.kind === 'nook') {
    const n = ctx.cards ? ctx.cards.length : 0;
    return n ? `🗂️ ${n} ${n === 1 ? 'Karteikarte' : 'Karteikarten'}` : '🗂️ keine Karten gefunden';
  }
  if (!companionMode(pet)) return '';
  const b = ctx.battery;
  const w = pet.talent.place && ctx.weather && ctx.weather[pet.talent.place.toLowerCase()];
  const hh = `${ctx.now.getHours()}:${String(ctx.now.getMinutes()).padStart(2, '0')}`;
  switch (pet.species) {
    case 'ghost': return `👻 Mut: ${Math.min(100, 3 + (mem.pets || 0) * 7)} %`;
    case 'cat': {
      const since = mem.lastPetAt ? (ctx.now - mem.lastPetAt) / 60000 : Infinity;
      return since < 30 ? '😽 Laune: gnädig' : since > 180 && ctx.activeMin >= 120 ? '😾 Laune: beleidigt' : `😼 Laune: ${['verschlafen', 'königlich', 'huldvoll', 'unbeeindruckt'][ctx.now.getHours() % 4]}`;
    }
    case 'blob': return `🥛 ${mem.glasses || 0} ${mem.glasses === 1 ? 'Glas' : 'Gläser'} · Stimmung SUPER`;
    case 'bird': return `📰 ${mem.events || 0} Meldungen heute`;
    case 'beau': return `🌙 ${moonOf(ctx.now)}`;
    case 'fox': return `⏳ ${fillCompanion('{feierabend}', pet, mem, ctx).replace(/^Noch /, 'noch ')}`;
    case 'owl': return `📚 ${mem.facts || 0} Fakten heute`;
    case 'frog': return `😂 ${mem.jokes || 0} Witze · 🪰 ${mem.flies || 0} gefangen`;
    case 'penguin': return `🫧 Atem-Pausen heute: ${mem.breaths || 0}`;
    case 'bunny': return `⏰ ${hh}${mem.lockDay === dayOf(ctx.now) && mem.lockTotal ? ` · 🔒 ${fmtClock(mem.lockTotal)} gesperrt` : ''}`;
    case 'panda': return `💤 Nickerchen heute: ${mem.naps || 0}`;
    case 'axolotl': return `🎉 heute geschafft: ${mem.winsDay === dayOf(ctx.now) ? mem.wins || 0 : 0} · Klick = erledigt`;
    case 'dragon': return b && typeof b.level === 'number' ? `🔋 ${Math.round(b.level * 100)} %${b.charging ? ' ⚡' : ''}` : '🔌 kein Akku – volle Energie';
    case 'mushroom': {
      const look = weatherLook(pet.talent.place && ctx.weather ? ctx.weather[pet.talent.place.toLowerCase()] : null);
      return `${look ? `${SKY[look.sky]}${look.windy ? ', windig' : ''} · ` : ''}🌱 ${mem.garden || 0}`;
    }
    case 'robot': return `${ctx.sys ? `RAM ${ctx.sys.ram} % · ` : ''}🎯 Fokus ${mem.focusMin || 0} Min`;
    default: return '';
  }
}

// Kurzform einer Meldung fuer den Boten ("✅ 3C fertig (Pets)")
function shortEvent(ev, src) {
  const where = ev.project ? ` (${ev.project})` : '';
  if (ev.type === 'task-done') return `✅ ${src} fertig${where}`;
  if (ev.type === 'task-error') return `⚠️ Fehler in ${src}${where}`;
  if (ev.type === 'decision') return `❓ ${src} braucht dich${where}`;
  return `💬 ${ev.text}`.slice(0, 60);
}

// Atem-Pause: Ablauf (Text, Stimmung, Dauer in ms)
const BREATH = [];
for (let i = 0; i < 6; i++) { BREATH.push({ text: i ? 'Einatmen … 🫧' : 'Los geht’s. Einatmen … 🫧', mood: 'inhale', ms: 4000 }); BREATH.push({ text: 'Ausatmen …', mood: 'exhale', ms: 6000 }); }
BREATH.push({ text: 'Schön. Ganz ruhig. 🐧', mood: 'happy', ms: 3000 });

// Fokus-Timer des Roboters: Phasen
const FOCUS = { work: 25, rest: 5 };
const FOCUS_LINES = {
  start: 'BIP. FOKUS-MODUS AKTIVIERT. 25:00 MINUTEN. VIEL ERFOLG, MENSCH. 🤖',
  rest: 'BIP BIP! 25 MINUTEN GESCHAFFT. ICH BERECHNE: STOLZ. 5 MINUTEN PAUSE. 🤖💙',
  again: 'PAUSE BEENDET. NOCH EINE RUNDE? RECHTSKLICK → FOKUS STARTEN. 🤖',
  stop: 'FOKUS BEENDET. GUTE ARBEIT, MENSCH. 🤖',
};
const TIMER_LINES = { set: (m) => `Okay! In ${m} Minuten sag ich Bescheid! Versprochen! ⏰🐰`, done: (m) => `ZEIT IST UM! ${m} Minuten sind vorbei! ⏰🐰` };

module.exports = { lockLine, lottiPraise, weatherLook, weatherSay, fmtClock, COMPANION, FACTS, SCARED, companionDue, companionInfo, companionMode, moonOf, TALENTS, LINES, normalizeTalent, talentDue, JOKES, shortEvent, BREATH, FOCUS, FOCUS_LINES, TIMER_LINES, hhmm, weekOf };
