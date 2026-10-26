import { luminance, mix, multiply } from './color';

export type Weather = 'clear' | 'clouds' | 'rain' | 'snow' | 'fog';

export interface Light {
  skyTop: number;
  skyBottom: number;
  /** Multiplied into every lit surface. */
  tint: number;
  /** Colour distant layers fade into. */
  haze: number;
  /** 0..1 how much of the sky is covered by cloud. */
  cover: number;
  stars: number;
  /** Windows and lanterns glow. */
  lightsOn: boolean;
  sun: { x: number; y: number } | null;
  moon: { x: number; y: number } | null;
}

interface Key {
  h: number;
  top: number;
  bottom: number;
  tint: number;
  haze: number;
}

const NIGHT: Omit<Key, 'h'> = { top: 0x0a0f24, bottom: 0x1d2a4c, tint: 0x4f5c8c, haze: 0x222f52 };
const DAY: Omit<Key, 'h'> = { top: 0x4c8bd6, bottom: 0xbfe0ef, tint: 0xffffff, haze: 0xb4d0e0 };

const KEYS: readonly Key[] = [
  { h: 0, ...NIGHT },
  { h: 4.5, ...NIGHT },
  { h: 5.6, top: 0x2b2d58, bottom: 0xc0727a, tint: 0x9688a8, haze: 0x8a6f86 },
  { h: 6.6, top: 0x5a78b8, bottom: 0xf2b27a, tint: 0xf0c4a2, haze: 0xe0a888 },
  { h: 9, ...DAY },
  { h: 15.5, ...DAY },
  { h: 17.6, top: 0x4a68ae, bottom: 0xf4c27c, tint: 0xffd6a4, haze: 0xf0c090 },
  { h: 18.8, top: 0x39387a, bottom: 0xe0705a, tint: 0xc4868c, haze: 0xb06a70 },
  { h: 20.2, top: 0x141a3a, bottom: 0x39396a, tint: 0x62679a, haze: 0x383c66 },
  { h: 24, ...NIGHT },
];

const COVER: Record<Weather, number> = { clear: 0, clouds: 0.55, rain: 0.95, snow: 0.8, fog: 0.4 };

export function lightAt(hour: number, weather: Weather, intensity: number, width: number, horizon: number): Light {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && (KEYS[i + 1]?.h ?? 24) <= h) i += 1;
  const a = KEYS[i] ?? KEYS[0]!;
  const b = KEYS[i + 1] ?? a;
  const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
  const cover = COVER[weather] * intensity;

  let skyTop = mix(a.top, b.top, t);
  let skyBottom = mix(a.bottom, b.bottom, t);
  let tint = mix(a.tint, b.tint, t);
  let haze = mix(a.haze, b.haze, t);

  // Overcast skies lose saturation but keep the brightness of the hour.
  const grey = (c: number): number => mix(0x000000, 0xffffff, luminance(c) * 0.9);
  skyTop = mix(skyTop, grey(skyTop), cover);
  skyBottom = mix(skyBottom, grey(skyBottom), cover);
  tint = mix(tint, multiply(grey(tint), 0xd8dce4), cover * 0.7);
  haze = mix(haze, grey(haze), cover * 0.8);

  const dayArc = (x: number): { x: number; y: number } => ({
    x: 14 + x * (width - 28),
    y: horizon - Math.sin(Math.PI * x) * horizon * 0.85,
  });
  const visible = cover < 0.7;
  return {
    skyTop,
    skyBottom,
    tint,
    haze,
    cover,
    stars: (h < 4.6 || h > 20.4 ? 1 : h < 5.6 ? 5.6 - h : h > 19.4 ? h - 19.4 : 0) * (1 - cover),
    lightsOn: h < 6.4 || h > 18.2,
    sun: visible && h > 6 && h < 18 ? dayArc((h - 6) / 12) : null,
    moon: visible && (h > 18.5 || h < 5.5) ? dayArc((((h - 18) % 24) + 24) % 24 / 12) : null,
  };
}
