// Rudon, Prototype 01: one sector of Thermal Accounting.
// A corridor, three server rooms, a pump and a chiller, a Reconciliation Engine
// on each room's valve site, and the wreck of the transport you arrived in.
// Everything is made of parts and can be taken apart, carried and rebuilt.
// The physics runs in Rust workers (see simClient.ts / sim/src/lib.rs).
import * as THREE from 'three';
import { SimClient } from './simClient';
import { H, R, ROOMS, outletTemp, room } from './simLayout';
import * as S from './sprites';
import { InspectPanel, type Instance } from './inspect';
import { Inventory, type Item } from './items';
import { PLACEABLE, assemblyOf, make, without } from './assemblies';
import { benchDef } from './machines';
import { World, type Site, type WorldMachine } from './world';
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

const sim = new SimClient(new URL('sim.wasm', document.baseURI).href);
const send = (k: number, i: number, v: number) => sim.command(k, i, v);
const hud = new Hud(document.getElementById('hud')!, sim);
const hint = document.getElementById('hint')!;
const inventory = new Inventory(document.getElementById('inventory')!);
// A plumber never goes anywhere without these.
inventory.add(make('screwdriver'));
inventory.add(make('wrench'));

// ------------------------------------------------------------------ architecture
const WALL_H = 1.4;
const WALL_T = 0.25;
interface Box { x0: number; x1: number; z0: number; z1: number }
const colliders: Box[] = [];
const wallMat = new THREE.MeshLambertMaterial({ map: S.wallTexture() });

function wall(ax: number, az: number, bx: number, bz: number): void {
  const b = { x0: Math.min(ax, bx) - WALL_T / 2, x1: Math.max(ax, bx) + WALL_T / 2, z0: Math.min(az, bz) - WALL_T / 2, z1: Math.max(az, bz) + WALL_T / 2 };
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  const geo = new THREE.BoxGeometry(w, WALL_H, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * Math.max(w, d) * 0.7, uv.getY(k));
  const m = new THREE.Mesh(geo, wallMat);
  m.position.set((b.x0 + b.x1) / 2, WALL_H / 2, (b.z0 + b.z1) / 2);
  scene.add(m);
  colliders.push(b);
}

function floor(x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, tile = 2): void {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * (x1 - x0)) / tile, (uv.getY(k) * (z1 - z0)) / tile);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  scene.add(m);
}

const roomX = (i: number) => i * 10; // room i spans x [i*10, i*10+8], z [-11, -3]
const zoneOf = (x: number, z: number) => {
  for (let i = 0; i < ROOMS; i++) if (x > roomX(i) && x < roomX(i) + 8 && z > -11 && z < -3) return i;
  return -1;
};
floor(-10, -3, 60, 3, new THREE.MeshLambertMaterial({ map: S.carpetTexture() }), 1.5);
const tile = S.tileTexture();
const roomFloorMats = Array.from({ length: ROOMS }, (_, i) => {
  const mat = new THREE.MeshLambertMaterial({ map: tile });
  floor(roomX(i), -11, roomX(i) + 8, -3, mat, 2);
  return mat;
});

// The corridor runs on past the rooms into the dark. It ends, eventually, at the wreck.
wall(-10, 3, 60, 3);
wall(-10, -3, -10, 3);
wall(60, -3, 60, 3);
wall(-10, -3, 0, -3);
wall(8, -3, 10, -3);
wall(18, -3, 20, -3);
wall(28, -3, 60, -3);
for (let i = 0; i < ROOMS; i++) {
  const x0 = roomX(i);
  wall(x0, -11, x0, -3);
  wall(x0 + 8, -11, x0 + 8, -3);
  wall(x0, -11, x0 + 8, -11);
  wall(x0, -3, x0 + 3, -3);
  wall(x0 + 5, -3, x0 + 8, -3);
}

// The transport you arrived in.
const wreck = S.makeSprite(S.wreckTexture(), 5.5, 2.75);
wreck.position.set(52, 0, -0.6);
scene.add(wreck);
colliders.push({ x0: 49.6, x1: 54.6, z0: -1.6, z1: 0.2 });

