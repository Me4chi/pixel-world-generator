import { rng } from './color';

export const WIDTH = 192;
export const HEIGHT = 108;
/** Row where the walkable ground begins. */
export const GROUND = 82;
export const LAKE_TOP = 87;

export interface Foliage {
  dark: number;
  mid: number;
  light: number;
}

export interface Biome {
  name: string;
  grass: Foliage;
  foliage: Foliage;
  /** Second canopy colour for round trees (blossom, autumn leaves). */
  canopy: Foliage;
  trunk: number;
  far: number;
  mid: number;
  pines: number;
}

export const BIOMES: readonly Biome[] = [
  {
    name: 'Temperate valley',
    grass: { dark: 0x2f5a34, mid: 0x4f8a45, light: 0x7fb85a },
    foliage: { dark: 0x1f4630, mid: 0x2f6a40, light: 0x4f9450 },
    canopy: { dark: 0x2a5a2e, mid: 0x3f8040, light: 0x6aae55 },
    trunk: 0x5a3e2a,
    far: 0x6f88a8,
    mid: 0x3f6a5a,
    pines: 0.5,
  },
  {
    name: 'Autumn hills',
    grass: { dark: 0x5a5a2a, mid: 0x8a8a3a, light: 0xb8a850 },
    foliage: { dark: 0x2f4a30, mid: 0x3f6438, light: 0x5a8048 },
    canopy: { dark: 0x8a3a1e, mid: 0xc8642a, light: 0xeea040 },
    trunk: 0x4a3222,
    far: 0x8a8098,
    mid: 0x6a5a48,
    pines: 0.3,
  },
  {
    name: 'Sakura glade',
    grass: { dark: 0x3a5e3a, mid: 0x5a8a4e, light: 0x8ab868 },
    foliage: { dark: 0x24483a, mid: 0x356650, light: 0x52886a },
    canopy: { dark: 0xb05a7a, mid: 0xe08aa6, light: 0xf8c0d0 },
    trunk: 0x4a3030,
    far: 0x8890b8,
    mid: 0x4f6a6a,
    pines: 0.25,
  },
  {
    name: 'Boreal ridge',
    grass: { dark: 0x24443a, mid: 0x3a6450, light: 0x5a8a66 },
    foliage: { dark: 0x12302a, mid: 0x1e4638, light: 0x30604a },
    canopy: { dark: 0x1e4034, mid: 0x2e5a44, light: 0x4a7a58 },
    trunk: 0x3a2a22,
    far: 0x7a8ca8,
    mid: 0x2e4a4a,
    pines: 0.9,
  },
];

export type StructureKind = 'cottage' | 'shrine' | 'windmill';

export interface Tree {
  x: number;
  y: number;
  h: number;
  pine: boolean;
  phase: number;
}

export interface World {
  seed: number;
  biome: Biome;
  far: Int16Array;
  mid: Int16Array;
  hills: Int16Array;
  snowPeaks: boolean;
  midTrees: Tree[];
  hillTrees: Tree[];
  nearTrees: Tree[];
  structure: { kind: StructureKind; x: number };
  lake: { x: number; w: number } | null;
  stars: { x: number; y: number; phase: number; speed: number }[];
  clouds: { x: number; y: number; w: number; h: number; phase: number }[];
  drops: { x: number; y: number; speed: number }[];
  fireflies: { x: number; y: number; r: number; phase: number }[];
  tufts: { x: number; y: number; phase: number }[];
  flowers: { x: number; y: number; color: number }[];
  birds: { y: number; offset: number }[];
}

function ridge(r: () => number, base: number, amp: number, detail: number): Int16Array {
  const waves = Array.from({ length: 4 }, (_, i) => ({ f: (0.015 + r() * 0.02) * (i + 1) * detail, p: r() * 10, a: amp / (i + 1.3) }));
  return Int16Array.from({ length: WIDTH }, (_, x) =>
    Math.round(base + waves.reduce((sum, w) => sum + Math.sin(x * w.f + w.p) * w.a, 0)),
  );
}

