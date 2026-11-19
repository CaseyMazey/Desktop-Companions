// Streicheln erkennen: die Maus faehrt (ohne Taste) ueber dem Pet hin und her.
// Ein "Strich" zaehlt, wenn die Maus mindestens MIN_PX in eine Richtung lief und dann umkehrt.
// Ab STROKES Strichen innerhalb von WINDOW_MS wird gestreichelt; nach IDLE_MS ohne Bewegung ist Schluss.
// Laeuft im Pet-Fenster (window.Stroke) und in den Tests (require).
(function (root) {
  const MIN_PX = 8;
  const STROKES = 3;
  const WINDOW_MS = 1600;
  const IDLE_MS = 700;

  function createStroke() {
    let lastX = null;
    let dir = 0;
    let run = 0;           // Weg in der aktuellen Richtung
    let flips = [];        // Zeitpunkte der Umkehrungen
    let lastMove = 0;
    let active = false;

    // x: Mausposition, t: Zeit in ms. Gibt true zurueck, solange gestreichelt wird.
    function move(x, t) {
      if (lastX === null) { lastX = x; lastMove = t; return active; }
      const dx = x - lastX;
      lastX = x;
      if (!dx) return active;
      lastMove = t;
      const d = Math.sign(dx);
      if (d === dir) run += Math.abs(dx);
      else {
        if (dir && run >= MIN_PX) flips.push(t);
        dir = d;
        run = Math.abs(dx);
      }
      flips = flips.filter((f) => t - f <= WINDOW_MS);
      if (!active && flips.length >= STROKES) active = true;
      return active;
    }
    // regelmaessig aufrufen: endet das Streicheln, weil die Maus stillsteht?
    function tick(t) {
      if (active && t - lastMove > IDLE_MS) { reset(); return false; }
      return active;
    }
    function reset() { lastX = null; dir = 0; run = 0; flips = []; active = false; }
    return { move, tick, reset, get active() { return active; } };
  }

  const api = { createStroke, MIN_PX, STROKES, WINDOW_MS, IDLE_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Stroke = api;
})(typeof window !== 'undefined' ? window : globalThis);
