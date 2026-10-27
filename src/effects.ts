import { bayer, mix, multiply, rng } from './color';
import { cycles, dot, glow, line, type Paint, SNOW, TAU, wave } from './paint';
import { seaDistance, type Water } from './world';

/** Weather that blows particles across the frame. */
export type Precip = 'rain' | 'storm' | 'snow' | null;

/** Sky gradient, stars, aurora, shooting star, moon, sun and rainbow — everything behind the mountains. */
export function sky(p: Paint, camX: number, intensity: number, rain: boolean): void {
  const { light, world } = p;
  const { span, height, ground } = world;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < span; x += 1) {
      // Eight dithered bands read as pixel art rather than a smooth gradient.
      const band = Math.min(1, Math.floor((y / ground) * 8 + bayer(x, y)) / 8);
      p.r.px(x, y, mix(light.skyTop, light.skyBottom, band));
    }
  }
  for (const s of world.stars) dot(p, s.x, s.y, 0xf4f0e0, light.stars * (0.55 + 0.45 * wave(p, 0.4 * s.speed, s.phase)));

  const northern = world.biome.id === 'boreal' || world.biome.id === 'tundra' || p.look.snow;
  if (northern && light.stars > 0.4 && light.cover < 0.4) aurora(p, light.stars);
  if (light.stars > 0.6 && light.cover < 0.3) shootingStar(p, camX);

  if (light.moon) {
    const x = light.moon.x + camX;
    const y = light.moon.y;
    glow(p, x, y, 10, 0xc8d4f0, 1 - light.cover);
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const d = Math.hypot(dx, dy);
        if (d <= 4.2) p.r.px(x + dx, y + dy, d > 3.3 || (dx === 1 && dy === -1) ? 0xd8d4c4 : 0xf2eedc);
      }
    }
  }
  if (light.sun) {
    const x = light.sun.x + camX;
    glow(p, x, light.sun.y, 14, 0xfff0c0, 1 - light.cover);
    for (let dy = -5; dy <= 5; dy += 1) for (let dx = -5; dx <= 5; dx += 1) if (Math.hypot(dx, dy) <= 5.2) p.r.px(x + dx, light.sun.y + dy, 0xfff4d0);
    // A rainbow hangs opposite the sun after a light shower.
    if (rain && intensity <= 0.6) rainbow(p, camX + world.width - light.sun.x, ground);
  }
}

function aurora(p: Paint, strength: number): void {
  const { span, height } = p.world;
  const n = Math.max(1, Math.round(span / 90));
  for (let x = 0; x < span; x += 1) {
    const base = height * 0.1 + Math.sin((TAU * n * x) / span + TAU * p.t * cycles(p, 0.05)) * height * 0.05;
    const flicker = 0.6 + 0.4 * Math.sin(x * 0.13 + TAU * p.t * cycles(p, 0.2));
    const len = height * 0.2;
    for (let dy = 0; dy < len; dy += 1) {
      const k = dy / len;
      dot(p, x, base + dy, mix(0x60ffb0, 0x9a60ff, k), (1 - k) * 0.55 * strength * flicker);
    }
  }
}

function shootingStar(p: Paint, camX: number): void {
  const { width, height } = p.world;
  const window = 0.08;
  const k = (((p.t - p.world.events.shootingStar) % 1) + 1) % 1 / window;
  if (k >= 1) return;
  const x0 = camX + width * (0.2 + p.world.events.shootingStar * 0.5);
  const hx = x0 + k * width * 0.3;
  const hy = height * 0.08 + k * height * 0.15;
  for (let i = 0; i < 8; i += 1) p.r.px(hx - i * 2, hy - i, 0xffffff, (1 - i / 8) * (1 - k * 0.5));
}

function rainbow(p: Paint, cx: number, ground: number): void {
  const colors = [0xff4a4a, 0xffa040, 0xfff060, 0x60e060, 0x50a0ff, 0x9a60ff];
  const radius = p.world.height * 0.55;
  for (let band = 0; band < colors.length; band += 1) {
    const rr = radius - band;
    for (let a = 0; a <= 180; a += 0.5) {
      const x = cx + Math.cos((a * Math.PI) / 180) * rr;
      const y = ground - Math.sin((a * Math.PI) / 180) * rr;
      if (y < ground - 2) p.r.px(x, y, colors[band]!, 0.22);
    }
  }
}

