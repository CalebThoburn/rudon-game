// Rudon, Prototype 01: one corridor of headquarters.
// Server rooms cooled by Reconciliation Engines; the water room; caterpillar
// farms; peanut processing; mixing; a cafeteria; records rooms; and the wreck
// of the transport you arrived in. Everything is made of parts and can be
// taken apart, carried, dropped, and rebuilt. The physics runs in Rust workers.
import * as THREE from 'three';
import { SimClient } from './simClient';
import { H, M, R, ROOMS, outletTemp, room } from './simLayout';
import * as S from './sprites';
import { InspectPanel, type Instance } from './inspect';
import { Inventory, type Item } from './items';
import { PLACEABLE, assemblyOf, make, without } from './assemblies';
import { benchDef } from './machines';
import { World, isMachineFrame, type Site, type WorldMachine } from './world';
import { Building, Farms, airZoneAt, roomX, serverRoomAt } from './rooms';
import { Hud } from './hud';
import { chime } from './audio';

// ------------------------------------------------------------------ setup
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17140f);
scene.fog = new THREE.Fog(0x17140f, 20, 46);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
scene.add(new THREE.AmbientLight(0xfff0d0, 2.2));
const sun = new THREE.DirectionalLight(0xfff6e0, 1.4);
sun.position.set(6, 14, 5);
scene.add(sun);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const sim = new SimClient(new URL(`sim.wasm?v=${__BUILD__}`, document.baseURI).href);
const send = (k: number, i: number, v: number) => sim.command(k, i, v);
const hint = document.getElementById('hint')!;
const inventory = new Inventory(document.getElementById('inventory')!);
// A plumber never goes anywhere without these.
inventory.add(make('screwdriver'));
inventory.add(make('wrench'));

// ------------------------------------------------------------------ the building
const building = new Building(scene);
const colliders = building.colliders;
const farms = new Farms(scene, building.farmFloors);

// The transport you arrived in.
const wreck = S.makeSprite(S.wreckTexture(), 5.5, 2.75);
wreck.position.set(64, 0, -0.6);
scene.add(wreck);
colliders.push({ x0: 61.6, x1: 66.6, z0: -1.6, z1: 0.2 });

// The coolant loop at floor level (as before).
const supplyMat = new THREE.MeshLambertMaterial({ color: 0x5fb3c9 });
const returnMat = new THREE.MeshLambertMaterial({ color: 0xcfc6ad });
const branchReturnMats = Array.from({ length: ROOMS }, () => new THREE.MeshLambertMaterial({ color: 0xcfc6ad }));
building.pipe([[-6.8, 0.2], [-5.0, 0.2], [-5.0, -1.0]], supplyMat);
building.pipe([[-5.0, -1.8], [-5.0, -2.55], [22, -2.55]], supplyMat);
building.pipe([[22.4, -2.15], [-6.8, -2.15], [-6.8, -0.2]], returnMat);

