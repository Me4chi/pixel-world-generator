import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { Raster } from './raster';
import { FRAME_MS, LOOP_FRAMES, renderFrame, type Settings } from './render';
import type { World } from './world';

/** Upscales an indexed frame by an integer factor with nearest neighbour, keeping pixels square. */
function upscale(index: Uint8Array, width: number, height: number, scale: number): Uint8Array {
  if (scale === 1) return index;
  const out = new Uint8Array(width * scale * height * scale);
  for (let y = 0; y < height * scale; y += 1) {
    const row = Math.floor(y / scale) * width;
    for (let x = 0; x < width * scale; x += 1) out[y * width * scale + x] = index[row + Math.floor(x / scale)] ?? 0;
  }
  return out;
}

/** Renders one full loop and encodes it as an endlessly repeating GIF. */
export async function exportGif(world: World, settings: Settings, scale: number, onProgress: (p: number) => void): Promise<Blob> {
  const raster = new Raster(192, 108);
  const { width, height } = raster;
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < LOOP_FRAMES; i += 1) {
    renderFrame(raster, world, settings, i);
    frames.push(raster.data.slice());
  }
  // One global palette for the whole loop, so colours never flicker between frames.
  const all = new Uint8ClampedArray(frames.length * width * height * 4);
  frames.forEach((frame, i) => all.set(frame, i * frame.length));
  const palette = quantize(all, 256);

  const gif = GIFEncoder();
  for (const [i, frame] of frames.entries()) {
    const index = upscale(applyPalette(frame, palette), width, height, scale);
    gif.writeFrame(index, width * scale, height * scale, i === 0 ? { palette, delay: FRAME_MS, repeat: 0 } : { delay: FRAME_MS });
    onProgress((i + 1) / frames.length);
    if (i % 6 === 5) await new Promise(resolve => setTimeout(resolve)); // let the progress bar paint
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