/** Clouds drift yet loop: each exists twice, half a cycle apart, fading in and out of its drift. */
export function clouds(p: Paint): void {
  const { light, world } = p;
  const amount = Math.max(light.cover, 0.2);
  const count = Math.round(world.clouds.length * amount) + 1;
  const storm = light.cover > 0.95;
  const base = storm ? mix(multiply(0x8a90a0, light.tint), light.skyTop, 0.3) : mix(multiply(0xf4f4f4, light.tint), light.skyBottom, 0.35);
  const shade = mix(base, light.skyTop, 0.35);
  for (const [i, c] of world.clouds.slice(0, count).entries()) {
    for (const copy of [0, 0.5]) {
      const k = (p.t + c.phase + copy) % 1;
      const fade = Math.sin(Math.PI * k);
      const cx = c.x + k * 26 * p.wind - 13;
      const w = c.w * (0.8 + amount * 0.5);
      const h = c.h * (storm ? 1.6 : 1);
      for (let dy = 0; dy < h; dy += 1) {
        const half = (w / 2) * Math.sqrt(Math.max(0, 1 - ((dy - h * 0.6) / h) ** 2)) * (dy < h * 0.4 ? 0.7 + (i % 3) * 0.1 : 1);
        for (let dx = -half; dx <= half; dx += 1) dot(p, cx + dx, c.y + dy, dy > h * 0.6 ? shade : base, fade * 0.95);
      }
    }
  }
}

/** Lakes, ponds and seas mirror what is already drawn above them. */
export function water(p: Paint, w: Water): void {
  const { light, world, r } = p;
  const frozen = p.look.snow && (w.kind === 'lake' || w.kind === 'swamp') && world.biome.id !== 'coast';
  const color =
    w.kind === 'swamp' ? mix(multiply(0x3a4a2a, light.tint), light.skyBottom, 0.2) : mix(multiply(w.kind === 'oasis' ? 0x2a8aa0 : 0x3a6a8a, light.tint), light.skyBottom, 0.3);
  const n = cycles(p, 0.6);
  if (w.kind === 'sea') {
    const horizon = world.ground;
    for (let y = horizon; y < world.height; y += 1) {
      const foam = Math.sin(TAU * p.t * cycles(p, 0.3) + y * 0.3) * 1.5;
      for (let x = 0; x < world.span; x += 1) {
        const dist = seaDistance(world, w, x, y);
        if (dist < -2) continue;
        if (dist < 0) {
          r.px(x, y, mix(multiply(world.biome.soil, light.tint), light.haze, 0.2));
          continue;
        }
        const k = (y - horizon) / Math.max(1, world.height - horizon);
        const reflected = r.get(x, horizon - 1 - (y - horizon) * 1.4);
        let c = mix(reflected, color, 0.55 + k * 0.2);
        const crest = Math.sin(TAU * (y / 5 - p.t * n) + x * 0.12) > 0.93 - k * 0.05;
        if (crest || dist < 1.5 + foam) c = mix(c, 0xf0f6fa, 0.7);
        r.px(x, y, c);
      }
    }
    return;
  }
  for (let y = Math.round(w.top); y < w.top + w.depth; y += 1) {
    const k = (y - w.top) / w.depth;
    const half = (w.w / 2) * Math.sqrt(Math.max(0, 1 - k * k));
    const ripple = frozen ? 0 : Math.round(Math.sin(TAU * (p.t * n + y * 0.37)));
    const srcY = w.top - 1 - (y - w.top) * 1.7;
    for (let x = Math.ceil(w.x - half); x <= w.x + half; x += 1) {
      let c = mix(r.get(x + ripple, srcY), color, (w.kind === 'swamp' ? 0.6 : 0.4) + k * 0.3);
      if (frozen) c = mix(c, 0xdde6ee, 0.65);
      const sparkle = !frozen && w.kind !== 'swamp' && k < 0.5 && Math.sin(TAU * (p.t * n + x * 0.21 + y * 0.53)) > 0.993;
      r.px(x, y, sparkle ? mix(c, 0xffffff, 0.5) : c);
      if (w.kind === 'swamp' && !frozen && (x * 13 + y * 7) % 23 === 0) r.px(x, y, multiply(0x5a8a3a, light.tint));
    }
    r.px(w.x - half - 1, y, multiply(world.biome.soil, light.tint));
    r.px(w.x + half + 1, y, multiply(world.biome.soil, light.tint));
  }
}