interface Branch { path: THREE.Vector3[]; lengths: number[]; total: number; dots: THREE.Mesh[]; offset: number }
const branches: Branch[] = [];
const dotGeo = new THREE.SphereGeometry(0.05, 8, 6);
const dotMat = new THREE.MeshBasicMaterial({ color: 0xf4f1e8 });
for (let i = 0; i < ROOMS; i++) {
  const x0 = roomX(i);
  const sup = building.pipe([[x0 + 2, -2.55], [x0 + 2, -8.7], [x0 + 6, -8.7]], supplyMat);
  const ret = building.pipe([[x0 + 6, -8.35], [x0 + 2.4, -8.35], [x0 + 2.4, -2.15]], branchReturnMats[i]);
  const path = [...sup, ...ret];
  const lengths = path.slice(1).map((p, k) => p.distanceTo(path[k]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const dots = Array.from({ length: 12 }, () => {
    const d = new THREE.Mesh(dotGeo, dotMat);
    scene.add(d);
    return d;
  });
  branches.push({ path, lengths, total, dots, offset: 0 });
}
function along(b: Branch, s: number, out: THREE.Vector3): THREE.Vector3 {
  s = ((s % b.total) + b.total) % b.total;
  for (let k = 0; k < b.lengths.length; k++) {
    if (s <= b.lengths[k]) return out.copy(b.path[k]).lerp(b.path[k + 1], s / b.lengths[k]);
    s -= b.lengths[k];
  }
  return out.copy(b.path[b.path.length - 1]);
}

// ------------------------------------------------------------------ machines and their sites
const site = (type: Site['type'], x: number, z: number, id: number): Site => ({ type, x, z, id, machine: null });
const sites: Site[] = [
  site('pump_frame', -5.0, -1.4, 0),
  site('chiller_frame', -7.6, 0.6, 0),
  ...Array.from({ length: ROOMS }, (_, i) => site('engine_frame', roomX(i) + 2, -9.3, i)),
  site('separator_frame', 34, -7.6, M.separator),
  site('synth_frame', 4, 7.9, M.synth),
  site('h2_tank', 1.3, 9.7, M.h2),
  site('water_tank', 6.8, 9.6, M.water),
  site('irrigator_frame', 11.6, 4.4, M.irrigatorA),
  site('irrigator_frame', 21.6, 4.4, M.irrigatorB),
  site('grinder_frame', 16.4, 4.6, M.grinderA),
  site('grinder_frame', 26.4, 4.6, M.grinderB),
  site('mixer_frame', 34, 8.0, M.mixer),
  site('salt_silo', 31.2, 9.8, M.salt),
  site('sugar_silo', 36.8, 9.8, M.sugar),
  site('pb_pump_frame', 31.6, 4.6, M.pbPump),
  site('cafe_counter', 44, 8.2, M.cafe),
];
sites.forEach((s) => building.flange(s.x, s.z + 0.45));

let panel: InspectPanel | null = null; // created below; the world asks it what's open
const world = new World(scene, sites, send, serverRoomAt, (inst) => panel?.instance === inst);

// Everything starts complete and on its site...
for (const s of sites) world.place(make(s.type), s.x, s.z);
// ...except what never came: the chiller's second fan, and the racks' spare bays.
const chiller = sites[1].machine!;
without(chiller.inst.item, 'fan1');
world.syncSim(chiller);
const STOCK_BLADES = [4, 6, 8];
for (let i = 0; i < ROOMS; i++) {
  const rack = without(make('rack_frame'), ...Array.from({ length: 8 - STOCK_BLADES[i] }, (_, k) => `bay${7 - k}`));
  world.place(rack, roomX(i) + 6, -9.7);
}
// The records rooms: nothing else to use them for.
for (const i of [4, 5]) for (const z of [-9.6, -6.9]) for (const dx of [1.4, 3.8, 6.4]) world.place(make('cabinet'), roomX(i) + dx, z);
world.place(make('toolbox'), 62.2, 1.3);

// ------------------------------------------------------------------ inspect & bench
const benches = new WeakMap<Item, Instance>();
const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function hitsWall(x: number, z: number, r: number): boolean {
  for (const b of colliders) if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
  return false;
}

/** The floor point under the cursor, pulled within reach of the player and out of walls. */
function floorPoint(clientX: number, clientY: number, reach = 2.5): THREE.Vector3 {
  const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(floorPlane, p)) p.copy(player.position);
  const d = p.clone().sub(player.position).setY(0);
  if (d.length() > reach) p.copy(player.position).add(d.setLength(reach));
  for (let k = 0; k < 10 && hitsWall(p.x, p.z, 0.2); k++) p.lerp(player.position, 0.25);
  return p.setY(0);
}

panel = new InspectPanel(
  document.getElementById('inspect') as HTMLCanvasElement,
  document.getElementById('ghost') as HTMLCanvasElement,
  inventory,
  {
    send,
    changed(inst) {
      const wm = world.find(inst);
      if (wm) world.syncSim(wm);
      inventory.render();
    },
    removeMachine(inst) {
      const wm = world.find(inst);
      if (wm) world.remove(wm);
    },
    broke(inst, into) {
      const wm = world.find(inst);
      const at = wm ? wm.obj.position : player.position;
      for (const l of inst.item.loose ?? []) world.dropAround(l.item, at.x, at.z, 0.4);
      if (wm) world.remove(wm);
      else inventory.consume(inst.item);
      for (const m of into) if (!inventory.add(m)) world.dropAround(m, at.x, at.z, 0.4);
    },
    fall(inst, item) {
      const wm = world.find(inst);
      if (wm) world.dropAround(item, wm.obj.position.x, wm.obj.position.z, wm.radius);
      else world.dropAround(item, player.position.x, player.position.z, 0.3);
    },
    drop(item, clientX, clientY) {
      const p = floorPoint(clientX, clientY);
      if (isMachineFrame(item.type) && placementOk(item.type, p.x, p.z) && world.place(item, p.x, p.z)) return true;
      world.addFloor(item, p.x, p.z);
      return true;
    },
  },
);
const ui = panel;

function openBench(item: Item): void {
  let inst = benches.get(item);
  if (!inst) {
    inst = { key: 'bench', kind: 'bench', item, asm: assemblyOf(item.type) ?? { slots: [] }, def: benchDef(), room: -1, vis: {}, switches: {} };
    benches.set(item, inst);
  }
  ui.open(inst);
}
inventory.onOpen = (i) => {
  const it = inventory.slots[i];
  if (it) openBench(it);
};

// ------------------------------------------------------------------ player
const player = S.makeSprite(S.playerTexture(), 0.9, 1.35);
player.position.set(-2, 0, 0.5);
scene.add(player);
const PLAYER_R = 0.3;
const SPEED = 4.2;
const facing = new THREE.Vector2(0, -1);

const keys = new Set<string>();
const cam = { yaw: 0, yawTarget: 0, pitch: 0.92, dist: 15, distTarget: 15 };

function blocked(x: number, z: number): boolean {
  if (hitsWall(x, z, PLAYER_R)) return true;
  for (const m of world.machines) if (Math.hypot(x - m.obj.position.x, z - m.obj.position.z) < m.radius + PLAYER_R) return true;
  return false;
}

function placementOk(type: Item['type'], x: number, z: number): boolean {
  const s = world.snap(type, x, z);
  const r = world.radiusOf(type);
  return !hitsWall(s.x, s.z, r) &&
    world.machines.every((m) => Math.hypot(s.x - m.obj.position.x, s.z - m.obj.position.z) > m.radius + r + 0.1) &&
    Math.hypot(s.x - player.position.x, s.z - player.position.z) > r + PLAYER_R;
}

// Placement preview: a ring on the floor where the frame in your hand would go.
const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0xe9c46a, transparent: true, opacity: 0.7, depthWrite: false }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.02;
scene.add(ring);

