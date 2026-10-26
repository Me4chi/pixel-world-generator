import { exportGif } from './gif';
import type { Weather } from './lighting';
import { Raster } from './raster';
import { FRAME_MS, LOOP_FRAMES, renderFrame, type Settings } from './render';
import { generateWorld, HEIGHT, WIDTH, type World } from './world';
import './style.css';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing`);
  return el as T;
};

const canvas = $<HTMLCanvasElement>('preview');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D canvas is unavailable');
const seedInput = $<HTMLInputElement>('seed');
const timeInput = $<HTMLInputElement>('time');
const intensityInput = $<HTMLInputElement>('intensity');
const scaleInput = $<HTMLSelectElement>('scale');
const playButton = $<HTMLButtonElement>('play');
const exportButton = $<HTMLButtonElement>('export');
const status = $('status');
const weatherInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="weather"]')];
const WEATHERS: readonly Weather[] = ['clear', 'clouds', 'rain', 'snow', 'fog'];

const raster = new Raster(WIDTH, HEIGHT);
const image = new ImageData(WIDTH, HEIGHT);
let world: World;
let seed = 0;
let settings: Settings = { hour: 21, weather: 'clear', intensity: 0.6 };
let frame = 0;
let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const formatHour = (h: number): string => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const clampSeed = (n: number): number => (Number.isFinite(n) ? Math.abs(Math.floor(n)) % 1_000_000_000 : 0);

/** Settings live in the URL hash, so any world can be shared as a link. */
function readHash(): void {
  const params = new URLSearchParams(location.hash.slice(1));
  seed = params.has('seed') ? clampSeed(Number(params.get('seed'))) : Math.floor(Math.random() * 1_000_000);
  const hour = Number(params.get('time'));
  const intensity = Number(params.get('intensity'));
  const weather = params.get('weather') as Weather | null;
  settings = {
    hour: params.has('time') && hour >= 0 && hour <= 24 ? hour : settings.hour,
    weather: weather && WEATHERS.includes(weather) ? weather : settings.weather,
    intensity: params.has('intensity') && intensity >= 0 && intensity <= 1 ? intensity : settings.intensity,
  };
}

function writeHash(): void {
  const params = new URLSearchParams({ seed: String(seed), time: String(settings.hour), weather: settings.weather, intensity: String(settings.intensity) });
  history.replaceState(null, '', `#${params}`);
}

function syncInputs(): void {
  seedInput.value = String(seed);
  timeInput.value = String(settings.hour);
  intensityInput.value = String(settings.intensity);
  for (const input of weatherInputs) input.checked = input.value === settings.weather;
  $('time-out').textContent = formatHour(settings.hour);
  $('intensity-out').textContent = `${Math.round(settings.intensity * 100)}%`;
  intensityInput.disabled = settings.weather === 'clear';
}

function draw(): void {
  renderFrame(raster, world, settings, frame);
  image.data.set(raster.data);
  ctx!.putImageData(image, 0, 0);
}

function update(regenerate: boolean): void {
  if (regenerate) {
    world = generateWorld(seed);
    $('biome').textContent = world.biome.name;
    $('structure').textContent = world.structure.kind;
  }
  syncInputs();
  writeHash();
  draw();
}

seedInput.addEventListener('change', () => {
  seed = clampSeed(Number(seedInput.value));
  update(true);
});
$('random').addEventListener('click', () => {
  seed = Math.floor(Math.random() * 1_000_000);
  update(true);
});
timeInput.addEventListener('input', () => {
  settings = { ...settings, hour: Number(timeInput.value) };
  update(false);
});
intensityInput.addEventListener('input', () => {
  settings = { ...settings, intensity: Number(intensityInput.value) };
  update(false);
});
for (const input of weatherInputs) {
  input.addEventListener('change', () => {
    settings = { ...settings, weather: input.value as Weather };
    update(false);
  });
}

function setPlaying(next: boolean): void {
  playing = next;
  playButton.textContent = playing ? 'Pause' : 'Play';
  playButton.setAttribute('aria-pressed', String(playing));
}
playButton.addEventListener('click', () => setPlaying(!playing));

let last = 0;
function tick(now: number): void {
  if (playing && now - last >= FRAME_MS) {
    last = now;
    frame = (frame + 1) % LOOP_FRAMES;
    draw();
  }
  requestAnimationFrame(tick);
}

exportButton.addEventListener('click', async () => {
  exportButton.disabled = true;
  const scale = Number(scaleInput.value);
  try {
    const blob = await exportGif(world, settings, scale, p => (status.textContent = `Encoding… ${Math.round(p * 100)}%`));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pixel-world-${seed}-${settings.weather}-${formatHour(settings.hour).replace(':', '')}.gif`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    status.textContent = `Saved ${(blob.size / 1024 / 1024).toFixed(1)} MB · ${WIDTH * scale} × ${HEIGHT * scale}`;
  } catch (error) {
    console.error(error);
    status.textContent = 'Export failed — try a smaller GIF size.';
  } finally {
    exportButton.disabled = false;
  }
});

window.addEventListener('hashchange', () => {
  readHash();
  update(true);
});

readHash();
setPlaying(playing);
update(true);
requestAnimationFrame(tick);
