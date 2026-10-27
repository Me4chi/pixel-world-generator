import { BIOMES } from './biomes';
import { colorToHex } from './color';
import { FORMATS, frameSize, SIZES } from './formats';
import { detectLang, hasKey, type Key, type Lang, translate } from './i18n';
import { PALETTES, parseCustomPalette } from './palettes';
import { Raster } from './raster';
import { type Caption, renderFrame } from './render';
import { type AppState, defaultState, fromParams, SEASONS, toParams, WEATHERS, worldOptions } from './state';
import type { WorkerRequest, WorkerResponse } from './worker';
import { generateWorld, type World } from './world';
import './style.css';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing`);
  return el as T;
};

const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the gallery simply won't persist.
    }
  },
};

let lang: Lang = storage.get<Lang>('pwg-lang', detectLang());
const t = (key: Key): string => translate(lang, key);

const canvas = $<HTMLCanvasElement>('preview');
const ctx = canvas.getContext('2d')!;
const status = $('status');
const progress = $('progress');

let state: AppState = defaultState(Math.floor(Math.random() * 1_000_000));
let world: World;
let raster: Raster;
let image: ImageData;
let caption: Caption | null = null;
let frame = 0;
let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let busy = false;

// ---------- Worker ----------

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let requestId = 0;
const pending = new Map<number, { resolve: (msg: WorkerResponse) => void; progress?: (v: number) => void }>();
worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
  const msg = event.data;
  const job = pending.get(msg.id);
  if (!job) return;
  if (msg.kind === 'progress') job.progress?.(msg.value);
  else {
    pending.delete(msg.id);
    job.resolve(msg);
  }
};
function ask(kind: WorkerRequest['kind'], scale: number, onProgress?: (v: number) => void): Promise<WorkerResponse> {
  const id = (requestId += 1);
  return new Promise(resolve => {
    pending.set(id, { resolve, ...(onProgress ? { progress: onProgress } : {}) });
    worker.postMessage({ id, kind, params: toParams(state).toString(), scale, caption } satisfies WorkerRequest);
  });
}

// ---------- Controls ----------

const fill = (select: HTMLSelectElement, options: [string, string][], value: string): void => {
  select.replaceChildren(...options.map(([v, label]) => new Option(label, v, false, v === value)));
};

function buildControls(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n ?? '';
    if (hasKey(key)) el.textContent = t(key);
  }
  document.documentElement.lang = lang;
  document.title = t('title');
  $('lang').textContent = lang === 'en' ? 'RU' : 'EN';
  $('play').textContent = playing ? t('pause') : t('play');

  fill($<HTMLSelectElement>('biome'), [['auto', t('auto')], ...BIOMES.map(b => [b.id, b.name[lang]] as [string, string])], state.biome);
  fill($<HTMLSelectElement>('format'), FORMATS.map(f => [f.id, f.label[lang]]), state.format);
  fill(
    $<HTMLSelectElement>('size'),
    SIZES.map(s => {
      const { width, height } = frameSize(state.format, s.id);
      return [s.id, `${s.label[lang]} — ${width}×${height}`];
    }),
    state.size,
  );
  fill($<HTMLSelectElement>('season'), SEASONS.map(s => [s, t(`season.${s}` as Key)]), state.settings.season);
  fill(
    $<HTMLSelectElement>('palette'),
    [...PALETTES.map(p => [p.id, hasKey(`palette.${p.id}`) ? t(`palette.${p.id}` as Key) : p.name] as [string, string]), ['custom', t('custom')]],
    state.settings.palette,
  );
  const { width, height } = frameSize(state.format, state.size);
  fill(
    $<HTMLSelectElement>('scale'),
    [1, 2, 3, 4, 5, 6, 8].map(s => [String(s), `${s}× — ${width * s}×${height * s}`]),
    $<HTMLSelectElement>('scale').value || '4',
  );

  $('weather').replaceChildren(
    ...WEATHERS.map(w => {
      const label = document.createElement('label');
      const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'weather', value: w, checked: w === state.settings.weather });
      input.addEventListener('change', () => update(s => (s.settings.weather = w)));
      const span = document.createElement('span');
      span.textContent = t(`weather.${w}` as Key);
      label.append(input, span);
      return label;
    }),
  );
  $('layers').replaceChildren(
    ...(['clouds', 'structures', 'life', 'weather'] as const).map(k => {
      const label = document.createElement('label');
      label.className = 'check';
      const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: state.settings.layers[k] });
      input.addEventListener('change', () => update(s => (s.settings.layers[k] = input.checked)));
      const span = document.createElement('span');
      span.textContent = t(`layer.${k}` as Key);
      label.append(input, span);
      return label;
    }),
  );
}

function syncInputs(): void {
  const s = state.settings;
  $<HTMLInputElement>('seed').value = String(state.seed);
  $<HTMLInputElement>('pan').checked = state.pan;
  $<HTMLInputElement>('time').value = String(s.hour);
  $<HTMLInputElement>('timelapse').checked = s.timelapse;
  $<HTMLInputElement>('intensity').value = String(s.intensity);
  $<HTMLInputElement>('intensity').disabled = s.weather === 'clear';
  $<HTMLInputElement>('frames').value = String(s.frames);
  $<HTMLInputElement>('fps').value = String(s.fps);
  $<HTMLInputElement>('caption').value = state.caption;
  $('time-out').textContent = formatHour(s.hour) + (s.timelapse ? ' ↻' : '');
  $('intensity-out').textContent = `${Math.round(s.intensity * 100)}%`;
  $('frames-out').textContent = `${s.frames} · ${(s.frames / s.fps).toFixed(1)} s ${t('loop')}`;
  $('fps-out').textContent = String(s.fps);
  $('custom-field').hidden = s.palette !== 'custom';
  const swatchColors = s.palette === 'custom' ? s.customPalette ?? [] : PALETTES.find(p => p.id === s.palette)?.colors ?? [];
  $('swatches').replaceChildren(
    ...swatchColors.slice(0, 32).map(c => Object.assign(document.createElement('i'), { style: `background:${colorToHex(c)}` })),
  );
}

const formatHour = (h: number): string => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

// ---------- State changes ----------

let estimateTimer = 0;
function update(change: (s: AppState) => void, opts: { regenerate?: boolean; rebuild?: boolean } = {}): void {
  const before = toParams(state).toString();
  const next = structuredClone(state);
  change(next);
  state = next;
  const worldChanged = opts.regenerate ?? false;
  if (worldChanged || !world) regenerate();
  if (opts.rebuild) buildControls();
  syncInputs();
  if (toParams(state).toString() !== before) history.replaceState(null, '', `#${toParams(state)}`);
  draw();
  clearTimeout(estimateTimer);
  estimateTimer = window.setTimeout(refreshEstimate, 500);
}

