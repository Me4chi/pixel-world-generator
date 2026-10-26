// Self-check: worlds are deterministic and every animation loops seamlessly.
// Run: npm test
import { Raster } from '../src/raster';
import { LOOP_FRAMES, renderFrame, type Settings } from '../src/render';
import { generateWorld } from '../src/world';

function assert(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}

const draw = (seed: number, settings: Settings, frame: number): string => {
  const r = new Raster(192, 108);
  renderFrame(r, generateWorld(seed), settings, frame);
  return Buffer.from(r.data).toString('base64');
};

const cases: Settings[] = [
  { hour: 12, weather: 'clear', intensity: 0.5 },
  { hour: 22, weather: 'clouds', intensity: 0.4 },
  { hour: 7, weather: 'rain', intensity: 1 },
  { hour: 17, weather: 'snow', intensity: 0.8 },
  { hour: 19, weather: 'fog', intensity: 0.7 },
];
for (const seed of [1, 42, 2024]) {
  for (const s of cases) {
    assert(draw(seed, s, 0) === draw(seed, s, LOOP_FRAMES), `loop seam: seed ${seed}, ${s.weather} @ ${s.hour}h`);
    assert(draw(seed, s, 5) === draw(seed, s, 5), `non-deterministic: seed ${seed}`);
  }
}
const s0 = cases[0]!;
assert(draw(1, s0, 0) !== draw(2, s0, 0), 'different seeds should give different worlds');
assert(draw(1, s0, 0) !== draw(1, s0, 10), 'world should be animated');
console.log('render check: ok');