function placement(): { x: number; z: number; ok: boolean } | null {
  const hand = inventory.hand;
  if (!hand || !PLACEABLE[hand.type] || ui.isOpen) return null;
  const s = world.snap(hand.type, player.position.x + facing.x * 1.5, player.position.z + facing.y * 1.5);
  return { x: s.x, z: s.z, ok: placementOk(hand.type, s.x, s.z) };
}

function interact(): void {
  if (ui.isOpen) return ui.close();
  const p = placement();
  if (p) {
    if (!p.ok) return;
    const item = inventory.takeOne(inventory.selected);
    if (item && !world.place(item, p.x, p.z)) inventory.add(item);
    return;
  }
  const { x, z } = player.position;
  const f = world.nearestFloor(x, z, 1.1);
  const m = world.nearest(x, z, 1.3);
  const fd = f ? Math.hypot(f.obj.position.x - x, f.obj.position.z - z) : Infinity;
  const md = m ? Math.hypot(m.obj.position.x - x, m.obj.position.z - z) - m.radius : Infinity;
  if (f && fd <= md) {
    if (inventory.add(f.item)) world.removeFloor(f);
  } else if (m) ui.open(m.inst);
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.repeat) return;
  if (k === 'f') interact();
  else if (k === 'escape') ui.close();
  else if (k === 'b' && inventory.hand) {
    if (ui.isOpen) ui.close();
    else openBench(inventory.hand);
  } else if (k === 'q') cam.yawTarget -= Math.PI / 4;
  else if (k === 'e') cam.yawTarget += Math.PI / 4;
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (ui.isOpen) {
    if (!ui.dragging) ui.close();
    return;
  }
  // Click something on the floor nearby to pick it up.
  raycaster.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = raycaster.intersectObjects(world.floor.map((f) => f.obj), true)[0];
  if (!hit) return;
  const f = world.floor.find((fi) => fi.obj === hit.object.parent || fi.obj === hit.object);
  if (f && f.obj.position.distanceTo(player.position) < 3 && inventory.add(f.item)) world.removeFloor(f);
});
renderer.domElement.addEventListener('wheel', (e) => {
  cam.distTarget = THREE.MathUtils.clamp(cam.distTarget + Math.sign(e.deltaY) * 1.5, 8, 26);
}, { passive: true });

const hud = new Hud(document.getElementById('hud')!, sim, () => airZoneAt(player.position.x, player.position.z));

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const white = new THREE.Color(0xffffff);
const lastChimes: number[] = Array(ROOMS).fill(-1);
let elapsed = 0;

