import { type Biome, BIOMES, type PoiKind, pickWeighted, type TreeKind, type WaterKind } from './biomes';
import { rng } from './color';

const TAU = Math.PI * 2;

export interface WorldOptions {
  seed: number;
  /** Visible frame size in pixels. */
  width: number;
  height: number;
  /** Panorama: the world becomes a ring twice as wide as the frame, scrolled once per loop. */
  pan: boolean;
  /** Force a biome instead of picking one from the seed. */
  biome?: Biome['id'];
}

export interface Tree {
  x: number;
  y: number;
  h: number;
  kind: TreeKind;
  phase: number;
}

export interface Poi {
  kind: PoiKind;
  x: number;
  /** Base line the structure stands on. */
  y: number;
  /** Seeded variation: colours, sizes, details. */
  variant: number;
  /** Hill structures are farther away and hazier. */
  far: boolean;
}

export interface Water {
  kind: WaterKind;
  /** Lake / oasis / swamp pond: centre x and width. Sea: x of the shore at the horizon. */
  x: number;
  w: number;
  top: number;
  depth: number;
  /** Sea only: which side the sea is on. */
  side: -1 | 1;
  /** Sea only: how far the sea reaches from the shore (bounded in panoramas so the ring has no seam). */
  extent: number;
}

export interface River {
  /** Source on the hills and mouth at the bottom (or in the lake). */
  x0: number;
  x1: number;
  yTop: number;
  yEnd: number;
  phase: number;
}

export interface World {
  seed: number;
  width: number;
  height: number;
  /** Width of the world: equals `width`, or twice it for panoramas. */
  span: number;
  pan: boolean;
  ground: number;
  biome: Biome;
  far: Int16Array;
  mid: Int16Array;
  hills: Int16Array;
  snowPeaks: boolean;
  midTrees: Tree[];
  hillTrees: Tree[];
  groundTrees: Tree[];
  nearTrees: Tree[];
  pois: Poi[];
  waters: Water[];
  river: River | null;
  rocks: { x: number; y: number; s: number }[];
  bushes: { x: number; y: number; s: number }[];
  tufts: { x: number; y: number; phase: number }[];
  flowers: { x: number; y: number; color: number }[];
  stars: { x: number; y: number; phase: number; speed: number }[];
  clouds: { x: number; y: number; w: number; h: number; phase: number }[];
  drops: { x: number; y: number; speed: number }[];
  fireflies: { x: number; y: number; r: number; phase: number }[];
  birds: { y: number; offset: number }[];
  sheep: { x: number; y: number; phase: number }[];
  /** Loop moments (0..1) for one-off events. */
  events: { lightning: number[]; shootingStar: number; fish: { x: number; y: number; t: number }[] };
}

export const POI_DEFS: Record<PoiKind, { w: number; zone: 'ground' | 'hill' | 'shore' | 'river'; unique?: boolean }> = {
  cottage: { w: 24, zone: 'ground' },
  house: { w: 20, zone: 'ground' },
  windmill: { w: 26, zone: 'ground' },
  watermill: { w: 24, zone: 'river', unique: true },
  castle: { w: 50, zone: 'hill', unique: true },
  ruins: { w: 30, zone: 'ground' },
  tower: { w: 12, zone: 'hill' },
  lighthouse: { w: 14, zone: 'shore', unique: true },
  shrine: { w: 30, zone: 'ground' },
  pagoda: { w: 24, zone: 'hill', unique: true },
  village: { w: 58, zone: 'ground', unique: true },
  town: { w: 66, zone: 'hill', unique: true },
  farm: { w: 46, zone: 'ground' },
  camp: { w: 30, zone: 'ground' },
  stones: { w: 32, zone: 'ground' },
  bigtree: { w: 34, zone: 'ground', unique: true },
  pyramid: { w: 48, zone: 'hill' },
  oasis: { w: 42, zone: 'ground', unique: true },
  igloo: { w: 18, zone: 'ground' },
  stilthut: { w: 22, zone: 'ground' },
  bridge: { w: 20, zone: 'river', unique: true },
  waterfall: { w: 24, zone: 'hill', unique: true },
};

/** Vertical layout shared by generation and rendering. */
export function layout(height: number): { ground: number; lakeTop: number; lakeDepth: number } {
  const ground = Math.round(height * 0.74);
  const below = height - ground;
  return { ground, lakeTop: ground + Math.max(2, Math.round(below * 0.18)), lakeDepth: Math.max(6, Math.round(below * 0.48)) };
}

