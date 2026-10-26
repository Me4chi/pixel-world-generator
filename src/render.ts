import { bayer, mix, multiply } from './color';
import { type Light, lightAt, type Weather } from './lighting';
import type { Raster } from './raster';
import { type Biome, type Foliage, GROUND, HEIGHT, LAKE_TOP, type Tree, WIDTH, type World } from './world';

/** Frames in one seamless loop; every animation completes a whole number of cycles in it. */
export const LOOP_FRAMES = 72;
export const FRAME_MS = 100;

export interface Settings {
  /** 0..24 */
  hour: number;
  weather: Weather;
  /** 0..1 */
  intensity: number;
}

const TAU = Math.PI * 2;
const SNOW = 0xe8eef6;
const LAKE_DEPTH = 13;

interface Frame {
  r: Raster;
  world: World;
  light: Light;
  biome: Biome;
  /** Loop position 0..1 — periodic animation uses only this. */
  t: number;
  frame: number;
  weather: Weather;
  intensity: number;
  fog: number;
}

/** Light a surface colour at a depth (0 = horizon, 1 = foreground). */
function lit(f: Frame, color: number, depth: number): number {
  const haze = (1 - depth) * 0.55 + f.fog * (1 - depth * 0.7);
  return mix(multiply(color, f.light.tint), f.light.haze, haze);
}

/** Dithered alpha: keeps edges crisp and the GIF palette small. */
function dot(f: Frame, x: number, y: number, color: number, alpha: number): void {
  if (alpha > bayer(Math.round(x), Math.round(y))) f.r.px(x, y, color);
}

function glow(f: Frame, x: number, y: number, radius: number, color: number, strength: number): void {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const d = Math.hypot(dx, dy) / radius;
      if (d < 1) f.r.px(x + dx, y + dy, color, Math.ceil((1 - d) * 3) / 3 * 0.28 * strength);
    }
  }
}

function sky(f: Frame): void {
  const { light } = f;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      // Eight dithered bands read as pixel art rather than a smooth gradient.
      const band = Math.min(1, Math.floor((y / GROUND) * 8 + bayer(x, y)) / 8);
      f.r.px(x, y, mix(light.skyTop, light.skyBottom, band));
    }
  }
  for (const s of f.world.stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(TAU * (f.t * s.speed + s.phase));
    dot(f, s.x, s.y, 0xf4f0e0, light.stars * twinkle);
  }
  if (light.moon) {
    const { x, y } = light.moon;
    glow(f, x, y, 10, 0xc8d4f0, 1 - light.cover);
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const d = Math.hypot(dx, dy);
        if (d <= 4.2) f.r.px(x + dx, y + dy, d > 3.3 || (dx === 1 && dy === -1) ? 0xd8d4c4 : 0xf2eedc);
      }
    }
  }
  if (light.sun) {
    const { x, y } = light.sun;
    glow(f, x, y, 14, 0xfff0c0, 1 - light.cover);
    for (let dy = -5; dy <= 5; dy += 1) {
      for (let dx = -5; dx <= 5; dx += 1) if (Math.hypot(dx, dy) <= 5.2) f.r.px(x + dx, y + dy, 0xfff4d0);
    }
  }
}

/**
 * Clouds drift slowly yet loop: each cloud exists twice, half a cycle apart, and fades in as it
 * enters its drift and out as it leaves — one copy is always taking over from the other.
 */
function clouds(f: Frame): void {
  const amount = Math.max(f.light.cover, 0.2);
  const count = Math.round(f.world.clouds.length * amount) + 1;
  const base = mix(multiply(0xf4f4f4, f.light.tint), f.light.skyBottom, 0.35);
  const shade = mix(base, f.light.skyTop, 0.35);
  for (const [i, c] of f.world.clouds.slice(0, count).entries()) {
    for (const copy of [0, 0.5]) {
      const p = (f.t + c.phase + copy) % 1;
      const fade = Math.sin(Math.PI * p);
      const cx = c.x + p * 26 - 13;
      const w = c.w * (0.8 + amount * 0.4);
      for (let dy = 0; dy < c.h; dy += 1) {
        const half = (w / 2) * Math.sqrt(1 - ((dy - c.h * 0.6) / c.h) ** 2) * (dy < c.h * 0.4 ? 0.7 + (i % 3) * 0.1 : 1);
        for (let dx = -half; dx <= half; dx += 1) dot(f, cx + dx, c.y + dy, dy > c.h * 0.6 ? shade : base, fade * 0.95);
      }
    }
  }
}

