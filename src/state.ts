import { BIOMES, type BiomeId, type Season } from './biomes';
import { colorToHex } from './color';
import { FORMATS, type FormatId, frameSize, SIZES, type SizeId } from './formats';
import type { Weather } from './lighting';
import { PALETTES, parseCustomPalette } from './palettes';
import { DEFAULT_SETTINGS, type Settings } from './render';

import type { WorldOptions } from './world';

/** Everything that defines a picture. Serialises to a URL hash and to CLI flags with the same keys. */
export interface AppState {
  seed: number;
  biome: BiomeId | 'auto';
  format: FormatId;
  size: SizeId;
  pan: boolean;
  caption: string;
  settings: Settings;
}

export const WEATHERS: readonly Weather[] = ['clear', 'clouds', 'rain', 'storm', 'snow', 'fog'];
export const SEASONS: readonly (Season | 'auto')[] = ['auto', 'spring', 'summer', 'autumn', 'winter'];
const LAYERS = ['clouds', 'structures', 'life', 'weather'] as const;

export function defaultState(seed: number): AppState {
  return { seed, biome: 'auto', format: 'wide', size: 'medium', pan: false, caption: '', settings: { ...DEFAULT_SETTINGS, layers: { ...DEFAULT_SETTINGS.layers } } };
}

export function worldOptions(s: AppState): WorldOptions {
  return { seed: s.seed, ...frameSize(s.format, s.size), pan: s.pan, ...(s.biome === 'auto' ? {} : { biome: s.biome }) };
}

export function toParams(s: AppState): URLSearchParams {
  const st = s.settings;
  const p = new URLSearchParams({
    seed: String(s.seed),
    biome: s.biome,
    format: s.format,
    size: s.size,
    time: String(st.hour),
    weather: st.weather,
    intensity: String(st.intensity),
    season: st.season,
    palette: st.palette,
    frames: String(st.frames),
    fps: String(st.fps),
    layers: LAYERS.filter(k => st.layers[k]).join(','),
  });
  if (s.pan) p.set('pan', '1');
  if (st.timelapse) p.set('timelapse', '1');
  if (st.palette === 'custom' && st.customPalette) p.set('colors', st.customPalette.map(c => colorToHex(c).slice(1)).join(','));
  if (s.caption) p.set('caption', s.caption);
  return p;
}

const num = (v: string | null, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const oneOf = <T extends string>(v: string | null, list: readonly T[], fallback: T): T => (v !== null && (list as readonly string[]).includes(v) ? (v as T) : fallback);

/** Parses untrusted input (URL hash or CLI flags); anything invalid falls back to the defaults. */
export function fromParams(p: URLSearchParams, fallbackSeed: number): AppState {
  const d = defaultState(fallbackSeed);
  const custom = p.get('colors') ? parseCustomPalette(p.get('colors')!.split(',').map(h => `#${h}`).join(' ')) : null;
  const palette = oneOf(p.get('palette'), [...PALETTES.map(pl => pl.id), 'custom'], 'original');
  const layerList = p.has('layers') ? (p.get('layers') ?? '').split(',') : LAYERS;
  return {
    seed: Math.floor(num(p.get('seed'), 0, 999_999_999, d.seed)),
    biome: oneOf(p.get('biome'), ['auto', ...BIOMES.map(b => b.id)], 'auto'),
    format: oneOf(p.get('format'), FORMATS.map(f => f.id), 'wide'),
    size: oneOf(p.get('size'), SIZES.map(s => s.id), 'medium'),
    pan: p.get('pan') === '1',
    caption: (p.get('caption') ?? '').slice(0, 40),
    settings: {
      hour: num(p.get('time'), 0, 24, d.settings.hour),
      weather: oneOf(p.get('weather'), WEATHERS, d.settings.weather),
      intensity: num(p.get('intensity'), 0, 1, d.settings.intensity),
      season: oneOf(p.get('season'), SEASONS, 'auto'),
      timelapse: p.get('timelapse') === '1',
      frames: Math.round(num(p.get('frames'), 12, 240, d.settings.frames)),
      fps: Math.round(num(p.get('fps'), 4, 30, d.settings.fps)),
      palette: palette === 'custom' && !custom ? 'original' : palette,
      ...(custom ? { customPalette: custom } : {}),
      layers: { clouds: layerList.includes('clouds'), structures: layerList.includes('structures'), life: layerList.includes('life'), weather: layerList.includes('weather') },
    },
  };
}
