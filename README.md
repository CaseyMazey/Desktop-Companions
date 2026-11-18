<p align="center">
  <img src="build/icon.png" alt="Pets" width="96">
</p>

<h1 align="center">Pets</h1>

<p align="center"><strong>Kleine Begleiter für deinen Bildschirm – sie erinnern, gratulieren und plaudern miteinander.</strong><br>
<em>Immer da. Nie im Weg.</em></p>

<p align="center">
  <a href="https://github.com/CaseyMazey/Pets/releases/latest/download/Pets-Setup.exe"><img src="https://img.shields.io/badge/Windows-Download-8b7cf6?style=for-the-badge&logo=windows&logoColor=white" alt="Download für Windows"></a>
  <a href="#macos"><img src="https://img.shields.io/badge/macOS-Download-8b7cf6?style=for-the-badge&logo=apple&logoColor=white" alt="Download für macOS"></a>
  <a href="#linux"><img src="https://img.shields.io/badge/Linux-Download-8b7cf6?style=for-the-badge&logo=linux&logoColor=white" alt="Download für Linux"></a>
</p>

<p align="center">
  <a href="https://github.com/CaseyMazey/Pets/releases/latest"><img src="https://img.shields.io/github/v/release/CaseyMazey/Pets?label=Version&color=f4a261" alt="Neueste Version"></a>
  <img src="https://img.shields.io/badge/System-Windows%20%7C%20macOS%20%7C%20Linux-0078d4" alt="Windows, macOS und Linux">
  <img src="https://img.shields.io/badge/Sprache-Deutsch-555" alt="Deutsch">
  <img src="https://img.shields.io/badge/passt%20zu-NEXUS%20%7C%20DAN%20%7C%20Nook-7dd3a8" alt="Passt zu NEXUS, DAN und Nook">
</p>

<p align="center">
  <img src="docs/screenshots/pets.png" alt="Vier Pets über der Taskleiste: ein Geist meldet einen fertigen Auftrag in NEXUS, eine Katze erinnert an DAN, ein Schleim sagt etwas Nettes, ein Vogel ist einfach da" width="900">
</p>

Du vergisst beim Arbeiten, deinen Ausbildungsnachweis zu schreiben, Wasser zu trinken oder nachzusehen, ob Claude schon fertig ist? **Pets sitzen unten auf deinem Bildschirm und sagen dir Bescheid.**

- 🐾 **Immer im Vordergrund, nie im Weg.** Klicks neben dem Pet gehen durch, ziehen kannst du es überallhin.
- 🔗 **Verbunden mit deiner App.** Ein Klick aufs Pet öffnet NEXUS, DAN, Nook oder jede andere App.
- 💬 **Mehrere Pets, die miteinander reden.** Stehen zwei nebeneinander, plaudern sie ab und zu.
- 🔒 **Ohne Konto, ohne Server.** Pets läuft komplett auf deinem Rechner.

## Installieren

Pets gibt es kostenlos für Windows, macOS und Linux, direkt hier von GitHub.

### Windows

