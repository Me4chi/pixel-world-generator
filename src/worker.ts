/// <reference lib="webworker" />
import { encodeGif, estimateGifBytes, renderLoop } from './gif';
import type { Caption } from './render';
import { fromParams, worldOptions } from './state';
import { generateWorld } from './world';

export interface WorkerRequest {
  id: number;
  kind: 'gif' | 'estimate';
  /** Serialised AppState (URL hash parameters). */
  params: string;
  scale: number;
  caption: Caption | null;
}

export type WorkerResponse =
  | { id: number; kind: 'progress'; value: number }
  | { id: number; kind: 'gif'; bytes: Uint8Array<ArrayBuffer> }
  | { id: number; kind: 'estimate'; bytes: number }
  | { id: number; kind: 'error'; message: string };

const post = (msg: WorkerResponse, transfer: Transferable[] = []): void => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, kind, params, scale, caption } = event.data;
  try {
    const state = fromParams(new URLSearchParams(params), 0);
    const settings = { ...state.settings, caption };
    const world = generateWorld(worldOptions(state));
    if (kind === 'estimate') {
      post({ id, kind: 'estimate', bytes: estimateGifBytes(world, settings, scale) });
      return;
    }
    // Rendering is about a third of the work, encoding the rest.
    const frames = renderLoop(world, settings, i => post({ id, kind: 'progress', value: ((i + 1) / settings.frames) * 0.35 }));
    const bytes = encodeGif(frames, world.width, world.height, settings, scale, v => post({ id, kind: 'progress', value: 0.35 + v * 0.65 }));
    post({ id, kind: 'gif', bytes }, [bytes.buffer]);
  } catch (error) {
    post({ id, kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
