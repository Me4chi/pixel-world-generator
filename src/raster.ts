/** A tiny RGBA framebuffer. Pure TypeScript, so worlds render identically in the browser, a worker, Node and tests. */
export class Raster {
  readonly data: Uint8ClampedArray;

  /** @param wrap Horizontal wrap-around: used for panoramas, where the world is a seamless ring. */
  constructor(readonly width: number, readonly height: number, readonly wrap = false) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  px(x: number, y: number, color: number, alpha = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    const a = Math.min(1, alpha);
    d[i] = (d[i] ?? 0) + (((color >> 16) & 255) - (d[i] ?? 0)) * a;
    d[i + 1] = (d[i + 1] ?? 0) + (((color >> 8) & 255) - (d[i + 1] ?? 0)) * a;
    d[i + 2] = (d[i + 2] ?? 0) + ((color & 255) - (d[i + 2] ?? 0)) * a;
    d[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy += 1) {
      for (let xx = Math.round(x); xx < Math.round(x + w); xx += 1) this.px(xx, yy, color, alpha);
    }
  }

  get(x: number, y: number): number {
    x = Math.round(x);
    x = this.wrap ? ((x % this.width) + this.width) % this.width : Math.max(0, Math.min(this.width - 1, x));
    y = Math.max(0, Math.min(this.height - 1, Math.round(y)));
    const i = (y * this.width + x) * 4;
    return ((this.data[i] ?? 0) << 16) | ((this.data[i + 1] ?? 0) << 8) | (this.data[i + 2] ?? 0);
  }

  /** Copies a window starting at column `x` (wrapping when the source wraps) into `out`. */
  copyWindow(out: Raster, x: number): void {
    const start = Math.round(x);
    for (let y = 0; y < out.height; y += 1) {
      for (let ox = 0; ox < out.width; ox += 1) {
        const sx = this.wrap ? (((start + ox) % this.width) + this.width) % this.width : Math.min(this.width - 1, start + ox);
        const s = (y * this.width + sx) * 4;
        const d = (y * out.width + ox) * 4;
        out.data[d] = this.data[s] ?? 0;
        out.data[d + 1] = this.data[s + 1] ?? 0;
        out.data[d + 2] = this.data[s + 2] ?? 0;
        out.data[d + 3] = 255;
      }
    }
  }
}