function regenerate(): void {
  world = generateWorld(worldOptions(state));
  raster = new Raster(world.width, world.height);
  image = new ImageData(world.width, world.height);
  canvas.width = world.width;
  canvas.height = world.height;
  frame %= state.settings.frames;
  fitCanvas();
  const pois = [...new Set(world.pois.map(p => t(`poi.${p.kind}` as Key)))].join(', ');
  $('summary').textContent = `${world.biome.name[lang]}${pois ? ` · ${pois}` : ''} · ${world.width}×${world.height}${world.pan ? ' ↔' : ''}`;
  rememberSeed(state.seed);
  void renderCaption();
}

/** Largest whole-number scale that fits, so preview pixels stay square and crisp. */
function fitCanvas(): void {
  if (!world) return;
  const box = $('stage').getBoundingClientRect();
  const maxH = window.innerHeight * 0.7;
  const s = Math.max(1, Math.floor(Math.min(box.width / world.width, maxH / world.height)));
  canvas.style.width = `${world.width * s}px`;
  canvas.style.height = `${world.height * s}px`;
}

async function renderCaption(): Promise<void> {
  const text = state.caption.trim();
  if (!text) {
    caption = null;
    draw();
    return;
  }
  await document.fonts.load('8px "Press Start 2P"');
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = '8px "Press Start 2P", monospace';
  let shown = text;
  while (shown.length > 1 && g.measureText(shown).width > world.width - 6) shown = shown.slice(0, -1);
  c.width = Math.ceil(g.measureText(shown).width) + 1;
  c.height = 9;
  g.font = '8px "Press Start 2P", monospace';
  g.textBaseline = 'top';
  g.fillStyle = '#fff';
  g.fillText(shown, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const mask = new Uint8Array(c.width * c.height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = (data[i * 4 + 3] ?? 0) > 110 ? 1 : 0;
  caption = { mask, width: c.width, height: c.height };
  draw();
}

function draw(): void {
  if (!world) return;
  renderFrame(raster, world, { ...state.settings, caption }, frame);
  image.data.set(raster.data);
  ctx.putImageData(image, 0, 0);
}

async function refreshEstimate(): Promise<void> {
  const scale = Number($<HTMLSelectElement>('scale').value);
  $('estimate').textContent = '…';
  const msg = await ask('estimate', scale);
  if (msg.kind === 'estimate') $('estimate').textContent = formatBytes(msg.bytes);
}

const formatBytes = (n: number): string => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// ---------- Export ----------

const fileBase = (): string => `pixel-world-${state.seed}-${state.settings.weather}-${formatHour(state.settings.hour).replace(':', '')}`;

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function scaledCanvas(src: Raster, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width * scale;
  c.height = src.height * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas');
  tmp.width = src.width;
  tmp.height = src.height;
  tmp.getContext('2d')!.putImageData(new ImageData(src.data.slice(), src.width, src.height), 0, 0);
  g.drawImage(tmp, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c: HTMLCanvasElement, type = 'image/png'): Promise<Blob> => new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('toBlob failed'))), type));

