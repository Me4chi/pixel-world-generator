import { mix } from './color';
import { cycles, dot, glow, lamp, line, lit, type Paint, SNOW, TAU, WARM_LIGHT, wave } from './paint';
import { type Poi, riverWidth } from './world';

const ROOFS = [0x8a4630, 0x5a6a7a, 0xa88a4a, 0x6a3a4a, 0x3a5a4a];
const WALLS = [0xcbb48c, 0xd8cfc0, 0xb89a78, 0xe0d4b0];
const BANNERS = [0xb03a2e, 0x2e5ab0, 0xd8a830, 0x3a8a4a, 0x7a3a9a];

const pick = <T>(list: readonly T[], v: number, salt = 0): T => list[Math.floor(((v * 9973 + salt * 7.31) % 1) * list.length)] ?? list[0]!;

/** Depth of a structure: hill structures are distant, ground ones come closer the lower they stand. */
function depthOf(p: Paint, poi: Poi): number {
  if (poi.far) return 0.5;
  const below = p.world.height - p.world.ground;
  return 0.72 + Math.min(1, Math.max(0, (poi.y - p.world.ground) / below)) * 0.25;
}

function wall(p: Paint, x: number, y: number, w: number, h: number, color: number, d: number, pattern: 'plaster' | 'brick' | 'log' | 'stone' | 'timber'): void {
  p.r.rect(x, y, w, h, lit(p, color, d));
  const dark = lit(p, mix(color, 0x000000, 0.25), d);
  const light = lit(p, mix(color, 0xffffff, 0.15), d);
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      const X = x + xx;
      const Y = y + yy;
      if (pattern === 'brick' && (yy % 3 === 2 || (xx + (Math.floor(yy / 3) % 2) * 2) % 4 === 0)) p.r.px(X, Y, dark);
      if (pattern === 'stone' && (yy % 4 === 3 || (xx + Math.floor(yy / 4) * 3) % 5 === 0)) p.r.px(X, Y, dark);
      if (pattern === 'log' && yy % 2 === 1) p.r.px(X, Y, dark);
      if (pattern === 'timber' && (xx === 0 || xx === w - 1 || yy === 0 || xx === Math.floor(w / 2) || (yy === Math.floor(h / 2)) || Math.abs(xx - yy) === 0)) p.r.px(X, Y, lit(p, 0x4a3022, d));
    }
  }
  p.r.rect(x, y, 1, h, light);
}

/** Gable roof; snow covers the upper rows in winter. */
function roof(p: Paint, cx: number, baseY: number, half: number, h: number, color: number, d: number): void {
  for (let i = 0; i < h; i += 1) {
    const w = Math.round((half * (i + 1)) / h);
    const y = baseY - h + i;
    const snowy = p.look.snow && i < h * 0.6;
    const c = snowy ? SNOW : i % 2 === 0 ? mix(color, 0xffffff, 0.08) : color;
    p.r.rect(cx - w, y, w * 2 + 1, 1, lit(p, c, d));
    p.r.px(cx - w, y, lit(p, mix(c, 0x000000, 0.3), d));
  }
}

function door(p: Paint, x: number, y: number, w: number, h: number, d: number): void {
  p.r.rect(x, y, w, h, lit(p, 0x4a3022, d));
  p.r.px(x + w - 1, y + Math.floor(h / 2), lit(p, 0xd8b060, d));
}

function chimneySmoke(p: Paint, x: number, y: number, d: number, phase: number): void {
  const n = cycles(p, 0.25);
  for (let i = 0; i < 4; i += 1) {
    const k = (p.t * n + i / 4 + phase) % 1;
    const size = 1 + Math.round(k * 2);
    const px = x + Math.sin(TAU * k) * 2 + k * 6 * p.wind;
    const py = y - k * 18;
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) dot(p, px + dx, py + dy, lit(p, 0xb8b8b8, d * 0.8), 1 - k);
  }
}

function flag(p: Paint, x: number, top: number, color: number, d: number, phase: number): void {
  p.r.rect(x, top, 1, 6, lit(p, 0x3a3a3a, d));
  for (let c = 0; c < 5; c += 1) {
    const off = Math.round(wave(p, 0.8, phase + c * 0.12) * (c / 4) * p.wind);
    p.r.rect(x + 1 + c, top + off, 1, 3, lit(p, c % 2 === 0 ? color : mix(color, 0x000000, 0.2), d));
  }
}

