// Runs the element world (Rust/WASM) on its own thread and streams pixels back.
interface ElemExports {
  memory: WebAssembly.Memory;
  elem_new(which: number): number;
  elem_step(e: number, dt: number): void;
  elem_render(e: number, mode: number): number;
  elem_agents(e: number): number;
  elem_agent_count(e: number): number;
  elem_probe(e: number, x: number, y: number): number;
  elem_edit(e: number, x: number, y: number, tool: number, value: number): void;
  elem_time(e: number): number;
  elem_width(): number;
  elem_height(): number;
}

export type ToElem =
  | { type: 'init'; wasmUrl: string; which: number }
  | { type: 'edits'; edits: [number, number, number, number][] }
  | { type: 'mode'; value: number }
  | { type: 'speed'; value: number }
  | { type: 'probe'; x: number; y: number }
  | { type: 'reset'; which: number };

export type FromElem =
  | { type: 'frame'; rgba: Uint8Array; agents: Float32Array; time: number; stepMs: number; w: number; h: number }
  | { type: 'probe'; data: Float32Array; x: number; y: number };

const ctx = self as unknown as { postMessage(m: FromElem, t?: Transferable[]): void; onmessage: ((e: MessageEvent<ToElem>) => void) | null };
let ex: ElemExports | null = null;
let world = 0;
let mode = 0;
let speed = 1; // game seconds per real second
const pending: ToElem[] = [];
let last = 0;
let w = 0, h = 0;

function tick(): void {
  if (!ex) return;
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t0 = performance.now();
  if (speed > 0) ex.elem_step(world, dt * speed);
  const stepMs = performance.now() - t0;
  const rgba = new Uint8Array(ex.memory.buffer, ex.elem_render(world, mode), w * h * 4).slice();
  const n = ex.elem_agent_count(world);
  const agents = new Float32Array(ex.memory.buffer, ex.elem_agents(world), n * 3).slice();
  ctx.postMessage({ type: 'frame', rgba, agents, time: ex.elem_time(world), stepMs, w, h }, [rgba.buffer, agents.buffer]);
  setTimeout(tick, Math.max(0, 50 - (performance.now() - now)));
}

function handle(m: ToElem): void {
  if (!ex) return;
  if (m.type === 'edits') for (const [x, y, tool, value] of m.edits) ex.elem_edit(world, x, y, tool, value);
  else if (m.type === 'mode') mode = m.value;
  else if (m.type === 'speed') speed = m.value;
  else if (m.type === 'reset') world = ex.elem_new(m.which);
  else if (m.type === 'probe') {
    const data = new Float32Array(ex.memory.buffer, ex.elem_probe(world, m.x, m.y), 96).slice();
    ctx.postMessage({ type: 'probe', data, x: m.x, y: m.y }, [data.buffer]);
  }
}

ctx.onmessage = async (e) => {
  const m = e.data;
  if (m.type !== 'init') {
    if (ex) handle(m);
    else pending.push(m);
    return;
  }
  const bytes = await (await fetch(m.wasmUrl)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  ex = instance.exports as unknown as ElemExports;
  w = ex.elem_width();
  h = ex.elem_height();
  world = ex.elem_new(m.which);
  for (const p of pending.splice(0)) handle(p);
  last = performance.now();
  tick();
};