// ------------------------------------------------------------------ pipes
const PIPE_Y = 0.12;
const pipeGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 10);
const supplyMat = new THREE.MeshLambertMaterial({ color: 0x5fb3c9 });
const returnMat = new THREE.MeshLambertMaterial({ color: 0xcfc6ad });
const branchReturnMats = Array.from({ length: ROOMS }, () => new THREE.MeshLambertMaterial({ color: 0xcfc6ad }));

function pipe(pts: [number, number][], mat: THREE.Material): THREE.Vector3[] {
  const v = pts.map(([x, z]) => new THREE.Vector3(x, PIPE_Y, z));
  for (let k = 0; k + 1 < v.length; k++) {
    const a = v[k], b = v[k + 1];
    const m = new THREE.Mesh(pipeGeo, mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.y = a.distanceTo(b) + 0.07;
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    scene.add(m);
  }
  return v;
}

/** A pipe flange on the floor: where a machine connects to the building. */
function flange(x: number, z: number): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), new THREE.MeshLambertMaterial({ color: 0x8d959b }));
  m.position.set(x, 0.03, z);
  scene.add(m);
}

pipe([[-6.8, 0.2], [-5.0, 0.2], [-5.0, -1.0]], supplyMat);
pipe([[-5.0, -1.8], [-5.0, -2.55], [22, -2.55]], supplyMat);
pipe([[22.4, -2.15], [-6.8, -2.15], [-6.8, -0.2]], returnMat);

interface Branch { path: THREE.Vector3[]; lengths: number[]; total: number; dots: THREE.Mesh[]; offset: number }
const branches: Branch[] = [];
const dotGeo = new THREE.SphereGeometry(0.05, 8, 6);
const dotMat = new THREE.MeshBasicMaterial({ color: 0xf4f1e8 });
for (let i = 0; i < ROOMS; i++) {
  const x0 = roomX(i);
  const sup = pipe([[x0 + 2, -2.55], [x0 + 2, -8.7], [x0 + 6, -8.7]], supplyMat);
  const ret = pipe([[x0 + 6, -8.35], [x0 + 2.4, -8.35], [x0 + 2.4, -2.15]], branchReturnMats[i]);
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

// ------------------------------------------------------------------ machines
const sites: Site[] = [
  { kind: 'pump', x: -5.0, z: -1.4, room: 0, machine: null },
  { kind: 'chiller', x: -7.6, z: 0.6, room: 0, machine: null },
  ...Array.from({ length: ROOMS }, (_, i): Site => ({ kind: 'engine', x: roomX(i) + 2, z: -9.3, room: i, machine: null })),
];
sites.forEach((s) => flange(s.x, s.z + 0.45));

let inspect: InspectPanel | null = null; // created below; the world asks it what's open
const world = new World(scene, sites, send, zoneOf, (inst) => inspect?.instance === inst);

const STOCK_BLADES = [4, 6, 8];
world.place(make('pump_frame'), -5.0, -1.4);
const chiller = world.place(without(make('chiller_frame'), 'fan1'), -7.6, 0.6); // the second fan mount came empty
for (let i = 0; i < ROOMS; i++) {
  world.place(make('engine_frame'), roomX(i) + 2, -9.3);
  const rack = without(make('rack_frame'), ...Array.from({ length: 8 - STOCK_BLADES[i] }, (_, k) => `bay${7 - k}`));
  world.place(rack, roomX(i) + 6, -9.7);
}
world.place(make('toolbox'), 50.2, 1.3);
void chiller;

// ------------------------------------------------------------------ inspect & bench
const benches = new WeakMap<Item, Instance>();
const panel = new InspectPanel(
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
      if (wm) world.remove(wm);
      else inventory.consume(inst.item);
      for (const m of into) inventory.add(m); // anything that doesn't fit is lost on the floor
    },
  },
);
inspect = panel;