function engineAt(i: number): WorldMachine | null {
  return sites.find((s) => s.type === 'engine_frame' && s.id === i)?.machine ?? null;
}

function update(dt: number): void {
  elapsed += dt;

  if (!ui.isOpen) {
    let fx = 0, fz = 0;
    if (keys.has('w')) fz -= 1;
    if (keys.has('s')) fz += 1;
    if (keys.has('a')) fx -= 1;
    if (keys.has('d')) fx += 1;
    if (fx || fz) {
      const len = Math.hypot(fx, fz);
      const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
      const dx = ((fx * cos + fz * sin) / len) * SPEED * dt;
      const dz = ((-fx * sin + fz * cos) / len) * SPEED * dt;
      facing.set(dx, dz).normalize();
      const p = player.position;
      if (!blocked(p.x + dx, p.z)) p.x += dx;
      if (!blocked(p.x, p.z + dz)) p.z += dz;
      player.children[0].position.y = Math.abs(Math.sin(elapsed * 11)) * 0.05;
    }
  }

  cam.yaw += (cam.yawTarget - cam.yaw) * Math.min(1, dt * 8);
  cam.dist += (cam.distTarget - cam.dist) * Math.min(1, dt * 8);
  const horiz = Math.cos(cam.pitch) * cam.dist;
  camera.position.set(player.position.x + Math.sin(cam.yaw) * horiz, Math.sin(cam.pitch) * cam.dist, player.position.z + Math.cos(cam.yaw) * horiz);
  camera.lookAt(player.position.x, 0.6, player.position.z);

  // placement ring, or the interaction hint
  const p = placement();
  ring.visible = !!p;
  if (p) {
    ring.position.x = p.x;
    ring.position.z = p.z;
    (ring.material as THREE.MeshBasicMaterial).color.setHex(p.ok ? 0xe9c46a : 0xe76f51);
  }
  let hintAt: THREE.Vector3 | null = null;
  if (!ui.isOpen) {
    if (p) hintAt = p.ok ? tmpV.set(p.x, 0, p.z) : null;
    else {
      const f = world.nearestFloor(player.position.x, player.position.z, 1.1);
      const m = world.nearest(player.position.x, player.position.z, 1.3);
      hintAt = f ? f.obj.position : m ? m.obj.position : null;
    }
  }
  if (hintAt) {
    tmpV.set(hintAt.x, 2.1, hintAt.z).project(camera);
    hint.style.left = `${((tmpV.x + 1) / 2) * innerWidth}px`;
    hint.style.top = `${((1 - tmpV.y) / 2) * innerHeight}px`;
    hint.classList.remove('hidden');
  } else hint.classList.add('hidden');

  const st = sim.state;
  if (st) {
    S.tempColor(st[H.coolantTemp], supplyMat.color);
    let fSum = 0, tf = 0;
    for (let i = 0; i < ROOMS; i++) {
      const temp = room(st, i, R.temp);
      const flow = room(st, i, R.flow);
      const tOut = outletTemp(st, i);
      fSum += flow;
      tf += flow * tOut;
      S.tempColor(tOut, branchReturnMats[i].color);
      building.serverFloors[i].color.copy(white).lerp(S.tempColor(temp, tmpC), 0.55);
      const b = branches[i];
      b.offset += flow * 1000 * 8 * dt;
      b.dots.forEach((d, k) => along(b, b.offset + (k * b.total) / b.dots.length, d.position));

      const chimes = room(st, i, R.chimes);
      const eng = engineAt(i);
      if (lastChimes[i] >= 0 && chimes > lastChimes[i] && eng) {
        const d = player.position.distanceTo(eng.obj.position);
        if (ui.instance === eng.inst) chime(0.3);
        else if (d < 9) chime(0.25 * (1 - d / 9));
      }
      lastChimes[i] = chimes;
    }
    S.tempColor(fSum > 1e-7 ? tf / fSum : st[H.coolantTemp], returnMat.color);
    building.update(st);
    farms.update(st, dt);
    ui.draw(st, dt, sim.timeScale);
  }
  world.update(st, dt, sim.timeScale);
  hud.update(dt);
  document.getElementById('hud')!.classList.toggle('dim', ui.isOpen);
}

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Debug handle for poking at the world from the browser console.
(window as unknown as { __rudon: unknown }).__rudon = { world, inventory, sim, player, panel: ui, facing };