/** Ridge line made of sines with a whole number of periods across the span, so panoramas wrap seamlessly. */
function ridge(r: () => number, span: number, base: number, amp: number, detail: number): Int16Array {
  const waves = Array.from({ length: 4 }, (_, i) => ({
    n: Math.max(1, Math.round((span * (0.015 + r() * 0.02) * (i + 1) * detail) / TAU)),
    p: r() * TAU,
    a: amp / (i + 1.3),
  }));
  return Int16Array.from({ length: span }, (_, x) => Math.round(base + waves.reduce((s, w) => s + Math.sin((TAU * w.n * x) / span + w.p) * w.a, 0)));
}

export function riverX(river: River, y: number): number {
  const k = (y - river.yTop) / Math.max(1, river.yEnd - river.yTop);
  return river.x0 + (river.x1 - river.x0) * k + Math.sin(y * 0.22 + river.phase) * 2;
}

export function riverWidth(river: River, y: number): number {
  return 2 + Math.max(0, (y - river.yTop) / Math.max(1, river.yEnd - river.yTop)) * 4;
}

/** True when (x, y) lies on water (lake, pond, sea) or the river, with a margin. */
export function isWet(world: World, x: number, y: number, margin = 0): boolean {
  for (const w of world.waters) {
    if (w.kind === 'sea') {
      if (y >= world.ground - 1 && seaDistance(world, w, x, y) > -margin) return true;
      continue;
    }
    if (y < w.top - margin || y > w.top + w.depth + margin) continue;
    const k = Math.min(1, Math.max(0, (y - w.top) / w.depth));
    const half = (w.w / 2) * Math.sqrt(1 - k * k) + margin;
    if (Math.abs(x - w.x) <= half) return true;
  }
  if (world.river && y >= world.river.yTop - margin && y <= world.river.yEnd) {
    return Math.abs(x - riverX(world.river, y)) <= riverWidth(world.river, y) / 2 + margin + 1;
  }
  return false;
}

/**
 * Signed distance from the shore into the sea at (x, y): negative on land. In panoramas the sea is a bay
 * bounded on both sides, measured around the ring so it never meets the seam with a straight edge.
 */
export function seaDistance(world: Pick<World, 'span' | 'pan'>, w: Water, x: number, y: number): number {
  let raw = (x - seaShore(w, y)) * w.side;
  if (world.pan) raw = ((((raw + world.span / 2) % world.span) + world.span) % world.span) - world.span / 2;
  return Math.min(raw, w.extent - raw);
}

/** x of the shoreline at row y; the sea opens up toward the viewer. */
export function seaShore(w: Water, y: number): number {
  const spread = (y - (w.top - 2)) * 0.6;
  return w.x - spread * w.side + Math.sin(y * 0.5) * 1.2;
}

