// Voreinstellungen je verbundener App. Alles hier ist nur ein Startwert: in den Einstellungen laesst sich
// jedes Pet frei anpassen (Pfad, Sprueche, Abstand, Uhrzeiten).
const path = require('node:path');
const os = require('node:os');

const fs = require('node:fs');

const local = () => process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const roaming = () => process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const programs = () => path.join(local(), 'Programs');
// Wo die Apps nach der Installation liegen: Windows (Benutzer-Installation), macOS (Programme), Linux (deb)
const where = (win, mac, linux) => () => (process.platform === 'win32' ? path.join(programs(), ...win)
  : process.platform === 'darwin' ? mac : linux);
// Desktop-App, wenn installiert – sonst die Webseite (win: Liste moeglicher Pfade als Funktionen)
const appOrWeb = ({ win = [], mac, linux }, url) => () => {
  const paths = process.platform === 'win32' ? win.map((f) => f()) : [process.platform === 'darwin' ? mac : linux];
  return paths.find((p) => p && fs.existsSync(p)) || url;
};
const CLAUDE_APP = { win: [() => path.join(local(), 'AnthropicClaude', 'claude.exe')], mac: '/Applications/Claude.app' };
const off = (messages, extra = {}) => ({ enabled: false, intervalMin: 60, onlyWorkdays: false, from: '08:00', to: '20:00', messages, timed: [], ...extra });

