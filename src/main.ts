// Rudon, Prototype 01: one sector of Thermal Accounting.
// A corridor, three server rooms, a pump and a chiller, and a Reconciliation
// Engine in each room. The 3D world is drawn here; the physics runs in Rust
// workers (see simClient.ts / sim/src/lib.rs).
import * as THREE from 'three';
import { SimClient } from './simClient';
import { Cmd, H, R, ROOMS, outletTemp, room } from './simLayout';
import * as S from './sprites';
import { InspectPanel } from './inspect';
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
const inspect = new InspectPanel(document.getElementById('inspect') as HTMLCanvasElement, (k, r, v) => sim.command(k, r, v));
const hud = new Hud(document.getElementById('hud')!, sim);
const hint = document.getElementById('hint')!;

// ------------------------------------------------------------------ architecture
const WALL_H = 1.4;
const WALL_T = 0.25;
interface Box { x0: number; x1: number; z0: number; z1: number }
const colliders: Box[] = [];
const wallTex = S.wallTexture();
const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });

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

function floor(x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, tile = 2): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * (x1 - x0)) / tile, (uv.getY(k) * (z1 - z0)) / tile);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  scene.add(m);
  return m;
}

const roomX = (i: number) => i * 10; // room i spans x [i*10, i*10+8], z [-11, -3]
floor(-10, -3, 60, 3, new THREE.MeshLambertMaterial({ map: S.carpetTexture() }), 1.5);
const tile = S.tileTexture();
const roomFloorMats = Array.from({ length: ROOMS }, (_, i) => {
  const mat = new THREE.MeshLambertMaterial({ map: tile });
  floor(roomX(i), -11, roomX(i) + 8, -3, mat, 2);
  return mat;
});

// The corridor runs on past the rooms into the dark. It ends, eventually.
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

// ------------------------------------------------------------------ machines
type Kind = 'engine' | 'rack' | 'pump' | 'chiller';
interface Machine { kind: Kind; room: number; obj: THREE.Group; radius: number }
const machines: Machine[] = [];
function place(kind: Kind, roomIdx: number, obj: THREE.Group, x: number, z: number, radius: number): void {
  obj.position.set(x, 0, z);
  scene.add(obj);
  machines.push({ kind, room: roomIdx, obj, radius });
}

place('chiller', -1, S.makeSprite(S.chillerTexture(), 2.4, 2.0), -7.6, 0.6, 1.0);
place('pump', -1, S.makeSprite(S.pumpTexture(), 1.2, 1.05), -5.0, -1.4, 0.5);
const engineSprites: S.EngineSprite[] = [];
const rackSprites: S.RackSprite[] = [];
for (let i = 0; i < ROOMS; i++) {
  const es = new S.EngineSprite();
  engineSprites.push(es);
  place('engine', i, S.makeSprite(es.tex, 1.6, 1.6), roomX(i) + 2, -9.3, 0.6);
  const rs = new S.RackSprite();
  rackSprites.push(rs);
  place('rack', i, S.makeSprite(rs.tex, 1.0, 1.85), roomX(i) + 6, -9.7, 0.5);
}

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

pipe([[-6.8, 0.2], [-5.0, 0.2], [-5.0, -1.0]], supplyMat);
pipe([[-5.0, -1.8], [-5.0, -2.55], [22, -2.55]], supplyMat);
pipe([[22.4, -2.15], [-6.8, -2.15], [-6.8, -0.2]], returnMat);

// Flow markers travel each branch at a speed proportional to the real flow.
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

// ------------------------------------------------------------------ player
const player = S.makeSprite(S.playerTexture(), 0.9, 1.35);
player.position.set(-2, 0, 0.5);
scene.add(player);
const PLAYER_R = 0.3;
const SPEED = 4.2;

const keys = new Set<string>();
const cam = { yaw: 0, yawTarget: 0, pitch: 0.92, dist: 15, distTarget: 15 };

function blocked(x: number, z: number): boolean {
  for (const b of colliders) if (x + PLAYER_R > b.x0 && x - PLAYER_R < b.x1 && z + PLAYER_R > b.z0 && z - PLAYER_R < b.z1) return true;
  for (const m of machines) if (Math.hypot(x - m.obj.position.x, z - m.obj.position.z) < m.radius + PLAYER_R) return true;
  return false;
}

function nearestMachine(): Machine | null {
  let best: Machine | null = null;
  let bestD = Infinity;
  for (const m of machines) {
    const d = Math.hypot(player.position.x - m.obj.position.x, player.position.z - m.obj.position.z) - m.radius;
    if (d < 1.3 && d < bestD) { best = m; bestD = d; }
  }
  return best;
}