async function run(task: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  document.querySelectorAll<HTMLButtonElement>('.exports button').forEach(b => (b.disabled = true));
  progress.hidden = false;
  setProgress(0);
  try {
    await task();
  } catch (error) {
    console.error(error);
    status.textContent = t('failed');
  } finally {
    busy = false;
    progress.hidden = true;
    document.querySelectorAll<HTMLButtonElement>('.exports button').forEach(b => (b.disabled = false));
  }
}

const setProgress = (v: number): void => {
  (progress.firstElementChild as HTMLElement).style.transform = `scaleX(${v})`;
};

$('export-gif').addEventListener('click', () =>
  run(async () => {
    status.textContent = t('encoding');
    const scale = Number($<HTMLSelectElement>('scale').value);
    const msg = await ask('gif', scale, setProgress);
    if (msg.kind !== 'gif') throw new Error(msg.kind === 'error' ? msg.message : 'unexpected reply');
    download(new Blob([msg.bytes], { type: 'image/gif' }), `${fileBase()}.gif`);
    status.textContent = `${t('saved')}: ${formatBytes(msg.bytes.length)} · ${world.width * scale}×${world.height * scale}`;
  }),
);

$('export-png').addEventListener('click', () =>
  run(async () => {
    draw();
    const blob = await toBlob(scaledCanvas(raster, Number($<HTMLSelectElement>('scale').value)));
    download(blob, `${fileBase()}.png`);
    status.textContent = `${t('saved')}: ${formatBytes(blob.size)}`;
  }),
);

$('export-sheet').addEventListener('click', () =>
  run(async () => {
    const n = state.settings.frames;
    const cols = Math.ceil(Math.sqrt(n));
    const sheet = new Raster(world.width * cols, world.height * Math.ceil(n / cols));
    const r = new Raster(world.width, world.height);
    for (let i = 0; i < n; i += 1) {
      renderFrame(r, world, { ...state.settings, caption }, i);
      const ox = (i % cols) * world.width;
      const oy = Math.floor(i / cols) * world.height;
      for (let y = 0; y < world.height; y += 1) sheet.data.set(r.data.subarray(y * world.width * 4, (y + 1) * world.width * 4), ((oy + y) * sheet.width + ox) * 4);
      setProgress((i + 1) / n);
      if (i % 8 === 7) await new Promise(ok => setTimeout(ok));
    }
    const blob = await toBlob(scaledCanvas(sheet, 1));
    download(blob, `${fileBase()}-sheet-${cols}x${Math.ceil(n / cols)}.png`);
    status.textContent = `${t('saved')}: ${formatBytes(blob.size)} · ${n} × ${world.width}×${world.height}`;
  }),
);

