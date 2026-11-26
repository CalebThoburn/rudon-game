// The inspect view: a layered 2D panel (Among Us-task style) over the world.
//
// Works on any assembly: a machine standing in the world, or an item opened on
// the bench from the inventory. Interaction is physical:
//   * hold on anything fixed (screws, bolted drums, soldered chips) with the
//     right tool to free it; it lands in your hand, so drag it somewhere
//   * drag plates off once nothing holds them; drag parts out and in
//   * hold or drag controls; levers follow the cursor and settle on release
//   * an emptied assembly can be picked up whole, or broken into materials
//     by holding on it with the right tool
// The same renderer draws the panel and the machine's front in the world.
import { BREAKS, isEmptyAssembly, type AssemblyDef, type SlotDef } from './assemblies';
import { Inventory, drawItem, type Item, type ItemType, type SlotContent } from './items';

export const PW = 800;
export const PH = 560;
const INK = '#2a2118';
const TOOLS: ItemType[] = ['screwdriver', 'wrench', 'pliers', 'solder_iron'];

export interface ControlDef {
  id: string;
  kind: 'hold' | 'drag' | 'lever';
  r: number;
  pos(c: Ctx): [number, number];
  /** Unreachable until this slot is empty. */
  behind?: string;
  enabled?(c: Ctx): boolean;
  onHold?(c: Ctx, on: boolean): void;
  /** Called while dragging; return true once the gesture has done its thing. */
  onDrag?(c: Ctx, dx: number, dy: number): boolean;
  /** Levers: vertical track; the knob follows the pointer and settles on release. */
  track?: { top: number; bottom: number };
  onLever?(c: Ctx, on: boolean): void;
}

export interface PanelDef {
  controls: ControlDef[];
  /** Send the assembly's current state to the simulation (machines only). */
  sync(c: Ctx): void;
  onInstall?(c: Ctx, slot: string, item: Item): void;
  onRemove?(c: Ctx, slot: string, item: Item): void;
  drawInterior(g: CanvasRenderingContext2D, c: Ctx): void;
  drawPlate(g: CanvasRenderingContext2D, c: Ctx, plateId: string): void;
  drawExterior?(g: CanvasRenderingContext2D, c: Ctx): void;
  /** World sprite: crop of the panel art [x, y, w, h], and its size in metres. */
  front: { rect: [number, number, number, number]; size: [number, number] };
}

export interface Instance {
  key: string;
  kind: 'machine' | 'bench';
  item: Item;
  asm: AssemblyDef;
  def: PanelDef;
  /** Simulation index (room / site) or -1 when not connected to anything. */
  room: number;
  vis: Record<string, number>;
  switches: Record<string, boolean>;
}

export interface Ctx {
  inst: Instance;
  room: number;
  state: Float64Array;
  send(kind: number, index: number, value: number): void;
  slots: Record<string, SlotContent>;
  vis: Record<string, number>;
  switches: Record<string, boolean>;
  dt: number;
  timeScale: number;
  /** Drawing for the world sprite (no background, no overlays). */
  world: boolean;
  has(id: string): boolean;
  item(id: string): Item | null;
  /** The control being held/dragged right now, with pointer offsets. */
  active: { id: string; dx: number; dy: number; x: number; y: number } | null;
}

export interface Hooks {
  send(kind: number, index: number, value: number): void;
  /** Parts changed: re-sync the simulation, redraw the sprite. */
  changed(inst: Instance): void;
  /** The whole frame went into the pocket: take the machine out of the world. */
  removeMachine(inst: Instance): void;
  /** Broken into materials. */
  broke(inst: Instance, into: Item[]): void;
  /** Something fell out of this assembly onto the floor. */
  fall(inst: Instance, item: Item): void;
  /** Dropped outside any panel or hotbar: put it in the world. False = couldn't. */
  drop(item: Item, clientX: number, clientY: number): boolean;
}

