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

  window.renderSpecies = (species) => `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="sp-${species}">${(SPECIES[species] || SPECIES.blob)()}</svg>`;
})();