function openBench(item: Item): void {
  let inst = benches.get(item);
  if (!inst) {
    inst = { key: 'bench', kind: 'bench', item, asm: assemblyOf(item.type) ?? { slots: [] }, def: benchDef(), room: -1, vis: {}, switches: {} };
    benches.set(item, inst);
  }
  panel.open(inst);
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

function hitsWall(x: number, z: number, r: number): boolean {
  for (const b of colliders) if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
  return false;
}
function blocked(x: number, z: number): boolean {
  if (hitsWall(x, z, PLAYER_R)) return true;
  for (const m of world.machines) if (Math.hypot(x - m.obj.position.x, z - m.obj.position.z) < m.radius + PLAYER_R) return true;
  return false;
}

// Placement preview: a ring on the floor where the frame in your hand would go.
const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0xe9c46a, transparent: true, opacity: 0.7, depthWrite: false }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.02;
scene.add(ring);

function placement(): { x: number; z: number; ok: boolean } | null {
  const hand = inventory.hand;
  if (!hand || !PLACEABLE[hand.type] || panel.isOpen) return null;
  const tx = player.position.x + facing.x * 1.5;
  const tz = player.position.z + facing.y * 1.5;
  const s = world.snap(hand.type, tx, tz);
  const r = world.radiusOf(hand.type);
  const clear = !hitsWall(s.x, s.z, r) &&
    world.machines.every((m) => Math.hypot(s.x - m.obj.position.x, s.z - m.obj.position.z) > m.radius + r + 0.1) &&
    Math.hypot(s.x - player.position.x, s.z - player.position.z) > r + PLAYER_R;
  return { x: s.x, z: s.z, ok: clear };
}

function interact(): void {
  if (panel.isOpen) return panel.close();
  const p = placement();
  if (p) {
    if (!p.ok) return;
    const item = inventory.takeOne(inventory.selected);
    if (item && !world.place(item, p.x, p.z)) inventory.add(item);
    return;
  }
  const m = world.nearest(player.position.x, player.position.z, 1.3);
  if (m) panel.open(m.inst);
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.repeat) return;
  if (k === 'f') interact();
  else if (k === 'escape') panel.close();
  else if (k === 'b' && inventory.hand) {
    if (panel.isOpen) panel.close();
    else openBench(inventory.hand);
  } else if (k === 'q') cam.yawTarget -= Math.PI / 4;
  else if (k === 'e') cam.yawTarget += Math.PI / 4;
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('pointerdown', () => {
  if (panel.isOpen && !panel.dragging) panel.close();
});
renderer.domElement.addEventListener('wheel', (e) => {
  cam.distTarget = THREE.MathUtils.clamp(cam.distTarget + Math.sign(e.deltaY) * 1.5, 8, 26);
}, { passive: true });

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const white = new THREE.Color(0xffffff);
const lastChimes: number[] = Array(ROOMS).fill(-1);
let elapsed = 0;

function engineAt(i: number): WorldMachine | null {
  return sites.find((s) => s.kind === 'engine' && s.room === i)?.machine ?? null;
}

function update(dt: number): void {
  elapsed += dt;

  if (!panel.isOpen) {
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
  const near = panel.isOpen || p ? null : world.nearest(player.position.x, player.position.z, 1.3);
  const hintAt = near ? near.obj.position : p && p.ok ? new THREE.Vector3(p.x, 0, p.z) : null;
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
      roomFloorMats[i].color.copy(white).lerp(S.tempColor(temp, tmpC), 0.55);
      const b = branches[i];
      b.offset += flow * 1000 * 8 * dt;
      b.dots.forEach((d, k) => along(b, b.offset + (k * b.total) / b.dots.length, d.position));

      const chimes = room(st, i, R.chimes);
      const eng = engineAt(i);
      if (lastChimes[i] >= 0 && chimes > lastChimes[i] && eng) {
        const d = player.position.distanceTo(eng.obj.position);
        if (panel.instance === eng.inst) chime(0.3);
        else if (d < 9) chime(0.25 * (1 - d / 9));
      }
      lastChimes[i] = chimes;
    }
    S.tempColor(fSum > 1e-7 ? tf / fSum : st[H.coolantTemp], returnMat.color);
    panel.draw(st, dt, sim.timeScale);
  }
  world.update(st, dt, sim.timeScale);
  hud.update(dt);
  document.getElementById('hud')!.classList.toggle('dim', panel.isOpen);
}

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Debug handle for poking at the world from the browser console.
(window as unknown as { __rudon: unknown }).__rudon = { world, inventory, sim, player, panel, facing };
