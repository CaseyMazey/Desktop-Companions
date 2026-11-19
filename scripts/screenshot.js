// README-Bilder neu erzeugen: npx electron scripts/screenshot.js
//   docs/screenshots/pets.png      Szene ueber der Taskleiste (showcase.html)
//   docs/screenshots/all-pets.png  alle Pets mit Name, Tier und Talent (allpets.html)
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

async function shoot(page, file, width, height) {
  const win = new BrowserWindow({ width, height, show: false, useContentSize: true, webPreferences: { sandbox: true } });
  await win.loadFile(path.join(__dirname, page));
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage();
  const out = path.join(__dirname, '..', 'docs', 'screenshots', file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.toPNG());
  console.log('gespeichert:', out);
  win.destroy();
}

app.on('window-all-closed', () => { /* zwischen den Bildern nicht beenden */ });
app.whenReady().then(async () => {
  await shoot('showcase.html', 'pets.png', 1100, 360);
  await shoot('allpets.html', 'all-pets.png', 1000, 680);
  app.exit(0);
});