$('export-webm').addEventListener('click', () =>
  run(async () => {
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder unsupported');
    status.textContent = t('recording');
    const scale = Math.min(Number($<HTMLSelectElement>('scale').value), Math.floor(1920 / world.width) || 1);
    const out = document.createElement('canvas');
    out.width = world.width * scale;
    out.height = world.height * scale;
    const g = out.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const tmp = document.createElement('canvas');
    tmp.width = world.width;
    tmp.height = world.height;
    const tg = tmp.getContext('2d')!;
    const r = new Raster(world.width, world.height);
    const paint = (i: number): void => {
      renderFrame(r, world, { ...state.settings, caption }, i);
      tg.putImageData(new ImageData(r.data.slice(), world.width, world.height), 0, 0);
      g.drawImage(tmp, 0, 0, out.width, out.height);
    };
    paint(0);
    const stream = out.captureStream(state.settings.fps);
    const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    const done = new Promise<void>(ok => (recorder.onstop = () => ok()));
    recorder.start();
    // Video plays in real time: one loop takes frames / fps seconds to record.
    for (let i = 1; i <= state.settings.frames; i += 1) {
      await new Promise(ok => setTimeout(ok, 1000 / state.settings.fps));
      paint(i % state.settings.frames);
      setProgress(i / state.settings.frames);
    }
    recorder.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    download(blob, `${fileBase()}.webm`);
    status.textContent = `${t('saved')}: ${formatBytes(blob.size)}`;
  }),
);

// ---------- Gallery ----------

interface Favourite {
  params: string;
  thumb: string;
}

function renderGallery(): void {
  const favs = storage.get<Favourite[]>('pwg-gallery', []);
  $('gallery-empty').hidden = favs.length > 0;
  $('favourites').replaceChildren(
    ...favs.map((fav, i) => {
      const li = document.createElement('li');
      const open = Object.assign(document.createElement('a'), { href: `#${fav.params}`, title: fav.params });
      open.append(Object.assign(document.createElement('img'), { src: fav.thumb, alt: new URLSearchParams(fav.params).get('seed') ?? '' }));
      const del = Object.assign(document.createElement('button'), { type: 'button', textContent: '×', title: t('remove') });
      del.setAttribute('aria-label', t('remove'));
      del.addEventListener('click', () => {
        storage.set('pwg-gallery', favs.filter((_, k) => k !== i));
        renderGallery();
      });
      li.append(open, del);
      return li;
    }),
  );
  $('recent').replaceChildren(
    ...storage.get<number[]>('pwg-recent', []).map(seed => {
      const li = document.createElement('li');
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: String(seed) });
      b.addEventListener('click', () => update(s => (s.seed = seed), { regenerate: true }));
      li.append(b);
      return li;
    }),
  );
}

function rememberSeed(seed: number): void {
  const recent = [seed, ...storage.get<number[]>('pwg-recent', []).filter(s => s !== seed)].slice(0, 10);
  storage.set('pwg-recent', recent);
  renderGallery();
}

$('save').addEventListener('click', () => {
  draw();
  const thumb = scaledCanvas(raster, Math.max(1, Math.round(96 / world.width))).toDataURL('image/png');
  const favs = [{ params: toParams(state).toString(), thumb }, ...storage.get<Favourite[]>('pwg-gallery', [])].slice(0, 24);
  storage.set('pwg-gallery', favs);
  renderGallery();
});

// ---------- Wiring ----------

