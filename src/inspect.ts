// The inspect view: a layered 2D panel (Among Us-task style) over the world.
//
// Machine-agnostic. A machine is a MachineDef: slots (fasteners, cover plates,
// removable parts), controls (things you hold or drag), and drawing code.
// Interaction is physical:
//   * hold on a screw/bolt to turn it out (bolts need a wrench in hand);
//     when it comes free it's in your hand, so drag it somewhere
//   * drag a cover plate off once nothing holds it
//   * drag parts out to the inventory, or from the inventory into empty slots
//   * hold or drag controls (levers, taps, drums, couplings)
import { Inventory, drawItem, type Item, type ItemType } from './items';

export const PW = 800;
export const PH = 560;
const INK = '#2a2118';

export type Fastener = 'tight' | 'loose' | null;

export interface SlotDef {
  id: string;
  kind: 'fastener' | 'part' | 'plate';
  accepts: ItemType;
  x: number;
  y: number;
  r: number;
  /** Plates: hit/drop rectangle [x, y, w, h]. */
  rect?: [number, number, number, number];
  /** Fasteners: the plate they hold. Parts: the plate that must be off to reach them. */
  plate?: string;
  /** Fasteners: tool that must be in hand to turn them. */
  tool?: ItemType;
  /** Fasteners: seconds of holding to turn fully. */
  hold?: number;
  onInstall?(c: Ctx, item: Item): void;
  onRemove?(c: Ctx, item: Item): void;
}

export interface ControlDef {
  id: string;
  kind: 'hold' | 'drag';
  r: number;
  pos(c: Ctx): [number, number];
  /** Interior controls: the plate that must be off to reach them. */
  plate?: string;
  enabled?(c: Ctx): boolean;
  onHold?(c: Ctx, on: boolean): void;
  /** Called while dragging; return true once the gesture has done its thing. */
  onDrag?(c: Ctx, dx: number, dy: number): boolean;
}

export interface SlotContent {
  item: Item | null;
  fastener?: Fastener;
}

export interface MachineDef {
  slots: SlotDef[];
  controls: ControlDef[];
  initial(): Record<string, SlotContent>;
  /** Send the machine's absolute part state to the simulation. */
  sync(c: Ctx): void;
  drawInterior(g: CanvasRenderingContext2D, c: Ctx): void;
  drawPlate(g: CanvasRenderingContext2D, c: Ctx, plateId: string): void;
  drawExterior?(g: CanvasRenderingContext2D, c: Ctx): void;
}

export interface Ctx {
  room: number;
  state: Float64Array;
  send(kind: number, room: number, value: number): void;
  slots: Record<string, SlotContent>;
  /** Per-machine scratch values for animation. */
  vis: Record<string, number>;
  dt: number;
  timeScale: number;
  has(id: string): boolean;
  /** The control currently held, and the live drag offset of a dragged control. */
  active: { id: string; dx: number; dy: number } | null;
}

interface Instance {
  def: MachineDef;
  room: number;
  slots: Record<string, SlotContent>;
  vis: Record<string, number>;
}

type Origin = { kind: 'slot'; inst: Instance; slot: SlotDef } | { kind: 'inv'; index: number };

export class InspectPanel {
  private g: CanvasRenderingContext2D;
  private instances = new Map<string, Instance>();
  private current: Instance | null = null;
  private state: Float64Array | null = null;
  private mouse = { x: -100, y: -100, down: false, clientX: 0, clientY: 0 };
  private drag: { item: Item; origin: Origin } | null = null;
  private pendingInv: { index: number; x: number; y: number } | null = null;
  private turn: { slot: SlotDef; dir: 'out' | 'in'; progress: number } | null = null;
  private gesture: { ctrl: ControlDef; x0: number; y0: number; fired: boolean } | null = null;
  private ghostG: CanvasRenderingContext2D;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private ghost: HTMLCanvasElement,
    private inv: Inventory,
    private send: (kind: number, room: number, value: number) => void,
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
  get room(): number {
    return this.current?.room ?? -1;
  }
  isShowing(key: string): boolean {
    return this.current !== null && this.instances.get(key) === this.current;
  }

  /** Open a machine. Its parts persist between visits (keyed by `key`). */
  open(key: string, def: MachineDef, room: number): void {
    let inst = this.instances.get(key);
    if (!inst) {
      inst = { def, room, slots: def.initial(), vis: {} };
      this.instances.set(key, inst);
    }
    this.current = inst;
    this.canvas.classList.remove('hidden');
  }

