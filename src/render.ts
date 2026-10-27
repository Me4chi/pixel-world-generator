import { seasonLook, type Season } from './biomes';
import { bayer, mix, multiply } from './color';
import { clouds, fogBanks, life, lightning, precipitation, riverFlow, sky, water } from './effects';
import { drawTree } from './flora';
import { lightAt, type Weather } from './lighting';
import { lit, type Paint, SNOW, wave } from './paint';
import { applyPalette, PALETTES } from './palettes';
import { Raster } from './raster';
import { drawPoi } from './structures';
import { layout, riverWidth, riverX, type World } from './world';

export interface Layers {
  clouds: boolean;
  structures: boolean;
  life: boolean;
  weather: boolean;
}

/** A 1-bit text mask (1 = ink), drawn centred near the top of the frame. */
export interface Caption {
  mask: Uint8Array;
  width: number;
  height: number;
}

export interface Settings {
  /** 0..24 */
  hour: number;
  weather: Weather;
  /** 0..1 */
  intensity: number;
  season: Season | 'auto';
  /** The whole day passes during one loop. */
  timelapse: boolean;
  /** Frames in one seamless loop. */
  frames: number;
  fps: number;
  /** Palette id from PALETTES, or 'custom'. */
  palette: string;
  customPalette?: number[];
  layers: Layers;
  caption?: Caption | null;
}

export const DEFAULT_SETTINGS: Settings = {
  hour: 21,
  weather: 'clear',
  intensity: 0.6,
  season: 'auto',
  timelapse: false,
  frames: 72,
  fps: 10,
  palette: 'original',
  layers: { clouds: true, structures: true, life: true, weather: true },
};

const wide = new Map<string, Raster>();

/** Renders frame `frame` of the loop into `out` (width × height of the world). */
export function renderFrame(out: Raster, world: World, settings: Settings, frame: number): void {
  const frames = Math.max(1, settings.frames);
  const f = ((frame % frames) + frames) % frames;
  const t = f / frames;
  const hour = settings.timelapse ? (settings.hour + 24 * t) % 24 : settings.hour;
  const { weather, intensity, layers } = settings;
  const light = lightAt(hour, weather, intensity, world.width, world.ground - 4);
  const look = seasonLook(world.biome, settings.season);
  const fog =
    (weather === 'fog' ? intensity * 0.8 : weather === 'rain' ? intensity * 0.25 : weather === 'storm' ? intensity * 0.3 : 0) + (world.biome.id === 'swamp' ? 0.12 : 0);

  let target = out;
  if (world.pan) {
    const key = `${world.span}x${world.height}`;
    target = wide.get(key) ?? new Raster(world.span, world.height, true);
    wide.set(key, target);
  }
  const camX = world.pan ? t * world.span : 0;
  const p: Paint = {
    r: target,
    world,
    light,
    look,
    t,
    frame: f,
    duration: frames / Math.max(1, settings.fps),
    fog: Math.min(1, fog),
    wind: weather === 'storm' ? 2.2 : weather === 'rain' ? 1.6 : 1,
  };
  const calm = weather === 'clear' || weather === 'clouds';
  const precip = !layers.weather ? null : weather === 'rain' || weather === 'storm' || weather === 'snow' ? weather : null;

  sky(p, camX, intensity, weather === 'rain');
  if (layers.clouds) clouds(p);
  terrain(p, layers.structures);

  // Ground objects back to front; water is drawn once everything behind it exists, so it can reflect it.
  const { lakeTop } = layout(world.height);
  const items: { y: number; draw: () => void }[] = [];
  for (const tree of world.groundTrees) items.push({ y: tree.y, draw: () => drawTree(p, tree, 0.72 + ((tree.y - world.ground) / (world.height - world.ground)) * 0.25, 0.8) });
  for (const rock of world.rocks) items.push({ y: rock.y, draw: () => drawRock(p, rock.x, rock.y, rock.s) });
  for (const bush of world.bushes) items.push({ y: bush.y, draw: () => drawBush(p, bush.x, bush.y, bush.s) });
  if (layers.structures) for (const poi of world.pois) if (!poi.far) items.push({ y: poi.y, draw: () => drawPoi(p, poi) });
  items.sort((a, b) => a.y - b.y);
  const waters = [...world.waters].sort((a, b) => a.top - b.top);
  let wi = 0;
  const flushWater = (y: number): void => {
    while (wi < waters.length && waters[wi]!.top <= y) water(p, waters[wi++]!);
  };
  details(p, lakeTop);
  for (const item of items) {
    flushWater(item.y);
    item.draw();
  }
  flushWater(Infinity);
  if (layers.life) life(p, calm, camX);
  for (const tree of world.nearTrees) drawTree(p, tree, 1, 1);

  fogBanks(p);
  if (precip) precipitation(p, precip, intensity, false);
  if (layers.weather && (calm || weather === 'fog')) precipitation(p, null, intensity, true);
  if (precip === 'storm' && lightning(p, frames)) flash(target, f, world.events.lightning, frames);

  if (world.pan) target.copyWindow(out, camX);
  if (settings.caption) drawCaption(out, settings.caption, light.skyTop);
  const palette = settings.palette === 'custom' ? { colors: settings.customPalette ?? [], ramp: false } : PALETTES.find(pl => pl.id === settings.palette);
  if (palette && palette.colors.length) applyPalette(out, palette.colors, palette.ramp ?? false);
}

