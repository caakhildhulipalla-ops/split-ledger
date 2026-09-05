/**
 * Capture Play-ready phone screenshots from a running deployment.
 *
 * Play wants screenshots of the real app with real content, so this drives an
 * actual browser against your deployment rather than mocking anything.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/screenshots.mjs --url https://your-app.vercel.app
 *
 * On the first run a browser window opens: sign in and pick the group you
 * want shown, then press Enter in the terminal. The session is saved to
 * .playwright-profile/ (git-ignored) so later runs go straight through.
 *
 * Output: play/screenshots/*.png at 1080×2160 (9:18) — inside Play's 9:16-to-
 * 2:1 window, min 320px, max 3840px.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'play/screenshots');
mkdirSync(outDir, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const base = (args.url ?? '').replace(/\/$/, '');
if (!base) {
  console.error('Pass your deployment: node scripts/screenshots.mjs --url https://…');
  process.exit(1);
}

// 540×1080 at deviceScaleFactor 2 gives a 1080×2160 PNG.
const ctx = await chromium.launchPersistentContext(resolve(root, '.playwright-profile'), {
  headless: false,
  viewport: { width: 540, height: 1080 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(`${base}/groups`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question(
  '\nSign in and open the group you want in the shots, then press Enter here… ',
);
rl.close();

const groupUrl = new URL(page.url());
const gid = groupUrl.pathname.split('/')[2];
if (!gid) {
  console.error('Open a group first (the URL should look like /g/<id>).');
  await ctx.close();
  process.exit(1);
}

const shots = [
  ['1-ledger', `${base}/g/${gid}`, 'The ledger'],
  ['2-balances', `${base}/g/${gid}/balances`, 'Settle up'],
  ['3-dashboard', `${base}/g/${gid}/dashboard`, 'Dashboard'],
  ['4-recurring', `${base}/g/${gid}/recurring`, 'Recurring'],
  ['5-activity', `${base}/g/${gid}/activity`, 'Activity'],
];

for (const [name, url, label] of shots) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900); // let charts measure and draw
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  console.log(`captured ${name}.png — ${label}`);
}

// One dark-mode shot: Play listings benefit from showing it, and it proves
// the theme handling to a reviewer.
await page.emulateMedia({ colorScheme: 'dark' });
await page.goto(`${base}/g/${gid}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(outDir, '6-dashboard-dark.png') });
console.log('captured 6-dashboard-dark.png — Dashboard, dark');

await ctx.close();
console.log(`\nDone. ${shots.length + 1} screenshots in play/screenshots/`);
console.log('Check each one for real content — Play rejects placeholder data.');