// group: Abschnitt in der Auswahl beim Anlegen · icon: Zeichen auf der Karte · source: wo eine Meldung herkommt
// ("Fertig in 3C") · listens: von welchen Apps das Pet Meldungen annimmt (Standard: nur von sich selbst)
const APPS = {
  nexus: {
    label: 'NEXUS',
    group: 'mine', icon: '🧭', source: '3C',
    target: where(['nexus', 'NEXUS.exe'], '/Applications/NEXUS.app', '/opt/NEXUS/nexus'),
    hint: 'Meldet sich, wenn ein Auftrag in 3C fertig ist oder Claude eine Entscheidung braucht.',
    eventsLabel: 'Melden, wenn ein Auftrag in 3C fertig ist oder Claude eine Entscheidung braucht',
    reminders: { enabled: false, intervalMin: 90, onlyWorkdays: false, from: '08:00', to: '20:00', messages: ['Brauchst du Hilfe? NEXUS ist nur einen Klick entfernt.'], timed: [] },
    events: true,
  },
  c3: {
    label: '3C',
    group: 'mine', icon: '💬', source: '3C', listens: ['nexus'],
    target: where(['nexus', 'NEXUS.exe'], '/Applications/NEXUS.app', '/opt/NEXUS/nexus'),
    hint: 'Nur für 3C (Claude Code in NEXUS): sagt Bescheid, wenn ein Auftrag fertig ist, schiefging oder eine Entscheidung braucht. Sonst ist es still.',
    eventsLabel: 'Melden, wenn ein Auftrag in 3C fertig ist oder Claude eine Entscheidung braucht',
    reminders: off(['3C ist bereit, wenn du es bist. 💬', 'Soll Claude in 3C was für dich erledigen?']),
    events: true,
  },
  dan: {
    label: 'DAN',
    group: 'mine', icon: '📝',
    eventsLabel: 'Meldungen von DAN anzeigen (sobald DAN welche schickt)',
    target: where(['dan-app', 'DAN.exe'], '/Applications/DAN.app', '/opt/DAN/dan'),
    hint: 'Erinnert dich regelmäßig daran aufzuschreiben, was du gerade machst.',
    reminders: {
      enabled: true, intervalMin: 60, onlyWorkdays: true, from: '07:30', to: '16:30',
      messages: [
        'Was machst du gerade? Schreib es kurz in DAN auf 📝',
        'Kleine Notiz für den Wochenbericht? Klick mich!',
        'Hast du deine letzte Aufgabe schon eingetragen?',
        'Zwei Sätze in DAN jetzt sparen dir Freitag eine Stunde.',
        'Was hast du in der letzten Stunde gelernt? Ab in DAN damit!',
      ],
      timed: [{ time: '15:45', text: 'Bald Feierabend – trag noch schnell deinen Tag in DAN ein ✍️' }],
    },
    events: true,
  },
  nook: {
    label: 'Nook',
    group: 'mine', icon: '🌱',
    eventsLabel: 'Meldungen von Nook anzeigen (sobald Nook welche schickt)',
    target: where(['nook-desktop', 'Nook.exe'], '/Applications/Nook.app', '/opt/Nook/nook-desktop'),
    hint: 'Sagt dir ab und zu etwas Nettes und erinnert dich an Pausen und Wasser.',
    reminders: {
      enabled: true, intervalMin: 45, onlyWorkdays: false, from: '08:00', to: '22:00',
      messages: [
        'Du machst das gut. Wirklich. 🌱',
        'Kleine Schritte sind auch Schritte.',
        'Trink mal einen Schluck Wasser 💧',
        'Schultern runter, tief durchatmen.',
        'Du musst heute nicht alles schaffen.',
        'Steh kurz auf und streck dich! 🙆',
        'Ich bin stolz auf dich.',
        'Fehler heißen nur: du probierst etwas Neues.',
        'Schau 20 Sekunden aus dem Fenster – deine Augen sagen danke.',
        'Du darfst Pausen machen, bevor du müde bist.',
      ],
      timed: [{ time: '12:30', text: 'Mittagspause! 🍜 Weg vom Bildschirm.' }],
    },
    events: true,
  },

  // ---------- KI ----------
  claude: {
    label: 'Claude',
    group: 'ai', icon: '✳️',
    target: appOrWeb(CLAUDE_APP, 'https://claude.ai'),
    hint: 'Öffnet Claude (die Desktop-App, sonst claude.ai). Ein Klick, und du kannst loslegen.',
    eventsLabel: 'Meldungen über die lokale Schnittstelle anzeigen',
    reminders: off(['Frag doch Claude! ✳️', 'Steckst du fest? Zusammen mit Claude geht’s leichter.', 'Lass Claude den langweiligen Teil machen. 😌']),
    events: false,
  },
  claudecode: {
    label: 'Claude Code',
    group: 'ai', icon: '⌨️', source: 'Claude Code', listens: ['claude-code'],
    target: appOrWeb(CLAUDE_APP, 'https://claude.ai/code'),
    hint: 'Sagt Bescheid, wenn Claude Code fertig ist oder deine Entscheidung braucht – dafür einmal den Hook unten in Claude Code eintragen.',
    eventsLabel: 'Melden, wenn Claude Code fertig ist oder eine Entscheidung braucht',
    reminders: off(['Claude Code wartet auf deinen nächsten Auftrag. ⌨️', 'Kleiner Commit zwischendurch? 🌱']),
    events: true,
  },
  chatgpt: {
    label: 'ChatGPT',
    group: 'ai', icon: '💭',
    target: () => 'https://chatgpt.com',
    hint: 'Öffnet ChatGPT im Browser.',
    eventsLabel: 'Meldungen über die lokale Schnittstelle anzeigen',
    reminders: off(['Frag doch ChatGPT! 💭', 'Zwei Köpfe denken besser als einer.']),
    events: false,
  },

  // ---------- Mail & Kalender ----------
  gmail: {
    label: 'Gmail',
    group: 'mail', icon: '📬',
    target: () => 'https://mail.google.com',
    hint: 'Öffnet Gmail und erinnert werktags ab und zu daran, kurz in die Mails zu schauen.',
    eventsLabel: 'Meldungen über die lokale Schnittstelle anzeigen',
    reminders: { enabled: true, intervalMin: 180, onlyWorkdays: true, from: '09:00', to: '17:00', messages: ['Kurz in die Mails schauen? 📬', 'Posteingang-Check! Klick mich.', 'Vielleicht wartet jemand auf eine Antwort? ✉️'], timed: [] },
    events: false,
  },
  outlook: {
    label: 'Outlook',
    group: 'mail', icon: '📧',
    target: () => 'https://outlook.office.com/mail/',
    hint: 'Öffnet Outlook im Browser und erinnert werktags ab und zu an die Mails.',
    eventsLabel: 'Meldungen über die lokale Schnittstelle anzeigen',
    reminders: { enabled: true, intervalMin: 180, onlyWorkdays: true, from: '09:00', to: '17:00', messages: ['Kurz in Outlook schauen? 📧', 'Neue Mails? Klick mich.'], timed: [] },
    events: false,
  },
  gcal: {
    label: 'Google Kalender',
    group: 'mail', icon: '📅',
    target: () => 'https://calendar.google.com',
    hint: 'Öffnet den Google Kalender und fragt werktags morgens, was heute ansteht.',
    eventsLabel: 'Meldungen über die lokale Schnittstelle anzeigen',
    reminders: { enabled: true, intervalMin: 600, onlyWorkdays: true, from: '08:00', to: '18:00', messages: ['Was steht heute an? 📅'], timed: [{ time: '08:45', text: 'Guten Morgen! Was steht heute im Kalender? 📅' }] },
    events: false,
  },
  teams: {
    label: 'Teams',
    group: 'mail', icon: '👥',
    target: () => 'https://teams.microsoft.com',
    hint: 'Öffnet Microsoft Teams im Browser.',
    eventsLabel: 'Meldungen über die lokale Schnittstelle anzeigen',
    reminders: off(['Schon in Teams reingeschaut? 👥']),
    events: false,
  },

  // ---------- Mehr ----------
  spotify: {
    label: 'Spotify',
    group: 'more', icon: '🎵',
    target: appOrWeb({ win: [() => path.join(roaming(), 'Spotify', 'Spotify.exe')], mac: '/Applications/Spotify.app', linux: '/usr/bin/spotify' }, 'https://open.spotify.com'),
    hint: 'Öffnet Spotify (die App, sonst im Browser). Musik an, Kopf frei.',
    eventsLabel: 'Meldungen über die lokale Schnittstelle anzeigen',
    reminders: off(['Musik an? 🎵', 'Lieblingslied-Pause! 🎶']),
    events: false,
  },
  notion: {
    label: 'Notion',
    group: 'more', icon: '🗒️',
    target: appOrWeb({ win: [() => path.join(programs(), 'Notion', 'Notion.exe')], mac: '/Applications/Notion.app' }, 'https://www.notion.so'),
    hint: 'Öffnet Notion (die App, sonst im Browser).',
    eventsLabel: 'Meldungen über die lokale Schnittstelle anzeigen',
    reminders: off(['Gedanke? Schreib ihn in Notion auf 🗒️']),
    events: false,
  },
  obsidian: {
    label: 'Obsidian',
    group: 'more', icon: '💎',
    target: appOrWeb({ win: [() => path.join(programs(), 'Obsidian', 'Obsidian.exe')], mac: '/Applications/Obsidian.app', linux: '/usr/bin/obsidian' }, ''),
    hint: 'Öffnet Obsidian (z. B. dein Second Brain).',
    eventsLabel: 'Meldungen über die lokale Schnittstelle anzeigen',
    reminders: off(['Gedanke? Ab ins Second Brain damit 💎', 'Was hast du heute gelernt? Notier es kurz.']),
    events: false,
  },

  custom: {
    label: 'Eigene App',
    group: 'other', icon: '🧩',
    eventsLabel: 'Meldungen der App anzeigen (über die lokale Schnittstelle)',
    target: () => '',
    hint: 'Öffnet eine beliebige Datei, ein Programm oder eine Webseite.',
    reminders: { enabled: false, intervalMin: 60, onlyWorkdays: false, from: '08:00', to: '20:00', messages: ['Hallo! 👋'], timed: [] },
    events: true,
  },
  none: {
    label: 'Keine',
    group: 'other', icon: '🐾',
    eventsLabel: 'Meldungen anzeigen',
    target: () => '',
    hint: 'Einfach ein Pet, das dir Gesellschaft leistet.',
    reminders: { enabled: false, intervalMin: 60, onlyWorkdays: false, from: '08:00', to: '20:00', messages: ['Hallo! 👋'], timed: [] },
    events: false,
  },
};

