// Die Pets als SVG (eigene Entwuerfe). Alle teilen dieselben Teile, damit die Animationen ueberall greifen:
// .body (Koerperfarbe), .eyes (Blinzeln), .mouth-* (je nach Stimmung), .cheek, .limb (Arme/Fluegel/Schwanz).
/* global window */
(function () {
  // gx: Seite des Glanzpunkts (-1 links, +1 rechts) – bestimmt, wohin das Pet zu schauen scheint
  // ink: Farbe der geschlossenen/gluecklichen Augen (Panda: hell, weil die Augen auf dunklen Flecken sitzen)
  const eyes = (lx, rx, y, gx = -1, ink = '#1e293b') => `
    <g class="eyes">
      <g class="eye"><ellipse cx="${lx}" cy="${y}" rx="5.5" ry="7.5" fill="#1e293b"/><circle cx="${lx + gx * 1.8}" cy="${y - 2.8}" r="2" fill="#fff"/></g>
      <g class="eye"><ellipse cx="${rx}" cy="${y}" rx="5.5" ry="7.5" fill="#1e293b"/><circle cx="${rx + gx * 1.8}" cy="${y - 2.8}" r="2" fill="#fff"/></g>
    </g>
    <g class="eyes-closed"><path d="M${lx - 6} ${y} q6 5 12 0 M${rx - 6} ${y} q6 5 12 0" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>
    <g class="eyes-happy"><path d="M${lx - 6} ${y + 2} q6 -8 12 0 M${rx - 6} ${y + 2} q6 -8 12 0" stroke="${ink}" stroke-width="2.8" fill="none" stroke-linecap="round"/></g>`;
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
      ${eyes(46, 74, 68)}${cheeks(34, 86, 80)}${mouth(60, 82)}
      <g class="minis"><path class="body mini-l" d="M2 110 C1 98 6 90 13 90 C20 90 25 98 24 110 Q13 113 2 110 Z"/><path class="body mini-r" d="M96 110 C95 98 100 90 107 90 C114 90 119 98 118 110 Q107 113 96 110 Z"/>
        <circle cx="10" cy="100" r="1.6" fill="#1e293b"/><circle cx="16" cy="100" r="1.6" fill="#1e293b"/><circle cx="104" cy="100" r="1.6" fill="#1e293b"/><circle cx="110" cy="100" r="1.6" fill="#1e293b"/></g>`,
    cat: () => `
      <path class="body limb tail" d="M96 96 q22 -6 18 -34 q-2 -8 -8 -4 q4 22 -14 30 z"/>
      <path class="body" d="M24 46 L22 18 L44 34 Q60 28 76 34 L98 18 L96 46 Q108 66 102 92 Q96 110 60 110 Q24 110 18 92 Q12 66 24 46 Z"/>
      <path d="M27 24 L28 40 L39 33 Z M93 24 L92 40 L81 33 Z" fill="#f9a8d4" opacity=".8"/>
      <path class="stripe" d="M52 32 l2 8 M60 30 v9 M68 32 l-2 8" stroke-width="3" stroke-linecap="round" fill="none"/>
      <g class="whiskers" stroke="#1e293b" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round">
        <path d="M22 72 h-12 M22 77 l-11 4 M98 72 h12 M98 77 l11 4"/>
      </g>
      <ellipse class="belly" cx="60" cy="96" rx="22" ry="12" fill="#fff" fill-opacity=".45"/>
      ${eyes(46, 74, 62, 1)}${cheeks(33, 87, 74)}
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
      <g class="eye"><ellipse cx="${lx}" cy="${y}" rx="6.5" ry="8" fill="${GOLD}" stroke="#a86f08" stroke-width="1.5"/><g class="pupil"><ellipse cx="${lx + 0.5}" cy="${y + 0.5}" rx="2.6" ry="5.6" fill="#140f1a"/><circle cx="${lx - 2.2}" cy="${y - 3}" r="2" fill="#fff"/></g></g>
      <g class="eye"><ellipse cx="${rx}" cy="${y}" rx="6.5" ry="8" fill="${GOLD}" stroke="#a86f08" stroke-width="1.5"/><g class="pupil"><ellipse cx="${rx + 0.5}" cy="${y + 0.5}" rx="2.6" ry="5.6" fill="#140f1a"/><circle cx="${rx - 2.2}" cy="${y - 3}" r="2" fill="#fff"/></g></g>
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

  // ---------- Weitere Pets (Liste aus MIND, 2026-11) ----------
  // Gleicher Stil: runde Formen, 2.5er Linie, Baeckchen. .body = waehlbare Farbe, .dark = dunklere Toenung davon.
  const beak = (x, y) => `
      <path class="beak" d="M${x - 6} ${y} L${x + 6} ${y} L${x} ${y + 8} Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/>
      <g class="beak-open"><path d="M${x - 6} ${y} L${x + 6} ${y} L${x} ${y + 5} Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/><path d="M${x - 4} ${y + 7} L${x + 4} ${y + 7} L${x} ${y + 11} Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/></g>`;
  // Breites Laecheln als einziger Mund (Frosch, Axolotl): klar erkennbar, die anderen Stimmungen wie bei mouth()
  const wideMouth = (x, y, w) => `
    <path class="mouth mouth-idle" d="M${x - w} ${y} q${w} ${w * 0.55} ${w * 2} 0" stroke="#1e293b" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth mouth-talk" cx="${x}" cy="${y + 2}" rx="${w * 0.45}" ry="4.5" fill="#7f1d1d"/>
    <path class="mouth mouth-happy" d="M${x - w} ${y - 1} q${w} ${w * 0.9} ${w * 2} 0 z" fill="#7f1d1d" stroke="#1e293b" stroke-width="2" stroke-linejoin="round"/>
    <path class="mouth mouth-sad" d="M${x - w * 0.6} ${y + 4} q${w * 0.6} -6 ${w * 1.2} 0" stroke="#1e293b" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth mouth-alert" cx="${x}" cy="${y + 1.5}" rx="3.5" ry="4.2" fill="#1e293b"/>`;
  const roundBody = (top) => `<path class="body" d="M60 ${top} C88 ${top} 104 ${top + 20} 102 ${top + 46} C100 ${top + 68} 84 110 60 110 C36 110 20 ${top + 68} 18 ${top + 46} C16 ${top + 20} 32 ${top} 60 ${top} Z"/>`;

  Object.assign(SPECIES, {
    // Fuchs: grosse spitze Ohren mit dunklen Spitzen, weisses Gesicht, buschiger Schwanz mit weisser Spitze
    fox: () => `
      <g class="limb tail"><path class="body" d="M90 102 q30 -2 26 -34 q-2 -12 -11 -13 q5 20 -5 32 q-6 8 -14 9 z"/><path d="M105 55 q9 1 11 13 q-5 -4 -12 -5 z" fill="#fff"/></g>
      <path class="body" d="M27 50 L25 13 L52 36 Z"/><path class="body" d="M93 50 L95 13 L68 36 Z"/>
      <path class="dark" d="M25.6 24 L25 13 L35 21.5 Z M94.4 24 L95 13 L85 21.5 Z"/>
      <path d="M31 42 L30 26 L42 35 Z M89 42 L90 26 L78 35 Z" fill="#fff" opacity=".7"/>
      ${roundBody(32)}
      <path d="M22 70 Q40 64 60 82 Q80 64 98 70 Q98 98 60 106 Q22 98 22 70 Z" fill="#fff" opacity=".92"/>
      <ellipse class="dark" cx="45" cy="108" rx="8" ry="4.5"/><ellipse class="dark" cx="75" cy="108" rx="8" ry="4.5"/>
      ${eyes(45, 75, 62)}${cheeks(31, 89, 76)}
      <ellipse cx="60" cy="78" rx="4" ry="3" fill="#1e293b"/>${mouth(60, 85)}`,

    // Eule: Federohren, grosse helle Augenscheiben, Brust mit Federmuster, kleiner Schnabel
    owl: () => `
      <path class="body" d="M30 38 L22 14 L46 30 Z"/><path class="body" d="M90 38 L98 14 L74 30 Z"/>
      ${roundBody(22)}
      <path class="body limb wing-l" d="M22 62 q-12 16 -5 36 q13 -4 13 -24 z"/>
      <path class="body limb wing-r" d="M98 62 q12 16 5 36 q-13 -4 -13 -24 z"/>
      <ellipse class="belly" cx="60" cy="94" rx="24" ry="14" fill="#fff" fill-opacity=".45"/>
      <path class="stripe" d="M48 90 l3 3 l3 -3 M57 97 l3 3 l3 -3 M66 90 l3 3 l3 -3" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle class="disc" cx="44" cy="58" r="15"/><circle class="disc" cx="76" cy="58" r="15"/>
      ${eyes(44, 76, 58)}${cheeks(30, 90, 78)}${beak(60, 68)}
      <path d="M48 108 l-3 4 M53 108 v4 M67 108 v4 M72 108 l3 4" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>`,

    // Frosch: breit und flach, Augen oben auf Huegeln, grosser Mund
    frog: () => `
      <ellipse class="body" cx="24" cy="98" rx="13" ry="10"/><ellipse class="body" cx="96" cy="98" rx="13" ry="10"/>
      <circle class="body" cx="40" cy="44" r="15"/><circle class="body" cx="80" cy="44" r="15"/>
      <path class="body" d="M14 90 C10 62 30 46 60 46 C90 46 110 62 106 90 Q104 110 60 110 Q16 110 14 90 Z"/>
      <circle cx="40" cy="43" r="10" fill="#fff"/><circle cx="80" cy="43" r="10" fill="#fff"/>
      <ellipse class="belly" cx="60" cy="96" rx="28" ry="12" fill="#fff" fill-opacity=".4"/>
      <path class="body limb limb-l" d="M30 98 q-16 2 -18 11 h20 z"/><path class="body limb limb-r" d="M90 98 q16 2 18 11 h-20 z"/>
      ${eyes(40, 80, 44)}${cheeks(28, 92, 70)}
      ${wideMouth(60, 74, 15)}
      <line class="tongue" x1="60" y1="76" x2="60" y2="76" stroke="#ec4899" stroke-width="7" stroke-linecap="round"/>`,

    // Pinguin: dunkler Koerper (Farbe waehlbar), weisses Gesicht und Bauch, oranger Schnabel und Fuesse
    penguin: () => `
      <g class="stand">
      <ellipse cx="48" cy="109" rx="9" ry="4.5" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/><ellipse cx="72" cy="109" rx="9" ry="4.5" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>
      <path class="body" d="M60 22 C86 22 100 46 100 74 C100 98 86 108 60 108 C34 108 20 98 20 74 C20 46 34 22 60 22 Z"/>
      <path d="M60 40 C70 34 84 40 84 56 C90 74 88 102 60 104 C32 102 30 74 36 56 C36 40 50 34 60 40 Z" fill="#fff"/>
      <path class="body limb wing-l" d="M22 62 q-14 14 -10 32 q12 -6 12 -24 z"/><path class="body limb wing-r" d="M98 62 q14 14 10 32 q-12 -6 -12 -24 z"/>
      ${eyes(49, 71, 58)}${cheeks(40, 80, 72)}${beak(60, 66)}
      </g>
      <!-- seitlich auf dem Bauch rutschend (Blick nach rechts; gespiegelt fuer links) -->
      <g class="slide-pose">
        <path class="puffs" d="M2 106 h9 M6 99 h7 M0 112 h6" stroke="#fff" stroke-opacity=".85" stroke-width="2.6" stroke-linecap="round"/>
        <ellipse cx="17" cy="103" rx="7" ry="3.5" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" transform="rotate(-18 17 103)"/>
        <ellipse cx="19" cy="109" rx="7" ry="3.5" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" transform="rotate(12 19 109)"/>
        <path class="body" d="M22 100 C22 86 46 79 72 80 C94 81 108 88 108 99 C108 108 94 113 66 113 C40 113 22 110 22 100 Z"/>
        <path d="M30 106 C48 112 84 113 104 104 C100 110 86 113 66 113 C46 113 34 111 30 106 Z" fill="#fff"/>
        <path d="M84 84 C96 84 106 90 106 98 C106 104 100 106 92 104 C84 102 80 96 80 90 C80 87 81 84 84 84 Z" fill="#fff"/>
        <path class="body limb wing-l" d="M66 92 Q48 92 30 99 Q48 100 66 98 Z"/>
        <g class="eyes"><g class="eye"><ellipse cx="94" cy="92" rx="3.6" ry="4.8" fill="#1e293b"/><circle cx="95.4" cy="90.4" r="1.4" fill="#fff"/></g></g>
        <g class="eyes-closed"><path d="M90 92 q4 3 8 0" stroke="#1e293b" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>
        <g class="eyes-happy"><path d="M90 93 q4 -5 8 0" stroke="#1e293b" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>
        <ellipse class="cheek" cx="92" cy="100" rx="4" ry="2.4"/>
        <path d="M106 94 L116 97 L106 100 Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/>
      </g>`,

    // Hase: lange Ohren (wackeln beim Streicheln), Stupsnase, Puschelschwanz
    bunny: () => `
      <circle class="limb tail" cx="100" cy="96" r="9" fill="#fff" stroke="#e5e7eb" stroke-width="2"/>
      <g class="ear ear-l"><path class="body" d="M40 46 C29 22 33 4 42 6 C51 8 51 28 49 46 Z"/><path d="M41 38 C35 22 38 12 42 13 C46 15 46 28 45 38 Z" fill="#f9a8d4"/></g>
      <g class="ear ear-r"><path class="body" d="M80 46 C91 22 87 4 78 6 C69 8 69 28 71 46 Z"/><path d="M79 38 C85 22 82 12 78 13 C74 15 74 28 75 38 Z" fill="#f9a8d4"/></g>
      ${roundBody(40)}
      <ellipse class="belly" cx="60" cy="98" rx="20" ry="10" fill="#fff" fill-opacity=".5"/>
      <path class="body limb limb-l" d="M22 82 q-10 6 -6 16 q8 0 10 -8 z"/><path class="body limb limb-r" d="M98 82 q10 6 6 16 q-8 0 -10 -8 z"/>
      <ellipse cx="44" cy="108" rx="9" ry="4.5" fill="#fff" fill-opacity=".7"/><ellipse cx="76" cy="108" rx="9" ry="4.5" fill="#fff" fill-opacity=".7"/>
      ${eyes(46, 74, 68)}${cheeks(33, 87, 80)}
      <path d="M57 76 h6 l-3 3 z" fill="#f472b6"/>${mouth(60, 83)}`,

    // Panda: helles Fell (Farbe waehlbar), schwarze Ohren, Augenflecken, Arme und Fuesse
    panda: () => `
      <circle cx="30" cy="42" r="11" fill="#2b2b33"/><circle cx="90" cy="42" r="11" fill="#2b2b33"/>
      ${roundBody(32)}
      <path class="limb limb-l" d="M22 74 q-13 6 -9 22 q11 0 15 -11 z" fill="#2b2b33"/><path class="limb limb-r" d="M98 74 q13 6 9 22 q-11 0 -15 -11 z" fill="#2b2b33"/>
      <ellipse cx="44" cy="108" rx="10" ry="5" fill="#2b2b33"/><ellipse cx="76" cy="108" rx="10" ry="5" fill="#2b2b33"/>
      <ellipse cx="45" cy="63" rx="10" ry="12" fill="#2b2b33" transform="rotate(-24 45 63)"/><ellipse cx="75" cy="63" rx="10" ry="12" fill="#2b2b33" transform="rotate(24 75 63)"/>
      <g class="eyes"><circle cx="46" cy="62" r="7" fill="#fff"/><circle cx="74" cy="62" r="7" fill="#fff"/></g>
      ${eyes(46, 74, 62, -1, '#fff')}${cheeks(31, 89, 80)}
      <ellipse cx="60" cy="76" rx="4.5" ry="3" fill="#2b2b33"/>${mouth(60, 83)}
      <!-- Bambus essen: Stange mit Blaettern quer in den Pfoten, Kaumund (Klasse "eat") -->
      <g class="bamboo">
        <path d="M30 98 L96 74" stroke="#4d7c0f" stroke-width="7" stroke-linecap="round"/>
        <path d="M30 98 L96 74" stroke="#84cc16" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M52 90.2 l1.6 4.4 M74 82.3 l1.6 4.4" stroke="#4d7c0f" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M90 76 q10 -14 22 -12 q-8 10 -22 12 z M86 78 q6 -16 2 -26 q-8 12 -2 26 z" fill="#65a30d" stroke="#3f6212" stroke-width="1.2" stroke-linejoin="round"/>
        <ellipse cx="34" cy="97" rx="8" ry="6" fill="#2b2b33"/><ellipse cx="88" cy="78" rx="8" ry="6" fill="#2b2b33"/>
        <ellipse class="chew" cx="60" cy="84" rx="5" ry="3" fill="#7f1d1d" stroke="#1e293b" stroke-width="1.5"/>
      </g>`,

    // Axolotl: breiter Kopf, wedelnde Kiemen, laechelt immer
    axolotl: () => `
      <path class="body limb tail" d="M94 98 q20 4 24 -10 q-12 -2 -24 2 z"/>
      <g class="gills gill-l"><path class="dark" d="M26 54 q-14 -18 -20 -12 q0 7 18 18 z"/><path class="dark" d="M22 64 q-18 -6 -19 2 q3 6 19 4 z"/><path class="dark" d="M23 74 q-17 2 -15 10 q6 3 17 -4 z"/></g>
      <g class="gills gill-r"><path class="dark" d="M94 54 q14 -18 20 -12 q0 7 -18 18 z"/><path class="dark" d="M98 64 q18 -6 19 2 q-3 6 -19 4 z"/><path class="dark" d="M97 74 q17 2 15 10 q-6 3 -17 -4 z"/></g>
      <path class="body" d="M60 40 C92 40 106 58 104 78 C102 100 84 110 60 110 C36 110 18 100 16 78 C14 58 28 40 60 40 Z"/>
      <ellipse class="belly" cx="60" cy="98" rx="22" ry="9" fill="#fff" fill-opacity=".35"/>
      <path class="body limb limb-l" d="M26 92 q-10 4 -8 14 q8 0 10 -8 z"/><path class="body limb limb-r" d="M94 92 q10 4 8 14 q-8 0 -10 -8 z"/>
      ${eyes(40, 80, 68)}${cheeks(28, 92, 80)}
      ${wideMouth(60, 82, 11)}`,

    // kleiner Drache: Hoerner, Rueckenzacken, Fledermausfluegel, Bauchschuppen, Schwanz mit Spitze
    dragon: () => `
      <g class="limb tail"><path class="body" d="M92 100 q24 2 22 -24 q-6 0 -6 6 q0 12 -16 12 z"/><path class="dark" d="M108 82 l6 -14 l6 12 z"/></g>
      <path class="dark limb wing-l" d="M28 58 L6 40 L10 58 L1 62 L14 72 L8 78 L26 80 Z"/>
      <path class="dark limb wing-r" d="M92 58 L114 40 L110 58 L119 62 L106 72 L112 78 L94 80 Z"/>
      <path d="M44 38 L40 20 L52 34 Z M76 38 L80 20 L68 34 Z" fill="#fde68a" stroke="#d4a72c" stroke-width="2" stroke-linejoin="round"/>
      <path class="dark" d="M54 31 l6 -9 l6 9 z"/>
      ${roundBody(30)}
      <ellipse class="belly" cx="60" cy="96" rx="20" ry="13" fill="#fef3c7" fill-opacity=".75"/>
      <path class="stripe" d="M46 92 h28 M48 100 h24" stroke-width="2" stroke-linecap="round" opacity=".5"/>
      <ellipse class="dark" cx="45" cy="108" rx="8" ry="4.5"/><ellipse class="dark" cx="75" cy="108" rx="8" ry="4.5"/>
      ${eyes(46, 74, 60, 1)}${cheeks(32, 88, 74)}
      <circle cx="56" cy="72" r="1.4" fill="#1e293b"/><circle cx="64" cy="72" r="1.4" fill="#1e293b"/>${mouth(60, 79)}`,

    // Pilz: Hut in waehlbarer Farbe mit weissen Punkten, Gesicht auf dem Stiel
    mushroom: () => `
      <path d="M34 66 Q28 104 40 108 Q60 114 80 108 Q92 104 86 66 Z" fill="#fdf3e1" stroke="#d8c3a0" stroke-width="2.5" stroke-linejoin="round"/>
      <path class="limb limb-l" d="M34 84 q-12 2 -12 12 q8 2 13 -5 z" fill="#fdf3e1" stroke="#d8c3a0" stroke-width="2.5" stroke-linejoin="round"/>
      <path class="limb limb-r" d="M86 84 q12 2 12 12 q-8 2 -13 -5 z" fill="#fdf3e1" stroke="#d8c3a0" stroke-width="2.5" stroke-linejoin="round"/>
      <g class="cap"><path class="body" d="M8 70 C8 36 32 16 60 16 C88 16 112 36 112 70 Q60 82 8 70 Z"/>
        <circle cx="38" cy="38" r="7" fill="#fff" opacity=".9"/><circle cx="66" cy="28" r="5" fill="#fff" opacity=".9"/><circle cx="88" cy="46" r="8" fill="#fff" opacity=".9"/><circle cx="22" cy="60" r="4.5" fill="#fff" opacity=".9"/><circle cx="58" cy="56" r="4" fill="#fff" opacity=".9"/>
        <path d="M24 38 q8 -12 22 -16" stroke="#fff" stroke-opacity=".5" stroke-width="4" fill="none" stroke-linecap="round"/></g>
      ${eyes(48, 72, 86)}${cheeks(39, 81, 96)}${mouth(60, 98)}
      <!-- Wetter (nur sichtbar mit passender Klasse): Schneehaube, Schal, Sonnenbrille, Pilzfreund, Regentropfen -->
      <path class="snowcap" d="M12 56 C16 32 36 17 60 17 C84 17 104 32 108 56 C101 49 95 54 88 47 C81 54 73 47 66 52 C59 46 51 52 45 47 C37 54 30 47 23 53 C19 49 15 53 12 56 Z" fill="#fff" stroke="#e2e8f0" stroke-width="1.5"/>
      <g class="scarf"><path d="M34 73 Q60 82 86 73 L87 81 Q60 90 33 81 Z" fill="#60a5fa" stroke="#2563eb" stroke-width="1.5" stroke-linejoin="round"/><path d="M75 80 L79 97 L86 95 L83 79 Z" fill="#60a5fa" stroke="#2563eb" stroke-width="1.5" stroke-linejoin="round"/><path d="M40 77 l2 6 M50 79 l2 6 M60 80 l1 6 M70 79 l-1 6" stroke="#93c5fd" stroke-width="1.5"/></g>
      <g class="shades"><rect x="39" y="80" width="18" height="11" rx="4.5" fill="#1e293b"/><rect x="63" y="80" width="18" height="11" rx="4.5" fill="#1e293b"/><path d="M57 84.5 h6" stroke="#1e293b" stroke-width="2.5"/><path d="M42 83 h5 M66 83 h5" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/></g>
      <g class="friend"><path d="M-14 104 Q-14 88 -1 88 Q12 88 12 104 Z" fill="#e5534b" stroke="#a83232" stroke-width="1.8"/><circle cx="-7" cy="95" r="2" fill="#fff"/><circle cx="4" cy="93" r="2.4" fill="#fff"/><rect x="-6" y="103" width="10" height="9" rx="3" fill="#fdf3e1" stroke="#d8c3a0" stroke-width="1.5"/><circle cx="-3" cy="107" r="1.1" fill="#1e293b"/><circle cx="1.5" cy="107" r="1.1" fill="#1e293b"/></g>
      <g class="drops"><path d="M26 4 v7 M52 -4 v7 M80 2 v7 M96 -6 v7 M40 -12 v7 M68 -10 v7" stroke="#60a5fa" stroke-width="2.2" stroke-linecap="round"/></g>`,

    // Roboter: runder Kasten mit Antenne (Lampe blinkt), Gesichtsdisplay, Bauchklappe mit Lichtern
    robot: () => `
      <path class="stripe" d="M60 30 V16" stroke-width="3" stroke-linecap="round"/><circle class="bulb" cx="60" cy="13" r="5" fill="#fbbf24" stroke="#b45309" stroke-width="1.5"/>
      <rect class="dark" x="36" y="102" width="16" height="9" rx="4"/><rect class="dark" x="68" y="102" width="16" height="9" rx="4"/>
      <rect class="body" x="20" y="28" width="80" height="78" rx="24"/>
      <path class="body limb limb-l" d="M21 66 q-13 3 -13 16 q9 2 13 -6 z"/><path class="body limb limb-r" d="M99 66 q13 3 13 16 q-9 2 -13 -6 z"/>
      <!-- Gesicht = Monitor: zeigt Gesicht, Herz (beim Streicheln) oder Werte wie "RAM 63 %" -->
      <rect x="28" y="39" width="64" height="42" rx="13" fill="#1d2a3a" stroke="#0f172a" stroke-width="2.5"/>
      <rect x="31" y="42" width="58" height="36" rx="10" fill="#22364b"/>
      <path d="M34 50 h52 M34 58 h52 M34 66 h52 M34 74 h52" stroke="#67e8f9" stroke-opacity=".06" stroke-width="1.5"/>
      <g class="screen-face">
        <g class="eyes">
          <g class="eye"><rect x="41" y="51" width="10" height="13" rx="4" fill="#67e8f9"/><rect x="43" y="53" width="3" height="3" rx="1" fill="#fff"/></g>
          <g class="eye"><rect x="69" y="51" width="10" height="13" rx="4" fill="#67e8f9"/><rect x="71" y="53" width="3" height="3" rx="1" fill="#fff"/></g>
        </g>
        <g class="eyes-closed"><path d="M40 59 q6 4 12 0 M68 59 q6 4 12 0" stroke="#67e8f9" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>
        <g class="eyes-happy"><path d="M40 61 q6 -7 12 0 M68 61 q6 -7 12 0" stroke="#67e8f9" stroke-width="2.8" fill="none" stroke-linecap="round"/></g>
        <rect class="cheek" x="34" y="66" width="7" height="4" rx="2"/><rect class="cheek" x="79" y="66" width="7" height="4" rx="2"/>
        <path class="mouth mouth-idle" d="M54 69 q6 5 12 0" stroke="#67e8f9" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <rect class="mouth mouth-talk" x="55" y="68" width="10" height="6" rx="2" fill="#67e8f9"/>
        <path class="mouth mouth-happy" d="M52 68 q8 9 16 0 z" fill="#67e8f9"/>
        <path class="mouth mouth-sad" d="M54 72 q6 -5 12 0" stroke="#67e8f9" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <rect class="mouth mouth-alert" x="57" y="67" width="6" height="7" rx="2" fill="#67e8f9"/>
        <text class="screen-mini" x="60" y="75.5" text-anchor="middle"></text>
      </g>
      <path class="screen-heart" d="M60 74 C48 66 42 60 44 54 C46 48 54 47 60 54 C66 47 74 48 76 54 C78 60 72 66 60 74 Z" fill="#f472b6"/>
      <g class="screen-text"><text class="scr-label" x="60" y="52.5" text-anchor="middle"></text><text class="scr-value" x="60" y="70" text-anchor="middle"></text></g>
      <rect class="dark" x="44" y="86" width="32" height="12" rx="5"/>
      <circle class="led" cx="52" cy="92" r="2.2" fill="#34d399"/><circle class="led" cx="60" cy="92" r="2.2" fill="#fbbf24"/><circle class="led" cx="68" cy="92" r="2.2" fill="#f472b6"/>`,
  });

  window.renderSpecies = (species) => `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="sp-${species}">${(SPECIES[species] || SPECIES.blob)()}</svg>`;
})();
