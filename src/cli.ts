// Command-line renderer: the same engine as the website, without a browser.
//   npm run cli -- --seed 42 --time 21 --weather rain --format banner --size large --scale 4 --out world.gif
//   npm run cli -- --daily --out daily/world.gif     (a new world every day, derived from the date)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { rng } from './color';
import { encodeGif, renderLoop } from './gif';
import { fromParams, SEASONS, toParams, WEATHERS, worldOptions } from './state';
import { generateWorld } from './world';

const args = process.argv.slice(2);
const params = new URLSearchParams();
let out = 'world.gif';
let scale = 4;
for (let i = 0; i < args.length; i += 1) {
  const key = args[i]!.replace(/^--/, '');
  const next = args[i + 1];
  const value = next && !next.startsWith('--') ? (i += 1, next) : '1';
  if (key === 'out') out = value;
  else if (key === 'scale') scale = Math.max(1, Math.min(8, Math.round(Number(value)) || 4));
  else params.set(key, value);
}

if (params.get('daily') === '1') {
  // Same date → same world, anywhere: the seed and the conditions come from the date alone.
  const today = new Date().toISOString().slice(0, 10);
  const seed = Number(today.replaceAll('-', ''));
  const r = rng(seed);
  params.set('seed', String(seed));
  if (!params.has('time')) params.set('time', String(Math.round(r() * 96) / 4));
  if (!params.has('weather')) params.set('weather', WEATHERS[Math.floor(r() * WEATHERS.length)]!);
  if (!params.has('season')) params.set('season', SEASONS[Math.floor(r() * SEASONS.length)]!);
  if (!params.has('format')) params.set('format', 'banner');
  if (!params.has('size')) params.set('size', 'large');
}

const state = fromParams(params, Math.floor(Math.random() * 1_000_000));
const world = generateWorld(worldOptions(state));
const frames = renderLoop(world, state.settings);
const bytes = encodeGif(frames, world.width, world.height, state.settings, scale);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`${out}: ${(bytes.length / 1024).toFixed(0)} KB · ${world.width * scale}×${world.height * scale} · ${world.biome.name.en} · #${toParams(state)}`);