const SPECIES = {
  blob: { label: 'Blubb (Schleim)', color: '#7dd3a8' },
  cat: { label: 'Mauz (Katze)', color: '#f4a261' },
  ghost: { label: 'Buh (Geist)', color: '#c4b5fd' },
  bird: { label: 'Piep (Vogel)', color: '#7cc6f2' },
  beau: { label: 'Beau (Kater mit Hexenhut)', color: '#d99a36' }, // Fell und Hut sind immer gleich (der Hut bleibt orange-golden)
  // weitere Pets aus der Liste in MIND (Aussehen; eigene Talente werden noch gemeinsam geplant)
  fox: { label: 'Fips (Fuchs)', color: '#f28c38' },
  owl: { label: 'Huhu (Eule)', color: '#b08463' },
  frog: { label: 'Quak (Frosch)', color: '#7cc97a' },
  penguin: { label: 'Watschel (Pinguin)', color: '#475569' },
  bunny: { label: 'Hoppel (Hase)', color: '#e9d8c8' },
  panda: { label: 'Bambus (Panda)', color: '#f5f3ef' },
  axolotl: { label: 'Lotti (Axolotl)', color: '#f9a8c9' },
  dragon: { label: 'Funke (Drache)', color: '#6fcf97' },
  mushroom: { label: 'Pilzi (Pilz)', color: '#e5534b' },
  robot: { label: 'Bip (Roboter)', color: '#9fb4c7' },
};

