// Machines standing in the world. A machine is just a placed frame item with
// parts inside; it can be stripped to nothing, carried off and rebuilt
// anywhere. Sites are where the building's pipework connects: a pump, chiller
// or engine only does its job when built on a matching site. Racks work
// anywhere and heat whichever room they stand in.
//
// Each machine's billboard is rendered from the same art as its inspect panel,
// so what you see from across the room is its actual current makeup.
import * as THREE from 'three';
import { assemblyOf, works } from './assemblies';
import { makeCtx, renderInstance, type Instance, type PanelDef } from './inspect';
import type { Item, ItemType } from './items';
import { chillerDef, engineDef, pumpDef, rackDef, toolboxDef } from './machines';
import { Cmd, E, MAX_RACKS, rackBits } from './simLayout';
import { makeSprite } from './sprites';

export type Kind = 'engine' | 'rack' | 'pump' | 'chiller' | 'toolbox';

export const KIND_OF: Partial<Record<ItemType, Kind>> = {
  engine_frame: 'engine', rack_frame: 'rack', pump_frame: 'pump', chiller_frame: 'chiller', toolbox: 'toolbox',
};
const DEFS: Record<Kind, PanelDef> = { engine: engineDef, rack: rackDef, pump: pumpDef, chiller: chillerDef, toolbox: toolboxDef };
const RADIUS: Record<Kind, number> = { engine: 0.6, rack: 0.5, pump: 0.6, chiller: 1.0, toolbox: 0.35 };
const PX_PER_UNIT = 0.45; // sprite texture resolution, per panel unit

export interface Site { kind: Kind; x: number; z: number; room: number; machine: WorldMachine | null }

export interface WorldMachine {
  inst: Instance;
  kind: Kind;
  obj: THREE.Group;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  site: Site | null;
  rackIndex: number;
  radius: number;
}

let nextId = 1;

export class World {
  readonly machines: WorldMachine[] = [];
  private racks: (WorldMachine | null)[] = Array(MAX_RACKS).fill(null);
  private spriteTimer = 0;

  constructor(
    private scene: THREE.Scene,
    readonly sites: Site[],
    private send: (kind: number, index: number, value: number) => void,
    private zoneOf: (x: number, z: number) => number,
    private isOpen: (inst: Instance) => boolean,
  ) {}

  find(inst: Instance): WorldMachine | undefined {
    return this.machines.find((m) => m.inst === inst);
  }