function flash(r: Raster, frame: number, events: number[], frames: number): void {
  const first = events.some(ev => Math.round(ev * frames) % frames === frame);
  const a = first ? 0.35 : 0.15;
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = (d[i] ?? 0) + (235 - (d[i] ?? 0)) * a;
    d[i + 1] = (d[i + 1] ?? 0) + (240 - (d[i + 1] ?? 0)) * a;
    d[i + 2] = (d[i + 2] ?? 0) + (255 - (d[i + 2] ?? 0)) * a;
  }
}

function terrain(p: Paint, structures: boolean): void {
  const { world, look } = p;
  const { biome, span, height, ground } = world;
  const snowy = look.snow;
  const farTop = Math.min(...world.far);
  for (let x = 0; x < span; x += 1) {
    const top = world.far[x] ?? 0;
    for (let y = top; y < height; y += 1) {
      const peak = (world.snowPeaks || snowy) && y - top < 3 && top < farTop + height * 0.08;
      p.r.px(x, y, lit(p, peak ? SNOW : y === top ? mix(biome.far, 0xffffff, 0.2) : biome.far, 0.05));
    }
  }
  for (let x = 0; x < span; x += 1) {
    const top = world.mid[x] ?? 0;
    for (let y = top; y < height; y += 1) p.r.px(x, y, lit(p, snowy && y - top < 2 ? mix(biome.mid, SNOW, 0.7) : biome.mid, 0.3));
  }
  for (const t of world.midTrees) drawTree(p, t, 0.3, 0);

  const grass = look.grass;
  for (let x = 0; x < span; x += 1) {
    const top = world.hills[x] ?? ground;
    for (let y = top; y < ground; y += 1) p.r.px(x, y, lit(p, y === top ? grass.mid : grass.dark, 0.55));
  }
  for (const t of world.hillTrees) drawTree(p, t, 0.6, 0.5);
  if (structures) for (const poi of world.pois) if (poi.far) drawPoi(p, poi);

  const below = height - ground;
  for (let y = ground; y < height; y += 1) {
    for (let x = 0; x < span; x += 1) {
      const depth = 0.7 + ((y - ground) / below) * 0.3;
      const band = (y - ground) / below + bayer(x, y) * 0.3;
      // Sparse texture: tiny patches of light and dark grass give the ground grain.
      const grain = (x * 7 + y * 13) % 29 === 0 ? grass.light : (x * 11 + y * 5) % 37 === 0 ? grass.dark : null;
      p.r.px(x, y, lit(p, y === ground ? grass.light : grain ?? (band > 0.75 ? grass.dark : grass.mid), depth));
    }
  }
  const river = world.river;
  if (river) riverFlow(p, y => riverX(river, y), y => riverWidth(river, y), river.yTop, river.yEnd);
}

