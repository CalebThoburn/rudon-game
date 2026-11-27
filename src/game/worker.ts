// Runs the building (Rust/WASM element world) on its own thread.
interface Exports {
  memory: WebAssembly.Memory;
  elem_new(which: number): number;
  elem_step(e: number, dt: number): void;
  elem_render(e: number, mode: number): number;
  elem_agents(e: number): number;
  elem_agent_count(e: number): number;
  elem_people(e: number): number;
  elem_people_count(e: number): number;
  elem_player_state(e: number): number;
  elem_player_input(e: number, dx: number, dy: number, act: number): void;
  elem_pick(e: number, x: number, y: number): number;
  elem_place(e: number, x: number, y: number, slot: number): number;
  elem_probe(e: number, x: number, y: number): number;
  elem_time(e: number): number;
  elem_width(): number;
  elem_height(): number;
}

export type ToGame =
  | { type: 'init'; wasmUrl: string }
  | { type: 'input'; dx: number; dy: number; act: number }
  | { type: 'pick'; x: number; y: number }
  | { type: 'place'; x: number; y: number; slot: number }
  | { type: 'probe'; x: number; y: number }
  | { type: 'speed'; value: number }
  | { type: 'mode'; value: number }
  | { type: 'reset' };

export type FromGame =
  | { type: 'frame'; rgba: Uint8Array; agents: Float32Array; people: Float32Array; player: Float32Array; time: number; stepMs: number; w: number; h: number }
  | { type: 'probe'; data: Float32Array; x: number; y: number }
  | { type: 'result'; what: 'pick' | 'place'; ok: boolean };

const ctx = self as unknown as { postMessage(m: FromGame, t?: Transferable[]): void; onmessage: ((e: MessageEvent<ToGame>) => void) | null };
let ex: Exports | null = null;
let world = 0;
let speed = 1;
let mode = 0;
let last = 0;
let w = 0, h = 0;
const pending: ToGame[] = [];
let input = { dx: 0, dy: 0 };

function grab(ptr: number, n: number): Float32Array {
  return new Float32Array(ex!.memory.buffer, ptr, n).slice();
}

function tick(): void {
  if (!ex) return;
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  ex.elem_player_input(world, input.dx, input.dy, 0);
  const t0 = performance.now();
  if (speed > 0) ex.elem_step(world, dt * speed);
  const stepMs = performance.now() - t0;
  const rgba = new Uint8Array(ex.memory.buffer, ex.elem_render(world, mode), w * h * 4).slice();
  const agents = grab(ex.elem_agents(world), ex.elem_agent_count(world) * 3);
  const people = grab(ex.elem_people(world), ex.elem_people_count(world) * 8);
  const player = grab(ex.elem_player_state(world), 96);
  ctx.postMessage({ type: 'frame', rgba, agents, people, player, time: ex.elem_time(world), stepMs, w, h }, [rgba.buffer, agents.buffer, people.buffer, player.buffer]);
  setTimeout(tick, Math.max(0, 50 - (performance.now() - now)));
}

function handle(m: ToGame): void {
  if (!ex) return;
  switch (m.type) {
    case 'input':
      input = { dx: m.dx, dy: m.dy };
      if (m.act) ex.elem_player_input(world, m.dx, m.dy, m.act);
      break;
    case 'pick':
      ctx.postMessage({ type: 'result', what: 'pick', ok: ex.elem_pick(world, m.x, m.y) === 1 });
      break;
    case 'place':
      ctx.postMessage({ type: 'result', what: 'place', ok: ex.elem_place(world, m.x, m.y, m.slot) === 1 });
      break;
    case 'probe': {
      const data = grab(ex.elem_probe(world, m.x, m.y), 96);
      ctx.postMessage({ type: 'probe', data, x: m.x, y: m.y }, [data.buffer]);
      break;
    }
    case 'speed': speed = m.value; break;
    case 'mode': mode = m.value; break;
    case 'reset': world = ex.elem_new(2); break;
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
  ex = instance.exports as unknown as Exports;
  w = ex.elem_width();
  h = ex.elem_height();
  world = ex.elem_new(2);
  for (const p of pending.splice(0)) handle(p);
  last = performance.now();
  tick();
};
