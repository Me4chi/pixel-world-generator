import { mix } from './color';

export type BiomeId = 'temperate' | 'autumn' | 'sakura' | 'boreal' | 'desert' | 'tundra' | 'swamp' | 'coast';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TreeKind = 'pine' | 'round' | 'birch' | 'palm' | 'cactus' | 'dead' | 'willow';
export type PoiKind =
  | 'cottage'
  | 'house'
  | 'windmill'
  | 'watermill'
  | 'castle'
  | 'ruins'
  | 'tower'
  | 'lighthouse'
  | 'shrine'
  | 'pagoda'
  | 'village'
  | 'town'
  | 'farm'
  | 'camp'
  | 'stones'
  | 'bigtree'
  | 'pyramid'
  | 'oasis'
  | 'igloo'
  | 'stilthut'
  | 'bridge'
  | 'waterfall';
export type WaterKind = 'lake' | 'sea' | 'swamp' | 'oasis';

export interface Foliage {
  dark: number;
  mid: number;
  light: number;
}

export interface Biome {
  id: BiomeId;
  name: { en: string; ru: string };
  grass: Foliage;
  /** Needles of conifers. */
  foliage: Foliage;
  /** Leaves of broadleaf trees in summer. */
  canopy: Foliage;
  /** Spring canopy override (blossom). */
  spring?: Foliage;
  trunk: number;
  far: number;
  mid: number;
  stone: number;
  /** Path, shore and dirt. */
  soil: number;
  trees: Partial<Record<TreeKind, number>>;
  /** How dense ground trees are, relative. */
  forest: number;
  water: Partial<Record<WaterKind | 'none', number>>;
  river: number;
  pois: Partial<Record<PoiKind, number>>;
  season: Season;
  /** False for biomes that look the same all year (desert, tundra). */
  seasonal: boolean;
}

const g = (dark: number, mid: number, light: number): Foliage => ({ dark, mid, light });

export const BIOMES: readonly Biome[] = [
  {
    id: 'temperate',
    name: { en: 'Temperate valley', ru: 'Зелёная долина' },
    grass: g(0x2f5a34, 0x4f8a45, 0x7fb85a),
    foliage: g(0x1f4630, 0x2f6a40, 0x4f9450),
    canopy: g(0x2a5a2e, 0x3f8040, 0x6aae55),
    trunk: 0x5a3e2a,
    far: 0x6f88a8,
    mid: 0x3f6a5a,
    stone: 0x8a8a84,
    soil: 0x8a6e48,
    trees: { round: 5, pine: 3, birch: 2 },
    forest: 1,
    water: { lake: 6, none: 4 },
    river: 0.45,
    pois: { cottage: 4, house: 3, windmill: 3, watermill: 2, castle: 2, ruins: 2, village: 2, town: 1, farm: 3, camp: 1, stones: 1, tower: 2, bigtree: 1 },
    season: 'summer',
    seasonal: true,
  },
  {
    id: 'autumn',
    name: { en: 'Autumn hills', ru: 'Осенние холмы' },
    grass: g(0x4a5a2a, 0x6e7e3a, 0x9aa050),
    foliage: g(0x2f4a30, 0x3f6438, 0x5a8048),
    canopy: g(0x3a5a2a, 0x557a35, 0x7aa048),
    trunk: 0x4a3222,
    far: 0x8a8098,
    mid: 0x6a5a48,
    stone: 0x8a8278,
    soil: 0x7a5a38,
    trees: { round: 6, birch: 3, pine: 2 },
    forest: 1.1,
    water: { lake: 5, none: 5 },
    river: 0.5,
    pois: { farm: 4, windmill: 3, watermill: 3, cottage: 3, ruins: 3, castle: 2, village: 2, tower: 1, camp: 1 },
    season: 'autumn',
    seasonal: true,
  },
  {
    id: 'sakura',
    name: { en: 'Sakura glade', ru: 'Сакуровая поляна' },
    grass: g(0x3a5e3a, 0x5a8a4e, 0x8ab868),
    foliage: g(0x24483a, 0x356650, 0x52886a),
    canopy: g(0x2f5e3a, 0x467e48, 0x6aa65a),
    spring: g(0xb05a7a, 0xe08aa6, 0xf8c0d0),
    trunk: 0x4a3030,
    far: 0x8890b8,
    mid: 0x4f6a6a,
    stone: 0x8a8a8c,
    soil: 0x9a7a58,
    trees: { round: 7, pine: 2, willow: 1 },
    forest: 0.9,
    water: { lake: 7, none: 3 },
    river: 0.4,
    pois: { shrine: 4, pagoda: 3, village: 2, bigtree: 2, bridge: 2, camp: 1, house: 1 },
    season: 'spring',
    seasonal: true,
  },
  {
    id: 'boreal',
    name: { en: 'Boreal ridge', ru: 'Северный лес' },
    grass: g(0x24443a, 0x3a6450, 0x5a8a66),
    foliage: g(0x12302a, 0x1e4638, 0x30604a),
    canopy: g(0x1e4034, 0x2e5a44, 0x4a7a58),
    trunk: 0x3a2a22,
    far: 0x7a8ca8,
    mid: 0x2e4a4a,
    stone: 0x7a8088,
    soil: 0x5a4a3a,
    trees: { pine: 8, birch: 2, dead: 1 },
    forest: 1.4,
    water: { lake: 7, none: 3 },
    river: 0.5,
    pois: { cottage: 3, tower: 3, camp: 3, stones: 2, ruins: 2, castle: 1, waterfall: 2 },
    season: 'summer',
    seasonal: true,
  },
  {
    id: 'desert',
    name: { en: 'Desert dunes', ru: 'Пустыня' },
    grass: g(0xb08a50, 0xd4ac6c, 0xf0d090),
    foliage: g(0x3a5a30, 0x4f7a3a, 0x6a9a48),
    canopy: g(0x3a6a30, 0x528a3a, 0x72aa4a),
    trunk: 0x7a5a3a,
    far: 0xc89878,
    mid: 0xb07a58,
    stone: 0xc8a878,
    soil: 0xc09860,
    trees: { cactus: 6, palm: 2, dead: 1 },
    forest: 0.35,
    water: { oasis: 4, none: 6 },
    river: 0,
    pois: { pyramid: 4, oasis: 3, ruins: 3, camp: 2, town: 1, tower: 1 },
    season: 'summer',
    seasonal: false,
  },
  {
    id: 'tundra',
    name: { en: 'Frozen tundra', ru: 'Тундра' },
    grass: g(0xb8c4d0, 0xd8e2ea, 0xf2f6fa),
    foliage: g(0x1a3a34, 0x2a5044, 0x406a58),
    canopy: g(0x1a3a34, 0x2a5044, 0x406a58),
    trunk: 0x3a2e2a,
    far: 0x9aaac0,
    mid: 0x6a7a8a,
    stone: 0x7a8490,
    soil: 0x8a8a90,
    trees: { pine: 5, dead: 3 },
    forest: 0.5,
    water: { lake: 6, none: 4 },
    river: 0.2,
    pois: { igloo: 4, camp: 3, stones: 3, tower: 2, ruins: 1 },
    season: 'winter',
    seasonal: false,
  },
  {
    id: 'swamp',
    name: { en: 'Misty swamp', ru: 'Туманное болото' },
    grass: g(0x2e3a24, 0x46542e, 0x5e6e3a),
    foliage: g(0x1e3024, 0x2c4430, 0x3e5a3c),
    canopy: g(0x2a3e26, 0x3e5630, 0x56703a),
    trunk: 0x3a3226,
    far: 0x6a7a78,
    mid: 0x3e4e44,
    stone: 0x6a6e64,
    soil: 0x4a4430,
    trees: { willow: 5, dead: 4, round: 2 },
    forest: 1.1,
    water: { swamp: 10 },
    river: 0.2,
    pois: { stilthut: 4, ruins: 3, bigtree: 2, camp: 2, stones: 2, tower: 1 },
    season: 'summer',
    seasonal: true,
  },
  {
    id: 'coast',
    name: { en: 'Sea coast', ru: 'Морское побережье' },
    grass: g(0x3e6a3a, 0x5a9048, 0x86ba62),
    foliage: g(0x1f4630, 0x2f6a40, 0x4f9450),
    canopy: g(0x2a5a2e, 0x3f8040, 0x6aae55),
    trunk: 0x5a3e2a,
    far: 0x7890b0,
    mid: 0x48705e,
    stone: 0x9a968c,
    soil: 0xd8c08a,
    trees: { round: 4, pine: 3, palm: 2 },
    forest: 0.8,
    water: { sea: 10 },
    river: 0.25,
    pois: { lighthouse: 5, village: 2, house: 3, cottage: 2, ruins: 2, castle: 2, tower: 1, camp: 1 },
    season: 'summer',
    seasonal: true,
  },
];