function details(p: Paint, lakeTop: number): void {
  const { world, look } = p;
  if (!look.snow && world.biome.id !== 'desert') {
    for (const fl of world.flowers) if (look.blossom || fl.y % 3 < 1.2) p.r.px(fl.x, fl.y, lit(p, fl.color, 0.85));
  }
  const wind = p.wind;
  // Desert tufts are dry, darker scrub rather than bright blades.
  const desert = world.biome.id === 'desert';
  const c = lit(p, look.snow ? mix(look.grass.light, SNOW, 0.6) : desert ? mix(look.grass.dark, 0x6a5a30, 0.4) : look.grass.light, 0.9);
  for (const [i, tuft] of world.tufts.entries()) {
    if (desert && i % 3 !== 0) continue;
    if (tuft.y > lakeTop - 1 && world.waters.some(w => w.kind !== 'sea' && Math.abs(tuft.x - w.x) < w.w / 2)) continue;
    const sway = Math.round(wave(p, 0.4, tuft.phase) * 0.6 * wind);
    p.r.px(tuft.x, tuft.y, c);
    p.r.px(tuft.x + sway, tuft.y - 1, c);
    p.r.px(tuft.x + 2, tuft.y, c);
    p.r.px(tuft.x + 2 + sway, tuft.y - 1, c);
  }
}

function drawRock(p: Paint, x: number, y: number, s: number): void {
  const stone = p.world.biome.stone;
  for (let row = 0; row < s; row += 1) {
    const inset = Math.round(((s - row) / s) ** 2 * (s / 2));
    for (let dx = inset; dx <= s + 1 - inset; dx += 1) {
      const c = row === 0 && p.look.snow ? SNOW : row < 1 ? mix(stone, 0xffffff, 0.2) : dx > s / 2 ? mix(stone, 0x000000, 0.25) : stone;
      p.r.px(x + dx, y - s + row, lit(p, c, 0.85));
    }
  }
}

function drawBush(p: Paint, x: number, y: number, s: number): void {
  const leaves = p.look.bare ? null : p.look.canopy;
  for (let dy = -s; dy <= 0; dy += 1) {
    for (let dx = -s - 1; dx <= s + 1; dx += 1) {
      if ((dx / (s + 1)) ** 2 + (dy / s) ** 2 > 1) continue;
      const c = !leaves ? mix(p.world.biome.trunk, 0x000000, 0.1) : dy < -s / 2 ? leaves.light : dx > 0 ? leaves.dark : leaves.mid;
      if (!leaves && (dx + dy) % 2 !== 0) continue;
      p.r.px(x + dx, y + dy, lit(p, p.look.snow && dy === -s ? SNOW : c, 0.85));
    }
  }
  if (p.look.blossom && leaves) p.r.px(x, y - s, lit(p, 0xf8e0ea, 0.85));
}

function drawCaption(r: Raster, c: Caption, shadow: number): void {
  const x0 = Math.round((r.width - c.width) / 2);
  const y0 = Math.max(2, Math.round(r.height * 0.06));
  const dark = multiply(shadow, 0x606060);
  for (let y = 0; y < c.height; y += 1) {
    for (let x = 0; x < c.width; x += 1) {
      if (!c.mask[y * c.width + x]) continue;
      r.px(x0 + x + 1, y0 + y + 1, dark);
    }
  }
  for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) if (c.mask[y * c.width + x]) r.px(x0 + x, y0 + y, 0xf4ecd8);
}
