import { bayer, mix, multiply } from './color';
import type { Light } from './lighting';
import type { Raster } from './raster';
import type { SeasonLook } from './biomes';
import type { World } from './world';

export const TAU = Math.PI * 2;
export const SNOW = 0xe8eef6;
export const WARM_LIGHT = 0xffd27a;

/** Everything a drawing routine needs for the current frame. */
export interface Paint {
  r: Raster;
  world: World;
  light: Light;
  look: SeasonLook;
  /** Loop position 0..1. */
  t: number;
  frame: number;
  /** Loop length in seconds. */
  duration: number;
  /** Extra haze from fog, 0..1. */
  fog: number;
  /** Wind strength multiplier (rain and storms blow harder). */
  wind: number;
}

/** Light a surface colour at a depth (0 = horizon, 1 = foreground). */
export function lit(p: Paint, color: number, depth: number): number {
  const haze = (1 - depth) * 0.55 + p.fog * (1 - depth * 0.7);
  return mix(multiply(color, p.light.tint), p.light.haze, haze);
}

/**
 * Whole number of animation cycles per loop for a motion that should run at about `hz`.
 * Keeps motion at a natural speed for any loop length while staying perfectly seamless.
 */
export function cycles(p: Paint, hz: number): number {
  return Math.max(1, Math.round(hz * p.duration));
}

/** sin of an animation running at roughly `hz`, offset by `phase` (0..1). */
export function wave(p: Paint, hz: number, phase = 0): number {
  return Math.sin(TAU * (p.t * cycles(p, hz) + phase));
}

/** Dithered alpha: keeps edges crisp and the GIF palette small. */
export function dot(p: Paint, x: number, y: number, color: number, alpha: number): void {
  if (alpha > bayer(Math.round(x), Math.round(y))) p.r.px(x, y, color);
}

export function glow(p: Paint, x: number, y: number, radius: number, color: number, strength: number): void {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const d = Math.hypot(dx, dy) / radius;
      if (d < 1) p.r.px(x + dx, y + dy, color, (Math.ceil((1 - d) * 3) / 3) * 0.28 * strength);
    }
  }
}

export function line(p: Paint, x0: number, y0: number, x1: number, y1: number, color: number, alpha = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i += 1) p.r.px(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, color, alpha);
}

/** Night-time warm light: emissive colour, untouched by the lighting tint. */
export function lamp(p: Paint, x: number, y: number, w: number, h: number, depth: number, radius = 7): void {
  if (p.light.lightsOn) {
    p.r.rect(x, y, w, h, WARM_LIGHT);
    glow(p, x + w / 2, y + h / 2, radius, 0xffc060, 0.85 + 0.15 * wave(p, 3));
  } else {
    p.r.rect(x, y, w, h, lit(p, 0x2a2e3a, depth));
    if (w > 1 && h > 1) p.r.px(x, y, lit(p, 0x8aa0b8, depth));
  }
}