  close(): void {
    this.endGesture();
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

  // ---------------------------------------------------------------- context
  private ctx(inst: Instance, dt = 0, timeScale = 1): Ctx {
    return {
      room: inst.room,
      state: this.state ?? new Float64Array(64),
      send: this.send,
      slots: inst.slots,
      vis: inst.vis,
      dt,
      timeScale,
      has: (id) => !!inst.slots[id]?.item,
      active: this.gesture ? { id: this.gesture.ctrl.id, dx: this.mouse.x - this.gesture.x0, dy: this.mouse.y - this.gesture.y0 } : null,
    };
  }

  private reachable(inst: Instance, plate?: string): boolean {
    return !plate || !inst.slots[plate]?.item;
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
    if (!inst || !this.state) return;
    const { x, y } = this.mouse;
    const c = this.ctx(inst);
    const def = inst.def;
    const near = (px: number, py: number, r: number) => Math.hypot(x - px, y - py) < r;
    const inRect = (s: SlotDef) => !!s.rect && x >= s.rect[0] && x <= s.rect[0] + s.rect[2] && y >= s.rect[1] && y <= s.rect[1] + s.rect[3];
    const control = (ctrl: ControlDef) => {
      const [cx, cy] = ctrl.pos(c);
      if (!near(cx, cy, ctrl.r) || !this.reachable(inst, ctrl.plate) || (ctrl.enabled && !ctrl.enabled(c))) return false;
      this.gesture = { ctrl, x0: x, y0: y, fired: false };
      if (ctrl.kind === 'hold') ctrl.onHold?.(c, true);
      return true;
    };

    // 1. exterior controls (no plate requirement) sit on top
    for (const ctrl of def.controls) if (!ctrl.plate && control(ctrl)) return;

    // 2. fasteners on plates that are fitted
    for (const s of def.slots) {
      if (s.kind !== 'fastener' || !c.has(s.plate!) || !near(s.x, s.y, s.r)) continue;
      const content = inst.slots[s.id];
      if (!content.item) continue;
      if (s.tool && this.inv.hand?.type !== s.tool) {
        inst.vis[`needTool:${s.id}`] = 1;
        return;
      }
      this.turn = { slot: s, dir: content.fastener === 'tight' ? 'out' : 'in', progress: 0 };
      return;
    }

    // 3. plates: drag off once nothing holds them
    for (const s of def.slots) {
      if (s.kind !== 'plate' || !c.has(s.id) || !inRect(s)) continue;
      const holders = def.slots.filter((f) => f.kind === 'fastener' && f.plate === s.id);
      if (holders.some((f) => inst.slots[f.id].fastener === 'tight')) {
        inst.vis[`rattle:${s.id}`] = 1;
        return;
      }
      // Loose screws come away with the plate, into your pocket.
      for (const f of holders) {
        const it = inst.slots[f.id].item;
        if (it && !this.inv.add(it)) return; // pockets full: leave it be
        inst.slots[f.id] = { item: null, fastener: null };
      }
      this.beginDrag(this.removeFrom(inst, s), { kind: 'slot', inst, slot: s });
      return;
    }

    // 4. interior: parts, then controls
    for (const s of def.slots) {
      if (s.kind !== 'part' || !c.has(s.id) || !this.reachable(inst, s.plate) || !near(s.x, s.y, s.r)) continue;
      this.beginDrag(this.removeFrom(inst, s), { kind: 'slot', inst, slot: s });
      return;
    }
    for (const ctrl of def.controls) if (ctrl.plate && control(ctrl)) return;
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
    this.endGesture();
    if (this.drag) this.drop(e);
  }

  private endGesture(): void {
    const gst = this.gesture;
    if (gst?.ctrl.kind === 'hold' && this.current) gst.ctrl.onHold?.(this.ctx(this.current), false);
    this.gesture = null;
  }

  // ---------------------------------------------------------------- items
  private removeFrom(inst: Instance, s: SlotDef): Item {
    const item = inst.slots[s.id].item!;
    inst.slots[s.id] = { item: null, fastener: null };
    const c = this.ctx(inst);
    s.onRemove?.(c, item);
    inst.def.sync(c);
    return item;
  }

  private install(inst: Instance, s: SlotDef, item: Item): void {
    inst.slots[s.id] = { item, fastener: s.kind === 'fastener' ? 'loose' : undefined };
    const c = this.ctx(inst);
    s.onInstall?.(c, item);
    inst.def.sync(c);
  }

  /** Can `item` go into slot `s` of `inst` right now? */
  private accepts(inst: Instance, s: SlotDef, item: Item): boolean {
    if (s.accepts !== item.type || inst.slots[s.id].item) return false;
    if (s.kind === 'fastener') return !!inst.slots[s.plate!]?.item;
    if (s.kind === 'part') return this.reachable(inst, s.plate);
    return true; // plates
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

    // Onto an inventory slot?
    const slotEl = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.slot') as HTMLElement | null;
    if (slotEl) {
      if (this.inv.placeAt(Number(slotEl.dataset.slot), item) || this.inv.add(item)) return;
      return this.returnTo(origin, item);
    }

    // Into the open machine?
    const inst = this.current;
    if (inst) {
      const { x, y } = this.mouse;
      for (const s of inst.def.slots) {
        if (!this.accepts(inst, s, item)) continue;
        const hit = s.rect
          ? x >= s.rect[0] && x <= s.rect[0] + s.rect[2] && y >= s.rect[1] && y <= s.rect[1] + s.rect[3]
          : Math.hypot(x - s.x, y - s.y) < s.r + 16;
        if (hit) return this.install(inst, s, item);
      }
    }

    // Anywhere else: into the pocket.
    if (origin.kind === 'slot') {
      if (!this.inv.add(item)) this.returnTo(origin, item);
    } else if (!this.inv.placeAt(origin.index, item) && !this.inv.add(item)) {
      this.returnTo(origin, item);
    }
  }

  private returnTo(origin: Origin, item: Item): void {
    if (origin.kind === 'slot') this.install(origin.inst, origin.slot, item);
    else this.inv.placeAt(origin.index, item) || this.inv.add(item);
  }

  // ---------------------------------------------------------------- drawing
  draw(state: Float64Array, dt: number, timeScale: number): void {
    this.state = state;
    const inst = this.current;
    if (!inst) return;
    const g = this.g;
    const c = this.ctx(inst, dt, timeScale);
    const def = inst.def;

    // Advance hold-to-turn.
    const t = this.turn;
    if (t) {
      const content = inst.slots[t.slot.id];
      const onIt = Math.hypot(this.mouse.x - t.slot.x, this.mouse.y - t.slot.y) < t.slot.r * 2;
      t.progress = onIt ? t.progress + dt / (t.slot.hold ?? 1) : Math.max(0, t.progress - dt * 2);
      if (t.progress >= 1) {
        this.turn = null;
        if (t.dir === 'out') this.beginDrag(this.removeFrom(inst, t.slot), { kind: 'slot', inst, slot: t.slot });
        else content.fastener = 'tight';
      }
    }
    for (const k of Object.keys(inst.vis)) {
      if (k.startsWith('rattle:') || k.startsWith('needTool:')) inst.vis[k] = Math.max(0, inst.vis[k] - dt * 2.5);
    }

    g.save();
    def.drawInterior(g, c);
    for (const s of def.slots) {
      if (s.kind !== 'plate' || !c.has(s.id)) continue;
      const rattle = inst.vis[`rattle:${s.id}`] ?? 0;
      g.save();
      g.translate(Math.sin(rattle * 40) * rattle * 5, 0);
      def.drawPlate(g, c, s.id);
      for (const f of def.slots) if (f.kind === 'fastener' && f.plate === s.id) this.drawFastener(inst, f);
      g.restore();
    }
    def.drawExterior?.(g, c);
    if (this.drag) this.drawTargets(inst, this.drag.item);
    g.restore();

    this.drawHand();
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.strokeRect(3, 3, PW - 6, PH - 6);
  }

  private drawFastener(inst: Instance, f: SlotDef): void {
    const g = this.g;
    const content = inst.slots[f.id];
    const turning = this.turn?.slot === f ? this.turn : null;
    const need = inst.vis[`needTool:${f.id}`] ?? 0;
    g.save();
    g.translate(f.x, f.y);
    // the hole
    g.beginPath(); g.arc(0, 0, f.r * 0.55, 0, Math.PI * 2); g.fillStyle = '#1e160c'; g.fill();
    if (content.item) {
      // turning out = progress up; turning in = progress down from loose
      let lift = content.fastener === 'loose' ? 0.7 : 0;
      let rot = 0;
      if (turning) {
        lift = turning.dir === 'out' ? turning.progress * 0.7 : 0.7 * (1 - turning.progress);
        rot = (turning.dir === 'out' ? 1 : -1) * turning.progress * 14;
      }
      g.translate(lift * 4, -lift * 10);
      g.rotate(rot + (content.fastener === 'loose' ? 0.5 : 0));
      const s = 1 + lift * 0.25;
      g.scale(s, s);
      if (f.accepts === 'bolt') {
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.lineTo(Math.cos(a) * f.r * 0.75, Math.sin(a) * f.r * 0.75); }
        g.closePath(); g.fillStyle = '#a4abb0'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
      } else {
        g.beginPath(); g.arc(0, 0, f.r * 0.7, 0, Math.PI * 2); g.fillStyle = '#cfcfcf'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
        g.beginPath(); g.moveTo(-f.r * 0.45, 0); g.lineTo(f.r * 0.45, 0); g.stroke();
      }
    }
    g.restore();
    if (turning) {
      g.beginPath(); g.arc(f.x, f.y, f.r + 6, -Math.PI / 2, -Math.PI / 2 + turning.progress * Math.PI * 2);
      g.strokeStyle = '#e9c46a'; g.lineWidth = 4; g.stroke();
    }
    if (need > 0) {
      // A wrench flickers over the bolt: this needs a tool.
      g.save(); g.globalAlpha = need;
      drawItem(g, { type: 'wrench', count: 1 }, f.x + 22, f.y - 22, 34);
      g.restore();
    }
  }

  private drawTargets(inst: Instance, item: Item): void {
    const g = this.g;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
    g.save();
    g.setLineDash([8, 6]);
    g.lineWidth = 3;
    g.strokeStyle = `rgba(233,196,106,${0.45 + 0.45 * pulse})`;
    for (const s of inst.def.slots) {
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
    if (this.drag) return; // the item itself follows the pointer
    g.save();
    g.translate(x, y);
    const hand = this.inv.hand;
    if (hand && hand.type === 'wrench') drawItem(g, hand, 16, -14, 40);
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
