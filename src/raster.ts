/** A tiny RGBA framebuffer. Pure TypeScript, so worlds render identically in the browser and in tests. */
export class Raster {
  readonly data: Uint8ClampedArray;

  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  px(x: number, y: number, color: number, alpha = 1): void {
    x = Math.round(x);
    y = Math.round(y);
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
    x = Math.max(0, Math.min(this.width - 1, Math.round(x)));
    y = Math.max(0, Math.min(this.height - 1, Math.round(y)));
    const i = (y * this.width + x) * 4;
    return ((this.data[i] ?? 0) << 16) | ((this.data[i + 1] ?? 0) << 8) | (this.data[i + 2] ?? 0);
  }
}