export function generateWorld(options: WorldOptions): World {
  const { seed, width, height, pan } = options;
  const r = rng(seed);
  const span = pan ? width * 2 : width;
  const { ground, lakeTop, lakeDepth } = layout(height);
  const below = height - ground;
  const biome = (options.biome && BIOMES.find(b => b.id === options.biome)) || BIOMES[Math.floor(r() * BIOMES.length)] || BIOMES[0]!;
  // Consume the same random numbers whether or not a biome was forced, so the rest of the world stays put.
  if (options.biome) r();

  const far = ridge(r, span, ground - height * 0.32, height * (0.09 + r() * 0.08), 1);
  const mid = ridge(r, span, ground - height * 0.15, height * 0.05, 1.6);
  const hills = ridge(r, span, ground - height * 0.055, height * 0.025, 2.2);
  const snowPeaks = biome.id === 'tundra' || Math.min(...far) < ground - height * 0.44;

  // Water.
  const waters: Water[] = [];
  const waterKind = pickWeighted(biome.water, r);
  if (waterKind === 'lake' || waterKind === 'oasis') {
    const w = waterKind === 'oasis' ? 20 + r() * 14 : Math.min(span * 0.5, 36 + r() * span * 0.25);
    waters.push({ kind: waterKind, x: w / 2 + 8 + r() * (span - w - 16), w, top: lakeTop, depth: waterKind === 'oasis' ? Math.max(5, lakeDepth * 0.6) : lakeDepth, side: 1, extent: 0 });
  } else if (waterKind === 'swamp') {
    const ponds = 2 + Math.floor((span / 120) * (1 + r()));
    for (let i = 0; i < ponds; i += 1) {
      const w = 14 + r() * 26;
      waters.push({ kind: 'swamp', x: (span / ponds) * (i + 0.2 + r() * 0.6), w, top: ground + 2 + r() * below * 0.4, depth: 4 + r() * 5, side: 1, extent: 0 });
    }
  } else if (waterKind === 'sea') {
    const side = r() < 0.5 ? -1 : 1;
    waters.push({ kind: 'sea', x: side === 1 ? span * (0.55 + r() * 0.15) : span * (0.3 + r() * 0.15), w: 0, top: ground, depth: below, side: side as -1 | 1, extent: pan ? span * 0.35 : Infinity });
  }

  // River from the hills to the lake or the bottom edge.
  let river: River | null = null;
  const lake = waters.find(w => w.kind === 'lake');
  if (r() < biome.river && !pan) {
    const x0 = 10 + r() * (span - 20);
    const x1 = lake ? lake.x + (r() - 0.5) * lake.w * 0.3 : Math.max(6, Math.min(span - 6, x0 + (r() - 0.5) * 60));
    river = { x0, x1, yTop: (hills[Math.round(x0)] ?? ground) + 1, yEnd: lake ? lake.top + 1 : height + 2, phase: r() * TAU };
  }

  const world: World = {
    seed,
    width,
    height,
    span,
    pan,
    ground,
    biome,
    far,
    mid,
    hills,
    snowPeaks,
    midTrees: [],
    hillTrees: [],
    groundTrees: [],
    nearTrees: [],
    pois: [],
    waters,
    river,
    rocks: [],
    bushes: [],
    tufts: [],
    flowers: [],
    stars: [],
    clouds: [],
    drops: [],
    fireflies: [],
    birds: [],
    sheep: [],
    events: { lightning: [], shootingStar: r(), fish: [] },
  };

  placePois(world, r);

  // Footprints the ground clutter keeps away from.
  const blocked = (x: number, y: number, pad: number): boolean =>
    isWet(world, x, y, 2) ||
    world.pois.some(p => !p.far && Math.abs(x - p.x) < POI_DEFS[p.kind].w / 2 + pad && y > p.y - 18 && y < p.y + 4);
  const treeKind = (): TreeKind => pickWeighted(biome.trees, r);
  const tree = (x: number, y: number, h: number, kind = treeKind()): Tree => ({ x, y, h, kind, phase: r() });

  for (let x = 0; x < span; x += 3 + Math.floor(r() * 4)) {
    const kind = biome.id === 'desert' ? 'dead' : biome.trees.pine ? 'pine' : treeKind();
    if (biome.id !== 'desert' || r() < 0.15) world.midTrees.push(tree(x, mid[x] ?? 0, 5 + r() * 5, kind));
  }
  for (let x = 2; x < span; x += Math.round((9 + r() * 14) / biome.forest)) {
    const hy = (hills[x] ?? ground) + 1;
    if (!world.pois.some(p => p.far && Math.abs(x - p.x) < POI_DEFS[p.kind].w / 2 + 4) && !(river && Math.abs(x - river.x0) < 6)) {
      world.hillTrees.push(tree(x, hy, 9 + r() * 7));
    }
  }
  const groundCount = Math.round((span / 16) * biome.forest);
  for (let i = 0; i < groundCount * 3 && world.groundTrees.length < groundCount; i += 1) {
    const x = r() * span;
    const y = ground + 2 + r() * (below - 4);
    if (blocked(x, y, 6)) continue;
    const depth = (y - ground) / below;
    world.groundTrees.push(tree(x, y, (12 + r() * 10) * (0.6 + depth * 0.8)));
  }
  if (pan) {
    for (let i = 0; i < 4; i += 1) world.nearTrees.push(tree((span / 4) * (i + r() * 0.6), height + 2, height * (0.32 + r() * 0.14)));
  } else {
    world.nearTrees.push(tree(4 + r() * 14, height + 2, height * (0.32 + r() * 0.14)), tree(width - 6 - r() * 16, height + 2, height * (0.28 + r() * 0.16)));
  }
  world.nearTrees = world.nearTrees.filter(t => t.kind !== 'cactus' || biome.id === 'desert');

  const scatter = <T>(n: number, make: (x: number, y: number) => T, pad = 3): T[] => {
    const out: T[] = [];
    for (let i = 0; i < n * 3 && out.length < n; i += 1) {
      const x = r() * span;
      const y = ground + 1 + r() * (below - 2);
      if (!blocked(x, y, pad)) out.push(make(x, y));
    }
    return out;
  };
  world.rocks = scatter(Math.round(span / 22), (x, y) => ({ x, y, s: 2 + Math.floor(r() * 4) }));
  world.bushes = biome.id === 'desert' ? [] : scatter(Math.round(span / 18), (x, y) => ({ x, y, s: 2 + Math.floor(r() * 3) }));
  world.tufts = scatter(Math.round(span / 3), (x, y) => ({ x, y, phase: r() }), 1);
  world.flowers = scatter(Math.round(span / 7), (x, y) => ({ x, y, color: [0xf0e070, 0xf0a0c0, 0xe0e8f0, 0xb090f0][Math.floor(r() * 4)] ?? 0xf0e070 }), 1);
  world.stars = Array.from({ length: Math.round((span * height) / 300) }, () => ({ x: r() * span, y: r() * ground * 0.75, phase: r(), speed: 1 + Math.floor(r() * 3) }));
  world.clouds = Array.from({ length: Math.max(4, Math.round(span / 28)) }, () => ({ x: r() * span, y: height * 0.05 + r() * height * 0.3, w: 18 + r() * 26, h: 4 + r() * 5, phase: r() }));
  world.drops = Array.from({ length: Math.round((span * height) / 150) }, () => ({ x: r() * span, y: r(), speed: 0.8 + r() * 0.4 }));
  world.fireflies = Array.from({ length: Math.round(span / 12) }, () => ({ x: r() * span, y: ground - 4 + r() * below * 0.7, r: 2 + r() * 5, phase: r() }));
  world.birds = Array.from({ length: 3 + Math.floor(r() * 3) }, (_, i) => ({ y: height * 0.15 + r() * height * 0.2, offset: i * 7 + r() * 4 }));
  const pasture = world.pois.find(p => p.kind === 'farm' || p.kind === 'village' || p.kind === 'windmill');
  if (pasture && biome.id !== 'desert' && biome.id !== 'tundra') {
    world.sheep = scatter(3 + Math.floor(r() * 3), (x, y) => ({ x, y, phase: r() })).map(s => ({ ...s, x: pasture.x + (r() - 0.5) * 50 }));
  }
  world.events.lightning = Array.from({ length: 2 + Math.floor(r() * 2) }, () => r());
  if (lake) world.events.fish = Array.from({ length: 3 }, () => ({ x: lake.x + (r() - 0.5) * lake.w * 0.6, y: lake.top + 2 + r() * lake.depth * 0.5, t: r() }));
  return world;
}

