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
  cat: { title: 'Streck-Pause', character: 'Diva, unbeeindruckt, heimlich fürsorglich', desc: 'Nach etwa 90 Minuten am Stück streckt sich Mauz – und besteht darauf, dass du mitmachst.', options: [] },
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
    title: 'Wetterfrosch', character: 'energiegeladen, gut gelaunt, laut, liebt Kalauer',
    desc: 'Sagt dir morgens das Wetter mit Tipp (Jacke, Schirm, Sonnenbrille). Nur wenn du einen Ort einträgst – der Ort geht dafür an den kostenlosen Wetterdienst open-meteo.com.',
    options: [{ key: 'place', type: 'text', label: 'Ort (z. B. Berlin) – leer lassen, wenn du das nicht willst', def: '' }],
  },
  penguin: { title: 'Atem-Pause', character: 'tiefenentspannt, cool, durch nichts aus der Ruhe zu bringen', desc: 'Rechtsklick → „Atem-Pause“: eine Minute zusammen atmen, Watschel atmet sichtbar mit. Schlägt das ab und zu auch selbst vor.', options: [] },
  bunny: {
    title: 'Zeit & Timer', character: 'nervös, immer in Eile, besessen von Pünktlichkeit',
    desc: 'Rechtsklick → „Erinnere mich in …“: ein schneller Timer. Auf Wunsch sagt Hoppel zur vollen Stunde die Uhrzeit an.',
    options: [{ key: 'hourly', type: 'bool', label: 'Zur vollen Stunde die Uhrzeit ansagen (8–20 Uhr)', def: true }],
  },
  panda: { title: 'Augenpause (20-20-20)', character: 'faul, gemütlich, Genießer', desc: 'Alle 20 Minuten am Bildschirm: 20 Sekunden in die Ferne schauen. Bambus hält sich solange selbst die Augen zu.', options: [] },
  axolotl: {
    title: 'Lob', character: 'dein größter Fan, unendlich positiv, Cheerleader',
    desc: 'Freut sich über jeden fertigen Auftrag (3C, Claude, andere Apps) und zählt abends zusammen, was du geschafft hast.',
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
  mushroom: { title: 'Pausen-Garten', character: 'still, geduldig, naturverbunden, philosophisch', desc: 'Jede echte Pause (5 Minuten weg vom Rechner) lässt neben Pilzi etwas wachsen. Nichts welkt – jeden Tag ein neuer Garten.', options: [] },
  robot: { title: 'Fokus-Timer', character: 'logisch, nimmt alles wörtlich, lernt Gefühle', desc: 'Rechtsklick → „Fokus starten“: 25 Minuten Arbeit, 5 Minuten Pause, der Countdown steht über Bip.', options: [] },
};

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
  cat: ['Pff. Ich streck mich jetzt. Du auch. Sofort. 🐱', '*streckt sich ausgiebig* … Was guckst du? Mitmachen!', 'Dein Rücken hat mich angerufen. Er will gestreckt werden.', 'Arme hoch. Ich warte. *gähnt*'],
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

// Wetter: WMO-Code -> Wort, Tipp mit Kalauer
function weatherLine(w, place) {
  const rain = w.rain >= 50 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(w.code);
  const snow = [71, 73, 75, 77, 85, 86].includes(w.code);
  const sky = snow ? 'Schnee ❄️' : rain ? 'Regen 🌧️' : [0, 1].includes(w.code) ? 'Sonne ☀️' : [2, 3].includes(w.code) ? 'Wolken ⛅' : [45, 48].includes(w.code) ? 'Nebel 🌫️' : 'gemischtes Wetter';
  const tip = snow ? 'Mütze auf, sonst frierst du dir die Quak-Backen ab!'
    : rain ? 'Schirm mit, sonst wirst du nass wie ein Frosch! 🐸'
      : w.max >= 25 ? 'Sonnenbrille und Wasser – heute wird’s heiß!'
        : w.max <= 8 ? 'Jacke mit, sonst quakst du vor Kälte!' : 'Perfektes Wetter für einen kleinen Hüpfer nach draußen!';
  return `Quak! ${place}: ${Math.round(w.min)}–${Math.round(w.max)} °C, ${sky}. ${tip}`;
}

// ---------- Wann meldet sich ein Talent? ----------
// mem: Gedaechtnis pro Pet (lastAt, count je Tag, ...), wird hier veraendert
function talentDue(pet, mem, ctx, rnd = Math.random) {
  const t = pet.talent;
  if (!t || !t.enabled || pet.muted) return null;
  const now = ctx.now;
  const day = dayOf(now);
  const min = minOfDay(now);
  if (mem.day !== day) { mem.day = day; mem.count = 0; mem.once = {}; if (pet.species === 'mushroom') mem.garden = 0; }
  const sinceMin = (k) => (mem[k] ? (now - mem[k]) / 60000 : Infinity);
  const onceToday = (k) => { if (mem.once[k]) return false; mem.once[k] = true; return true; };
  const say = (text, mood = 'talk', extra = {}) => { mem.lastAt = now.getTime(); mem.count++; return { text, mood, ...extra }; };
  const hours = (a, b) => min >= a * 60 && min < b * 60;
  if (ctx.away) return null; // niemand da: nichts sagen (der Vogel sammelt im Hauptprozess)

  switch (pet.species) {
    case 'cat': // Streck-Pause: 90 Minuten am Stueck aktiv
      if (hours(8, 22) && mem.count < 4 && ctx.activeMin >= 90 && sinceMin('lastAt') >= 90) return say(pick(LINES.cat, rnd), 'stretch', { action: 'stretch' });
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
    case 'frog': { // Wetter am Morgen, nur mit Ort
      const w = t.place && ctx.weather && ctx.weather[t.place.toLowerCase()];
      if (w && min >= 7 * 60 && min < 12 * 60 && onceToday('weather')) return say(weatherLine(w, t.place), 'happy', { ms: 12000 });
      return null;
    }
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

module.exports = { TALENTS, LINES, normalizeTalent, talentDue, weatherLine, shortEvent, BREATH, FOCUS, FOCUS_LINES, TIMER_LINES, hhmm, weekOf };
