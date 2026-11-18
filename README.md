# 🐾 Pets

Kleine Bildschirm-Begleiter, die immer im Vordergrund bleiben, frei verschiebbar sind und sich mit einer App verbinden lassen.

- **Klick aufs Pet** öffnet die verbundene App. **Ziehen** verschiebt es. **Rechtsklick** öffnet das Pet-Menü.
- **Mehrere Pets** gleichzeitig. Stehen zwei nebeneinander, plaudern sie ab und zu miteinander.
- **Tray-Symbol** (unten rechts): neues Pet, Einstellungen, Pets verstecken, Beenden.

## Voreinstellungen

| Verbunden mit | Was das Pet macht |
|---|---|
| **NEXUS** | meldet, wenn ein Auftrag in 3C fertig ist, schiefging oder Claude eine Entscheidung braucht |
| **DAN** | erinnert Mo–Fr stündlich (7:30–16:30), aufzuschreiben, was du gerade machst; 15:45 Feierabend-Erinnerung |
| **Nook** | sagt alle 45 Minuten eine Affirmation oder Pausen-Erinnerung; 12:30 Mittagspause |
| **Eigene App** | öffnet ein beliebiges Programm, eine Datei oder eine `https://`-Adresse |

Alles davon lässt sich pro Pet in den Einstellungen ändern (Sprüche, Abstand, Uhrzeiten, Aussehen, Größe).

## Starten

```
npm install
npm start
```

`npm test` prüft die Logik (Erinnerungen, Nachbarn, Gespräche, Schnittstelle).
`npm run smoke` startet die App mit Test-Pets in einem eigenen Datenordner, fotografiert sie und beendet sich.

## Schnittstelle für andere Apps

Pets lauscht auf `http://127.0.0.1:47811` (nur dieser Rechner). Jede App kann ihrem Pet etwas sagen lassen:

```
POST /event
Content-Type: application/json

{ "app": "dan", "type": "say", "text": "Wochenbericht ist fertig!" }
```

`type`: `say` (mit `text`), `task-done`, `task-error`, `decision` (optional `project`).
Es reagieren alle Pets, die mit dieser App verbunden sind (oder mit `"pet": "<id>"` genau eins).
NEXUS schickt das seit `src/main/pets.js` von selbst.
