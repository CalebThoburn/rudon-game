// Machines standing in the world, and things lying on the floor.
//
// A machine is just a placed frame item with parts inside; it can be stripped
// to nothing, carried off and rebuilt anywhere. Sites are where the building's
// pipework connects: a machine only does its job when built on a matching
// site. Racks and cabinets work anywhere.
//
// Each machine's billboard is rendered from the same art as its inspect panel,
// so what you see from across the room is its actual current makeup.
import * as THREE from 'three';
import { assemblyOf, connected, works } from './assemblies';
import { makeCtx, renderInstance, type Instance, type PanelDef } from './inspect';
import { drawItem, type Item, type ItemType } from './items';
import {
  cabinetDef, cafeDef, chillerDef, engineDef, grinderDef, h2TankDef, irrigatorDef, mixerDef, pbPumpDef, pumpDef,
  rackDef, saltSiloDef, separatorDef, sugarSiloDef, synthDef, toolboxDef, waterTankDef,
} from './machines';
import { Cmd, E, M, MAX_RACKS, rackBits } from './simLayout';
import { makeSprite } from './sprites';

interface KindSpec { def: PanelDef; radius: number }
const KINDS: Partial<Record<ItemType, KindSpec>> = {
  engine_frame: { def: engineDef, radius: 0.6 },
  rack_frame: { def: rackDef, radius: 0.5 },
  pump_frame: { def: pumpDef, radius: 0.6 },
  chiller_frame: { def: chillerDef, radius: 1.0 },
  toolbox: { def: toolboxDef, radius: 0.35 },
  synth_frame: { def: synthDef, radius: 0.9 },
  h2_tank: { def: h2TankDef, radius: 0.45 },
  water_tank: { def: waterTankDef, radius: 0.5 },
  irrigator_frame: { def: irrigatorDef, radius: 0.55 },
  grinder_frame: { def: grinderDef, radius: 0.75 },
  separator_frame: { def: separatorDef, radius: 1.25 },
  mixer_frame: { def: mixerDef, radius: 0.8 },
  salt_silo: { def: saltSiloDef, radius: 0.5 },
  sugar_silo: { def: sugarSiloDef, radius: 0.5 },
  pb_pump_frame: { def: pbPumpDef, radius: 0.6 },
  cafe_counter: { def: cafeDef, radius: 0.9 },
  cabinet: { def: cabinetDef, radius: 0.4 },
};
/** Frames whose simulation input is a plant machine (Cmd.Machine). */
const PLANT_KINDS: Partial<Record<ItemType, true>> = {
  synth_frame: true, h2_tank: true, water_tank: true, irrigator_frame: true, grinder_frame: true, separator_frame: true,
  mixer_frame: true, salt_silo: true, sugar_silo: true, pb_pump_frame: true, cafe_counter: true,
};
const PX_PER_UNIT = 0.45; // sprite texture resolution, per panel unit

export const isMachineFrame = (t: ItemType) => !!KINDS[t];

/** Where a frame of a given type connects to the building. `id`: server room, or plant machine. */
export interface Site { type: ItemType; x: number; z: number; id: number; machine: WorldMachine | null }

export interface WorldMachine {
  inst: Instance;
  type: ItemType;
  obj: THREE.Group;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  site: Site | null;
  rackIndex: number;
  radius: number;
}

export interface FloorItem { item: Item; obj: THREE.Group }

let nextId = 1;

export class World {
  readonly machines: WorldMachine[] = [];
  readonly floor: FloorItem[] = [];
  private racks: (WorldMachine | null)[] = Array(MAX_RACKS).fill(null);
  private spriteTimer = 0;
  private spriteCursor = 0;

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

