/**
 * Generates the source images @capacitor/assets needs, from the same ledger
 * mark used for the web icons. Run with `npm run assets:src`, then
 * `npm run assets` turns these into every Android density.
 *
 *   assets/icon-only.png        1024  full-bleed rounded tile (legacy icon)
 *   assets/icon-foreground.png  1024  adaptive foreground, art in the safe zone
 *   assets/icon-background.png  1024  adaptive background, solid ink
 *   assets/splash.png           2732  launch screen, light
 *   assets/splash-dark.png      2732  launch screen, dark
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'assets');
mkdirSync(out, { recursive: true });

const INK = '#14201a';
const PAPER = '#eaf0e6';
const BAND = '#c9d9c2';
const BLUE = '#5b86f0';

/** The mark: four ledger entry lines, the last struck through as the total. */
const bars = (size, pad) => {
  const inset = size * pad;
  const w = size - inset * 2;
  const lines = [0.86, 0.62, 0.74, 0.5];
  const barH = w * 0.108;
  const gap = (w - barH * 4) / 3.4;
  const top = inset + (w - (barH * 4 + gap * 3)) / 2;
  return lines
    .map((frac, i) => {
      const y = top + i * (barH + gap);
      const fill = i === 3 ? BLUE : i % 2 === 0 ? PAPER : BAND;
      return `<rect x="${inset}" y="${y}" width="${w * frac}" height="${barH}" rx="${barH / 2}" fill="${fill}"/>`;
    })
    .join('');
};

const svg = (size, body) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`,
  );

const png = (buf, size) => sharp(buf, { density: 384 }).resize(size, size).png();

const jobs = [
  [
    'icon-only.png',
    1024,
    svg(1024, `<rect width="1024" height="1024" rx="225" fill="${INK}"/>${bars(1024, 0.17)}`),
  ],
  ['icon-foreground.png', 1024, svg(1024, bars(1024, 0.3))],
  ['icon-background.png', 1024, svg(1024, `<rect width="1024" height="1024" fill="${INK}"/>`)],
  [
    'splash.png',
    2732,
    svg(2732, `<rect width="2732" height="2732" fill="#fdfefc"/>${bars(2732, 0.38)}`),
  ],
  [
    'splash-dark.png',
    2732,
    svg(2732, `<rect width="2732" height="2732" fill="${INK}"/>${bars(2732, 0.38)}`),
  ],
];

for (const [name, size, body] of jobs) {
  await png(body, size).toFile(resolve(out, name));
  console.log('wrote assets/' + name);
}
