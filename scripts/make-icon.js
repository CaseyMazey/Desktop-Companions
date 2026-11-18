// App-Icon aus scripts/icon.svg erzeugen: npx electron scripts/make-icon.js
//   build/icon.png (512 px, fuer die Installer) und src/assets/icon.png (256 px, Fenster und Tray)
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadURL('data:text/html,<canvas></canvas>');
  for (const [size, out] of [[512, '../build/icon.png'], [256, '../src/assets/icon.png']]) {
    const url = await win.webContents.executeJavaScript(`new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => { const c = document.querySelector('canvas'); c.width = c.height = ${size};
        const g = c.getContext('2d'); g.clearRect(0, 0, ${size}, ${size}); g.drawImage(img, 0, 0, ${size}, ${size}); ok(c.toDataURL('image/png')); };
      img.onerror = () => fail(new Error('SVG laesst sich nicht laden'));
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
    })`);
    const file = path.join(__dirname, out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('gespeichert:', file);
  }
  app.exit(0);
});
