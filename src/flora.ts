import { bayer, mix } from './color';
import type { Foliage } from './biomes';
import { line, lit, type Paint, SNOW, wave } from './paint';
import type { Tree } from './world';

/** Draws any tree kind with wind sway; season decides leaves, blossom and snow. */
export function drawTree(p: Paint, tree: Tree, depth: number, amplitude: number): void {
  const sway = wave(p, 0.35, tree.phase) * amplitude * p.wind;
  const { look } = p;
  switch (tree.kind) {
    case 'pine':
      pine(p, tree, look.foliage, depth, sway);
      break;
    case 'round':
      if (look.bare) bare(p, tree, depth, sway, 0.55);
      else roundTree(p, tree, look.canopy, depth, sway);
      break;
    case 'birch':
      birch(p, tree, depth, sway);
      break;
    case 'palm':
      palm(p, tree, depth, sway);
      break;
    case 'cactus':
      cactus(p, tree, depth);
      break;
    case 'dead':
      bare(p, tree, depth, sway * 0.4, 0.75);
      break;
    case 'willow':
      willow(p, tree, depth, sway);
      break;
  }
}

function pine(p: Paint, tree: Tree, colors: Foliage, depth: number, sway: number): void {
  const h = Math.round(tree.h);
  const light = p.look.snow ? mix(colors.light, SNOW, 0.8) : colors.light;
  p.r.rect(tree.x, tree.y - 2, 1, 2, lit(p, p.world.biome.trunk, depth));
  for (let i = 0; i < h; i += 1) {
    const half = Math.floor(i / 3) + Math.floor((i % 4) / 2);
    const shift = Math.round(sway * (1 - i / h));
    const y = tree.y - 2 - h + i;
    // Snow rests on the top row of every tier.
    const snowRow = p.look.snow && i % 4 === 0;
    for (let dx = -half; dx <= half; dx += 1) {
      const c = snowRow ? SNOW : dx < -half / 3 ? light : dx > half / 3 ? colors.dark : colors.mid;
      p.r.px(tree.x + dx + shift, y, lit(p, c, depth));
    }
  }
}

function canopy(p: Paint, cx: number, cy: number, rx: number, ry: number, colors: Foliage, depth: number, sway: number, phase: number): void {
  for (let dy = -ry; dy <= ry; dy += 1) {
    const shift = Math.round(sway * (0.5 - dy / ry / 2));
    for (let dx = -rx; dx <= rx; dx += 1) {
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      const wobble = 0.85 + 0.15 * Math.sin(Math.atan2(dy, dx) * 5 + phase * 9);
      if (d > wobble) continue;
      const x = Math.round(cx + dx + shift);
      const y = Math.round(cy + dy);
      const shade = (-dx / rx) * 0.45 - (dy / ry) * 0.6 + bayer(x, y) * 0.5 - 0.25;
      let c = shade > 0.3 ? colors.light : shade < -0.3 ? colors.dark : colors.mid;
      if (p.look.blossom && shade > 0.1 && (x * 7 + y * 3) % 11 === 0) c = 0xf8f0f4;
      p.r.px(x, y, lit(p, c, depth));
    }
  }
}

function roundTree(p: Paint, tree: Tree, colors: Foliage, depth: number, sway: number): void {
  const trunkH = Math.round(tree.h * 0.4);
  const tw = tree.h > 20 ? 3 : 2;
  p.r.rect(tree.x - Math.floor(tw / 2), tree.y - trunkH, tw, trunkH, lit(p, p.world.biome.trunk, depth));
  canopy(p, tree.x, tree.y - trunkH - tree.h * 0.3, tree.h * 0.36, tree.h * 0.32, colors, depth, sway, tree.phase);
}

function birch(p: Paint, tree: Tree, depth: number, sway: number): void {
  const trunkH = Math.round(tree.h * 0.55);
  for (let y = 0; y < trunkH; y += 1) {
    const mark = (y * 5 + Math.round(tree.phase * 9)) % 7 === 0;
    p.r.px(tree.x, tree.y - y, lit(p, mark ? 0x2a2a2a : 0xe8e4da, depth));
  }
  if (p.look.bare) {
    bare(p, { ...tree, h: tree.h * 0.8 }, depth, sway, 0.4);
    return;
  }
  const leaves = p.look.canopy === p.world.biome.canopy ? { dark: 0x4a7a30, mid: 0x6a9a3a, light: 0x9ac458 } : p.look.canopy;
  const autumnal = p.look.drift === 'leaves' ? { dark: 0xb08a20, mid: 0xd8b030, light: 0xf0d860 } : leaves;
  canopy(p, tree.x, tree.y - trunkH - tree.h * 0.12, tree.h * 0.22, tree.h * 0.28, autumnal, depth, sway, tree.phase);
}