function pine(f: Frame, tree: Tree, colors: Foliage, depth: number, sway: number): void {
  const h = Math.round(tree.h);
  const light = f.weather === 'snow' ? mix(colors.light, SNOW, f.intensity) : colors.light;
  f.r.rect(tree.x, tree.y - 2, 1, 2, lit(f, f.biome.trunk, depth));
  for (let i = 0; i < h; i += 1) {
    const half = Math.floor(i / 3) + Math.floor((i % 4) / 2);
    const shift = Math.round(sway * (1 - i / h));
    const y = tree.y - 2 - h + i;
    for (let dx = -half; dx <= half; dx += 1) {
      const c = dx < -half / 3 ? light : dx > half / 3 ? colors.dark : colors.mid;
      f.r.px(tree.x + dx + shift, y, lit(f, c, depth));
    }
  }
}

function roundTree(f: Frame, tree: Tree, colors: Foliage, depth: number, sway: number): void {
  const trunkH = Math.round(tree.h * 0.4);
  const tw = tree.h > 20 ? 3 : 2;
  f.r.rect(tree.x - Math.floor(tw / 2), tree.y - trunkH, tw, trunkH, lit(f, f.biome.trunk, depth));
  const cy = tree.y - trunkH - tree.h * 0.3;
  const rx = tree.h * 0.36;
  const ry = tree.h * 0.32;
  const light = f.weather === 'snow' ? mix(colors.light, SNOW, f.intensity) : colors.light;
  for (let dy = -ry; dy <= ry; dy += 1) {
    const shift = Math.round(sway * (0.5 - dy / ry / 2));
    for (let dx = -rx; dx <= rx; dx += 1) {
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      const wobble = 0.85 + 0.15 * Math.sin(Math.atan2(dy, dx) * 5 + tree.phase * 9);
      if (d > wobble) continue;
      const x = Math.round(tree.x + dx + shift);
      const y = Math.round(cy + dy);
      const shadeV = -dx / rx * 0.45 - dy / ry * 0.6 + bayer(x, y) * 0.5 - 0.25;
      f.r.px(x, y, lit(f, shadeV > 0.3 ? light : shadeV < -0.3 ? colors.dark : colors.mid, depth));
    }
  }
}

function tree(f: Frame, t: Tree, depth: number, amplitude: number): void {
  const wind = f.weather === 'rain' ? 1.6 : 1;
  const sway = Math.sin(TAU * (f.t * 3 + t.phase)) * amplitude * wind;
  if (t.pine) pine(f, t, f.biome.foliage, depth, sway);
  else roundTree(f, t, f.biome.canopy, depth, sway);
}