  /** Where a frame would land if put down at (x, z): snapped to a free matching site nearby. */
  snap(type: ItemType, x: number, z: number): { x: number; z: number; site: Site | null } {
    let best: Site | null = null;
    let bestD = 1.8;
    for (const s of this.sites) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (s.type === type && !s.machine && d < bestD) { best = s; bestD = d; }
    }
    return best ? { x: best.x, z: best.z, site: best } : { x, z, site: null };
  }

  radiusOf(type: ItemType): number {
    return KINDS[type]?.radius ?? 0.5;
  }

  /** Put a frame item down in the world. Returns null if it can't be placed. */
  place(item: Item, x: number, z: number): WorldMachine | null {
    const kind = KINDS[item.type];
    const asm = assemblyOf(item.type);
    if (!kind || !asm) return null;
    const rackIndex = item.type === 'rack_frame' ? this.racks.indexOf(null) : -1;
    if (item.type === 'rack_frame' && rackIndex < 0) return null;
    const snapped = this.snap(item.type, x, z);
    const def = kind.def;
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
    const inst: Instance = { key: `m${nextId++}`, kind: 'machine', item, asm, def, room: -1, vis: {}, switches: { power: true } };
    const wm: WorldMachine = { inst, type: item.type, obj, canvas, g, tex, site: snapped.site, rackIndex, radius: kind.radius };
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
    const it = inst.item;
    const has = (id: string) => !removed && connected(it, id);
    const on = !!inst.switches.power;
    const ok = !removed && works(it);
    switch (wm.type) {
      case 'engine_frame': {
        inst.room = wm.site && !removed ? wm.site.id : -1;
        if (!wm.site) return;
        let flags = removed ? 0 : E.present;
        if (has('valve')) flags |= E.valve;
        if (has('pin') && has('screw') && has('diff')) flags |= E.actuated;
        if (has('ledger') && has('motor')) flags |= E.ledger;
        if (has('ref') && has('escapement')) flags |= E.reference;
        if (has('jar')) flags |= E.jar;
        if (has('vivarium')) flags |= E.vivarium;
        this.send(Cmd.EngineParts, wm.site.id, flags);
        return;
      }
      case 'rack_frame': {
        const zone = this.zoneOf(wm.obj.position.x, wm.obj.position.z);
        inst.room = zone;
        let blades = 0;
        for (let k = 0; k < 8; k++) if (has(`bay${k}`) && works(it.parts![`bay${k}`].item)) blades++;
        this.send(Cmd.Rack, wm.rackIndex, removed ? 0 : rackBits(true, on, blades, zone));
        return;
      }
      case 'pump_frame':
        inst.room = wm.site ? 0 : -1;
        if (wm.site) this.send(Cmd.Pump, 0, removed ? 0 : (+ok) | (+on << 1));
        return;
      case 'chiller_frame':
        inst.room = wm.site ? 0 : -1;
        if (!wm.site) return;
        this.send(Cmd.Chiller, 0, removed ? 0 : (+ok) | (+on << 1));
        this.send(Cmd.Fans, 0, removed ? 0 : (+has('fan0')) + (+has('fan1')));
        return;
    }
    if (PLANT_KINDS[wm.type]) {
      inst.room = wm.site && !removed ? wm.site.id : -1;
      if (!wm.site) return;
      let extra = 0;
      if (wm.type === 'mixer_frame') extra = (+has('salt')) | (+has('sugar') << 1);
      this.send(Cmd.Machine, wm.site.id, removed ? 0 : (+ok) | (+on << 1) | (extra << 2));
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

  // ---------------------------------------------------------------- the floor
  addFloor(item: Item, x: number, z: number): FloorItem {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    drawItem(c.getContext('2d')!, item, 48, 48, 80);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const obj = makeSprite(tex, 0.42, 0.42);
    obj.position.set(x, 0, z);
    obj.userData.floorItem = true;
    this.scene.add(obj);
    const fi = { item, obj };
    this.floor.push(fi);
    return fi;
  }

  /** Something fell out of a machine: it lands on the floor around it. */
  dropAround(item: Item, x: number, z: number, r: number): void {
    const a = Math.random() * Math.PI * 2;
    const d = r + 0.3 + Math.random() * 0.5;
    this.addFloor(item, x + Math.cos(a) * d, z + Math.sin(a) * d);
  }

  removeFloor(fi: FloorItem): void {
    this.scene.remove(fi.obj);
    this.floor.splice(this.floor.indexOf(fi), 1);
  }

  nearestFloor(x: number, z: number, reach: number): FloorItem | null {
    let best: FloorItem | null = null;
    let bestD = reach;
    for (const f of this.floor) {
      const d = Math.hypot(x - f.obj.position.x, z - f.obj.position.z);
      if (d < bestD) { best = f; bestD = d; }
    }
    return best;
  }

  /** Redraw billboards from each machine's actual parts, a few machines per frame. */
  update(state: Float64Array | null, dt: number, timeScale: number): void {
    this.spriteTimer += dt;
    const n = this.machines.length;
    if (!n) return;
    // Every machine is redrawn about 8 times a second, spread across frames.
    const perFrame = Math.max(1, Math.ceil(n * 8 * dt));
    for (let k = 0; k < perFrame; k++) {
      this.spriteCursor = (this.spriteCursor + 1) % n;
      const m = this.machines[this.spriteCursor];
      const last = (m.inst.vis.__drawn ?? 0);
      m.inst.vis.__drawn = this.spriteTimer;
      this.render(m, state, this.spriteTimer - last, timeScale);
    }
  }

  private render(m: WorldMachine, state: Float64Array | null, dt: number, timeScale: number): void {
    const [x, y] = m.inst.def.front.rect;
    const g = m.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, m.canvas.width, m.canvas.height);
    g.setTransform(PX_PER_UNIT, 0, 0, PX_PER_UNIT, -x * PX_PER_UNIT, -y * PX_PER_UNIT);
    // While its panel is open, the panel advances the animation; don't double-count.
    const c = makeCtx(m.inst, state, this.send, { world: true, dt: this.isOpen(m.inst) ? 0 : Math.min(dt, 0.5), timeScale });
    renderInstance(g, c);
    m.tex.needsUpdate = true;
  }
}

export { M };
