import * as gifenc from 'gifenc';
import type { Palette } from 'gifenc';
import { PALETTES } from './palettes';
import { Raster } from './raster';
import { renderFrame, type Settings } from './render';
import type { World } from './world';

// gifenc ships ESM for bundlers but CommonJS for Node, where its exports sit on `default`.
const lib: typeof gifenc = 'GIFEncoder' in gifenc ? gifenc : (gifenc as unknown as { default: typeof gifenc }).default;
const { GIFEncoder, quantize, applyPalette: indexFrame } = lib;

/** Upscales an indexed frame by an integer factor with nearest neighbour, keeping pixels square. */
function upscale(index: Uint8Array, width: number, height: number, scale: number): Uint8Array {
  if (scale === 1) return index;
  const out = new Uint8Array(width * scale * height * scale);
  const row = new Uint8Array(width * scale);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width * scale; x += 1) row[x] = index[y * width + Math.floor(x / scale)] ?? 0;
    for (let k = 0; k < scale; k += 1) out.set(row, (y * scale + k) * width * scale);
  }
  return out;
}

export function renderLoop(world: World, settings: Settings, onFrame?: (i: number) => void): Uint8ClampedArray[] {
  const raster = new Raster(world.width, world.height);
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < settings.frames; i += 1) {
    renderFrame(raster, world, settings, i);
    frames.push(raster.data.slice());
    onFrame?.(i);
  }
  return frames;
}

function paletteFor(settings: Settings, frames: Uint8ClampedArray[]): Palette {
  const fixed = settings.palette === 'custom' ? settings.customPalette : PALETTES.find(p => p.id === settings.palette)?.colors;
  if (fixed && fixed.length) return fixed.slice(0, 255).map(c => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
  // Quantize from a sample of frames: one shared palette means colours never flicker between frames.
  const step = Math.max(1, Math.floor(frames.length / 24));
  const sample = frames.filter((_, i) => i % step === 0);
  const all = new Uint8ClampedArray(sample.reduce((s, f) => s + f.length, 0));
  sample.forEach((f, i) => all.set(f, i * f.length));
  return quantize(all, 255);
}

/**
 * Encodes rendered frames as an endlessly looping GIF. Frames after the first store only the pixels that
 * changed (the rest is transparent and the previous frame stays), which makes animations several times smaller.
 */
export function encodeGif(frames: Uint8ClampedArray[], width: number, height: number, settings: Settings, scale: number, onProgress?: (p: number) => void): Uint8Array<ArrayBuffer> {
  const palette = paletteFor(settings, frames);
  const transparent = palette.length;
  const withClear = [...palette, [0, 0, 0]];
  const gif = GIFEncoder();
  const delay = Math.round(1000 / Math.max(1, settings.fps));
  let prev: Uint8Array | null = null;
  frames.forEach((frame, i) => {
    const index = indexFrame(frame, palette);
    let out = index;
    if (prev) {
      out = index.slice();
      for (let k = 0; k < out.length; k += 1) if (out[k] === prev[k]) out[k] = transparent;
    }
    prev = index;
    gif.writeFrame(upscale(out, width, height, scale), width * scale, height * scale, {
      ...(i === 0 ? { palette: withClear, repeat: 0 } : { transparent: true, transparentIndex: transparent }),
      delay,
      dispose: 1,
    });
    onProgress?.((i + 1) / frames.length);
  });
  gif.finish();
  return gif.bytes();
}

/** Size estimate from the first frame plus one changed frame, without encoding the whole loop. */
export function estimateGifBytes(world: World, settings: Settings, scale: number): number {
  const sample = renderLoop(world, { ...settings, frames: Math.min(settings.frames, 2) });
  const two = encodeGif(sample, world.width, world.height, settings, scale).length;
  const one = encodeGif(sample.slice(0, 1), world.width, world.height, settings, scale).length;
  return one + Math.max(0, two - one) * (settings.frames - 1);
}