function terrain(f: Frame): void {
  const { world, biome } = f;
  const snowy = f.weather === 'snow';
  for (let x = 0; x < WIDTH; x += 1) {
    const top = world.far[x] ?? 50;
    for (let y = top; y < HEIGHT; y += 1) {
      const peak = (world.snowPeaks || snowy) && y - top < 3 && top < 46;
      f.r.px(x, y, lit(f, peak ? SNOW : y === top ? mix(biome.far, 0xffffff, 0.2) : biome.far, 0.05));
    }
  }
  for (let x = 0; x < WIDTH; x += 1) {
    const top = world.mid[x] ?? 66;
    for (let y = top; y < HEIGHT; y += 1) f.r.px(x, y, lit(f, snowy && y - top < 2 ? mix(biome.mid, SNOW, 0.7) : biome.mid, 0.3));
  }
  for (const t of world.midTrees) pine(f, { ...t, h: t.h }, { dark: biome.mid, mid: biome.foliage.dark, light: biome.foliage.mid }, 0.3, 0);

  const grass = snowy ? { dark: mix(biome.grass.dark, SNOW, 0.7 * f.intensity), mid: mix(biome.grass.mid, SNOW, 0.85 * f.intensity), light: mix(biome.grass.light, SNOW, f.intensity) } : biome.grass;
  for (let x = 0; x < WIDTH; x += 1) {
    const top = world.hills[x] ?? 76;
    for (let y = top; y < GROUND; y += 1) f.r.px(x, y, lit(f, y === top ? grass.mid : grass.dark, 0.55));
  }
  for (const t of world.hillTrees) tree(f, t, 0.6, 0.5);
  for (let y = GROUND; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const depth = 0.7 + ((y - GROUND) / (HEIGHT - GROUND)) * 0.3;
      const band = (y - GROUND) / (HEIGHT - GROUND) + bayer(x, y) * 0.3;
      f.r.px(x, y, lit(f, y === GROUND ? grass.light : band > 0.75 ? grass.dark : grass.mid, depth));
    }
  }
}

function structure(f: Frame): void {
  const { kind, x } = f.world.structure;
  const base = GROUND + 3;
  const d = 0.8;
  const on = f.light.lightsOn;
  const flicker = 0.85 + 0.15 * Math.sin(TAU * f.t * 11);
  const window = (wx: number, wy: number, w: number, h: number): void => {
    f.r.rect(wx, wy, w, h, on ? 0xffd27a : lit(f, 0x2a2e3a, d));
    if (on) glow(f, wx + w / 2, wy + h / 2, 8, 0xffc060, flicker);
  };

  if (kind === 'cottage') {
    f.r.rect(x - 9, base - 10, 18, 10, lit(f, 0xcbb48c, d));
    f.r.rect(x - 9, base - 10, 1, 10, lit(f, 0x5a3e2a, d));
    f.r.rect(x + 8, base - 10, 1, 10, lit(f, 0x5a3e2a, d));
    f.r.rect(x - 2, base - 6, 3, 6, lit(f, 0x4a3022, d));
    window(x - 7, base - 8, 3, 3);
    window(x + 4, base - 8, 3, 3);
    const roof = f.weather === 'snow' ? mix(0x8a4630, SNOW, f.intensity) : 0x8a4630;
    for (let i = 0; i < 9; i += 1) f.r.rect(x - 2 - i * 1.2, base - 19 + i, 4 + i * 2.4, 1, lit(f, i < 2 ? mix(roof, 0xffffff, 0.15) : roof, d));
    f.r.rect(x + 4, base - 21, 2, 5, lit(f, 0x6a5a50, d));
    // Smoke: puffs rise and widen; four of them cycle through the loop.
    for (let i = 0; i < 4; i += 1) {
      const p = (f.t * 2 + i / 4) % 1;
      const py = base - 23 - p * 20;
      const px = x + 5 + Math.sin(TAU * p) * 2 + p * 6;
      const size = 1 + Math.round(p * 2);
      for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) dot(f, px + dx, py + dy, lit(f, 0xb8b8b8, 0.6), 1 - p);
    }
  } else if (kind === 'shrine') {
    const red = lit(f, 0xb0402e, d);
    f.r.rect(x - 9, base - 14, 2, 14, red);
    f.r.rect(x + 7, base - 14, 2, 14, red);
    f.r.rect(x - 12, base - 16, 24, 2, lit(f, 0x2a2224, d));
    f.r.rect(x - 10, base - 12, 20, 1, red);
    f.r.rect(x + 14, base - 3, 7, 3, lit(f, 0x8a8a84, d));
    f.r.rect(x + 16, base - 9, 3, 6, lit(f, 0x8a8a84, d));
    f.r.rect(x + 15, base - 10, 5, 1, lit(f, 0x6a6a64, d));
    f.r.rect(x + 17, base - 7, 1, 2, on ? 0xffd27a : lit(f, 0x2a2e3a, d));
    if (on) glow(f, x + 17, base - 6, 9, 0xffc060, flicker);
  } else {
    for (let i = 0; i < 22; i += 1) f.r.rect(x - 5 + i * 0.12, base - i - 1, 10 - i * 0.24, 1, lit(f, i % 6 === 0 ? 0xb8a888 : 0xd8ccb0, d));
    f.r.rect(x - 4, base - 25, 8, 3, lit(f, f.weather === 'snow' ? SNOW : 0x6a3a2a, d));
    f.r.rect(x - 1, base - 4, 2, 4, lit(f, 0x4a3022, d));
    window(x - 1, base - 14, 2, 2);
    // Four blades: a quarter turn per loop is a full visual cycle.
    const hubY = base - 21;
    for (let b = 0; b < 4; b += 1) {
      const angle = TAU * (f.t / 4 + b / 4);
      for (let s = 2; s <= 13; s += 0.5) {
        const bx = x + Math.cos(angle) * s;
        const by = hubY + Math.sin(angle) * s;
        f.r.px(bx, by, lit(f, 0x5a4434, d));
        if (s > 5) f.r.px(bx + Math.sin(angle), by - Math.cos(angle), lit(f, 0xe8e0d0, d));
      }
    }
    f.r.px(x, hubY, lit(f, 0x2a2224, d));
  }
}

