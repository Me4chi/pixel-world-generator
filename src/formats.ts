/** Frame shapes for common destinations; the pixel size of the world is chosen separately. */
export const FORMATS = [
  { id: 'wide', ratio: 16 / 9, label: { en: '16:9 — video, wallpaper', ru: '16:9 — видео, обои' } },
  { id: 'square', ratio: 1, label: { en: '1:1 — avatar, post', ru: '1:1 — аватар, пост' } },
  { id: 'portrait', ratio: 9 / 16, label: { en: '9:16 — phone, stories', ru: '9:16 — телефон, сторис' } },
  { id: 'social', ratio: 2, label: { en: '2:1 — GitHub / social preview', ru: '2:1 — превью GitHub и соцсетей' } },
  { id: 'banner', ratio: 3, label: { en: '3:1 — profile banner, Twitch', ru: '3:1 — баннер профиля, Twitch' } },
] as const;

/** World size: how many pixels the scene has, i.e. how much world fits in the frame at the same pixel scale. */
export const SIZES = [
  { id: 'small', area: 128 * 72, label: { en: 'Small world', ru: 'Маленький мир' } },
  { id: 'medium', area: 192 * 108, label: { en: 'Medium world', ru: 'Средний мир' } },
  { id: 'large', area: 288 * 162, label: { en: 'Large world', ru: 'Большой мир' } },
  { id: 'huge', area: 384 * 216, label: { en: 'Huge world', ru: 'Огромный мир' } },
] as const;

export type FormatId = (typeof FORMATS)[number]['id'];
export type SizeId = (typeof SIZES)[number]['id'];

export function frameSize(format: FormatId, size: SizeId): { width: number; height: number } {
  const ratio = FORMATS.find(f => f.id === format)?.ratio ?? 16 / 9;
  const area = SIZES.find(s => s.id === size)?.area ?? 192 * 108;
  const width = Math.round(Math.sqrt(area * ratio) / 2) * 2;
  return { width, height: Math.round(width / ratio / 2) * 2 };
}