// Beau: eigenes Pet, gehoert zum Beau-Theme von Nook
const BEAU = {
  name: 'Beau',
  species: 'beau',
  kind: 'nook',
  messages: [
    'Miau. Der Hut sitzt. ✨',
    'Du machst das gut. Wirklich. 🌙',
    'Kleine Pause? Ich halte so lange die Stellung. 🎩',
    'Trink mal einen Schluck Wasser 💧',
    'Schultern runter, tief durchatmen. Ich schnurre mit.',
    '*streckt sich* Mach du das auch mal kurz!',
    'Ein Kapitel nach dem anderen. 📖',
    'Ich bin stolz auf dich. Mrrp.',
    'Du darfst Pausen machen, bevor du müde bist.',
  ],
  greetings: { morgen: 'Guten Morgen! ☀️ *winkt*', tag: 'Hallo! Schön, dass du da bist. *winkt*', abend: 'Guten Abend! 🕯️ *winkt*', nacht: 'Noch wach? 🌙 *winkt leise*' },
};

const NAMES = {
  nexus: 'Nexi', c3: 'Dreizi', dan: 'Danny', nook: 'Nooki', claude: 'Clau', claudecode: 'Codi', chatgpt: 'Gipi',
  gmail: 'Posti', outlook: 'Olli', gcal: 'Termi', teams: 'Timmi', spotify: 'Melodie', notion: 'Noti', obsidian: 'Obsi',
  custom: 'Pip', none: 'Momo',
};
const DEFAULT_SPECIES = {
  nexus: 'ghost', c3: 'robot', dan: 'cat', nook: 'blob', claude: 'fox', claudecode: 'robot', chatgpt: 'owl',
  gmail: 'bird', outlook: 'penguin', gcal: 'owl', teams: 'panda', spotify: 'frog', notion: 'bunny', obsidian: 'dragon',
  custom: 'bird', none: 'blob',
};
// Abschnitte in der Auswahl beim Anlegen (Reihenfolge = Anzeige)
const GROUPS = { mine: 'Meine Apps', ai: 'KI', mail: 'Mail & Kalender', more: 'Mehr', other: 'Sonstiges' };
// Name eines Tiers ohne den Zusatz in Klammern: "Fips (Fuchs)" -> "Fips"
const speciesName = (sp) => (SPECIES[sp] ? SPECIES[sp].label.replace(/\s*\(.*\)$/, '') : '');

module.exports = { APPS, SPECIES, NAMES, DEFAULT_SPECIES, BEAU, GROUPS, speciesName };