function crenels(p: Paint, x: number, y: number, w: number, color: number, d: number): void {
  for (let i = 0; i < w; i += 1) if (i % 3 !== 2) p.r.px(x + i, y, lit(p, p.look.snow ? SNOW : color, d));
}

function tower(p: Paint, cx: number, base: number, w: number, h: number, color: number, d: number, top: 'cone' | 'crenel', roofColor: number, v: number): void {
  const x = cx - Math.floor(w / 2);
  wall(p, x, base - h, w, h, color, d, 'stone');
  if (top === 'crenel') {
    p.r.rect(x - 1, base - h - 1, w + 2, 1, lit(p, color, d));
    crenels(p, x - 1, base - h - 2, w + 2, color, d);
  } else {
    roof(p, cx, base - h, Math.ceil(w / 2) + 1, Math.round(w * 1.1), roofColor, d);
  }
  lamp(p, cx - 1, base - h + 3, 2, 3, d, 5);
  if (h > 16) lamp(p, cx - 1, base - h + 10, 2, 2, d, 4);
  if (v > 0.4) flag(p, cx, base - h - (top === 'cone' ? Math.round(w * 1.1) + 6 : 8), pick(BANNERS, v), d, v);
}

function house(p: Paint, cx: number, base: number, w: number, h: number, v: number, d: number, smoke: boolean): void {
  const x = cx - Math.floor(w / 2);
  const walls = p.world.biome.id === 'boreal' ? 0x8a5a3a : pick(WALLS, v);
  wall(p, x, base - h, w, h, walls, d, p.world.biome.id === 'boreal' ? 'log' : 'plaster');
  door(p, cx - 1, base - 5, 3, 5, d);
  if (w >= 12) {
    lamp(p, x + 2, base - h + 2, 2, 2, d);
    lamp(p, x + w - 4, base - h + 2, 2, 2, d);
  }
  const roofH = Math.round(w * 0.55);
  roof(p, cx, base - h, Math.floor(w / 2) + 2, roofH, pick(ROOFS, v, 1), d);
  if (smoke) {
    p.r.rect(cx + Math.floor(w / 4), base - h - roofH + 2, 2, 4, lit(p, 0x6a5a50, d));
    chimneySmoke(p, cx + Math.floor(w / 4), base - h - roofH, d, v);
  }
}

function fence(p: Paint, x0: number, x1: number, y: number, d: number): void {
  for (let x = x0; x <= x1; x += 1) {
    p.r.px(x, y - 2, lit(p, 0x7a5a3a, d));
    if (x % 3 === 0) p.r.rect(x, y - 3, 1, 3, lit(p, 0x5a3e2a, d));
  }
}