1. **[Pets-Setup.exe herunterladen](https://github.com/CaseyMazey/Pets/releases/latest/download/Pets-Setup.exe)** (Windows 10/11).
2. Die Datei ausführen. Pets installiert sich für deinen Benutzer, ohne Admin-Rechte, mit Verknüpfung auf dem Desktop und im Startmenü, und startet gleich.
3. Erscheint „Der Computer wurde durch Windows geschützt“: auf **Weitere Informationen → Trotzdem ausführen** klicken. Die Meldung kommt, weil das Setup nicht signiert ist.

**Update:** Neue Version herunterladen und ausführen, deine Pets bleiben erhalten.

### macOS

1. Herunterladen, passend zu deinem Mac (Apfel-Menü → Über diesen Mac):
   - **[Apple Silicon (M1, M2, M3 …)](https://github.com/CaseyMazey/Pets/releases/latest/download/Pets-mac-arm64.dmg)**
   - **[Intel](https://github.com/CaseyMazey/Pets/releases/latest/download/Pets-mac-x64.dmg)**
2. Die `.dmg` öffnen und **Pets in den Ordner „Programme“ ziehen**.
3. **Beim ersten Öffnen** blockiert macOS die App, weil sie nicht über ein kostenpflichtiges Apple-Entwicklerkonto signiert ist:
   - **Rechtsklick** auf Pets → **Öffnen** → **Öffnen**.
   - Klappt das nicht (macOS 15 und neuer): **Systemeinstellungen → Datenschutz & Sicherheit**, nach unten scrollen, bei Pets auf **„Dennoch öffnen“** klicken.
   - Meldet macOS, die App sei **„beschädigt“**: Terminal öffnen und `xattr -dr com.apple.quarantine /Applications/Pets.app` eingeben.

Pets erscheint unter macOS nicht im Dock, sondern als Symbol in der Menüleiste.

### Linux

- **Debian, Ubuntu, Mint …:** **[Pets-linux-amd64.deb](https://github.com/CaseyMazey/Pets/releases/latest/download/Pets-linux-amd64.deb)** herunterladen und installieren:
  ```bash
  sudo apt install ./Pets-linux-amd64.deb
  ```
- **Alle anderen (Fedora, Arch …):** **[Pets-linux-x86_64.AppImage](https://github.com/CaseyMazey/Pets/releases/latest/download/Pets-linux-x86_64.AppImage)** herunterladen, ausführbar machen und starten:
  ```bash
  chmod +x Pets-linux-x86_64.AppImage && ./Pets-linux-x86_64.AppImage
  ```

Unter Linux gehen Klicks direkt neben dem Pet nicht zum Fenster dahinter durch (das unterstützt Linux für durchsichtige Fenster nicht).

## So benutzt du Pets

| Aktion | Was passiert |
|---|---|
| **Klick aufs Pet** | öffnet die verbundene App |
| **Klick auf die Sprechblase** | öffnet die App (z. B. DAN, um gleich aufzuschreiben) |
| **Ziehen** | verschiebt das Pet; auf einem anderen abgesetzt, rutscht es zur Seite |
| **Rechtsklick** | Menü: Sag was, Schlafen legen, Herumlaufen, Einstellungen, Entfernen |
| **Tray-Symbol** | neues Pet, Einstellungen, Pets verstecken, Beenden |

Beim ersten Start legt Pets für jede gefundene App (NEXUS, DAN, Nook) ein eigenes Pet an.

## Voreinstellungen

| Verbunden mit | Was das Pet macht |
|---|---|
| **NEXUS** | meldet, wenn ein Auftrag in 3C fertig ist, schiefging oder Claude eine Entscheidung braucht |
| **DAN** | erinnert Mo–Fr stündlich (7:30–16:30) daran aufzuschreiben, was du gerade machst; um 15:45 die Feierabend-Erinnerung |
| **Nook** | sagt alle 45 Minuten etwas Nettes oder erinnert an Pausen und Wasser; um 12:30 Mittagspause |
| **Eigene App** | öffnet ein beliebiges Programm, eine Datei oder eine `https://`-Adresse |

Alles lässt sich pro Pet in den Einstellungen ändern: Tier (Geist, Katze, Schleim, Vogel), Farbe, Größe, Sprüche, Abstand, Uhrzeiten und ob es herumläuft.

## Für Entwickler

```bash
npm install
npm start
```

- `npm test` prüft die Logik (Erinnerungen, Platz, Nachbarn, Gespräche, Schnittstelle).
- `npm run smoke` startet die App mit Test-Pets in einem eigenen Datenordner, fotografiert sie und beendet sich.
- `npx electron scripts/screenshot.js` erzeugt das Bild oben neu.
- **Neue Version:** Version in `package.json` erhöhen, committen, dann `git tag v<version> && git push --tags`. GitHub baut die Installer für alle drei Systeme und legt das Release an.

### Schnittstelle für andere Apps

Pets lauscht auf `http://127.0.0.1:47811` (nur dieser Rechner). Jede App kann ihrem Pet etwas sagen lassen:

```
POST /event
Content-Type: application/json

{ "app": "dan", "type": "say", "text": "Wochenbericht ist fertig!" }
```

`type`: `say` (mit `text`), `task-done`, `task-error`, `decision` (optional `project`).
Es reagieren alle Pets, die mit dieser App verbunden sind (oder mit `"pet": "<id>"` genau eins).
NEXUS schickt fertige 3C-Aufträge und Rückfragen von selbst.
