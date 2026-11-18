// README-Bild neu erzeugen: npx electron scripts/screenshot.js  ->  docs/screenshots/pets.png
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1100, height: 360, show: false, useContentSize: true, webPreferences: { sandbox: true } });
  await win.loadFile(path.join(__dirname, 'showcase.html'));
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage();
  const out = path.join(__dirname, '..', 'docs', 'screenshots', 'pets.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.toPNG());
  console.log('gespeichert:', out);
  app.exit(0);
});
