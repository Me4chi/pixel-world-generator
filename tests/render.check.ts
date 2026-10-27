// Self-check: worlds are deterministic, every mode loops seamlessly, palettes and state round-trip.
// Run: npm test
import { BIOMES } from '../src/biomes';
import { encodeGif } from '../src/gif';
import { PALETTES } from '../src/palettes';
import { Raster } from '../src/raster';
import { DEFAULT_SETTINGS, renderFrame, type Settings } from '../src/render';
import { defaultState, fromParams, toParams, worldOptions } from '../src/state';
import { generateWorld, type WorldOptions } from '../src/world';

function assert(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}

const settings = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, frames: 24, ...patch });
const draw = (opts: WorldOptions, s: Settings, frame: number): string => {
  const world = generateWorld(opts);
  const r = new Raster(world.width, world.height);
  renderFrame(r, world, s, frame);
  return Buffer.from(r.data).toString('base64');
};

const cases: Settings[] = [
  settings({ hour: 12, weather: 'clear' }),
  settings({ hour: 22, weather: 'clouds', intensity: 0.4 }),
  settings({ hour: 7, weather: 'rain', intensity: 1, season: 'autumn' }),
  settings({ hour: 15, weather: 'storm', intensity: 0.9 }),
  settings({ hour: 17, weather: 'snow', intensity: 0.8, season: 'winter' }),
  settings({ hour: 19, weather: 'fog', intensity: 0.7, season: 'spring' }),
  settings({ hour: 6, timelapse: true, frames: 48 }),
];
let checked = 0;
for (const biome of BIOMES) {
  for (const [i, s] of cases.entries()) {
    const opts: WorldOptions = { seed: 100 + i, width: 192, height: 108, pan: i === 1, biome: biome.id };
    assert(draw(opts, s, 0) === draw(opts, s, s.frames), `loop seam: ${biome.id}, case ${i}`);
    assert(draw(opts, s, 5) === draw(opts, s, 5), `non-deterministic: ${biome.id}, case ${i}`);
    checked += 1;
  }
}
for (const [w, h] of [[128, 72], [108, 192], [384, 216], [250, 84]] as const) {
  const opts = { seed: 9, width: w, height: h, pan: false };
  assert(draw(opts, cases[0]!, 0) === draw(opts, cases[0]!, 24), `loop seam at ${w}×${h}`);
}
const base: WorldOptions = { seed: 1, width: 192, height: 108, pan: false };
assert(draw(base, cases[0]!, 0) !== draw({ ...base, seed: 2 }, cases[0]!, 0), 'different seeds should give different worlds');
assert(draw(base, cases[0]!, 0) !== draw(base, cases[0]!, 10), 'world should be animated');

// Palettes: every pixel must be one of the palette colours.
for (const palette of PALETTES.filter(p => p.colors.length)) {
  const world = generateWorld(base);
  const r = new Raster(world.width, world.height);
  renderFrame(r, world, settings({ palette: palette.id }), 3);
  const allowed = new Set(palette.colors);
  for (let i = 0; i < r.data.length; i += 4) {
    const c = ((r.data[i] ?? 0) << 16) | ((r.data[i + 1] ?? 0) << 8) | (r.data[i + 2] ?? 0);
    assert(allowed.has(c), `${palette.id}: colour #${c.toString(16)} is not in the palette`);
  }
}

// State survives the URL and rejects garbage.
const state = defaultState(42);
state.pan = true;
state.format = 'banner';
state.caption = 'Hello';
state.settings = settings({ hour: 9.25, weather: 'storm', palette: 'custom', customPalette: [0x112233, 0xaabbcc], timelapse: true });
const round = fromParams(toParams(state), 0);
const sorted = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
assert(JSON.stringify(sorted(round)) === JSON.stringify(sorted(state)), 'state should round-trip through URL parameters');
const junk = fromParams(new URLSearchParams('seed=-5&time=99&weather=lava&format=x&frames=100000&palette=custom&colors=zz'), 7);
assert(junk.seed === 7 && junk.settings.hour === DEFAULT_SETTINGS.hour && junk.settings.weather === 'clear' && junk.format === 'wide', 'invalid input must fall back');
assert(junk.settings.frames === DEFAULT_SETTINGS.frames && junk.settings.palette === 'original', 'invalid frames/palette must fall back');

// GIF: valid header, loops, and frame differencing keeps it small.
const world = generateWorld(worldOptions(defaultState(5)));
const r = new Raster(world.width, world.height);
const s = settings({ frames: 12 });
const frames = Array.from({ length: 12 }, (_, i) => (renderFrame(r, world, s, i), r.data.slice()));
const gif = encodeGif(frames, world.width, world.height, s, 2);
assert(String.fromCharCode(...gif.slice(0, 6)) === 'GIF89a', 'GIF header');
assert(gif.length < 12 * world.width * world.height * 4, 'GIF should be compressed');
console.log(`render check: ok (${checked} biome cases)`);
