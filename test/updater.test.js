// Automatische Updates: wo Desktop Companions sich selbst installieren darf, und dass im Quellcode nichts passiert.
const test = require('node:test');
const assert = require('node:assert');
const { Updater, canSelfInstall } = require('../src/updater');

test('Selbst installieren nur unter Windows und mit AppImage', () => {
  assert.equal(canSelfInstall('win32', {}), true);
  assert.equal(canSelfInstall('linux', { APPIMAGE: '/x/DC.AppImage' }), true);
  assert.equal(canSelfInstall('linux', {}), false); // .deb
  assert.equal(canSelfInstall('darwin', {}), false); // Mac ohne Apple-Signatur
});

test('Ausgeschaltet: kein Pruefen, kein Installieren', async () => {
  const opened = [];
  const u = new Updater({ enabled: false, releasesUrl: 'https://example.invalid', openUrl: (x) => opened.push(x) });
  u.start();
  assert.equal(u.state.status, 'off');
  assert.equal((await u.check(true)).status, 'off');
  u.install();
  assert.deepEqual(opened, []);
});

test('Nur Hinweis (Mac/.deb): Installieren oeffnet die Download-Seite', () => {
  const opened = [];
  const states = [];
  const u = new Updater({ enabled: true, releasesUrl: 'https://github.com/CaseyMazey/Desktop-Companions/releases/latest', openUrl: (x) => opened.push(x), onState: (s) => states.push(s.status) });
  u.set({ status: 'available', version: '9.9.9' });
  u.install();
  assert.deepEqual(opened, ['https://github.com/CaseyMazey/Desktop-Companions/releases/latest']);
  assert.deepEqual(states, ['available']);
});

