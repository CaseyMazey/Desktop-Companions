// Claude Code Bescheid sagen lassen: ein Hook in ~/.claude/settings.json schickt bei "Stop" (fertig) und
// "Notification" (braucht dich) die Daten des Hooks an die lokale Schnittstelle. Ein einziger Befehl fuer beide:
// Claude Code gibt die Hook-Daten (Ereignis, Ordner, Nachricht) per stdin, curl reicht sie unveraendert weiter.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const MARK = '/hook/claude-code';
const settingsFile = (home = os.homedir()) => path.join(home, '.claude', 'settings.json');
const hookCommand = (port) => `curl -s -m 2 -X POST http://127.0.0.1:${port}${MARK} -H "Content-Type: application/json" --data-binary @-`;
const entry = (port) => ({ hooks: [{ type: 'command', command: hookCommand(port) }] });

// Unser Hook (auch aelter: /event mit "app":"claude-code")?
const ours = (h) => h && typeof h.command === 'string' && (h.command.includes(MARK) || h.command.includes('"app":"claude-code"') || h.command.includes('\\"app\\":\\"claude-code\\"'));

// Nur der Teil zum Kopieren (falls man es lieber selbst eintraegt)
const hookJson = (port) => JSON.stringify({ hooks: { Stop: [entry(port)], Notification: [entry(port)] } }, null, 2);

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (!text.trim()) return {};
  const data = JSON.parse(text); // kaputtes JSON: Fehler nach oben geben, nichts ueberschreiben
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings.json ist kein JSON-Objekt');
  return data;
}

function hasHook(file, port) {
  try {
    const s = readSettings(file);
    return ['Stop', 'Notification'].every((ev) => (s.hooks?.[ev] || []).some((m) => (m.hooks || []).some((h) => h.command === hookCommand(port))));
  } catch { return false; }
}

// Eintragen: eigene alte Eintraege ersetzen, alles andere (fremde Hooks, Einstellungen) bleibt, vorher Sicherung
function installHook(file, port) {
  const s = readSettings(file);
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  s.hooks = s.hooks && typeof s.hooks === 'object' && !Array.isArray(s.hooks) ? s.hooks : {};
  for (const ev of ['Stop', 'Notification']) {
    const list = (Array.isArray(s.hooks[ev]) ? s.hooks[ev] : [])
      .map((m) => ({ ...m, hooks: (m.hooks || []).filter((h) => !ours(h)) }))
      .filter((m) => m.hooks.length);
    list.push(entry(port));
    s.hooks[ev] = list;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
  return true;
}

// Hook-Daten von Claude Code -> Meldung fuer die Pets (null = nicht melden)
function eventFromHook(h) {
  if (!h || typeof h !== 'object') return null;
  const project = typeof h.cwd === 'string' ? path.basename(h.cwd.replace(/[\\/]+$/, '')).slice(0, 80) : '';
  if (h.hook_event_name === 'Stop') return { app: 'claude-code', type: 'task-done', project };
  if (h.hook_event_name === 'Notification') {
    const msg = typeof h.message === 'string' ? h.message : '';
    if (/waiting for your input/i.test(msg)) return null; // kommt kurz nach "fertig" – doppelt
    const tool = (msg.match(/permission to use (.+)$/i) || [])[1] || '';
    return { app: 'claude-code', type: 'decision', project, tool: tool.slice(0, 60) };
  }
  return null;
}

module.exports = { settingsFile, hookCommand, hookJson, hasHook, installHook, eventFromHook, MARK };