function interact(): void {
  if (inspect.isOpen) return inspect.close();
  const m = nearestMachine();
  const st = sim.state;
  if (!m || !st) return;
  const flags = st[H.flags];
  switch (m.kind) {
    case 'engine': inspect.open(m.room); break;
    case 'rack': sim.command(Cmd.Rack, m.room, room(st, m.room, R.rackOn) > 0.5 ? 0 : 1); break;
    case 'pump': sim.command(Cmd.Pump, 0, flags & 1 ? 0 : 1); break;
    case 'chiller': sim.command(Cmd.Chiller, 0, flags & 2 ? 0 : 1); break;
  }
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.repeat) return;
  if (k === 'f') interact();
  else if (k === 'escape') inspect.close();
  else if (k === 'q') cam.yawTarget -= Math.PI / 4;
  else if (k === 'e') cam.yawTarget += Math.PI / 4;
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('pointerdown', () => inspect.isOpen && inspect.close());
renderer.domElement.addEventListener('wheel', (e) => {
  cam.distTarget = THREE.MathUtils.clamp(cam.distTarget + Math.sign(e.deltaY) * 1.5, 8, 26);
}, { passive: true });

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const white = new THREE.Color(0xffffff);
const vis = Array.from({ length: ROOMS }, () => ({ ledger: 0, ref: 0, bell: 0, chimes: -1 }));
let rackTimer = 0;
let elapsed = 0;

function update(dt: number): void {
  elapsed += dt;

  // movement (camera-relative), disabled while hands are inside a machine
  if (!inspect.isOpen) {
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
      const p = player.position;
      if (!blocked(p.x + dx, p.z)) p.x += dx;
      if (!blocked(p.x, p.z + dz)) p.z += dz;
      player.children[0].position.y = Math.abs(Math.sin(elapsed * 11)) * 0.05; // little walk bob
    }
  }

  // camera
  cam.yaw += (cam.yawTarget - cam.yaw) * Math.min(1, dt * 8);
  cam.dist += (cam.distTarget - cam.dist) * Math.min(1, dt * 8);
  const horiz = Math.cos(cam.pitch) * cam.dist;
  camera.position.set(
    player.position.x + Math.sin(cam.yaw) * horiz,
    Math.sin(cam.pitch) * cam.dist,
    player.position.z + Math.cos(cam.yaw) * horiz,
  );
  camera.lookAt(player.position.x, 0.6, player.position.z);

  // interaction hint
  const near = inspect.isOpen ? null : nearestMachine();
  if (near) {
    tmpV.copy(near.obj.position).setY(2.1).project(camera);
    hint.style.left = `${((tmpV.x + 1) / 2) * innerWidth}px`;
    hint.style.top = `${((1 - tmpV.y) / 2) * innerHeight}px`;
    hint.classList.remove('hidden');
  } else hint.classList.add('hidden');

  // world reacts to simulation state
  const st = sim.state;
  if (st) {
    const visScale = Math.min(sim.timeScale, 6);
    S.tempColor(st[H.coolantTemp], supplyMat.color);
    let fSum = 0, tf = 0;
    rackTimer += dt;
    const drawRacks = rackTimer > 0.1;
    if (drawRacks) rackTimer = 0;

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

      const v = vis[i];
      v.ledger += room(st, i, R.ledgerOmega) * visScale * dt;
      v.ref += visScale * dt;
      v.bell = Math.max(0, v.bell - dt * 0.9);
      const chimes = room(st, i, R.chimes);
      if (v.chimes >= 0 && chimes > v.chimes) {
        v.bell = 1;
        const eng = machines.find((m) => m.kind === 'engine' && m.room === i)!;
        const d = player.position.distanceTo(eng.obj.position);
        if (inspect.room === i) chime(0.3);
        else if (d < 9) chime(0.25 * (1 - d / 9));
      }
      v.chimes = chimes;
      engineSprites[i].draw(v.ledger, v.ref, room(st, i, R.valve), room(st, i, R.pbFill), v.bell);
      if (drawRacks) rackSprites[i].draw(room(st, i, R.rackOn) > 0.5, temp, elapsed);
    }
    S.tempColor(fSum > 1e-7 ? tf / fSum : st[H.coolantTemp], returnMat.color);
    inspect.draw(st, dt, sim.timeScale);
  }
  hud.update(dt);
}

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
