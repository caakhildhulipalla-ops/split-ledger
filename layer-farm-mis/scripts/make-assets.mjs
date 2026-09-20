/**
 * App icons and splash screens, generated from SVG so there is nothing
 * binary to keep in step by hand.
 *
 * The mark is an egg with a rising bar chart inside it: what the farm
 * produces, and whether it is going up.
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const GREEN = '#1f6b4a';
const GREEN_DARK = '#0f1c14';
const CREAM = '#f6f3e8';

const mark = (fg) => `
  <path d="M256 78c-58 0-118 128-118 208 0 62 49 104 118 104s118-42 118-104c0-80-60-208-118-208z"
        fill="${fg}"/>
  <g fill="${GREEN}">
    <rect x="196" y="286" width="26" height="46" rx="6"/>
    <rect x="240" y="258" width="26" height="74" rx="6"/>
    <rect x="284" y="222" width="26" height="110" rx="6"/>
  </g>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="${GREEN}"/>
  ${mark(CREAM)}
</svg>`;

// The foreground of an adaptive icon must sit inside the safe circle, so the
// mark is scaled down and centred rather than filling the tile.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g transform="translate(256 256) scale(0.62) translate(-256 -256)">${mark(CREAM)}</g>
</svg>`;

const background = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${GREEN}"/>
</svg>`;

const splash = (bg, fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">
  <rect width="2732" height="2732" fill="${bg}"/>
  <g transform="translate(1366 1366) scale(1.15) translate(-256 -256)">${mark(fg)}</g>
</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

async function write(path, buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
}

/* ------------------------------------------------------------ web icons */

const web = [
  ['public/icons/icon-192.png', icon, 192],
  ['public/icons/icon-512.png', icon, 512],
  ['public/icons/maskable-512.png', background, 512],
  ['public/favicon.png', icon, 64],
];

for (const [path, svg, size] of web) {
  await write(join(root, path), await png(svg, size));
}

// The maskable icon needs the mark composited onto the background plate.
await write(
  join(root, 'public/icons/maskable-512.png'),
  await sharp(Buffer.from(background))
    .composite([{ input: await png(foreground, 512) }])
    .png()
    .toBuffer(),
);

/* ---------------------------------------------------------- android res */

const densities = [
  ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192],
];

for (const [density, size] of densities) {
  const dir = join(root, 'android/app/src/main/res', `mipmap-${density}`);
  await write(join(dir, 'ic_launcher.png'), await png(icon, size));
  await write(join(dir, 'ic_launcher_round.png'), await png(icon, size));
  await write(join(dir, 'ic_launcher_foreground.png'), await png(foreground, Math.round(size * 2.2)));
  await write(join(dir, 'ic_launcher_background.png'), await png(background, Math.round(size * 2.2)));
}

/* ------------------------------------------------------------- splashes */

const splashSizes = [
  ['drawable', 480], ['drawable-port-mdpi', 480], ['drawable-port-hdpi', 800],
  ['drawable-port-xhdpi', 1280], ['drawable-port-xxhdpi', 1600], ['drawable-port-xxxhdpi', 1920],
];

for (const [dir, size] of splashSizes) {
  await write(
    join(root, 'android/app/src/main/res', dir, 'splash.png'),
    await sharp(Buffer.from(splash(CREAM, GREEN))).resize(size, size).png().toBuffer(),
  );
  await write(
    join(root, 'android/app/src/main/res', dir.replace('drawable', 'drawable-night'), 'splash.png'),
    await sharp(Buffer.from(splash(GREEN_DARK, CREAM))).resize(size, size).png().toBuffer(),
  );
}

console.log('Icons and splashes written.');