const onInput = (id: string, apply: (s: AppState, el: HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement) => void, opts: Parameters<typeof update>[1] = {}, event = 'input'): void => {
  const el = $<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>(id);
  el.addEventListener(event, () => update(s => apply(s, el), opts));
};
onInput('seed', (s, el) => (s.seed = Math.abs(Math.floor(Number(el.value))) % 1_000_000_000 || 0), { regenerate: true }, 'change');
onInput('biome', (s, el) => (s.biome = el.value as AppState['biome']), { regenerate: true }, 'change');
onInput('format', (s, el) => (s.format = el.value as AppState['format']), { regenerate: true, rebuild: true }, 'change');
onInput('size', (s, el) => (s.size = el.value as AppState['size']), { regenerate: true, rebuild: true }, 'change');
onInput('pan', (s, el) => (s.pan = el.checked), { regenerate: true }, 'change');
onInput('time', (s, el) => (s.settings.hour = Number(el.value)));
onInput('timelapse', (s, el) => (s.settings.timelapse = el.checked), {}, 'change');
onInput('intensity', (s, el) => (s.settings.intensity = Number(el.value)));
onInput('season', (s, el) => (s.settings.season = el.value as AppState['settings']['season']), {}, 'change');
onInput('palette', (s, el) => {
  s.settings.palette = el.value;
  if (el.value === 'custom' && !s.settings.customPalette) s.settings.customPalette = PALETTES[1]!.colors;
}, {}, 'change');
onInput('custom', (s, el) => {
  const colors = parseCustomPalette(el.value);
  el.setCustomValidity(colors ? '' : t('customHint'));
  if (colors) s.settings.customPalette = colors;
});
onInput('frames', (s, el) => (s.settings.frames = Number(el.value)));
onInput('fps', (s, el) => (s.settings.fps = Number(el.value)));
onInput('scale', () => undefined, {}, 'change');
$('caption').addEventListener('input', () => {
  update(s => (s.caption = $<HTMLInputElement>('caption').value.slice(0, 40)));
  void renderCaption();
});
$('random').addEventListener('click', () => update(s => (s.seed = Math.floor(Math.random() * 1_000_000)), { regenerate: true }));
$('surprise').addEventListener('click', () =>
  update(
    s => {
      const pickOne = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
      s.seed = Math.floor(Math.random() * 1_000_000);
      s.biome = 'auto';
      s.settings.hour = Math.round(Math.random() * 96) / 4;
      s.settings.weather = pickOne(['clear', 'clear', 'clouds', 'rain', 'storm', 'snow', 'fog'] as const);
      s.settings.intensity = Math.round((0.3 + Math.random() * 0.7) * 20) / 20;
      s.settings.season = pickOne(SEASONS);
      s.settings.timelapse = Math.random() < 0.15;
      s.settings.palette = Math.random() < 0.7 ? 'original' : pickOne(PALETTES).id;
    },
    { regenerate: true, rebuild: true },
  ),
);
$('play').addEventListener('click', () => {
  playing = !playing;
  $('play').textContent = playing ? t('pause') : t('play');
  $('play').setAttribute('aria-pressed', String(playing));
});
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    status.textContent = t('copied');
  } catch {
    status.textContent = location.href;
  }
});
$('lang').addEventListener('click', () => {
  lang = lang === 'en' ? 'ru' : 'en';
  storage.set('pwg-lang', lang);
  buildControls();
  update(() => undefined, { regenerate: true });
});
window.addEventListener('hashchange', () => {
  state = fromParams(new URLSearchParams(location.hash.slice(1)), state.seed);
  buildControls();
  update(() => undefined, { regenerate: true });
});
window.addEventListener('resize', fitCanvas);

let last = 0;
function tick(now: number): void {
  if (playing && world && now - last >= 1000 / state.settings.fps) {
    last = now;
    frame = (frame + 1) % state.settings.frames;
    draw();
  }
  requestAnimationFrame(tick);
}

if (location.hash.length > 1) state = fromParams(new URLSearchParams(location.hash.slice(1)), state.seed);
buildControls();
update(() => undefined, { regenerate: true });
renderGallery();
requestAnimationFrame(tick);
