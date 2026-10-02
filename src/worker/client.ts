/**
 * Promise wrapper around the engine worker. Every request can be cancelled
 * with an AbortSignal; the worker then drops it between generation attempts.
 */
import type { Envelope, Reply, Request, Response } from './protocol';
import EngineWorker from './engine.worker.ts?worker';

type Pending = { resolve: (r: Response) => void; reject: (e: Error) => void };

export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new EngineWorker();
    this.worker.onmessage = (e: MessageEvent<Reply>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok && e.data.res) p.resolve(e.data.res);
      else p.reject(new Error(e.data.error ?? 'engine error'));
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'worker crashed'));
      this.pending.clear();
    };
  }

  request<T extends Response['type']>(req: Request, signal?: AbortSignal): Promise<Extract<Response, { type: T }>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
      this.pending.set(id, { resolve: resolve as (r: Response) => void, reject });
      signal?.addEventListener(
        'abort',
        () => {
          if (!this.pending.has(id)) return;
          this.pending.delete(id);
          this.worker.postMessage({ id, cancel: true } satisfies Envelope);
          reject(new DOMException('aborted', 'AbortError'));
        },
        { once: true },
      );
      this.worker.postMessage({ id, req } satisfies Envelope);
    });
  }
}

let client: EngineClient | null = null;
export const engine = () => (client ??= new EngineClient());

/** Random seed for Classic games (UI side; the engine itself only takes seeds). */
export function randomSeed(): string {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(36)).join('');
}
