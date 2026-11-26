// Owns a pool of simulation workers. Sectors are split across them; each worker
// is a separate thread with its own WASM instance, so no shared memory (and no
// special HTTP headers) are needed. That's what lets this run on GitHub Pages.
import type { FromWorker, ToWorker } from './sim.worker';

export class SimClient {
  readonly workers: Worker[] = [];
  readonly stepMs: number[] = [];
  readonly sectorCounts: number[] = [];
  state: Float64Array | null = null;
  error: string | null = null;
  timeScale = 30;
  totalSectors = 1;

  constructor(wasmUrl: string) {
    const threads = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    const split = this.split(this.totalSectors, threads);
    for (let i = 0; i < threads; i++) {
      const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<FromWorker>) => this.receive(i, e.data);
      this.workers.push(w);
      this.stepMs.push(0);
      this.sectorCounts.push(split[i]);
      this.post(i, { type: 'init', wasmUrl, sectors: split[i], seed: 1 + i * 7919, reportState: i === 0, timeScale: this.timeScale });
    }
  }

  /** Worker 0 always keeps at least one sector: the one the player is in. */
  private split(total: number, n: number): number[] {
    const base = Math.floor(total / n);
    const out = Array.from({ length: n }, (_, i) => base + (i < total % n ? 1 : 0));
    if (out[0] === 0) out[0] = 1;
    return out;
  }

  private post(i: number, msg: ToWorker): void {
    this.workers[i].postMessage(msg);
  }

  private receive(i: number, m: FromWorker): void {
    if (m.type === 'error') {
      this.error = m.message;
      return;
    }
    // Smooth the timing so the HUD is readable.
    this.stepMs[i] = this.stepMs[i] * 0.85 + m.stepMs * 0.15;
    this.sectorCounts[i] = m.sectors;
    if (m.type === 'state') this.state = m.state;
  }

  command(kind: number, room: number, value: number): void {
    this.post(0, { type: 'command', kind, room, value });
  }

  setTimeScale(value: number): void {
    this.timeScale = value;
    this.workers.forEach((_, i) => this.post(i, { type: 'timeScale', value }));
  }

  setTotalSectors(total: number): void {
    this.totalSectors = total;
    this.split(total, this.workers.length).forEach((sectors, i) => this.post(i, { type: 'resize', sectors }));
  }
}