export function riverFlow(p: Paint, xAt: (y: number) => number, widthAt: (y: number) => number, yTop: number, yEnd: number): void {
  const { light, world, r } = p;
  const frozen = p.look.snow && world.biome.id !== 'coast';
  const base = mix(multiply(0x4a7a9a, light.tint), light.skyBottom, 0.35);
  const n = cycles(p, 0.8);
  for (let y = Math.round(yTop); y < Math.min(world.height, yEnd); y += 1) {
    const cx = xAt(y);
    const half = widthAt(y) / 2;
    for (let x = Math.round(cx - half); x <= cx + half; x += 1) {
      const flow = (((y - p.t * n * 8 + (x - cx) * 2) % 8) + 8) % 8 < 1;
      r.px(x, y, frozen ? mix(base, 0xdde6ee, 0.65) : flow ? mix(base, 0xffffff, 0.45) : base);
    }
  }
}

/** Birds, fireflies, a boat, jumping fish and grazing sheep. */
export function life(p: Paint, calm: boolean, camX: number): void {
  const { world, light } = p;
  if (calm && light.lightsOn && !p.look.snow) {
    for (const ff of world.fireflies) {
      const a = TAU * (p.t * cycles(p, 0.25) + ff.phase);
      const x = ff.x + Math.cos(a) * ff.r;
      const y = ff.y + Math.sin(a * 2) * ff.r * 0.4;
      if (wave(p, 0.7, ff.phase * 3) > -0.2) {
        p.r.px(x, y, 0xfff4a0);
        glow(p, x, y, 2, 0xe8d860, 1.2);
      }
    }
  }
  if (calm && light.sun) {
    for (const b of world.birds) {
      const x = camX + ((p.t * cycles(p, 0.12) + b.offset / 60) % 1) * (world.width + 24) - 12;
      const y = b.y + wave(p, 0.25, b.offset) * 2;
      const up = Math.floor(p.frame / 3 + b.offset) % 2 === 0;
      const c = mix(0x2a2a34, light.haze, 0.2);
      for (const [dx, dy] of [[0, 0], [-1, up ? -1 : 0], [1, up ? -1 : 0], [-2, up ? -1 : 1], [2, up ? -1 : 1]] as const) p.r.px(x + dx, y + dy, c);
    }
  }
  const boatWater = world.waters.find(w => w.kind === 'sea' || (w.kind === 'lake' && w.w > 34));
  if (boatWater && !(p.look.snow && boatWater.kind === 'lake')) {
    const sea = boatWater.kind === 'sea';
    const range = sea ? world.span * 0.12 : boatWater.w * 0.25;
    const centre = sea ? boatWater.x + boatWater.side * world.span * 0.18 : boatWater.x;
    const bx = centre + Math.sin(TAU * p.t * cycles(p, 0.03)) * range;
    const by = boatWater.top + boatWater.depth * (sea ? 0.25 : 0.35) + (wave(p, 0.5) > 0 ? 1 : 0);
    const hull = multiply(0x6a4a2a, light.tint);
    p.r.rect(bx - 4, by, 9, 1, hull);
    p.r.rect(bx - 3, by + 1, 7, 1, hull);
    p.r.rect(bx, by - 7, 1, 7, multiply(0x4a3a2a, light.tint));
    for (let i = 0; i < 6; i += 1) p.r.rect(bx + 1, by - 7 + i, Math.ceil(i * 0.7), 1, multiply(0xf0ece0, light.tint));
    if (light.lightsOn) glow(p, bx, by - 2, 4, 0xffc060, 1);
  }
  if (!p.look.snow) {
    for (const fish of world.events.fish) {
      const k = ((((p.t - fish.t) % 1) + 1) % 1) / 0.06;
      if (k >= 1) continue;
      const fx = fish.x + k * 5;
      const fy = fish.y - Math.sin(Math.PI * k) * 5;
      p.r.px(fx, fy, multiply(0xd8e0e8, light.tint));
      p.r.px(fx - 1, fy + (k < 0.5 ? 1 : -1), multiply(0xa8b8c8, light.tint));
      if (k > 0.8) dot(p, fish.x + 5, fish.y + 1, 0xffffff, 0.8);
    }
  }
  for (const s of world.sheep) {
    const wool = mix(multiply(0xf0ece4, light.tint), light.haze, 0.15);
    p.r.rect(s.x - 2, s.y - 3, 4, 2, wool);
    p.r.px(s.x - 2, s.y - 1, multiply(0x3a3a3a, light.tint));
    p.r.px(s.x + 1, s.y - 1, multiply(0x3a3a3a, light.tint));
    const grazing = wave(p, 0.2, s.phase) > 0;
    p.r.px(s.x + 2, s.y - (grazing ? 2 : 3), multiply(0x2a2a2a, light.tint));
  }
}