function lake(f: Frame): void {
  const l = f.world.lake;
  if (!l) return;
  const water = mix(multiply(0x3a6a8a, f.light.tint), f.light.skyBottom, 0.3);
  const frozen = f.weather === 'snow' && f.intensity > 0.6;
  for (let y = LAKE_TOP; y < LAKE_TOP + LAKE_DEPTH; y += 1) {
    const k = (y - LAKE_TOP) / LAKE_DEPTH;
    const half = (l.w / 2) * Math.sqrt(1 - k * k);
    const cx = l.x + l.w / 2;
    const ripple = frozen ? 0 : Math.round(Math.sin(TAU * (f.t * 2 + y * 0.37)));
    const srcY = LAKE_TOP - 1 - (y - LAKE_TOP) * 1.7;
    for (let x = Math.ceil(cx - half); x <= cx + half; x += 1) {
      const reflected = f.r.get(x + ripple, srcY);
      let c = mix(reflected, water, 0.4 + k * 0.3);
      if (frozen) c = mix(c, 0xdde6ee, 0.6);
      const sparkle = !frozen && k < 0.5 && Math.sin(TAU * (f.t * 3 + x * 0.21 + y * 0.53)) > 0.993;
      f.r.px(x, y, sparkle ? mix(c, 0xffffff, 0.5) : c);
    }
    f.r.px(cx - half - 1, y, lit(f, 0x6a604a, 0.85));
    f.r.px(cx + half + 1, y, lit(f, 0x6a604a, 0.85));
  }
}

function details(f: Frame): void {
  const { world } = f;
  if (f.weather !== 'snow') for (const fl of world.flowers) f.r.px(fl.x, fl.y, lit(f, fl.color, 0.85));
  const wind = f.weather === 'rain' ? 2 : 1;
  for (const tuft of world.tufts) {
    const sway = Math.round(Math.sin(TAU * (f.t * 3 + tuft.phase)) * 0.6 * wind);
    const c = lit(f, f.weather === 'snow' ? mix(f.biome.grass.light, SNOW, 0.6) : f.biome.grass.light, 0.9);
    f.r.px(tuft.x, tuft.y, c);
    f.r.px(tuft.x + sway, tuft.y - 1, c);
    f.r.px(tuft.x + 2, tuft.y, c);
    f.r.px(tuft.x + 2 + sway, tuft.y - 1, c);
  }
  for (const t of world.nearTrees) tree(f, t, 1, 1);
}

