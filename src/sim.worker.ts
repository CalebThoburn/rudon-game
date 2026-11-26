// Runs one Rust/WASM simulation World on its own thread.
// Worker 0 owns sector 0 (the one the player stands in) and streams its state
// back every tick; the other workers only simulate and report timing.
import { STATE_LEN } from './simLayout';

interface SimExports {
  memory: WebAssembly.Memory;
  world_new(n: number, seed: number): number;
  world_resize(w: number, n: number): void;
  world_step(w: number, dt: number): void;
  world_command(w: number, sector: number, kind: number, room: number, value: number): void;
  world_state(w: number, sector: number): number;
}

export type ToWorker =
  | { type: 'init'; wasmUrl: string; sectors: number; seed: number; reportState: boolean; timeScale: number }
  | { type: 'resize'; sectors: number }
  | { type: 'command'; kind: number; room: number; value: number }
  | { type: 'timeScale'; value: number };

export type FromWorker =
  | { type: 'state'; state: Float64Array; stepMs: number; sectors: number }
  | { type: 'perf'; stepMs: number; sectors: number }
  | { type: 'error'; message: string };

const TICK_MS = 50; // 20 Hz simulation tick
const MAX_REAL_DT = 0.25; // if a tick runs long, game time slows instead of exploding

const ctx = self as unknown as {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

let ex: SimExports | null = null;
let world = 0;
let sectors = 0;
let timeScale = 30;
let reportState = false;
let last = 0;

async function instantiate(url: string): Promise<SimExports> {
  try {
    const { instance } = await WebAssembly.instantiateStreaming(fetch(url), {});
    return instance.exports as unknown as SimExports;
  } catch {
    // Fallback for servers that don't send application/wasm.
    const bytes = await (await fetch(url)).arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return instance.exports as unknown as SimExports;
  }
}

function tick(): void {
  if (!ex) return;
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, MAX_REAL_DT);
  last = now;

  const t0 = performance.now();
  if (sectors > 0) ex.world_step(world, dt * timeScale);
  const stepMs = performance.now() - t0;

  if (reportState) {
    const ptr = ex.world_state(world, 0);
    const state = new Float64Array(ex.memory.buffer, ptr, STATE_LEN).slice();
    ctx.postMessage({ type: 'state', state, stepMs, sectors }, [state.buffer]);
  } else {
    ctx.postMessage({ type: 'perf', stepMs, sectors });
  }
  setTimeout(tick, Math.max(0, TICK_MS - (performance.now() - now)));
}

ctx.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      ex = await instantiate(m.wasmUrl);
    } catch (err) {
      ctx.postMessage({ type: 'error', message: String(err) });
      return;
    }
    sectors = m.sectors;
    world = ex.world_new(sectors, m.seed);
    reportState = m.reportState;
    timeScale = m.timeScale;
    last = performance.now();
    tick();
    return;
  }
  if (!ex) return;
  if (m.type === 'resize') {
    sectors = m.sectors;
    ex.world_resize(world, sectors);
  } else if (m.type === 'command') {
    ex.world_command(world, 0, m.kind, m.room, m.value);
  } else if (m.type === 'timeScale') {
    timeScale = m.value;
  }
};