/** Rain, storm, snow, and petals or leaves on the wind. */
export function precipitation(p: Paint, precip: Precip, intensity: number, drift: boolean): void {
  const { world, light } = p;
  const { span, height } = world;
  if (precip === 'rain' || precip === 'storm') {
    const color = mix(light.skyBottom, 0xffffff, 0.45);
    const count = Math.round(world.drops.length * intensity * (precip === 'storm' ? 1.4 : 1));
    for (let i = 0; i < count; i += 1) {
      const d = world.drops[i % world.drops.length]!;
      const n = cycles(p, 1.3 + (i % 4) * 0.15);
      const k = (d.y + p.t * n + (i >= world.drops.length ? 0.5 : 0)) % 1;
      const y = -6 + k * (height + 6);
      const slant = precip === 'storm' ? 0.7 : 0.35;
      const x = (d.x + k * height * slant) % span;
      for (let s = 0; s < 4; s += 1) p.r.px(x + s * slant, y + s, color, 0.55);
    }
  } else if (precip === 'snow') {
    const count = Math.round(world.drops.length * intensity);
    for (let i = 0; i < count; i += 1) {
      const d = world.drops[i]!;
      const k = (d.y + p.t * cycles(p, 0.12 + (i % 2) * 0.08)) % 1;
      const y = -2 + k * (height + 2);
      const x = (d.x + Math.sin(TAU * (k * 2 + d.speed)) * 2 + span) % span;
      p.r.px(x, y, mix(SNOW, light.haze, 0.2));
      if (i % 5 === 0) p.r.px(x + 1, y, mix(SNOW, light.haze, 0.2));
    }
  }
  if (drift && p.look.drift) {
    const palette = p.look.drift === 'petals' ? [0xf8c0d0, 0xf0a0b8, 0xfff0f4] : [0xd8642a, 0xeea040, 0xb03a1e, 0xd8b030];
    const count = Math.round(span / 6);
    for (let i = 0; i < count; i += 1) {
      const d = world.drops[i % world.drops.length]!;
      const k = (d.y + p.t * cycles(p, 0.15 + (i % 3) * 0.04)) % 1;
      const x = (d.x + k * span * 0.6 * p.wind + span) % span;
      const y = -2 + k * (height + 2) + Math.sin(TAU * (k * 3 + d.speed)) * 3;
      const c = multiply(palette[i % palette.length]!, light.tint);
      p.r.px(x, y, c);
      if (Math.sin(TAU * (k * 4 + d.speed)) > 0) p.r.px(x + 1, y, c);
    }
  }
}

/** Storm lightning: a two-frame flash with a jagged bolt. Returns true while flashing. */
export function lightning(p: Paint, frames: number): boolean {
  const { world } = p;
  for (const [i, ev] of world.events.lightning.entries()) {
    const start = Math.round(ev * frames) % frames;
    const age = (p.frame - start + frames) % frames;
    if (age > 1) continue;
    const r = rng(world.seed + i * 31);
    let x = world.span * (0.15 + r() * 0.7);
    let y = world.height * 0.12;
    const color = age === 0 ? 0xffffff : 0xc8d8ff;
    while (y < world.ground - 4) {
      const nx = x + (r() - 0.5) * 8;
      const ny = y + 2 + r() * 4;
      line(p, x, y, nx, ny, color);
      if (r() < 0.2) line(p, nx, ny, nx + (r() - 0.5) * 10, ny + 5, color, 0.6);
      x = nx;
      y = ny;
    }
    return true;
  }
  return false;
}

export function fogBanks(p: Paint): void {
  if (p.fog <= 0) return;
  const { world, light } = p;
  for (let y = Math.round(world.height * 0.3); y < world.height; y += 1) {
    const band = Math.exp(-(((y - (world.ground - 6)) / (world.height * 0.15)) ** 2));
    const roll = 0.85 + 0.15 * Math.sin(TAU * (p.t + y * 0.05));
    const alpha = p.fog * (0.15 + 0.6 * band) * roll;
    for (let x = 0; x < world.span; x += 1) p.r.px(x, y, light.haze, alpha);
  }
}
