const test = require('node:test');
const assert = require('node:assert');
const { parseRect, SCRIPT } = require('../src/watch-win');

test('Buhs Waechter: Vollbild-Monitor lesen, maximierte Fenster zaehlen nicht', () => {
  assert.equal(parseRect(''), null);
  assert.equal(parseRect(false), null);
  assert.deepEqual(parseRect('-1920,-34,0,1046,Chrome_WidgetWin_1'), { x: -1920, y: -34, w: 1920, h: 1080, cls: 'Chrome_WidgetWin_1' });
  assert.equal(parseRect('5,5,5,5'), null, 'leeres Rechteck');
  // Monitore ohne Taskleiste: ein maximiertes Fenster fuellt den ganzen Bildschirm und darf nicht als Vollbild gelten
  assert.match(SCRIPT, /IsZoomed\(h\)\) return ""/);
});