function placePois(world: World, r: () => number): void {
  const { span, ground, height, biome, hills, river } = world;
  const below = height - ground;
  const count = Math.max(1, Math.min(8, Math.round(span / 105 + r() * 1.2)));
  const used = new Set<PoiKind>();
  const fits = (kind: PoiKind, x: number, far: boolean): boolean => {
    const w = POI_DEFS[kind].w;
    if (!world.pan && (x - w / 2 < 2 || x + w / 2 > span - 2)) return false;
    return world.pois.every(p => p.far !== far || Math.abs(p.x - x) > (POI_DEFS[p.kind].w + w) / 2 + 6);
  };

  for (let n = 0; n < count; n += 1) {
    // Unique landmarks (castle, town…) appear once; re-roll instead of repeating them.
    let kind = pickWeighted(biome.pois, r);
    for (let k = 0; k < 6 && POI_DEFS[kind].unique && used.has(kind); k += 1) kind = pickWeighted(biome.pois, r);
    if (POI_DEFS[kind].unique && used.has(kind)) continue;
    const def = POI_DEFS[kind];
    if ((def.zone === 'river' && !river) || (kind === 'lighthouse' && !world.waters.some(w => w.kind === 'sea'))) continue;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      let x = r() * span;
      let y: number;
      let far = false;
      if (def.zone === 'hill') {
        far = true;
        y = (hills[Math.round(x) % span] ?? ground) + 1;
        if (kind === 'waterfall' && river) x = river.x0;
      } else if (def.zone === 'river' && river) {
        y = ground + 3 + r() * below * 0.45;
        const rx = riverX(river, y);
        x = kind === 'bridge' ? rx : rx + (r() < 0.5 ? -1 : 1) * (riverWidth(river, y) / 2 + def.w / 2 + 1);
      } else if (def.zone === 'shore') {
        y = ground + 3 + r() * below * 0.3;
        const sea = world.waters.find(w => w.kind === 'sea')!;
        x = seaShore(sea, y) - sea.side * (def.w / 2 + 3);
      } else {
        y = ground + 3 + r() * below * 0.4;
      }
      const wet = def.zone !== 'river' && !far && isWet(world, x, y, def.w / 2 + 2);
      if (!wet && fits(kind, x, far)) {
        world.pois.push({ kind, x: Math.round(x), y: Math.round(y), variant: r(), far });
        used.add(kind);
        break;
      }
    }
  }
}
