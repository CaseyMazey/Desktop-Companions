// Voreinstellungen je verbundener App. Alles hier ist nur ein Startwert: in den Einstellungen laesst sich
// jedes Pet frei anpassen (Pfad, Sprueche, Abstand, Uhrzeiten).
const path = require('node:path');
const os = require('node:os');

const programs = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs');

const APPS = {
  nexus: {
    label: 'NEXUS',
    target: () => path.join(programs(), 'nexus', 'NEXUS.exe'),
    hint: 'Meldet sich, wenn ein Auftrag in 3C fertig ist oder Claude eine Entscheidung braucht.',
    reminders: { enabled: false, intervalMin: 90, onlyWorkdays: false, from: '08:00', to: '20:00', messages: ['Brauchst du Hilfe? NEXUS ist nur einen Klick entfernt.'], timed: [] },
    events: true,
  },
  dan: {
    label: 'DAN',
    target: () => path.join(programs(), 'dan-app', 'DAN.exe'),
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
    target: () => path.join(programs(), 'nook-desktop', 'Nook.exe'),
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
  custom: {
    label: 'Eigene App',
    target: () => '',
    hint: 'Öffnet eine beliebige Datei, ein Programm oder eine Webseite.',
    reminders: { enabled: false, intervalMin: 60, onlyWorkdays: false, from: '08:00', to: '20:00', messages: ['Hallo! 👋'], timed: [] },
    events: true,
  },
  none: {
    label: 'Keine',
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
};

const NAMES = { nexus: 'Nexi', dan: 'Danny', nook: 'Nooki', custom: 'Pip', none: 'Momo' };
const DEFAULT_SPECIES = { nexus: 'ghost', dan: 'cat', nook: 'blob', custom: 'bird', none: 'blob' };

module.exports = { APPS, SPECIES, NAMES, DEFAULT_SPECIES };
