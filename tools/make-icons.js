// Draws every app icon from the KIWA mark, the same one the project page uses.
//   node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TEAL = '#0A6E7A';

/** The mark on a 32-unit grid: a learning curve that rises to a point, over a baseline. */
const mark = (color) =>
  `<path d="M8 21 C11 13 14 11 16 11 C19 11 20 15 24 9" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>` +
  `<circle cx="24" cy="9" r="2.6" fill="${color}"/>` +
  `<path d="M8 24 H24" stroke="${color}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`;

/**
 * An SVG of `size` pixels. The mark's drawing (x 6.5 to 26.6, y 6.4 to 25) is centred and scaled
 * so it spans `share` of the width. `background` fills the square, or `rounded` draws the tile.
 */
function svg({ size, share, color, background, rounded }) {
  const drawn = 20.1;
  const scale = (size * share) / drawn;
  const offsetX = size / 2 - 16.55 * scale;
  const offsetY = size / 2 - 15.7 * scale;
  const tile = rounded ? `<rect width="${size}" height="${size}" rx="${size * 0.28}" fill="${TEAL}"/>` : background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${tile}<g transform="translate(${offsetX} ${offsetY}) scale(${scale})">${mark(color)}</g></svg>`;
}

const outputs = [
  // The store and launcher icon. iOS and Android round the corners themselves.
  { file: 'assets/images/icon.png', size: 1024, share: 0.56, color: '#FFFFFF', background: TEAL },
  // Android adaptive icon: the launcher crops to a circle or squircle, so keep the mark inside the middle 60%.
  { file: 'assets/images/android-icon-foreground.png', size: 512, share: 0.42, color: '#FFFFFF' },
  { file: 'assets/images/android-icon-background.png', size: 512, share: 0, color: TEAL, background: TEAL, blank: true },
  { file: 'assets/images/android-icon-monochrome.png', size: 432, share: 0.5, color: '#000000' },
  // Splash: the mark alone, on the teal splash background set in app.json.
  { file: 'assets/images/splash-icon.png', size: 512, share: 0.9, color: '#FFFFFF' },
  { file: 'assets/images/favicon.png', size: 48, share: 0.6, color: '#FFFFFF', rounded: true },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const output of outputs) {
    const markup = output.blank ? `<svg xmlns="http://www.w3.org/2000/svg" width="${output.size}" height="${output.size}"><rect width="100%" height="100%" fill="${TEAL}"/></svg>` : svg(output);
    await page.setViewportSize({ width: output.size, height: output.size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${markup}`);
    await page.locator('svg').screenshot({ path: path.join(ROOT, output.file), omitBackground: true });
    console.log('wrote', output.file);
  }
  await browser.close();

  // iOS 26 icon (Icon Composer bundle): the mark as one layer over a teal gradient the system adds glass to.
  const bundle = path.join(ROOT, 'assets', 'kiwa.icon');
  fs.rmSync(bundle, { recursive: true, force: true });
  fs.mkdirSync(path.join(bundle, 'Assets'), { recursive: true });
  fs.writeFileSync(path.join(bundle, 'Assets', 'kiwa-mark.svg'), svg({ size: 1024, share: 0.56, color: '#FFFFFF' }));
  const icon = {
    fill: { 'automatic-gradient': 'extended-srgb:0.03922,0.43137,0.47843,1.00000' },
    groups: [{ layers: [{ 'image-name': 'kiwa-mark.svg', name: 'kiwa-mark' }], shadow: { kind: 'neutral', opacity: 0.5 }, translucency: { enabled: true, value: 0.5 } }],
    'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
  };
  fs.writeFileSync(path.join(bundle, 'icon.json'), `${JSON.stringify(icon, null, 2)}\n`);
  console.log('wrote assets/kiwa.icon');
})();