  /** Where a frame of this kind would land if put down at (x, z): snapped to a free site nearby. */
  snap(type: ItemType, x: number, z: number): { x: number; z: number; site: Site | null } {
    const kind = KIND_OF[type];
    let best: Site | null = null;
    let bestD = 1.8;
    for (const s of this.sites) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (s.kind === kind && !s.machine && d < bestD) { best = s; bestD = d; }
    }
    return best ? { x: best.x, z: best.z, site: best } : { x, z, site: null };
  }

  radiusOf(type: ItemType): number {
    const k = KIND_OF[type];
    return k ? RADIUS[k] : 0.5;
  }

  /** Put a frame item down in the world. Returns null if it can't be placed. */
  place(item: Item, x: number, z: number): WorldMachine | null {
    const kind = KIND_OF[item.type];
    const asm = assemblyOf(item.type);
    if (!kind || !asm) return null;
    const rackIndex = kind === 'rack' ? this.racks.indexOf(null) : -1;
    if (kind === 'rack' && rackIndex < 0) return null;
    const snapped = this.snap(item.type, x, z);
    const def = DEFS[kind];
    const [, , rw, rh] = def.front.rect;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rw * PX_PER_UNIT);
    canvas.height = Math.round(rh * PX_PER_UNIT);
    const g = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const obj = makeSprite(tex, def.front.size[0], def.front.size[1]);
    obj.position.set(snapped.x, 0, snapped.z);
    this.scene.add(obj);
    const inst: Instance = {
      key: `m${nextId++}`,
      kind: 'machine',
      item,
      asm,
      def,
      room: -1,
      vis: {},
      switches: { power: true },
    };
    const wm: WorldMachine = { inst, kind, obj, canvas, g, tex, site: snapped.site, rackIndex, radius: RADIUS[kind] };
    if (snapped.site) snapped.site.machine = wm;
    if (rackIndex >= 0) this.racks[rackIndex] = wm;
    this.machines.push(wm);
    this.syncSim(wm);
    this.render(wm, null, 0, 1);
    return wm;
  }

  remove(wm: WorldMachine): void {
    this.syncSim(wm, true);
    this.scene.remove(wm.obj);
    wm.tex.dispose();
    if (wm.site) wm.site.machine = null;
    if (wm.rackIndex >= 0) this.racks[wm.rackIndex] = null;
    this.machines.splice(this.machines.indexOf(wm), 1);
  }

  /** Tell the simulation what this machine physically is, right now. */
  syncSim(wm: WorldMachine, removed = false): void {
    const { inst } = wm;
    const p = inst.item.parts ?? {};
    const has = (id: string) => !removed && !!p[id]?.item;
    const on = !!inst.switches.power;
    switch (wm.kind) {
      case 'engine': {
        inst.room = wm.site && !removed ? wm.site.room : -1;
        if (!wm.site) return;
        let flags = removed ? 0 : E.present;
        if (has('valve')) flags |= E.valve;
        if (has('pin') && has('screw') && has('diff')) flags |= E.actuated;
        if (has('ledger') && has('motor')) flags |= E.ledger;
        if (has('ref') && has('escapement')) flags |= E.reference;
        if (has('jar')) flags |= E.jar;
        this.send(Cmd.EngineParts, wm.site.room, flags);
        break;
      }
      case 'rack': {
        const zone = this.zoneOf(wm.obj.position.x, wm.obj.position.z);
        inst.room = zone;
        let blades = 0;
        for (let k = 0; k < 8; k++) if (has(`bay${k}`) && works(p[`bay${k}`].item)) blades++;
        this.send(Cmd.Rack, wm.rackIndex, removed ? 0 : rackBits(true, on, blades, zone));
        break;
      }
      case 'pump':
        inst.room = wm.site ? 0 : -1;
        if (wm.site) this.send(Cmd.Pump, 0, removed ? 0 : (+works(inst.item)) | (+on << 1));
        break;
      case 'chiller': {
        inst.room = wm.site ? 0 : -1;
        if (!wm.site) return;
        const fans = (has('fan0') ? 1 : 0) + (has('fan1') ? 1 : 0);
        this.send(Cmd.Chiller, 0, removed ? 0 : (+works(inst.item)) | (+on << 1));
        this.send(Cmd.Fans, 0, removed ? 0 : fans);
        break;
      }
      case 'toolbox':
        break;
    }
  }

  nearest(x: number, z: number, reach: number): WorldMachine | null {
    let best: WorldMachine | null = null;
    let bestD = reach;
    for (const m of this.machines) {
      const d = Math.hypot(x - m.obj.position.x, z - m.obj.position.z) - m.radius;
      if (d < bestD) { best = m; bestD = d; }
    }
    return best;
  }

  /** Redraw billboards from each machine's actual parts (~12 times a second). */
  update(state: Float64Array | null, dt: number, timeScale: number): void {
    this.spriteTimer += dt;
    if (this.spriteTimer < 1 / 12) return;
    const step = this.spriteTimer;
    this.spriteTimer = 0;
    for (const m of this.machines) this.render(m, state, step, timeScale);
  }

  private render(m: WorldMachine, state: Float64Array | null, dt: number, timeScale: number): void {
    const [x, y] = m.inst.def.front.rect;
    const g = m.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, m.canvas.width, m.canvas.height);
    g.setTransform(PX_PER_UNIT, 0, 0, PX_PER_UNIT, -x * PX_PER_UNIT, -y * PX_PER_UNIT);
    // While its panel is open, the panel advances the animation; don't double-count.
    const c = makeCtx(m.inst, state, this.send, { world: true, dt: this.isOpen(m.inst) ? 0 : dt, timeScale });
    renderInstance(g, c);
    m.tex.needsUpdate = true;
  }
}