export interface SeasonLook {
  grass: Foliage;
  canopy: Foliage;
  foliage: Foliage;
  /** Snow lies on the ground, roofs and conifers. */
  snow: boolean;
  /** Broadleaf trees have lost their leaves. */
  bare: boolean;
  /** Flowers bloom in the grass. */
  blossom: boolean;
  /** Particles drifting in the wind, if any. */
  drift: 'petals' | 'leaves' | null;
}

const SNOW = 0xe8eef6;
const AUTUMN = g(0x8a3a1e, 0xc8642a, 0xeea040);
const tint = (f: Foliage, c: number, t: number): Foliage => g(mix(f.dark, c, t), mix(f.mid, c, t), mix(f.light, c, t));

/** How a biome looks in a season. Non-seasonal biomes ignore the season. */
export function seasonLook(b: Biome, requested: Season | 'auto'): SeasonLook {
  const season = !b.seasonal || requested === 'auto' ? b.season : requested;
  const base = { grass: b.grass, canopy: b.canopy, foliage: b.foliage };
  if (b.id === 'tundra') return { ...base, snow: true, bare: true, blossom: false, drift: null };
  if (b.id === 'desert') return { ...base, snow: false, bare: false, blossom: false, drift: null };
  switch (season) {
    case 'spring':
      return {
        grass: tint(b.grass, 0x9ad070, 0.15),
        canopy: b.spring ?? tint(b.canopy, 0xb0e080, 0.25),
        foliage: b.foliage,
        snow: false,
        bare: false,
        blossom: true,
        drift: b.spring ? 'petals' : null,
      };
    case 'autumn':
      return { grass: tint(b.grass, 0xb8a050, 0.4), canopy: AUTUMN, foliage: b.foliage, snow: false, bare: false, blossom: false, drift: 'leaves' };
    case 'winter':
      return { grass: tint(b.grass, SNOW, 0.85), canopy: b.canopy, foliage: tint(b.foliage, SNOW, 0.15), snow: true, bare: true, blossom: false, drift: null };
    default:
      return { ...base, snow: false, bare: false, blossom: false, drift: null };
  }
}

export function pickWeighted<K extends string>(weights: Partial<Record<K, number>>, r: () => number): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}
