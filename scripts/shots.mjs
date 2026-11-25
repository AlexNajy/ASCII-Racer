// Builds the game and saves pictures from fixed spots with headless Chrome, for looking at changes.
// Usage: npm run shots [-- name ...] [--seed N]
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shots');
const WIDTH = 1600;
const HEIGHT = 900;
const READY_TIMEOUT_MS = 120000;
const DEFAULT_SEED = 1;
// Driving height, m.
const EYE = 1.2;

// camera: 'x,y,z,yaw,pitch' (degrees; yaw 0 looks -Z, 90 looks -X, 180 looks +Z), or null for the chase camera.
// race: false drives freely from the middle junction instead of starting the city seed's race; the car (and its
// headlights) is in the fly camera's pictures too, so every shot from before races existed has it.
// gate: the race's next gate, so a later gate shows lit.
// Positions are for the default seed's city (seed 1); with another seed the same spots show something else.
const SHOTS = [
  { name: 'chase-junction', camera: null, mode: 'glyphs', tick: 300, race: false },
  { name: 'street-downtown', camera: `4,${EYE},110,0,3`, mode: 'glyphs', tick: 300, race: false },
  { name: 'street-downtown-grey', camera: `4,${EYE},110,0,3`, mode: 'brightness', tick: 300, race: false },
  { name: 'avenue-lights', camera: `6,${EYE},40,0,9`, mode: 'glyphs', tick: 600, race: false },
  { name: 'towers-aerial', camera: '4,70,150,0,-17', mode: 'glyphs', tick: 300, race: false },
  { name: 'houses', camera: `-188,3,76,180,6`, mode: 'glyphs', tick: 300, race: false },
  { name: 'park', camera: `-188,3,64,0,-8`, mode: 'glyphs', tick: 300, race: false },
  { name: 'car-park', camera: `-236,9,112,90,-16`, mode: 'glyphs', tick: 300, race: false },
  { name: 'supermarket', camera: `188,${EYE},238,180,9`, mode: 'glyphs', tick: 300, race: false },
  { name: 'outer-wall', camera: `154,${EYE},268,180,12`, mode: 'glyphs', tick: 300, race: false },
  { name: 'hud-driving', camera: null, mode: 'glyphs', tick: 300, drive: true, race: false },
  { name: 'race-start', camera: null, mode: 'glyphs', tick: 90 },
  // Gates on the default seed's route: 8 stands at x 260, z 4 heading +x, by a green neon shop; 11 is the finish, at
  // x 96, z 220 heading -x. Far views are from the lane at driving height. Tick 120 is the brightest of the next gate's pulse.
  { name: 'gate-far', camera: `10,${EYE},7,-90,2`, mode: 'glyphs', tick: 120, gate: 8 },
  { name: 'gate-neon', camera: `60,${EYE},7,-90,2`, mode: 'glyphs', tick: 120, gate: 8 },
  { name: 'gate-near', camera: `235,${EYE},7,-90,6`, mode: 'glyphs', tick: 120, gate: 8 },
  { name: 'gate-finish-far', camera: `296,${EYE},217,90,2`, mode: 'glyphs', tick: 120, gate: 11 },
  { name: 'gate-finish', camera: `130,${EYE},217,90,6`, mode: 'glyphs', tick: 120, gate: 11 },
  { name: 'hud-test', camera: `4,${EYE},110,0,3`, mode: 'glyphs', tick: 300, hud: 'test', race: false },
];

const args = process.argv.slice(2);
let seed = DEFAULT_SEED;
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed') seed = Number(args[++i]);
  else names.push(args[i]);
}
const unknown = names.filter((name) => !SHOTS.some((shot) => shot.name === name));
if (unknown.length > 0 || !Number.isInteger(seed) || seed < 0) {
  console.error(`Unknown shot or bad seed. Shots: ${SHOTS.map((shot) => shot.name).join(', ')}`);
  process.exit(1);
}
const chosen = names.length > 0 ? SHOTS.filter((shot) => names.includes(shot.name)) : SHOTS;

async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch (chromeError) {
    try {
      return await chromium.launch();
    } catch {
      throw new Error(
        `Could not start Chrome (${chromeError.message.split('\n')[0]}) or Playwright's Chromium.\n` +
          'Install Google Chrome, or run: npx playwright-core install chromium',
      );
    }
  }
}

let server;
let browser;
let failed = false;
const started = Date.now();
try {
  await build({ root, logLevel: 'warn' });
  server = await preview({ root, logLevel: 'silent', preview: { port: 0, host: '127.0.0.1' } });
  const base = server.resolvedUrls.local[0];
  browser = await launchChrome();
  mkdirSync(outDir, { recursive: true });

  for (const shot of chosen) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const errors = [];
    let onError;
    const firstError = new Promise((_, reject) => (onError = reject));
    firstError.catch(() => {});
    page.on('pageerror', (error) => {
      errors.push(error.message);
      onError(new Error('page error'));
    });
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    const query = new URLSearchParams({ seed: String(seed), mode: shot.mode, tick: String(shot.tick) });
    if (shot.camera) query.set('camera', shot.camera);
    if (shot.drive) query.set('drive', '1');
    if (shot.race === false) query.set('race', '0');
    if (shot.hud) query.set('hud', shot.hud);
    if (shot.gate !== undefined) query.set('gate', String(shot.gate));
    if (shot.cell) query.set('cell', String(shot.cell));
    try {
      await page.goto(`${base}?${query}`);
      await Promise.race([page.waitForSelector('canvas[data-ready="true"]', { timeout: READY_TIMEOUT_MS }), firstError]);
      const file = join(outDir, `${shot.name}.png`);
      await page.screenshot({ path: file });
      if (errors.length > 0) throw new Error(`page errors:\n${errors.join('\n')}`);
      console.log(file);
    } catch (error) {
      failed = true;
      console.error(`${shot.name}: ${error.message}`);
      if (errors.length > 0) console.error(errors.join('\n'));
    } finally {
      await page.close();
    }
  }
} catch (error) {
  failed = true;
  console.error(error.message);
} finally {
  await browser?.close();
  await server?.close();
}
console.log(`${((Date.now() - started) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