type Origin =
  | { kind: 'slot'; inst: Instance; slot: SlotDef }
  | { kind: 'loose'; inst: Instance; x: number; y: number; on?: string }
  | { kind: 'inv'; index: number }
  | { kind: 'frame'; inst: Instance };
type Turn = { slot: SlotDef | null; dir: 'out' | 'in' | 'break'; progress: number; hold: number; x: number; y: number };

export function makeCtx(inst: Instance, state: Float64Array | null, send: Hooks['send'], opts: Partial<Ctx> = {}): Ctx {
  const parts = inst.item.parts ?? {};
  return {
    inst,
    room: inst.room,
    state: state ?? new Float64Array(64),
    send,
    slots: parts,
    vis: inst.vis,
    switches: inst.switches,
    dt: 0,
    timeScale: 1,
    world: false,
    has: (id) => !!parts[id]?.item,
    item: (id) => parts[id]?.item ?? null,
    active: null,
    ...opts,
  };
}

/** Draw an assembly: interior, plates (with their screws), exterior. */
export function renderInstance(g: CanvasRenderingContext2D, c: Ctx, turn: Turn | null = null): void {
  const { inst } = c;
  inst.def.drawInterior(g, c);
  for (const s of inst.asm.slots) {
    if (s.kind !== 'plate' || !c.has(s.id)) continue;
    const rattle = c.world ? 0 : inst.vis[`rattle:${s.id}`] ?? 0;
    g.save();
    g.translate(Math.sin(rattle * 40) * rattle * 5, 0);
    inst.def.drawPlate(g, c, s.id);
    for (const f of inst.asm.slots) if (f.locks === s.id) drawFastener(g, c, f, turn?.slot === f ? turn : null);
    g.restore();
  }
  inst.def.drawExterior?.(g, c);
  // Things lying loose inside, connected to nothing.
  for (const l of inst.item.loose ?? []) {
    g.save();
    g.translate(l.x, l.y);
    g.rotate(((l.x * 7 + l.y * 3) % 10) / 10 - 0.5);
    drawItem(g, l.item, 0, 0, 64);
    g.restore();
  }
}

/** The part in a slot was picked up: whatever rested on it, and isn't fixed, falls. */
export function cascade(inst: Instance, slotId: string, fall: (item: Item) => void): void {
  const parts = inst.item.parts ?? {};
  for (const s of inst.asm.slots) {
    const c = parts[s.id];
    if (!c?.item || (s.fix && c.fixed)) continue;
    if (s.on === slotId || s.locks === slotId) {
      const it = c.item;
      parts[s.id] = { item: null };
      fall(it);
      cascade(inst, s.id, fall);
    }
  }
  const loose = inst.item.loose;
  if (loose) {
    for (const l of loose.filter((l) => l.on === slotId)) fall(l.item);
    inst.item.loose = loose.filter((l) => l.on !== slotId);
  }
}

function drawFastener(g: CanvasRenderingContext2D, c: Ctx, f: SlotDef, turning: Turn | null): void {
  const content = c.slots[f.id];
  g.save();
  g.translate(f.x, f.y);
  g.beginPath(); g.arc(0, 0, f.r * 0.55, 0, Math.PI * 2); g.fillStyle = '#1e160c'; g.fill();
  if (content?.item) {
    let lift = content.fixed ? 0 : 0.7;
    let rot = 0;
    if (turning) {
      lift = turning.dir === 'out' ? turning.progress * 0.7 : 0.7 * (1 - turning.progress);
      rot = (turning.dir === 'out' ? 1 : -1) * turning.progress * 14;
    }
    g.translate(lift * 4, -lift * 10);
    g.rotate(rot + (content.fixed ? 0 : 0.5));
    const s = 1 + lift * 0.25;
    g.scale(s, s);
    g.strokeStyle = INK; g.lineWidth = 3;
    if (f.accepts === 'bolt') {
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.lineTo(Math.cos(a) * f.r * 0.75, Math.sin(a) * f.r * 0.75); }
      g.closePath(); g.fillStyle = '#a4abb0'; g.fill(); g.stroke();
    } else {
      g.beginPath(); g.arc(0, 0, f.r * 0.7, 0, Math.PI * 2); g.fillStyle = '#cfcfcf'; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-f.r * 0.45, 0); g.lineTo(f.r * 0.45, 0); g.stroke();
    }
  }
  g.restore();
}