export function generateWorld(seed: number): World {
  const r = rng(seed);
  const biome = BIOMES[Math.floor(r() * BIOMES.length)] ?? BIOMES[0]!;
  const far = ridge(r, 50, 12 + r() * 10, 1);
  const mid = ridge(r, 66, 6, 1.6);
  const hills = ridge(r, 76, 3, 2.2);
  const snowPeaks = Math.min(...far) < 38;

  const lake = r() < 0.65 ? { x: 30 + r() * 120, w: 40 + r() * 50 } : null;
  // Structure stands on dry ground: the side of the valley away from the lake.
  const structureX = lake ? (lake.x > WIDTH / 2 ? 24 + r() * 30 : WIDTH - 54 + r() * 24) : 50 + r() * 90;
  const kinds: StructureKind[] = ['cottage', 'shrine', 'windmill'];
  const structure = { kind: kinds[Math.floor(r() * kinds.length)] ?? 'cottage', x: Math.round(structureX) };

  const tree = (x: number, y: number, h: number): Tree => ({ x, y, h, pine: r() < biome.pines, phase: r() });
  const midTrees: Tree[] = [];
  for (let x = 0; x < WIDTH; x += 3 + Math.floor(r() * 4)) midTrees.push(tree(x, mid[x] ?? 66, 5 + r() * 5));
  const hillTrees: Tree[] = [];
  for (let x = 2; x < WIDTH; x += 9 + Math.floor(r() * 14)) {
    if (Math.abs(x - structure.x) > 16) hillTrees.push(tree(x, (hills[x] ?? 76) + 1, 9 + r() * 7));
  }
  const nearTrees = [tree(4 + r() * 14, HEIGHT + 2, 34 + r() * 14), tree(WIDTH - 6 - r() * 16, HEIGHT + 2, 30 + r() * 16)];

  const onLake = (x: number): boolean => lake !== null && x > lake.x - 2 && x < lake.x + lake.w + 2;
  return {
    seed,
    biome,
    far,
    mid,
    hills,
    snowPeaks,
    midTrees,
    hillTrees,
    nearTrees,
    structure,
    lake,
    stars: Array.from({ length: 70 }, () => ({ x: r() * WIDTH, y: r() * 60, phase: r(), speed: 1 + Math.floor(r() * 3) })),
    clouds: Array.from({ length: 7 }, () => ({ x: r() * WIDTH, y: 6 + r() * 34, w: 18 + r() * 26, h: 4 + r() * 5, phase: r() })),
    drops: Array.from({ length: 140 }, () => ({ x: r() * WIDTH, y: r(), speed: 0.8 + r() * 0.4 })),
    fireflies: Array.from({ length: 16 }, () => ({ x: 10 + r() * (WIDTH - 20), y: GROUND - 4 + r() * 18, r: 2 + r() * 5, phase: r() })),
    tufts: Array.from({ length: 60 }, () => {
      let x = r() * WIDTH;
      if (onLake(x)) x = (x + WIDTH / 2) % WIDTH;
      return { x, y: GROUND + 2 + r() * (HEIGHT - GROUND - 3), phase: r() };
    }).filter(t => !onLake(t.x) || t.y < LAKE_TOP - 1),
    flowers: Array.from({ length: 24 }, () => ({ x: r() * WIDTH, y: GROUND + 1 + r() * 20, color: [0xf0e070, 0xf0a0c0, 0xe0e8f0][Math.floor(r() * 3)] ?? 0xf0e070 })).filter(
      f => !onLake(f.x),
    ),
    birds: Array.from({ length: 3 + Math.floor(r() * 3) }, (_, i) => ({ y: 18 + r() * 20, offset: i * 7 + r() * 4 })),
  };
}