function life(f: Frame): void {
  const calm = f.weather === 'clear' || f.weather === 'clouds';
  if (calm && f.light.lightsOn) {
    for (const ff of f.world.fireflies) {
      const a = TAU * (f.t * 2 + ff.phase);
      const x = ff.x + Math.cos(a) * ff.r;
      const y = ff.y + Math.sin(a * 2) * ff.r * 0.4;
      const on = Math.sin(TAU * (f.t * 5 + ff.phase * 3)) > -0.2;
      if (on) {
        f.r.px(x, y, 0xfff4a0);
        glow(f, x, y, 2, 0xe8d860, 1.2);
      }
    }
  }
  if (calm && f.light.sun) {
    for (const b of f.world.birds) {
      const x = ((f.t + b.offset / 60) % 1) * (WIDTH + 24) - 12;
      const y = b.y + Math.sin(TAU * (f.t * 2 + b.offset)) * 2;
      const up = Math.floor(f.frame / 3 + b.offset) % 2 === 0;
      const c = mix(0x2a2a34, f.light.haze, 0.2);
      f.r.px(x, y, c);
      f.r.px(x - 1, y + (up ? -1 : 0), c);
      f.r.px(x + 1, y + (up ? -1 : 0), c);
      f.r.px(x - 2, y + (up ? -1 : 1), c);
      f.r.px(x + 2, y + (up ? -1 : 1), c);
    }
  }
}

function precipitation(f: Frame): void {
  const { weather, intensity, world } = f;
  if (weather === 'rain') {
    const color = mix(f.light.skyBottom, 0xffffff, 0.45);
    const count = Math.round(world.drops.length * intensity);
    for (const [i, d] of world.drops.slice(0, count).entries()) {
      const falls = 9 + (i % 4);
      const p = (d.y + f.t * falls) % 1;
      const y = -6 + p * (HEIGHT + 6);
      const x = (d.x + p * 14) % WIDTH;
      for (let s = 0; s < 4; s += 1) f.r.px(x + s * 0.35, y + s, color, 0.55);
    }
    const l = world.lake;
    if (l) {
      for (let i = 0; i < Math.round(10 * intensity); i += 1) {
        const p = (f.t * 4 + i / 10) % 1;
        const rx = l.x + l.w * (0.15 + ((i * 37) % 70) / 100);
        const ry = LAKE_TOP + 2 + ((i * 5) % 8);
        const radius = Math.round(p * 3);
        dot(f, rx - radius, ry, color, 1 - p);
        dot(f, rx + radius, ry, color, 1 - p);
      }
    }
  } else if (weather === 'snow') {
    const count = Math.round(world.drops.length * intensity);
    for (const [i, d] of world.drops.slice(0, count).entries()) {
      const p = (d.y + f.t * (1 + (i % 2))) % 1;
      const y = -2 + p * (HEIGHT + 2);
      const x = (d.x + Math.sin(TAU * (p * 2 + d.speed)) * 2 + WIDTH) % WIDTH;
      f.r.px(x, y, mix(SNOW, f.light.haze, 0.2));
      if (i % 5 === 0) f.r.px(x + 1, y, mix(SNOW, f.light.haze, 0.2));
    }
  }
}

function fogBanks(f: Frame): void {
  if (f.fog <= 0) return;
  for (let y = 30; y < HEIGHT; y += 1) {
    const band = Math.exp(-(((y - (GROUND - 6)) / 16) ** 2));
    const roll = 0.85 + 0.15 * Math.sin(TAU * (f.t + y * 0.05));
    const alpha = f.fog * (0.15 + 0.6 * band) * roll;
    for (let x = 0; x < WIDTH; x += 1) f.r.px(x, y, f.light.haze, alpha);
  }
}

export function renderFrame(r: Raster, world: World, settings: Settings, frame: number): void {
  const f: Frame = {
    r,
    world,
    light: lightAt(settings.hour, settings.weather, settings.intensity, WIDTH, GROUND - 4),
    biome: world.biome,
    t: (((frame % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES) / LOOP_FRAMES,
    frame: ((frame % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES,
    weather: settings.weather,
    intensity: settings.intensity,
    fog: settings.weather === 'fog' ? settings.intensity * 0.8 : settings.weather === 'rain' ? settings.intensity * 0.25 : 0,
  };
  sky(f);
  clouds(f);
  terrain(f);
  structure(f);
  lake(f);
  details(f);
  life(f);
  fogBanks(f);
  precipitation(f);
}
