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
// gate: the race's next gate, so a later gate shows lit; the number of gates finishes the race at the held tick.
// car: 'x,z,quarterTurns' puts the car there once the race has started (quarter turns left of north).
// state: the game state the shot starts in ('menu', 'race', 'results', 'settings', 'garage', 'loading', which holds
// the loading line, and the daily's 'daily' (pre-race), 'dailyrace', 'dailyresults'); 'race' when not given.
// day: the daily's day for its states, in place of the seed (its city is the day's).
// dnf: with 'dailyresults', the try did not finish; next: seconds to the next daily on the pinned clock;
// giveup: with 'dailyrace', Esc has asked whether to give up.
// board: with 'dailyresults', a made-up leaderboard of that many finished runs.
// entry: the menu entry selected (0 is the first), with state 'results' the finish screen's option, 'dailyresults'
// its entry (0 share, 1 menu), 'settings' and 'garage' the row.
// edit: with state 'settings', the nickname being typed.
// blocks: blocks per side of the city; viewport: [width, height] of the window instead of 1600 × 900.
// shape, color: the car's body shape and colour instead of the default red coupe.
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
  { name: 'race-go', camera: null, mode: 'glyphs', tick: 200 },
  // The default seed's route starts south down the avenue at x -76 and turns right at z -72; 4 s of held throttle
  // after go the car is on the second leg, 62 m before that turn.
  { name: 'race-running', camera: null, mode: 'glyphs', tick: 420, drive: true },
  // On leg 1, heading south 43 m before the junction at z -72 where the route turns right (west) towards gate 0.
  { name: 'race-arrow', camera: null, mode: 'glyphs', tick: 300, car: '-81,-115,2' },
  // Heading east on the finish straight (the avenue at z -72), 150 m before the finish: its beam stands straight
  // ahead above the road. Every gate on this route stands just after a turn, so the finish is the only one with a
  // straight run up to it.
  { name: 'race-gate-ahead', camera: null, mode: 'glyphs', tick: 300, gate: 9, car: '-25,-70,-1' },
  { name: 'race-finished', camera: null, mode: 'glyphs', tick: 600, gate: 10 },
  // Gates on the default seed's route: 4 stands at x 44, z -148 heading +x on a street; 9 is the finish, at x 125,
  // z -72 heading +x on an avenue. Far views are from the lane at driving height. Tick 120 is the brightest of the
  // next gate's pulse.
  { name: 'gate-far', camera: `-206,${EYE},-145,-90,2`, mode: 'glyphs', tick: 120, gate: 4 },
  { name: 'gate-neon', camera: `-66,${EYE},-145,-90,2`, mode: 'glyphs', tick: 120, gate: 4 },
  { name: 'gate-near', camera: `19,${EYE},-145,-90,6`, mode: 'glyphs', tick: 120, gate: 4 },
  { name: 'gate-finish-far', camera: `-75,${EYE},-69,-90,2`, mode: 'glyphs', tick: 120, gate: 9 },
  { name: 'gate-finish', camera: `91,${EYE},-69,-90,6`, mode: 'glyphs', tick: 120, gate: 9 },
  { name: 'hud-test', camera: `4,${EYE},110,0,3`, mode: 'glyphs', tick: 300, hud: 'test', race: false },
  // The menu's flight goes clockwise round the roads two junctions out from the middle one, 1174 m, about 8800
  // ticks: 5400 heads west down the south side, 1200 east along the north side, 7800 north up the west side.
  { name: 'state-menu', camera: null, mode: 'glyphs', tick: 5400, state: 'menu' },
  { name: 'menu-flight-2', camera: null, mode: 'glyphs', tick: 1200, state: 'menu' },
  { name: 'menu-flight-3', camera: null, mode: 'glyphs', tick: 7800, state: 'menu' },
  { name: 'menu-garage', camera: null, mode: 'glyphs', tick: 5400, state: 'menu', entry: 4 },
  { name: 'state-results', camera: null, mode: 'glyphs', tick: 600, gate: 10, state: 'results' },
  { name: 'settings', camera: null, mode: 'glyphs', tick: 5400, state: 'settings' },
  { name: 'settings-edit', camera: null, mode: 'glyphs', tick: 5400, state: 'settings', edit: 'Speedy 7' },
  // The garage's car turns left once every 960 ticks, from facing away at 0: 120 shows its back and left side, 240
  // its left side, 360 its front and left side, 720 its right side, 840 its back and right side.
  { name: 'garage', camera: null, mode: 'glyphs', tick: 120, state: 'garage' },
  { name: 'garage-hatchback', camera: null, mode: 'glyphs', tick: 240, state: 'garage', shape: 'hatchback', color: 'sky' },
  { name: 'garage-pickup', camera: null, mode: 'glyphs', tick: 840, state: 'garage', shape: 'pickup', color: 'gold', entry: 1 },
  { name: 'garage-van', camera: null, mode: 'glyphs', tick: 360, state: 'garage', shape: 'van', color: 'silver' },
  { name: 'garage-wedge', camera: null, mode: 'glyphs', tick: 720, state: 'garage', shape: 'wedge', color: 'magenta' },
  { name: 'race-pickup', camera: null, mode: 'glyphs', tick: 420, drive: true, shape: 'pickup', color: 'teal' },
  // From behind, standing in the countdown: the hatch must read as part of the car.
  { name: 'race-hatchback', camera: null, mode: 'glyphs', tick: 120, shape: 'hatchback', color: 'sky' },
  // Minimap scales: 10 x 10 blocks at 1280 x 720 (3 x 1 cells per block), 6 x 6 at 1600 x 900, 10 x 10 at 1920 x 1080 (5 x 2).
  { name: 'minimap-large-city', camera: null, mode: 'glyphs', tick: 300, blocks: 10, viewport: [1280, 720], gate: 1, drive: true },
  { name: 'minimap-small-city', camera: null, mode: 'glyphs', tick: 300, blocks: 6, gate: 1, drive: true },
  { name: 'minimap-large-window', camera: null, mode: 'glyphs', tick: 300, blocks: 10, viewport: [1920, 1080], gate: 1, drive: true },
  { name: 'loading', camera: null, mode: 'glyphs', tick: 300, state: 'loading' },
  // Day 329 (seed 424449): 10 gates, 1800 m. The flyover's marker runs the route in about 8 s, so 300 and 420 show
  // it in two places.
  { name: 'daily-prerace', camera: null, mode: 'glyphs', tick: 300, state: 'daily', day: 329 },
  { name: 'daily-prerace-2', camera: null, mode: 'glyphs', tick: 420, state: 'daily', day: 329 },
  { name: 'daily-finished', camera: null, mode: 'glyphs', tick: 600, gate: 10, state: 'dailyresults', day: 329 },
  { name: 'daily-ready-finished', camera: null, mode: 'glyphs', tick: 600, gate: 10, state: 'dailyresults', day: 329, next: 0, entry: 1 },
  { name: 'daily-dnf', camera: null, mode: 'glyphs', tick: 5400, state: 'dailyresults', day: 329, dnf: true },
  { name: 'daily-ready', camera: null, mode: 'glyphs', tick: 5400, state: 'dailyresults', day: 329, dnf: true, next: 0 },
  // board: a made-up day of that many finished runs (82 s ± 7 with a slow tail), the player's among them when
  // finished; the time is the held tick minus the 180 ticks of countdown, so 5080 is 1:21.666 and 3600 0:57.000.
  { name: 'daily-board', camera: null, mode: 'glyphs', tick: 5080, gate: 10, state: 'dailyresults', day: 329, board: 300 },
  { name: 'daily-board-menu', camera: null, mode: 'glyphs', tick: 5080, gate: 10, state: 'dailyresults', day: 329, board: 300, entry: 1 },
  { name: 'daily-board-dnf', camera: null, mode: 'glyphs', tick: 5400, state: 'dailyresults', day: 329, dnf: true, board: 300 },
  { name: 'daily-board-first', camera: null, mode: 'glyphs', tick: 3600, gate: 10, state: 'dailyresults', day: 329, board: 300 },
  { name: 'daily-board-tiny', camera: null, mode: 'glyphs', tick: 5080, gate: 10, state: 'dailyresults', day: 329, board: 3 },
  { name: 'daily-board-empty', camera: null, mode: 'glyphs', tick: 5400, state: 'dailyresults', day: 329, dnf: true, board: 0 },
  { name: 'daily-board-glyph16', camera: null, mode: 'glyphs', tick: 5080, gate: 10, state: 'dailyresults', day: 329, board: 300, cell: 16 },
  { name: 'daily-giveup', camera: null, mode: 'glyphs', tick: 420, drive: true, state: 'dailyrace', day: 329, giveup: true },
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
    const page = await browser.newPage({ viewport: { width: shot.viewport?.[0] ?? WIDTH, height: shot.viewport?.[1] ?? HEIGHT }, deviceScaleFactor: 1 });
    const errors = [];
    let onError;
    const firstError = new Promise((_, reject) => (onError = reject));
    firstError.catch(() => {});
    page.on('pageerror', (error) => {
      errors.push(error.message);
      onError(new Error('page error'));
    });
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    const query = new URLSearchParams({ mode: shot.mode, tick: String(shot.tick), state: shot.state ?? 'race' });
    if (shot.day !== undefined) query.set('day', String(shot.day));
    else query.set('seed', String(seed));
    if (shot.blocks !== undefined) query.set('blocks', String(shot.blocks));
    if (shot.dnf) query.set('dnf', '1');
    if (shot.next !== undefined) query.set('next', String(shot.next));
    if (shot.giveup) query.set('giveup', '1');
    if (shot.board !== undefined) query.set('board', String(shot.board));
    if (shot.camera) query.set('camera', shot.camera);
    if (shot.drive) query.set('drive', '1');
    if (shot.race === false) query.set('race', '0');
    if (shot.hud) query.set('hud', shot.hud);
    if (shot.gate !== undefined) query.set('gate', String(shot.gate));
    if (shot.cell) query.set('cell', String(shot.cell));
    if (shot.car) query.set('car', shot.car);
    if (shot.entry !== undefined) query.set('entry', String(shot.entry));
    if (shot.edit !== undefined) query.set('edit', shot.edit);
    if (shot.shape) query.set('shape', shot.shape);
    if (shot.color) query.set('color', shot.color);
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
