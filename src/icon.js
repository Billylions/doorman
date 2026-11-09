// Doorman's look: a hotel bellboy reduced to four elements: a red hat, a small
// gold keyhole, closed smiling eyes (he never peeks at your keys) and a mustache.

export const COLORS = {
  red: '#D7262E',
  gold: '#FFC23A',
  cream: '#FFE7C2',
  ink: '#3A2418',
};

const c = COLORS;

/** App icon: the four elements on cream, flat colours only. */
export function appIconSvg(size = 1024) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="dm-clip"><rect x="100" y="100" width="824" height="824" rx="185"/></clipPath>
  </defs>
  <g clip-path="url(#dm-clip)">
    <!-- Four elements only: hat, keyhole, eyes, mustache. -->
    <rect x="0" y="0" width="1024" height="1024" fill="${c.cream}"/>
    <!-- red hat silhouette with a small gold keyhole -->
    <g transform="translate(0 40) rotate(-6 512 330)">
      <path d="M226 230 L226 456 A286 48 0 0 0 798 456 L798 230 Z" fill="${c.red}"/>
      <ellipse cx="512" cy="230" rx="286" ry="48" fill="${c.red}"/>
      <circle cx="512" cy="330" r="30" fill="${c.gold}"/>
      <path d="M495 348 L529 348 L539 400 L485 400 Z" fill="${c.gold}"/>
    </g>
    <!-- closed, smiling eyes: he never peeks -->
    <path d="M300 642 Q370 560 440 642" fill="none" stroke="${c.ink}" stroke-width="52" stroke-linecap="round"/>
    <path d="M584 642 Q654 560 724 642" fill="none" stroke="${c.ink}" stroke-width="52" stroke-linecap="round"/>
    <!-- the mustache -->
    <path transform="translate(512 792) scale(1.16) translate(-512 -728)" d="M512 728 C462 662 336 652 262 742 C330 730 420 790 512 762 C604 790 694 730 762 742 C688 652 562 662 512 728 Z" fill="${c.ink}"/>
  </g>
</svg>`;
}

/** Menu bar icon: the keyhole cap over the mustache, single colour (macOS template image). */
export function trayHatSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs><mask id="cut"><rect width="100" height="100" fill="#fff"/>
    <ellipse cx="50" cy="20" rx="20" ry="3.4" fill="none" stroke="#000" stroke-width="2.6"/>
    <circle cx="50" cy="31" r="5"/>
    <path d="M47.2 35 L52.8 35 L54.6 43 L45.4 43 Z" fill="#000"/>
  </mask></defs>
  <g transform="rotate(-8 50 34)" fill="#000" mask="url(#cut)">
    <path d="M24 20 L24 48 A26 6 0 0 0 76 48 L76 20 Z"/>
    <ellipse cx="50" cy="20" rx="26" ry="6"/>
  </g>
  <path fill="#000" d="M50 76 C42 66 26 66 16 80 C28 78 38 86 50 82 C62 86 72 78 84 80 C74 66 58 66 50 76 Z"/>
</svg>`;
}