export function drawPoi(p: Paint, poi: Poi): void {
  const d = depthOf(p, poi);
  const { x, y: base, variant: v } = poi;
  const stone = p.world.biome.stone;
  switch (poi.kind) {
    case 'cottage': {
      house(p, x, base, 16, 10, v, d, true);
      fence(p, x + 10, x + 12 + Math.round(v * 3), base, d);
      if (!p.look.snow) for (let i = 0; i < 3; i += 1) p.r.px(x - 10 + i * 2, base - 1, lit(p, pick([0xf0a0c0, 0xf0e070, 0xd05050], v, i), d));
      break;
    }
    case 'house': {
      const w = 16;
      const xL = x - 8;
      wall(p, xL, base - 18, w, 18, 0xe0d4b0, d, 'timber');
      door(p, x - 1, base - 6, 3, 6, d);
      for (const [wx, wy] of [[xL + 2, base - 15], [xL + w - 4, base - 15], [xL + 2, base - 7], [xL + w - 4, base - 7]] as const) lamp(p, wx, wy, 2, 3, d);
      roof(p, x, base - 18, 10, 10, pick(ROOFS, v, 2), d);
      p.r.rect(x + 3, base - 30, 2, 5, lit(p, 0x6a5a50, d));
      chimneySmoke(p, x + 3, base - 31, d, v);
      break;
    }
    case 'windmill': {
      for (let i = 0; i < 24; i += 1) p.r.rect(x - 5 + i * 0.12, base - i - 1, 10 - i * 0.24, 1, lit(p, i % 6 === 0 ? 0xb8a888 : 0xd8ccb0, d));
      roof(p, x, base - 24, 5, 5, p.look.snow ? SNOW : 0x6a3a2a, d);
      door(p, x - 1, base - 5, 2, 5, d);
      lamp(p, x - 1, base - 15, 2, 2, d);
      const hubY = base - 22;
      const speed = 0.12 * p.wind;
      // Four blades: a quarter turn is a full visual cycle.
      const angle0 = TAU * (p.t * cycles(p, speed)) / 4;
      for (let b = 0; b < 4; b += 1) {
        const a = angle0 + (TAU * b) / 4;
        for (let s = 2; s <= 14; s += 0.5) {
          const bx = x + Math.cos(a) * s;
          const by = hubY + Math.sin(a) * s;
          p.r.px(bx, by, lit(p, 0x5a4434, d));
          if (s > 5) p.r.px(bx + Math.sin(a) * 1.5, by - Math.cos(a) * 1.5, lit(p, s % 2 < 1 ? 0xe8e0d0 : 0xc8c0b0, d));
        }
      }
      p.r.px(x, hubY, lit(p, 0x2a2224, d));
      break;
    }
    case 'watermill': {
      const river = p.world.river;
      const side = river && x > (river.x0 + river.x1) / 2 ? -1 : 1;
      house(p, x, base, 14, 10, v, d, true);
      const wx = x - side * 9;
      const wy = base - 5;
      const a0 = TAU * (p.t * cycles(p, 0.2)) / 8;
      for (let s = 0; s < 8; s += 1) line(p, wx, wy, wx + Math.cos(a0 + (TAU * s) / 8) * 5, wy + Math.sin(a0 + (TAU * s) / 8) * 5, lit(p, 0x5a4434, d));
      for (let a = 0; a < 24; a += 1) p.r.px(wx + Math.cos((TAU * a) / 24) * 5, wy + Math.sin((TAU * a) / 24) * 5, lit(p, 0x7a5a3a, d));
      for (let i = 0; i < 3; i += 1) dot(p, wx + (i - 1) * 2, base + ((p.t * cycles(p, 1) + i / 3) % 1) * 2, 0xe8f0f8, 0.8);
      break;
    }
    case 'castle': {
      const color = p.world.biome.id === 'desert' ? 0xc8a878 : mix(stone, 0xd8d0c0, 0.3);
      const banner = pick(BANNERS, v);
      wall(p, x - 20, base - 12, 40, 12, color, d, 'stone');
      crenels(p, x - 20, base - 13, 40, color, d);
      p.r.rect(x - 3, base - 7, 6, 7, lit(p, 0x2a2224, d));
      p.r.rect(x - 2, base - 8, 4, 1, lit(p, 0x2a2224, d));
      tower(p, x - 21, base, 7, 20, color, d, v > 0.5 ? 'cone' : 'crenel', pick(ROOFS, v, 3), v);
      tower(p, x + 21, base, 7, 20, color, d, v > 0.5 ? 'cone' : 'crenel', pick(ROOFS, v, 3), (v + 0.37) % 1);
      tower(p, x + 6, base - 10, 10, 18, color, d, 'crenel', 0, 0.9);
      flag(p, x + 6, base - 38, banner, d, v + 0.2);
      break;
    }
    case 'ruins': {
      const color = p.world.biome.id === 'desert' ? 0xc8a878 : stone;
      const heights = [10, 14, 6, 12, 4, 9];
      for (let i = 0; i < 6; i += 1) {
        const h = Math.round(heights[(i + Math.floor(v * 6)) % 6]! * (1 + ((v * (i + 3)) % 0.6)));
        const cx = x - 14 + i * 5;
        wall(p, cx, base - h, 4, h, color, d, 'stone');
        if (!p.look.snow && p.world.biome.id !== 'desert') for (let k = 0; k < h; k += 3) p.r.px(cx + (k % 4), base - h + k, lit(p, 0x4a7a3a, d));
        else if (p.look.snow) p.r.rect(cx, base - h, 4, 1, lit(p, SNOW, d));
      }
      // An arch survives in the middle.
      for (let a = 0; a <= 8; a += 1) p.r.px(x - 4 + a, base - 13 + Math.round(Math.abs(a - 4) ** 1.5 / 3), lit(p, color, d));
      for (let i = 0; i < 4; i += 1) p.r.rect(x - 16 + i * 9 + Math.round(v * 3), base - 1, 2, 1, lit(p, color, d));
      break;
    }
    case 'tower':
      tower(p, x, base, 8, 24, mix(stone, 0xb0a890, 0.4), d, v > 0.5 ? 'cone' : 'crenel', pick(ROOFS, v, 4), Math.max(0.5, v));
      break;
    case 'lighthouse': {
      for (let i = 0; i < 30; i += 1) {
        const w = 8 - Math.floor(i / 10);
        p.r.rect(x - Math.floor(w / 2), base - i - 1, w, 1, lit(p, Math.floor(i / 5) % 2 === 0 ? 0xd8d4cc : 0xb03a2e, d));
      }
      p.r.rect(x - 4, base - 31, 8, 1, lit(p, 0x3a3a3a, d));
      const lampOn = p.light.lightsOn;
      p.r.rect(x - 2, base - 35, 4, 4, lampOn ? WARM_LIGHT : lit(p, 0x9ab0c0, d));
      roof(p, x, base - 35, 3, 3, 0x3a3a3a, d);
      door(p, x - 1, base - 4, 2, 4, d);
      if (lampOn) {
        glow(p, x, base - 33, 9, 0xffd890, 1);
        // Rotating beam: projected as a sweep that grows toward the viewer.
        const a = Math.sin(TAU * p.t * cycles(p, 0.15));
        const len = 60;
        for (let s = 4; s < len; s += 1) {
          const bx = x + a * s;
          const spread = (s / len) * 4;
          for (let o = -spread; o <= spread; o += 1) dot(p, bx, base - 33 + o, 0xfff0c0, (1 - s / len) * 0.5);
        }
      }
      break;
    }
    case 'shrine': {
      const red = lit(p, 0xb0402e, d);
      p.r.rect(x - 13, base - 14, 2, 14, red);
      p.r.rect(x - 3, base - 14, 2, 14, red);
      p.r.rect(x - 16, base - 16, 18, 2, lit(p, 0x2a2224, d));
      p.r.rect(x - 14, base - 12, 14, 1, red);
      wall(p, x + 4, base - 8, 10, 8, 0x8a5a3a, d, 'plaster');
      roof(p, x + 9, base - 8, 8, 5, 0x3a4440, d);
      for (const lx of [x + 1, x + 16]) {
        p.r.rect(lx, base - 2, 3, 2, lit(p, stone, d));
        p.r.rect(lx + 1, base - 5, 1, 3, lit(p, stone, d));
        p.r.rect(lx, base - 7, 3, 2, lit(p, stone, d));
        lamp(p, lx + 1, base - 7, 1, 1, d, 6);
      }
      break;
    }
    case 'pagoda': {
      const color = pick([0x9a3a2a, 0x7a4a3a, 0x3a3a4a], v);
      for (let tier = 0; tier < 4; tier += 1) {
        const w = 14 - tier * 3;
        const y = base - tier * 7;
        wall(p, x - Math.floor(w / 2) + 1, y - 5, w - 2, 5, 0xd8c8a8, d, 'plaster');
        lamp(p, x - 1, y - 4, 2, 2, d, 4);
        for (let i = 0; i < 3; i += 1) {
          const ew = Math.floor(w / 2) + 2 - i;
          p.r.rect(x - ew, y - 6 - i, ew * 2 + 1, 1, lit(p, p.look.snow && i === 2 ? SNOW : color, d));
        }
        p.r.px(x - Math.floor(w / 2) - 2, y - 7, lit(p, color, d));
        p.r.px(x + Math.floor(w / 2) + 2, y - 7, lit(p, color, d));
      }
      p.r.rect(x, base - 34, 1, 6, lit(p, 0xd8b060, d));
      break;
    }
    case 'village': {
      const offsets = [-22, -8, 6, 20];
      offsets.forEach((ox, i) => {
        const w = 10 + ((Math.floor(v * 10) + i * 3) % 3) * 2;
        house(p, x + ox, base - (i % 2) * 3, w, 7 + (i % 2), (v + i * 0.29) % 1, d, i === 1);
      });
      // Well in the middle of the square.
      p.r.rect(x - 1, base + 1, 4, 3, lit(p, stone, d));
      p.r.rect(x - 1, base - 3, 1, 4, lit(p, 0x5a3e2a, d));
      p.r.rect(x + 2, base - 3, 1, 4, lit(p, 0x5a3e2a, d));
      p.r.rect(x - 2, base - 4, 6, 1, lit(p, pick(ROOFS, v), d));
      break;
    }
    case 'town': {
      const color = p.world.biome.id === 'desert' ? 0xd8b888 : mix(stone, 0xd0c8b8, 0.3);
      for (let i = 0; i < 9; i += 1) {
        const hx = x - 28 + i * 7;
        const hh = 8 + ((i * 5 + Math.floor(v * 7)) % 5);
        wall(p, hx, base - 8 - hh, 6, hh, pick(WALLS, v, i), d, 'plaster');
        lamp(p, hx + 2, base - 8 - hh + 2, 1, 2, d, 3);
        roof(p, hx + 3, base - 8 - hh, 3, 3, pick(ROOFS, v, i), d);
      }
      // Church spire.
      wall(p, x + 4, base - 30, 6, 22, color, d, 'stone');
      roof(p, x + 7, base - 30, 3, 10, 0x3a4a5a, d);
      p.r.px(x + 7, base - 41, lit(p, 0xd8b060, d));
      lamp(p, x + 6, base - 26, 2, 3, d, 4);
      wall(p, x - 31, base - 8, 62, 8, color, d, 'stone');
      crenels(p, x - 31, base - 9, 62, color, d);
      p.r.rect(x - 2, base - 6, 4, 6, lit(p, 0x2a2224, d));
      flag(p, x - 30, base - 15, pick(BANNERS, v), d, v);
      flag(p, x + 29, base - 15, pick(BANNERS, v), d, v + 0.3);
      break;
    }
    case 'farm': {
      const crops = p.look.snow ? 0xe8eef6 : p.look.drift === 'leaves' ? 0xd8b040 : p.look.blossom ? 0x7ab858 : 0x8aa040;
      for (let row = 0; row < 5; row += 1) {
        for (let c = 0; c < 26; c += 1) {
          const sway = row > 2 ? Math.round(wave(p, 0.5, c * 0.07) * 0.6 * p.wind) : 0;
          p.r.px(x - 22 + c + sway, base - 1 + row, lit(p, (c + row) % 3 === 0 ? mix(crops, 0x000000, 0.25) : crops, d));
        }
      }
      // Barn.
      wall(p, x + 8, base - 12, 14, 12, 0x9a3a2a, d, 'log');
      p.r.rect(x + 12, base - 8, 6, 8, lit(p, 0x5a2a20, d));
      line(p, x + 12, base - 8, x + 17, base - 1, lit(p, 0xd8c8a8, d));
      roof(p, x + 15, base - 12, 9, 6, 0x5a4a40, d);
      // Scarecrow.
      p.r.rect(x - 10, base - 9, 1, 9, lit(p, 0x6a4a2a, d));
      p.r.rect(x - 13, base - 7, 7, 1, lit(p, 0x6a4a2a, d));
      p.r.rect(x - 11, base - 10, 3, 2, lit(p, 0xd8b060, d));
      if (p.look.drift === 'leaves') for (let i = 0; i < 3; i += 1) p.r.rect(x - 20 + i * 5, base + 5, 3, 2, lit(p, 0xd8a838, d));
      break;
    }
    case 'camp': {
      for (const [tx, color] of [[x - 9, pick([0x8a6a4a, 0x4a6a8a, 0x8a3a3a], v)], [x + 6, pick([0x6a8a4a, 0xa88a4a], v, 1)]] as const) {
        for (let i = 0; i < 7; i += 1) p.r.rect(tx - i, base - 7 + i, i * 2 + 1, 1, lit(p, i === 0 && p.look.snow ? SNOW : color, d));
        p.r.rect(tx, base - 3, 1, 3, lit(p, 0x2a2224, d));
      }
      // Campfire burns day and night.
      p.r.rect(x - 2, base + 2, 5, 1, lit(p, 0x5a3e2a, d));
      for (let i = 0; i < 4; i += 1) {
        const fh = 2 + Math.round((wave(p, 2.5, i * 0.31) + 1) * 1.2);
        p.r.rect(x - 1 + (i % 3), base + 2 - fh, 1, fh, i % 2 ? 0xffb030 : 0xff7020);
      }
      glow(p, x, base, p.light.lightsOn ? 12 : 5, 0xff9a40, 1);
      chimneySmoke(p, x, base - 4, d, v);
      break;
    }
    case 'stones': {
      const color = mix(stone, 0x9a9a92, 0.4);
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * TAU;
        const sx = x + Math.cos(a) * 13;
        const sy = base + Math.sin(a) * 3;
        const h = 6 + ((i * 3 + Math.floor(v * 5)) % 4) * 2;
        p.r.rect(sx - 1, sy - h, 3, h, lit(p, color, d));
        p.r.rect(sx + 1, sy - h, 1, h, lit(p, mix(color, 0x000000, 0.3), d));
        if (p.look.snow) p.r.rect(sx - 1, sy - h, 3, 1, lit(p, SNOW, d));
        else p.r.px(sx, sy - h + 2, lit(p, 0x5a8a4a, d));
        // Some circles hum with faint light after dark.
        if (v > 0.55 && p.light.lightsOn) dot(p, sx, sy - h / 2, 0x80e0ff, 0.5 + 0.5 * wave(p, 0.5, i / 7));
      }
      p.r.rect(x - 3, base - 2, 7, 2, lit(p, color, d));
      break;
    }
    case 'bigtree': {
      const trunk = p.world.biome.trunk;
      for (let i = 0; i < 26; i += 1) {
        const w = 6 - Math.floor(i / 8);
        p.r.rect(x - Math.floor(w / 2), base - i, w, 1, lit(p, i % 4 === 0 ? mix(trunk, 0x000000, 0.2) : trunk, d));
      }
      line(p, x - 3, base, x - 8, base + 2, lit(p, trunk, d));
      line(p, x + 3, base, x + 9, base + 2, lit(p, trunk, d));
      const leaves = p.look.bare ? null : p.look.canopy;
      const blobs = [[0, -32, 14, 9], [-11, -26, 9, 7], [11, -27, 10, 7], [-5, -38, 9, 6], [7, -37, 8, 6]] as const;
      for (const [bx, by, rx, ry] of blobs) {
        if (!leaves) {
          line(p, x, base - 22, x + bx, base + by, lit(p, trunk, d));
          continue;
        }
        const sway = Math.round(wave(p, 0.3, v + bx * 0.01) * p.wind);
        for (let dy = -ry; dy <= ry; dy += 1) {
          for (let dx = -rx; dx <= rx; dx += 1) {
            if ((dx / rx) ** 2 + (dy / ry) ** 2 > 0.9 + 0.1 * Math.sin(dx * 1.3 + dy)) continue;
            const shade = -dx / rx * 0.4 - dy / ry * 0.6;
            p.r.px(x + bx + dx + sway, base + by + dy, lit(p, shade > 0.3 ? leaves.light : shade < -0.3 ? leaves.dark : leaves.mid, d));
          }
        }
      }
      if (v > 0.5) for (let i = 0; i < 4; i += 1) lamp(p, x - 9 + i * 6, base - 24 + (i % 2) * 4, 1, 1, d, 4);
      break;
    }
    case 'pyramid': {
      const color = 0xd8b878;
      for (let i = 0; i < 22; i += 1) {
        const half = 22 - i;
        const y = base - i - 1;
        for (let dx = -half; dx <= half; dx += 1) p.r.px(x + dx, y, lit(p, dx > 0 ? mix(color, 0x000000, 0.25) : i % 3 === 0 ? mix(color, 0xffffff, 0.1) : color, d));
      }
      p.r.rect(x - 1, base - 5, 3, 5, lit(p, 0x3a2a1a, d));
      // Obelisk beside it.
      p.r.rect(x + 26, base - 16, 3, 16, lit(p, color, d));
      p.r.px(x + 27, base - 17, lit(p, 0xd8b060, d));
      break;
    }
    case 'oasis': {
      const water = mix(p.light.skyBottom, 0x3a8aa0, 0.5);
      for (let row = 0; row < 5; row += 1) {
        const half = 12 - row * 2;
        for (let dx = -half; dx <= half; dx += 1) {
          const sparkle = Math.sin(TAU * (p.t * cycles(p, 0.5) + dx * 0.2 + row * 0.5)) > 0.95;
          p.r.px(x + dx, base + row, sparkle ? 0xe8f4f8 : lit(p, water, d));
        }
      }
      for (const [px, h, ph] of [[-16, 18, 0.1], [14, 22, 0.6], [-6, 14, 0.3]] as const) {
        const sway = wave(p, 0.4, ph) * p.wind;
        for (let i = 0; i < h; i += 1) p.r.px(x + px + (i * i) / (h * 6) + sway * (i / h), base - i, lit(p, 0x8a6a3a, d));
        const tx = x + px + h / 6 + sway;
        for (let f = 0; f < 5; f += 1) {
          const a = (f / 5) * Math.PI + Math.PI;
          for (let s = 0; s < 7; s += 1) p.r.px(tx + Math.cos(a) * s, base - h + Math.abs(Math.sin(a)) * -s * 0.3 + (s * s) / 14, lit(p, 0x3a8a3a, d));
        }
      }
      break;
    }
    case 'igloo': {
      for (let dy = 0; dy < 8; dy += 1) {
        const half = Math.round(Math.sqrt(64 - dy * dy) * 1.1);
        for (let dx = -half; dx <= half; dx += 1) {
          const seam = dy % 3 === 0 || (dx + dy * 2) % 5 === 0;
          const edge = Math.abs(dx) >= half - 1 || dy === 7;
          // Blue seams and a shaded right side keep the igloo readable against snow.
          const c = edge ? 0x7a90a8 : seam ? 0xa8bccc : dx > half / 3 ? 0xc8d6e2 : 0xf2f7fb;
          p.r.px(x + dx, base - dy, lit(p, c, d));
        }
      }
      p.r.rect(x + 4, base - 4, 4, 4, p.light.lightsOn ? WARM_LIGHT : lit(p, 0x3a4a5a, d));
      if (p.light.lightsOn) glow(p, x + 6, base - 2, 7, 0xffc060, 1);
      break;
    }
    case 'stilthut': {
      for (const sx of [x - 6, x - 1, x + 5]) p.r.rect(sx, base - 8, 1, 10, lit(p, 0x4a3a2a, d));
      p.r.rect(x - 8, base - 9, 16, 1, lit(p, 0x6a4a2a, d));
      wall(p, x - 6, base - 17, 12, 8, 0x7a5a3a, d, 'log');
      lamp(p, x - 3, base - 15, 2, 2, d);
      roof(p, x, base - 17, 8, 6, 0x8a7a4a, d);
      for (let i = 0; i < 9; i += 2) p.r.rect(x + 8, base - 9 + i, 2, 1, lit(p, 0x6a4a2a, d));
      lamp(p, x - 9, base - 12, 1, 2, d, 6);
      break;
    }
    case 'bridge': {
      const river = p.world.river;
      const half = (river ? riverWidth(river, base) : 4) / 2 + 4;
      for (let dx = -half; dx <= half; dx += 1) {
        const arch = Math.round(Math.cos((dx / half) * (Math.PI / 2)) * 2);
        p.r.px(x + dx, base - arch, lit(p, 0x7a5a3a, d));
        p.r.px(x + dx, base - arch - 3, lit(p, 0x5a3e2a, d));
        if (Math.round(dx) % 3 === 0) p.r.rect(x + dx, base - arch - 3, 1, 3, lit(p, 0x5a3e2a, d));
        if (p.look.snow) p.r.px(x + dx, base - arch - 1, lit(p, SNOW, d));
      }
      break;
    }
    case 'waterfall': {
      const rock = mix(stone, 0x6a6a64, 0.4);
      for (let dy = 0; dy < 16; dy += 1) {
        const half = 9 + Math.round(Math.sin(dy * 0.7) * 2) + Math.floor(dy / 4);
        for (let dx = -half; dx <= half; dx += 1) {
          if (Math.abs(dx) < 3) continue;
          p.r.px(x + dx, base - 16 + dy, lit(p, (dx + dy) % 4 === 0 ? mix(rock, 0x000000, 0.3) : rock, d));
        }
      }
      if (!p.look.snow) for (let dy = 0; dy < 16; dy += 1) p.r.px(x - 10 + (dy % 3), base - 16 + dy, lit(p, 0x4a7a3a, d));
      const frozen = p.look.snow && p.world.biome.id === 'tundra';
      const n = cycles(p, 1.5);
      for (let dy = 0; dy < 17; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const streak = (dy - (p.t * n * 6 + dx * 3)) % 6;
          const c = frozen ? 0xd8e8f4 : Math.abs(streak) < 1.2 ? 0xffffff : 0x9ac8e8;
          p.r.px(x + dx, base - 16 + dy, lit(p, c, d));
        }
      }
      for (let i = 0; i < 6; i += 1) dot(p, x - 4 + i * 1.6, base + 1 - Math.abs(wave(p, 2, i * 0.17)), 0xffffff, frozen ? 0 : 0.9);
      break;
    }
  }
}