/** Lever knob position (0 = top/on, 1 = bottom/off), eased; follows the pointer while dragged. */
export function leverPos(c: Ctx, id: string, top: number, bottom: number): number {
  const key = `lever:${id}`;
  const target = c.switches[id] ? 0 : 1;
  if (c.active?.id === id) {
    c.vis[key] = Math.max(0, Math.min(1, (c.active.y - top) / (bottom - top)));
  } else {
    const v = c.vis[key] ?? target;
    c.vis[key] = v + (target - v) * Math.min(1, c.dt * 14 || 1);
  }
  return c.vis[key];
}

export class InspectPanel {
  private g: CanvasRenderingContext2D;
  private current: Instance | null = null;
  private state: Float64Array | null = null;
  private mouse = { x: -100, y: -100, down: false, clientX: 0, clientY: 0 };
  private drag: { item: Item; origin: Origin } | null = null;
  private pendingInv: { index: number; x: number; y: number } | null = null;
  private turn: Turn | null = null;
  private gesture: { ctrl: ControlDef; x0: number; y0: number; fired: boolean } | null = null;
  private ghostG: CanvasRenderingContext2D;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private ghost: HTMLCanvasElement,
    private inv: Inventory,
    private hooks: Hooks,
  ) {
    canvas.width = PW;
    canvas.height = PH;
    this.g = canvas.getContext('2d')!;
    ghost.width = ghost.height = 128;
    this.ghostG = ghost.getContext('2d')!;
    this.fit();
    addEventListener('resize', () => this.fit());
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    inv.onPointerDown = (i, e) => {
      this.track(e);
      if (inv.slots[i]) this.pendingInv = { index: i, x: e.clientX, y: e.clientY };
      else inv.select(i);
    };
  }

  get isOpen(): boolean {
    return this.current !== null;
  }
  get instance(): Instance | null {
    return this.current;
  }
  get dragging(): boolean {
    return this.drag !== null;
  }

  open(inst: Instance): void {
    this.current = inst;
    this.canvas.classList.remove('hidden');
  }

  close(): void {
    this.endGesture(false);
    this.turn = null;
    this.current = null;
    this.canvas.classList.add('hidden');
  }

  private fit(): void {
    const s = Math.min((innerWidth * 0.92) / PW, (innerHeight - 130) / PH, 1.4);
    this.canvas.style.width = `${PW * s}px`;
    this.canvas.style.height = `${PH * s}px`;
    this.canvas.style.top = `${(innerHeight - 90) / 2}px`;
  }

  private ctx(inst: Instance, dt = 0, timeScale = 1): Ctx {
    const gst = this.gesture;
    return makeCtx(inst, this.state, this.hooks.send, {
      dt,
      timeScale,
      active: gst ? { id: gst.ctrl.id, dx: this.mouse.x - gst.x0, dy: this.mouse.y - gst.y0, x: this.mouse.x, y: this.mouse.y } : null,
    });
  }

  // ---------------------------------------------------------------- reachability
  private reach(inst: Instance, s: { behind?: string; locks?: string }): boolean {
    const p = inst.item.parts ?? {};
    if (s.behind && p[s.behind]?.item) return false;
    if (s.locks && !p[s.locks]?.item) return false; // a screw hole only exists on its plate
    return true;
  }

  private accepts(inst: Instance, s: SlotDef, item: Item): boolean {
    return s.accepts === item.type && !inst.item.parts?.[s.id]?.item && this.reach(inst, s);
  }

  // ---------------------------------------------------------------- pointer
  private track(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = r.width ? ((e.clientX - r.left) / r.width) * PW : -100;
    this.mouse.y = r.height ? ((e.clientY - r.top) / r.height) * PH : -100;
    this.mouse.clientX = e.clientX;
    this.mouse.clientY = e.clientY;
    if (this.drag) this.placeGhost();
  }

  private down(e: PointerEvent): void {
    this.track(e);
    this.mouse.down = true;
    const inst = this.current;
    if (!inst) return;
    const { x, y } = this.mouse;
    const c = this.ctx(inst);
    const parts = inst.item.parts ?? {};
    const hand = this.inv.hand?.type;
    const near = (px: number, py: number, r: number) => Math.hypot(x - px, y - py) < r;
    const inRect = (s: SlotDef) => !!s.rect && x >= s.rect[0] && x <= s.rect[0] + s.rect[2] && y >= s.rect[1] && y <= s.rect[1] + s.rect[3];
    const control = (ctrl: ControlDef) => {
      const [cx, cy] = ctrl.pos(c);
      if (!near(cx, cy, ctrl.r) || !this.reach(inst, ctrl) || (ctrl.enabled && !ctrl.enabled(c))) return false;
      this.gesture = { ctrl, x0: x, y0: y, fired: false };
      if (ctrl.kind === 'hold') ctrl.onHold?.(c, true);
      return true;
    };
    let needTool: string | null = null;

    // 0. anything lying loose on top
    const loose = inst.item.loose ?? [];
    for (let k = loose.length - 1; k >= 0; k--) {
      const l = loose[k];
      if (!near(l.x, l.y, 34)) continue;
      loose.splice(k, 1);
      this.beginDrag(l.item, { kind: 'loose', inst, x: l.x, y: l.y, on: l.on });
      return;
    }

    // 1. exterior controls
    for (const ctrl of inst.def.controls) if (!ctrl.behind && control(ctrl)) return;

    // 2. anything fixed, if you hold the right tool
    for (const s of inst.asm.slots) {
      const content = parts[s.id];
      if (!s.fix || !content?.item || !this.reach(inst, s) || !near(s.x, s.y, s.r)) continue;
      if (s.fix.tool && hand !== s.fix.tool) {
        if (content.fixed) needTool ??= s.id;
        continue;
      }
      if (!content.fixed && !hand) continue; // loose and empty-handed: you can just drag it (step 5)
      this.turn = { slot: s, dir: content.fixed ? 'out' : 'in', progress: 0, hold: s.fix.hold, x: s.x, y: s.y };
      return;
    }

    // 3. plates: drag off once nothing holds them
    for (const s of inst.asm.slots) {
      if (s.kind !== 'plate' || !parts[s.id]?.item || !inRect(s) || !this.reach(inst, s)) continue;
      const holders = inst.asm.slots.filter((f) => f.locks === s.id);
      if (holders.some((f) => parts[f.id]?.item && parts[f.id].fixed)) {
        inst.vis[`rattle:${s.id}`] = 1;
        return;
      }
      // Loose screws in its holes come away with it, and fall.
      this.beginDrag(this.removeFrom(inst, s), { kind: 'slot', inst, slot: s });
      return;
    }

    // 4. interior controls
    for (const ctrl of inst.def.controls) if (ctrl.behind && control(ctrl)) return;

    // 5. loose parts
    for (const s of inst.asm.slots) {
      const content = parts[s.id];
      if (s.kind !== 'part' || !content?.item || (s.fix && content.fixed) || !this.reach(inst, s) || !near(s.x, s.y, s.r)) continue;
      this.beginDrag(this.removeFrom(inst, s), { kind: 'slot', inst, slot: s });
      return;
    }

    if (needTool) {
      inst.vis[`needTool:${needTool}`] = 1;
      return;
    }

    // 6. the bare frame / a leaf item: break it, or (machines) pick it up whole
    if (isEmptyAssembly(inst.item)) {
      const br = BREAKS[inst.item.type];
      if (br && (!br.tool || hand === br.tool)) {
        this.turn = { slot: null, dir: 'break', progress: 0, hold: br.hold, x, y };
      } else if (inst.kind === 'machine') {
        this.beginDrag(inst.item, { kind: 'frame', inst });
      } else if (br?.tool) {
        inst.vis['needTool:frame'] = 1;
      }
    }
  }

  private move(e: PointerEvent): void {
    this.track(e);
    if (this.pendingInv && Math.hypot(e.clientX - this.pendingInv.x, e.clientY - this.pendingInv.y) > 6) {
      const index = this.pendingInv.index;
      this.pendingInv = null;
      const item = this.inv.takeOne(index);
      if (item) this.beginDrag(item, { kind: 'inv', index });
    }
    const gst = this.gesture;
    if (gst && gst.ctrl.kind === 'drag' && !gst.fired && this.current) {
      gst.fired = gst.ctrl.onDrag?.(this.ctx(this.current), this.mouse.x - gst.x0, this.mouse.y - gst.y0) ?? false;
    }
  }

  private up(e: PointerEvent): void {
    this.track(e);
    this.mouse.down = false;
    if (this.pendingInv) {
      this.inv.select(this.pendingInv.index);
      this.pendingInv = null;
    }
    this.turn = null;
    this.endGesture(true);
    if (this.drag) this.drop(e);
  }

  private endGesture(commit: boolean): void {
    const gst = this.gesture;
    const inst = this.current;
    this.gesture = null;
    if (!gst || !inst) return;
    const c = this.ctx(inst);
    if (gst.ctrl.kind === 'hold') gst.ctrl.onHold?.(c, false);
    if (gst.ctrl.kind === 'lever' && commit && gst.ctrl.track) {
      const { top, bottom } = gst.ctrl.track;
      const on = this.mouse.y < (top + bottom) / 2;
      if (on !== !!inst.switches[gst.ctrl.id]) {
        inst.switches[gst.ctrl.id] = on;
        gst.ctrl.onLever?.(c, on);
        this.hooks.changed(inst);
      }
    }
  }

  // ---------------------------------------------------------------- items
  private removeFrom(inst: Instance, s: SlotDef): Item {
    const parts = inst.item.parts!;
    const item = parts[s.id].item!;
    parts[s.id] = { item: null };
    cascade(inst, s.id, (it) => this.hooks.fall(inst, it));
    const c = this.ctx(inst);
    inst.def.onRemove?.(c, s.id, item);
    inst.def.sync(c);
    this.hooks.changed(inst);
    return item;
  }

  private install(inst: Instance, s: SlotDef, item: Item): void {
    inst.item.parts![s.id] = { item, fixed: s.fix ? false : undefined };
    const c = this.ctx(inst);
    inst.def.onInstall?.(c, s.id, item);
    inst.def.sync(c);
    this.hooks.changed(inst);
  }

  private beginDrag(item: Item, origin: Origin): void {
    this.drag = { item, origin };
    const g = this.ghostG;
    g.clearRect(0, 0, 128, 128);
    drawItem(g, item, 64, 64, 104);
    this.ghost.classList.remove('hidden');
    this.placeGhost();
  }

  private placeGhost(): void {
    this.ghost.style.left = `${this.mouse.clientX}px`;
    this.ghost.style.top = `${this.mouse.clientY}px`;
  }

  private drop(e: PointerEvent): void {
    const { item, origin } = this.drag!;
    this.drag = null;
    this.ghost.classList.add('hidden');

    if (origin.kind === 'frame') {
      // Carrying a whole (empty) machine away.
      const slotEl = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.slot') as HTMLElement | null;
      const stored = (slotEl && this.inv.placeAt(Number(slotEl.dataset.slot), item)) || this.inv.add(item);
      if (stored) {
        this.close();
        this.hooks.removeMachine(origin.inst);
      }
      return;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const slotEl = target?.closest('.slot') as HTMLElement | null;
    if (slotEl) {
      if (this.inv.placeAt(Number(slotEl.dataset.slot), item) || this.inv.add(item)) return;
      return this.returnTo(origin, item);
    }

    // Into the open panel: a matching slot, or else it just rests where it's put.
    const inst = this.current;
    const { x, y } = this.mouse;
    const inPanel = target === this.canvas && x >= 0 && x <= PW && y >= 0 && y <= PH;
    if (inst && inPanel && inst.item !== item) {
      for (const s of inst.asm.slots) {
        if (!this.accepts(inst, s, item)) continue;
        const hit = s.rect
          ? x >= s.rect[0] && x <= s.rect[0] + s.rect[2] && y >= s.rect[1] && y <= s.rect[1] + s.rect[3]
          : Math.hypot(x - s.x, y - s.y) < s.r + 16;
        if (hit) return this.install(inst, s, item);
      }
      this.rest(inst, item, x, y);
      return;
    }

    // Anywhere else: onto the floor.
    if (this.hooks.drop(item, e.clientX, e.clientY)) return;
    if (!this.inv.add(item)) this.returnTo(origin, item);
  }

  /** Leave an item lying loose in an assembly, on whatever part is under it. */
  private rest(inst: Instance, item: Item, x: number, y: number): void {
    const parts = inst.item.parts ?? {};
    let on: string | undefined;
    for (const s of inst.asm.slots) {
      if (!parts[s.id]?.item || !this.reach(inst, s)) continue;
      const hit = s.rect ? x >= s.rect[0] && x <= s.rect[0] + s.rect[2] && y >= s.rect[1] && y <= s.rect[1] + s.rect[3] : Math.hypot(x - s.x, y - s.y) < s.r;
      if (hit) on = s.id; // later slots are drawn on top
    }
    (inst.item.loose ??= []).push({ item, x, y, on });
    this.hooks.changed(inst);
  }

  private returnTo(origin: Origin, item: Item): void {
    if (origin.kind === 'slot') this.install(origin.inst, origin.slot, item);
    else if (origin.kind === 'loose') (origin.inst.item.loose ??= []).push({ item, x: origin.x, y: origin.y, on: origin.on });
    else if (origin.kind === 'inv') this.inv.placeAt(origin.index, item) || this.inv.add(item);
  }

  // ---------------------------------------------------------------- drawing
  draw(state: Float64Array, dt: number, timeScale: number): void {
    this.state = state;
    const inst = this.current;
    if (!inst) return;
    if (inst.kind === 'bench' && !this.inv.slots.includes(inst.item) && this.drag?.item !== inst.item) return this.close();
    const g = this.g;

    // Advance hold-to-turn / hold-to-break.
    const t = this.turn;
    if (t) {
      const onIt = Math.hypot(this.mouse.x - t.x, this.mouse.y - t.y) < (t.slot ? t.slot.r * 2 : 60);
      t.progress = onIt ? t.progress + dt / t.hold : Math.max(0, t.progress - dt * 2);
      if (t.dir === 'in' && t.slot && Math.hypot(this.mouse.x - t.x, this.mouse.y - t.y) > t.slot.r) {
        // Pulled away instead of holding still: you wanted the loose part, not to tighten it.
        const s = t.slot;
        this.turn = null;
        this.beginDrag(this.removeFrom(inst, s), { kind: 'slot', inst, slot: s });
      } else if (t.progress >= 1) {
        this.turn = null;
        if (t.dir === 'break') this.breakApart(inst);
        else if (t.slot) {
          const content = inst.item.parts![t.slot.id];
          if (t.dir === 'out') {
            content.fixed = false;
            this.beginDrag(this.removeFrom(inst, t.slot), { kind: 'slot', inst, slot: t.slot });
          } else {
            content.fixed = true;
            const c = this.ctx(inst);
            inst.def.sync(c);
            this.hooks.changed(inst);
          }
        }
      }
    }
    for (const k of Object.keys(inst.vis)) {
      if (k.startsWith('rattle:') || k.startsWith('needTool:')) inst.vis[k] = Math.max(0, inst.vis[k] - dt * 2.5);
    }

    const c = this.ctx(inst, dt, timeScale);
    renderInstance(g, c, this.turn);

    // overlays
    if (this.turn) {
      const r = this.turn.slot ? this.turn.slot.r + 6 : 40;
      g.beginPath(); g.arc(this.turn.x, this.turn.y, r, -Math.PI / 2, -Math.PI / 2 + this.turn.progress * Math.PI * 2);
      g.strokeStyle = this.turn.dir === 'break' ? '#e76f51' : '#e9c46a'; g.lineWidth = 5; g.stroke();
    }
    for (const s of inst.asm.slots) {
      const need = inst.vis[`needTool:${s.id}`] ?? 0;
      if (need > 0 && s.fix?.tool) {
        g.save(); g.globalAlpha = need; drawItem(g, { type: s.fix.tool, count: 1 }, s.x + 26, s.y - 26, 40); g.restore();
      }
    }
    const needFrame = inst.vis['needTool:frame'] ?? 0;
    const brTool = BREAKS[inst.item.type]?.tool;
    if (needFrame > 0 && brTool) {
      g.save(); g.globalAlpha = needFrame; drawItem(g, { type: brTool, count: 1 }, this.mouse.x + 30, this.mouse.y - 30, 44); g.restore();
    }
    if (this.drag) this.drawTargets(inst, this.drag.item);
    this.drawHand();
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.strokeRect(3, 3, PW - 6, PH - 6);
  }

  private breakApart(inst: Instance): void {
    const br = BREAKS[inst.item.type];
    if (!br) return;
    this.close();
    this.hooks.broke(inst, br.into.map(([type, count]) => ({ type, count })));
  }

  private drawTargets(inst: Instance, item: Item): void {
    const g = this.g;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
    g.save();
    g.setLineDash([8, 6]);
    g.lineWidth = 3;
    g.strokeStyle = `rgba(233,196,106,${0.45 + 0.45 * pulse})`;
    for (const s of inst.asm.slots) {
      if (!this.accepts(inst, s, item)) continue;
      g.beginPath();
      if (s.rect) g.roundRect(s.rect[0], s.rect[1], s.rect[2], s.rect[3], 12);
      else g.arc(s.x, s.y, s.r + 4, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  private drawHand(): void {
    const g = this.g;
    const { x, y, down } = this.mouse;
    if (this.drag) return;
    g.save();
    g.translate(x, y);
    const hand = this.inv.hand;
    if (hand && TOOLS.includes(hand.type)) drawItem(g, hand, 18, -16, 42);
    g.fillStyle = '#e8c9a4'; g.strokeStyle = INK; g.lineWidth = 3;
    if (down) {
      g.beginPath(); g.roundRect(-14, -10, 28, 24, 9); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-8, -4); g.lineTo(8, -4); g.stroke();
    } else {
      g.beginPath(); g.roundRect(-12, -2, 24, 22, 8); g.fill(); g.stroke();
      for (let k = 0; k < 4; k++) { g.beginPath(); g.roundRect(-11 + k * 6, -18 + (k === 0 || k === 3 ? 4 : 0), 5, 18, 2.5); g.fill(); g.stroke(); }
      g.beginPath(); g.roundRect(10, 2, 12, 6, 3); g.fill(); g.stroke();
    }
    g.restore();
  }
}
