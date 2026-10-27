import { bayer, hexToColor, luminance } from './color';
import type { Raster } from './raster';

export interface Palette {
  id: string;
  name: string;
  colors: number[];
  /** Ramp palettes (one hue, light to dark) map by brightness with dithering; others by nearest colour. */
  ramp?: boolean;
}

const hex = (list: string): number[] => list.split(/\s+/).filter(Boolean).map(h => hexToColor(h) ?? 0);

export const PALETTES: readonly Palette[] = [
  { id: 'original', name: 'Original', colors: [] },
  { id: 'gameboy', name: 'Game Boy', colors: hex('0f380f 306230 8bac0f 9bbc0f'), ramp: true },
  { id: 'pico8', name: 'PICO-8', colors: hex('000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa') },
  {
    id: 'nes',
    name: 'NES',
    colors: hex(
      '7c7c7c 0000fc 0000bc 4428bc 940084 a80020 a81000 881400 503000 007800 006800 005800 004058 000000 ' +
        'bcbcbc 0078f8 0058f8 6844fc d800cc e40058 f83800 e45c10 ac7c00 00b800 00a800 00a844 008888 ' +
        'f8f8f8 3cbcfc 6888fc 9878f8 f878f8 f85898 f87858 fca044 f8b800 b8f818 58d854 58f898 00e8d8 787878 ' +
        'fcfcfc a4e4fc b8b8f8 d8b8f8 f8b8f8 f0d0b0 fce0a8 f8d878 d8f878 b8f8b8 b8f8d8 00fcfc f8d8f8',
    ),
  },
  { id: 'c64', name: 'Commodore 64', colors: hex('000000 ffffff 68372b 70a4b2 6f3d86 588d43 352879 b8c76f 6f4f25 433900 9a6759 444444 6c6c6c 9ad284 6c5eb5 959595') },
  { id: 'sepia', name: 'Sepia', colors: hex('1e140c 3d2a1a 5e4129 8a6440 b38d5e d8b88a f2e3c4'), ramp: true },
  { id: 'neon', name: 'Neon night', colors: hex('0b0a1a 1b1442 3a1c71 7b2cbf c13cff ff4fd8 ff8a3d ffe45e 3dd6f5 2b8cff 14f195 f4f4ff') },
  { id: 'onebit', name: '1-bit', colors: hex('101014 eaeaea'), ramp: true },
];

/** Parses user input like "#0f380f, 306230 8bac0f" into a palette, or null when it has fewer than 2 valid colours. */
export function parseCustomPalette(text: string): number[] | null {
  const colors = text.split(/[\s,;]+/).filter(Boolean).map(hexToColor);
  if (colors.some(c => c === null)) return null;
  const valid = colors as number[];
  return valid.length >= 2 && valid.length <= 256 ? valid : null;
}

/** Recolours a frame in place. Ramp palettes are ordered dithered by brightness so 2–7 colours keep the detail. */
export function applyPalette(r: Raster, colors: readonly number[], ramp: boolean): void {
  if (colors.length === 0) return;
  const sorted = ramp ? [...colors].sort((a, b) => luminance(a) - luminance(b)) : colors;
  const cache = new Map<number, number>();
  const d = r.data;
  for (let y = 0; y < r.height; y += 1) {
    for (let x = 0; x < r.width; x += 1) {
      const i = (y * r.width + x) * 4;
      const c = ((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0);
      let out: number;
      if (ramp) {
        const level = luminance(c) * (sorted.length - 1) + (bayer(x, y) - 0.5) * 0.7;
        out = sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(level)))] ?? 0;
      } else {
        let hit = cache.get(c);
        if (hit === undefined) {
          hit = nearest(c, sorted);
          cache.set(c, hit);
        }
        out = hit;
      }
      d[i] = (out >> 16) & 255;
      d[i + 1] = (out >> 8) & 255;
      d[i + 2] = out & 255;
    }
  }
}

/** Nearest colour with a perceptual (red-mean) weighting. */
function nearest(c: number, colors: readonly number[]): number {
  const r1 = (c >> 16) & 255;
  const g1 = (c >> 8) & 255;
  const b1 = c & 255;
  let best = colors[0] ?? 0;
  let bestD = Infinity;
  for (const p of colors) {
    const r2 = (p >> 16) & 255;
    const dr = r1 - r2;
    const dg = g1 - ((p >> 8) & 255);
    const db = b1 - (p & 255);
    const rm = (r1 + r2) / 2;
    const dist = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (dist < bestD) {
      bestD = dist;
      best = p;
    }
  }
  return best;
}