/** Leafless branches: winter broadleaf trees and dead trees. */
function bare(p: Paint, tree: Tree, depth: number, sway: number, spread: number): void {
  const c = lit(p, mix(p.world.biome.trunk, 0x2a2a2a, 0.2), depth);
  const top = tree.y - tree.h;
  line(p, tree.x, tree.y, tree.x + Math.round(sway * 0.5), top, c);
  const branches = 3 + Math.round(tree.phase * 3);
  for (let i = 0; i < branches; i += 1) {
    const by = tree.y - tree.h * (0.4 + (i / branches) * 0.55);
    const dir = i % 2 === 0 ? -1 : 1;
    const len = tree.h * spread * (0.5 - i / branches / 3);
    line(p, tree.x, by, tree.x + dir * len + sway, by - len * 0.6, c);
    if (p.look.snow) p.r.px(tree.x + dir * len + sway, by - len * 0.6 - 1, lit(p, SNOW, depth));
  }
}

function palm(p: Paint, tree: Tree, depth: number, sway: number): void {
  const h = tree.h;
  const bend = (tree.phase - 0.5) * 6;
  let topX = tree.x;
  for (let i = 0; i < h * 0.75; i += 1) {
    const k = i / (h * 0.75);
    topX = tree.x + bend * k * k + sway * k;
    p.r.px(topX, tree.y - i, lit(p, i % 3 === 0 ? 0x6a4a2a : 0x8a6a3a, depth));
  }
  const ty = tree.y - h * 0.75;
  const leaf = p.world.biome.canopy;
  for (let f = 0; f < 6; f += 1) {
    const ang = (f / 6) * Math.PI * 2 + sway * 0.1;
    const len = h * 0.35;
    for (let s = 0; s <= len; s += 1) {
      const droop = (s / len) ** 2 * len * 0.45;
      const x = topX + Math.cos(ang) * s;
      const y = ty - Math.abs(Math.sin(ang)) * s * 0.35 + droop;
      p.r.px(x, y, lit(p, s > len * 0.6 ? leaf.light : leaf.mid, depth));
    }
  }
  p.r.px(topX, ty + 1, lit(p, 0x6a4a20, depth));
}

function cactus(p: Paint, tree: Tree, depth: number): void {
  const h = Math.round(tree.h * 0.7);
  const green = lit(p, 0x4a8a3a, depth);
  const dark = lit(p, 0x2e6028, depth);
  p.r.rect(tree.x - 1, tree.y - h, 3, h, green);
  p.r.rect(tree.x + 1, tree.y - h, 1, h, dark);
  const armY = tree.y - Math.round(h * (0.35 + tree.phase * 0.2));
  p.r.rect(tree.x - 4, armY, 3, 2, green);
  p.r.rect(tree.x - 4, armY - 5, 2, 5, green);
  p.r.rect(tree.x + 2, armY - 3, 3, 2, green);
  p.r.rect(tree.x + 3, armY - 7, 2, 4, dark);
  if (tree.phase > 0.7) p.r.px(tree.x, tree.y - h - 1, lit(p, 0xf06a8a, depth));
}

function willow(p: Paint, tree: Tree, depth: number, sway: number): void {
  const trunkH = Math.round(tree.h * 0.5);
  p.r.rect(tree.x - 1, tree.y - trunkH, 3, trunkH, lit(p, p.world.biome.trunk, depth));
  if (p.look.bare) {
    bare(p, tree, depth, sway, 0.6);
    return;
  }
  const colors = p.look.canopy;
  const top = tree.y - tree.h;
  const r = tree.h * 0.38;
  canopy(p, tree.x, top + r * 0.6, r, r * 0.55, colors, depth, sway * 0.5, tree.phase);
  // Hanging strands sway more at their tips.
  for (let s = -r; s <= r; s += 2) {
    const len = tree.h * 0.45 * (1 - Math.abs(s / r) * 0.5);
    for (let i = 0; i < len; i += 1) {
      const x = tree.x + s + (sway * i) / len;
      p.r.px(x, top + r * 0.8 + i, lit(p, i % 3 === 0 ? colors.light : colors.mid, depth));
    }
  }
}
