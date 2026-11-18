// Die Pets als SVG (eigene Entwuerfe). Alle teilen dieselben Teile, damit die Animationen ueberall greifen:
// .body (Koerperfarbe), .eyes (Blinzeln), .mouth-* (je nach Stimmung), .cheek, .limb (Arme/Fluegel/Schwanz).
/* global window */
(function () {
  const eyes = (lx, rx, y) => `
    <g class="eyes">
      <g class="eye"><ellipse cx="${lx}" cy="${y}" rx="5.5" ry="7.5" fill="#1e293b"/><circle cx="${lx - 1.8}" cy="${y - 2.8}" r="2" fill="#fff"/></g>
      <g class="eye"><ellipse cx="${rx}" cy="${y}" rx="5.5" ry="7.5" fill="#1e293b"/><circle cx="${rx - 1.8}" cy="${y - 2.8}" r="2" fill="#fff"/></g>
    </g>
    <g class="eyes-closed"><path d="M${lx - 6} ${y} q6 5 12 0 M${rx - 6} ${y} q6 5 12 0" stroke="#1e293b" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>
    <g class="eyes-happy"><path d="M${lx - 6} ${y + 2} q6 -8 12 0 M${rx - 6} ${y + 2} q6 -8 12 0" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/></g>`;
  const mouth = (x, y) => `
    <path class="mouth mouth-idle" d="M${x - 5} ${y} q5 5 10 0" stroke="#1e293b" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth mouth-talk" cx="${x}" cy="${y + 1.5}" rx="4.5" ry="4" fill="#7f1d1d"/>
    <path class="mouth mouth-happy" d="M${x - 7} ${y - 1} q7 10 14 0 z" fill="#7f1d1d" stroke="#1e293b" stroke-width="2" stroke-linejoin="round"/>
    <path class="mouth mouth-sad" d="M${x - 5} ${y + 3} q5 -5 10 0" stroke="#1e293b" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth mouth-alert" cx="${x}" cy="${y + 1}" rx="3" ry="3.6" fill="#1e293b"/>`;
  const cheeks = (lx, rx, y) => `<ellipse class="cheek" cx="${lx}" cy="${y}" rx="6" ry="3.5"/><ellipse class="cheek" cx="${rx}" cy="${y}" rx="6" ry="3.5"/>`;

  const SPECIES = {
    blob: () => `
      <path class="body" d="M14 108 C10 66 30 30 60 30 C90 30 110 66 106 108 Q60 116 14 108 Z"/>
      <path class="shine" d="M36 48 q8 -10 20 -10" stroke="#fff" stroke-opacity=".55" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path class="body limb limb-l" d="M18 86 q-12 4 -10 14 q8 2 14 -6 z"/>
      <path class="body limb limb-r" d="M102 86 q12 4 10 14 q-8 2 -14 -6 z"/>
      ${eyes(46, 74, 68)}${cheeks(34, 86, 80)}${mouth(60, 82)}`,
    cat: () => `
      <path class="body limb tail" d="M96 96 q22 -6 18 -34 q-2 -8 -8 -4 q4 22 -14 30 z"/>
      <path class="body" d="M24 46 L22 18 L44 34 Q60 28 76 34 L98 18 L96 46 Q108 66 102 92 Q96 110 60 110 Q24 110 18 92 Q12 66 24 46 Z"/>
      <path d="M27 24 L28 40 L39 33 Z M93 24 L92 40 L81 33 Z" fill="#f9a8d4" opacity=".8"/>
      <path class="stripe" d="M52 32 l2 8 M60 30 v9 M68 32 l-2 8" stroke-width="3" stroke-linecap="round" fill="none"/>
      <g class="whiskers" stroke="#1e293b" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round">
        <path d="M22 72 h-12 M22 77 l-11 4 M98 72 h12 M98 77 l11 4"/>
      </g>
      <ellipse class="belly" cx="60" cy="96" rx="22" ry="12" fill="#fff" fill-opacity=".45"/>
      ${eyes(46, 74, 62)}${cheeks(33, 87, 74)}
      <path d="M57 69 h6 l-3 3 z" fill="#f472b6"/>${mouth(60, 76)}`,
    ghost: () => `
      <path class="body" d="M20 104 L20 60 C20 34 38 18 60 18 C82 18 100 34 100 60 L100 104 Q92 96 85 104 Q78 112 72 104 Q66 96 60 104 Q54 112 48 104 Q42 96 35 104 Q28 112 20 104 Z"/>
      <path class="shine" d="M34 44 q6 -12 18 -14" stroke="#fff" stroke-opacity=".6" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path class="body limb limb-l" d="M22 70 q-14 2 -14 12 q10 2 16 -4 z"/>
      <path class="body limb limb-r" d="M98 70 q14 2 14 12 q-10 2 -16 -4 z"/>
      ${eyes(47, 73, 58)}${cheeks(35, 85, 70)}${mouth(60, 72)}`,
    bird: () => `
      <path class="body limb tail" d="M22 92 l-14 6 l4 -12 z"/>
      <path class="body" d="M60 26 C88 26 104 50 102 78 C100 100 84 110 60 110 C36 110 18 100 18 78 C16 50 32 26 60 26 Z"/>
      <path class="body" d="M52 28 q4 -14 10 -12 q-2 6 2 10 z"/>
      <ellipse class="belly" cx="60" cy="88" rx="26" ry="18" fill="#fff" fill-opacity=".5"/>
      <path class="body limb wing-l" d="M22 70 q-16 10 -8 28 q14 -4 16 -18 z"/>
      <path class="body limb wing-r" d="M98 70 q16 10 8 28 q-14 -4 -16 -18 z"/>
      <path d="M86 104 v6 M92 104 v6 M34 104 v6 M28 104 v6" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      ${eyes(46, 74, 58)}${cheeks(33, 87, 70)}
      <path class="beak" d="M53 68 L67 68 L60 78 Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/>
      <g class="beak-open"><path d="M53 68 L67 68 L60 74 Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/><path d="M55 76 L65 76 L60 81 Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/></g>`,
  };

  // ---------- Beau: kleiner schwarzer Kater mit Hexenhut (Nook-Beau-Theme) ----------
  // Gleicher Stil wie alle Pets (runde Formen, 2.5er Linie, Baeckchen). Regeln aus MIND: Hut (orange-golden,
  // geschwungene Spitze, schwarzes Band, goldene Schnalle) ist IMMER auf; genau 4 Beine und 2 Ohren.
  const INK = '#e9e2f3';       // helle Linien fuer Mund und Schnurrhaare auf schwarzem Fell
  const GOLD = '#f6b91d';
  const beauEyes = (lx, rx, y) => `
    <g class="eyes">
      <g class="eye"><ellipse cx="${lx}" cy="${y}" rx="6.5" ry="8" fill="${GOLD}" stroke="#a86f08" stroke-width="1.5"/><ellipse cx="${lx + 0.5}" cy="${y + 0.5}" rx="2.6" ry="5.6" fill="#140f1a"/><circle cx="${lx - 2.2}" cy="${y - 3}" r="2" fill="#fff"/></g>
      <g class="eye"><ellipse cx="${rx}" cy="${y}" rx="6.5" ry="8" fill="${GOLD}" stroke="#a86f08" stroke-width="1.5"/><ellipse cx="${rx + 0.5}" cy="${y + 0.5}" rx="2.6" ry="5.6" fill="#140f1a"/><circle cx="${rx - 2.2}" cy="${y - 3}" r="2" fill="#fff"/></g>
    </g>
    <g class="eyes-closed"><path d="M${lx - 6} ${y} q6 5 12 0 M${rx - 6} ${y} q6 5 12 0" stroke="${GOLD}" stroke-width="2.8" fill="none" stroke-linecap="round"/></g>
    <g class="eyes-happy"><path d="M${lx - 6} ${y + 2} q6 -8 12 0 M${rx - 6} ${y + 2} q6 -8 12 0" stroke="${GOLD}" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
  const beauMouth = (x, y) => `
    <path class="mouth mouth-idle" d="M${x - 5} ${y} q2.5 3 5 0 q2.5 3 5 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth mouth-talk" cx="${x}" cy="${y + 1.5}" rx="4.5" ry="4" fill="#9b2c3a"/>
    <path class="mouth mouth-happy" d="M${x - 7} ${y - 1} q7 10 14 0 z" fill="#9b2c3a" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path class="mouth mouth-sad" d="M${x - 5} ${y + 3} q5 -5 10 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth mouth-alert" cx="${x}" cy="${y + 1}" rx="3" ry="3.6" fill="#9b2c3a"/>`;

  SPECIES.beau = () => `
      <path class="fur limb tail" d="M30 100 q-22 0 -20 -24 q2 -12 10 -10 q4 2 0 6 q-5 4 -2 14 q3 8 14 6 z"/>
      <path class="fur" d="M30 80 Q22 98 32 106 Q42 112 60 112 Q78 112 88 106 Q98 98 90 80 Z"/>
      <ellipse class="belly" cx="60" cy="98" rx="16" ry="9" fill="#fff" fill-opacity=".08"/>
      <ellipse class="fur" cx="46" cy="108" rx="9" ry="5.5"/>
      <g class="paw-r"><ellipse class="fur" cx="74" cy="108" rx="9" ry="5.5"/></g>
      <path class="fur" d="M22 54 L24 30 L42 44 Z"/>
      <path class="fur" d="M98 54 L96 30 L78 44 Z"/>
      <path d="M27 36 L28 47 L36 42 Z M93 36 L92 47 L84 42 Z" fill="#f9a8d4" opacity=".85"/>
      <ellipse class="fur" cx="60" cy="68" rx="37" ry="27"/>
      <g class="whiskers" stroke="${INK}" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round">
        <path d="M24 74 h-14 M24 79 l-13 4 M96 74 h14 M96 79 l13 4"/>
      </g>
      ${beauEyes(46, 74, 68)}${cheeks(32, 88, 80)}
      <path d="M57 76 h6 l-3 3.5 z" fill="#f472b6"/>${beauMouth(60, 82)}
      <g class="hat">
        <ellipse cx="59" cy="47" rx="48" ry="9.5" fill="#eb9a2f" stroke="#a8611c" stroke-width="2.5"/>
        <path d="M16 46 q10 -5 24 -6" stroke="#ffd27a" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
        <path d="M37 46 C41 33 47 22 52 15 C55 10 53 5 47 6 C42 7 41 13 45 14 C48 15 50 12 49 10 C55 9 60 14 64 20 C71 30 78 38 82 46 Q60 52 37 46 Z"
          fill="#eb9a2f" stroke="#a8611c" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M45 36 q4 -10 9 -17" stroke="#ffd27a" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
        <path d="M39.5 39 Q60 45 79.5 39 L82.5 46 Q60 52 36.8 46 Z" fill="#1b1622"/>
        <rect x="53" y="39.5" width="13" height="9.5" rx="2.2" fill="none" stroke="#f4c64f" stroke-width="2.6"/>
      </g>
      <g class="wave">
        <path class="fur" d="M84 92 Q92 80 98 66 L108 70 Q102 86 92 98 Z"/>
        <ellipse class="fur" cx="103" cy="63" rx="8" ry="7"/>
        <ellipse cx="103" cy="65" rx="3.2" ry="2.4" fill="#f9a8d4"/>
        <circle cx="99" cy="60" r="1.6" fill="#f9a8d4"/><circle cx="103" cy="58.5" r="1.6" fill="#f9a8d4"/><circle cx="107" cy="60" r="1.6" fill="#f9a8d4"/>
      </g>`;

  window.renderSpecies = (species) => `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="sp-${species}">${(SPECIES[species] || SPECIES.blob)()}</svg>`;
})();
