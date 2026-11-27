// Rudon: the building. You are one body among Rudon's employees, made of organs,
// breathing the air of the room you're in. Everything around you is the element
// world (sim/src/elements.rs + el_humans.rs + el_world.rs), drawn as flat vector shapes.
// Zoom in to see what anything is made of; pick it up; put it somewhere else.
import * as THREE from 'three';
import type { FromGame, ToGame } from './worker';
import { VectorFloor } from './vector';
import { carryDot, floorLabel, makeSprites } from './sprites';

const CELL = 0.1;
const MATERIALS = [
  'air', 'steel', 'copper', 'zinc', 'carbon', 'glass', 'concrete', 'rubber', 'gold', 'ice', 'soil', 'plant', 'peanuts',
  'rubble', 'salt crystal', 'sugar crystal', 'dead matter', 'rust', 'mesh', 'flap →', 'flap ↓', 'flap ←', 'flap ↑',
  'paper', 'water main', 'brine spring', 'drain',
];
const PLANT_ORGANS = ['root', 'stem', 'leaf', 'flower'];
const DRAINS = ['drain', 'toilet', 'sewer outfall'];
const SPECIES = [
  'oxygen O₂', 'nitrogen N₂', 'hydrogen H₂', 'carbon dioxide CO₂', 'steam H₂O', 'ammonia NH₃', 'methane CH₄',
  'water H₂O', 'liquid ammonia', 'dissolved ammonia', 'fat C₅₅H₉₈O₆', 'sugar C₁₂H₂₂O₁₁', 'salt NaCl',
  'protein C₅H₈O₂N', 'cellulose C₆H₁₀O₅', 'chitin C₈H₁₃O₅N', 'zinc hydroxide', 'rust Fe₂O₃', 'bone mineral Ca₅(PO₄)₃OH',
];
const SHORT = ['O₂', 'N₂', 'H₂', 'CO₂', 'steam', 'NH₃', 'CH₄', 'water', 'liq. NH₃', 'NH₃(aq)', 'fat', 'sugar', 'salt', 'protein', 'cellulose', 'chitin', 'Zn(OH)₂', 'rust', 'bone'];
const ELEMENTS = ['H', 'C', 'N', 'O', 'Na', 'Cl', 'Si', 'Fe', 'Cu', 'Zn', 'Au', 'Ca', 'P'];
const HUMAN_ORGANS = ['skin', 'lungs', 'heart', 'stomach', 'intestines', 'liver', 'kidneys', 'brain', 'muscle', 'fat', 'bone'];
const BUG_ORGANS = ['cuticle', 'mandibles', 'gut', 'fat body', 'tracheae', 'ganglia', 'antennae', 'legs'];
const GAS_MM = [0.032, 0.028, 0.002, 0.044, 0.018, 0.017, 0.016];
const MAT_COLORS = [
  '#34302a', '#80888e', '#c66b3d', '#aab2ba', '#28282c', '#afd2d7', '#78746c', '#2e2e2e', '#f2c94c', '#d2ebfa', '#6e5234', '#5d8a3a', '#c9a46a',
  '#605c56', '#f0f0f0', '#d9c39a', '#46341e', '#8c4628', '#5a6468', '#3c3c3c', '#3c3c3c', '#3c3c3c', '#3c3c3c', '#e8dec4', '#4a6ea0', '#8c96aa', '#1e1e22',
];
const SPECIES_COLORS = ['#cde', '#cde', '#eee', '#bbb', '#eee', '#dde', '#ddd', '#3c78c8', '#c8dcf0', '#78a0d2', '#d7b946', '#ebe1c8', '#f0f0f0', '#c3a078', '#967850', '#5a4628', '#e1e1e1', '#8c4628', '#eee8dc'];
// keep in step with sim/src/el_world.rs
const ROOMS: [string, number[]][] = [
  ['Archive: past', [1, 1, 54, 78]], ['Archive: future', [56, 1, 109, 78]], ['Peanut farm', [111, 1, 184, 78]],
  ['Kitchen', [186, 1, 240, 78]], ['Sugar plot', [242, 1, 286, 78]], ['Corridor', [1, 80, 286, 95]],
  ['Restrooms', [1, 97, 44, 174]], ['Cafeteria', [46, 97, 150, 174]], ['Brine well', [152, 97, 200, 174]], ['Quarters', [202, 97, 286, 174]],
];
const GOALS = ['standing about', 'going for water', 'going to the toilet', 'going to eat', 'fetching', 'carrying', 'taking it back'];

function codeName(code: number): string {
  if (code >= 60) return SHORT[code - 60] ?? '?';
  return MATERIALS[code] ?? '?';
}
function codeColor(code: number): string {
  if (code >= 60) return SPECIES_COLORS[code - 60] ?? '#fff';
  return MAT_COLORS[code] ?? '#fff';
}
function roomAt(x: number, y: number): string {
  for (const [n, r] of ROOMS) if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) return n;
  return 'wall';
}
const fmtMass = (kg: number) => (kg >= 1 ? `${kg.toFixed(2)} kg` : kg >= 1e-3 ? `${(kg * 1000).toPrecision(3)} g` : `${(kg * 1e6).toPrecision(3)} mg`);
const fmtC = (k: number) => `${(k - 273.15).toFixed(1)} °C`;

// ------------------------------------------------------------------ scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app')!.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14110d);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 200);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

let W = 288, H = 176;
const floor = new VectorFloor(CELL);
scene.add(floor.mesh);
const sprites = makeSprites();
// cell x → world +x (east), cell y → world +z (south): with the camera at yaw 0, north is up the screen
const cellToWorld = (cx: number, cy: number) => new THREE.Vector3((cx + 0.5) * CELL - W * CELL / 2, 0, (cy + 0.5) * CELL - H * CELL / 2);
const worldToCell = (p: THREE.Vector3) => [Math.floor((p.x + W * CELL / 2) / CELL), Math.floor((p.z + H * CELL / 2) / CELL)] as const;

for (const [name, r] of ROOMS) {
  const l = floorLabel(name, CELL);
  const c = cellToWorld((r[0] + r[2]) / 2, name === 'Corridor' ? 88 : r[1] + 6);
  l.position.set(c.x, 0.003, c.z);
  scene.add(l);
}

// hover outline
const hoverBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(CELL, CELL)), new THREE.LineBasicMaterial({ color: 0xe9c46a }));
hoverBox.rotation.x = -Math.PI / 2;
scene.add(hoverBox);
// reach ring
const reach = new THREE.Mesh(new THREE.RingGeometry(2.0 - 0.006, 2.0, 96), new THREE.MeshBasicMaterial({ color: 0xe9c46a, transparent: true, opacity: 0.25 }));
reach.rotation.x = -Math.PI / 2;
scene.add(reach);

// people and animals
interface Body { sprite: THREE.Sprite; dot: THREE.Mesh; pos: THREE.Vector3; seen: boolean }
const bodies = new Map<string, Body>();
function body(key: string): Body {
  let b = bodies.get(key);
  if (!b) {
    const sprite = new THREE.Sprite(sprites.worker);
    sprite.center.set(0.5, 0.02);
    const dot = carryDot();
    scene.add(sprite, dot);
    b = { sprite, dot, pos: new THREE.Vector3(), seen: false };
    bodies.set(key, b);
  }
  return b;
}

// ------------------------------------------------------------------ simulation
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const post = (m: ToGame) => worker.postMessage(m);
post({ type: 'init', wasmUrl: new URL(`sim.wasm?v=${__BUILD__}`, document.baseURI).href });
let simTime = 0, stepMs = 0;
let player: Float32Array = new Float32Array(96);
let people: Float32Array = new Float32Array(0);
let probe: { data: Float32Array; x: number; y: number } | null = null;
let ready = false;

worker.onmessage = (e: MessageEvent<FromGame>) => {
  const m = e.data;
  if (m.type === 'probe') { probe = m; return; }
  if (m.type === 'result') {
    if (!m.ok) toast(m.what === 'pick' ? 'Out of reach, or nothing to take.' : "That won't go there.");
    else if (m.what === 'place') selected = -1;
    return;
  }
  W = m.w; H = m.h;
  floor.update(m.rgba, W, H);
  simTime = m.time; stepMs = m.stepMs;
  player = m.player;
  people = m.people;
  for (const b of bodies.values()) b.seen = false;
  // animals and loose organs
  const n = m.agents.length / 3;
  const count = new Map<string, number>();
  for (let k = 0; k < n; k++) {
    const code = m.agents[k * 3 + 2];
    const kind = `a${code}`;
    const idx = count.get(kind) ?? 0;
    count.set(kind, idx + 1);
    const b = body(`${kind}:${idx}`);
    b.sprite.material = sprites.animals[code] ?? sprites.animals[5];
    const s = code <= 3 ? 0.16 : 0.1;
    b.sprite.scale.set(s, s, 1);
    place(b, m.agents[k * 3], m.agents[k * 3 + 1], 0);
  }
  for (let k = 0; k < people.length / 8; k++) {
    const o = k * 8;
    const b = body(`p${people[o + 7]}`);
    const alive = people[o + 3] > 0;
    b.sprite.material = !alive ? sprites.dead : people[o + 2] > 0 ? sprites.player : sprites.worker;
    b.sprite.scale.set(0.62, 0.62, 1);
    place(b, people[o], people[o + 1], people[o + 5]);
  }
  for (const [key, b] of bodies) if (!b.seen) { scene.remove(b.sprite, b.dot); bodies.delete(key); }
  if (!ready) {
    ready = true;
    const c = cellToWorld(player[8], player[9]);
    cam.x = c.x; cam.z = c.z;
  }
};

function place(b: Body, cx: number, cy: number, carry: number): void {
  const target = cellToWorld(cx, cy);
  if (!b.seen && b.pos.lengthSq() === 0) b.pos.copy(target);
  b.sprite.userData.target = target;
  b.seen = true;
  b.dot.visible = carry > 0;
  if (carry > 0) (b.dot.material as THREE.MeshBasicMaterial).color.set(codeColor(carry));
}

// ------------------------------------------------------------------ input
const cam = { x: 0, z: 0, dist: 4.5, yaw: 0, pitch: 0.95, yawTarget: 0, free: false };
const keys = new Set<string>();
let selected = -1;
let hover: [number, number] | null = null;
let lastMove = '';

function sendMove(): void {
  let f = 0, r = 0;
  if (keys.has('w') || keys.has('arrowup')) f += 1;
  if (keys.has('s') || keys.has('arrowdown')) f -= 1;
  if (keys.has('d') || keys.has('arrowright')) r += 1;
  if (keys.has('a') || keys.has('arrowleft')) r -= 1;
  // screen directions in cell coordinates (see VectorFloor.setView)
  const yaw = cam.yawTarget;
  const fx = -Math.sin(yaw), fy = -Math.cos(yaw);
  const rx = Math.cos(yaw), ry = -Math.sin(yaw);
  const dx = Math.round(f * fx + r * rx), dy = Math.round(f * fy + r * ry);
  const key = `${dx},${dy}`;
  if (key !== lastMove) { lastMove = key; post({ type: 'input', dx, dy, act: 0 }); }
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (keys.has(k)) return;
  keys.add(k);
  if (k === 'q') cam.yawTarget -= Math.PI / 2;
  if (k === 'e') cam.yawTarget += Math.PI / 2;
  if (k === 'f') post({ type: 'input', dx: 0, dy: 0, act: 1 });
  if (k === 'g') post({ type: 'input', dx: 0, dy: 0, act: 2 });
  if (k === 't') post({ type: 'input', dx: 0, dy: 0, act: 3 });
  if (k === 'escape') selected = -1;
  if (k === 'v') { viewMode = (viewMode + 1) % 4; post({ type: 'mode', value: viewMode }); }
  const slot = '1234567890-='.indexOf(k);
  if (slot >= 0) selected = selected === slot ? -1 : slot;
  sendMove();
});
addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); sendMove(); });
addEventListener('blur', () => { keys.clear(); sendMove(); });
renderer.domElement.addEventListener('wheel', (e) => {
  cam.dist = THREE.MathUtils.clamp(cam.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 0.6, 22);
}, { passive: true });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let mouse = { x: 0, y: 0 };
addEventListener('pointermove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!hover || e.button !== 0) return;
  if (selected >= 0 && selected < player[12]) post({ type: 'place', x: hover[0], y: hover[1], slot: selected });
  else post({ type: 'pick', x: hover[0], y: hover[1] });
});
let viewMode = 0;

// ------------------------------------------------------------------ HUD
const vitals = document.getElementById('vitals')!;
const readout = document.getElementById('readout')!;
const bag = document.getElementById('bag')!;
const toastEl = document.getElementById('toast')!;
const speedEl = document.getElementById('speed')!;
let toastTimer = 0;
function toast(s: string): void { toastEl.textContent = s; toastEl.classList.remove('hidden'); toastTimer = 2.5; }

for (const [v, l] of [[0, '❚❚'], [1, '×1'], [4, '×4'], [16, '×16']] as const) {
  const b = document.createElement('button');
  b.textContent = l;
  b.onclick = () => { post({ type: 'speed', value: v }); for (const c of speedEl.children) c.classList.remove('on'); b.classList.add('on'); };
  if (v === 1) b.classList.add('on');
  speedEl.append(b);
}

function bar(label: string, frac: number, text: string, bad: boolean): string {
  const pct = Math.round(THREE.MathUtils.clamp(frac, 0, 1) * 100);
  return `<div class="row"><span class="lbl">${label}</span><span class="bar${bad ? ' bad' : ''}"><i style="width:${pct}%"></i></span><span class="val">${text}</span></div>`;
}

function renderVitals(): void {
  const p = player;
  if (!ready) { vitals.innerHTML = 'starting the building…'; return; }
  if (p[0] === 0) {
    vitals.innerHTML = `<b>You died.</b><br>${fmtC(p[1])} core · brain ${(p[4] * 100).toFixed(0)}%<br><button id="again">start again</button>`;
    document.getElementById('again')!.onclick = () => post({ type: 'reset' });
    return;
  }
  const core = p[1];
  const o2 = p[64];
  vitals.innerHTML = [
    `<div class="title">${roomAt(p[8], p[9])}</div>`,
    bar('body', (core - 305) / 9, fmtC(core), core < 308.5 || core > 311.5),
    bar('fed', 1 - p[2], p[2] > 0.7 ? 'hungry' : p[2] > 0.3 ? 'peckish' : 'fed', p[2] > 0.7),
    bar('water', 1 - p[3], p[3] > 0.5 ? 'parched' : p[3] > 0.15 ? 'thirsty' : 'fine', p[3] > 0.5),
    bar('bladder', (p[6] + p[7]) / 0.5, fmtMass(p[6] + p[7]), p[6] + p[7] > 0.4),
    bar('brain', p[4], `${(p[4] * 100).toFixed(0)}%`, p[4] < 0.7),
    `<div class="air">air ${fmtC(p[65])} · O₂ ${(o2 * 100).toFixed(1)}% · humidity ${(p[66] * 100).toFixed(0)}%</div>`,
  ].join('');
}

function renderBag(): void {
  const n = player[12] | 0;
  const slots: string[] = [];
  for (let k = 0; k < 12; k++) {
    const code = player[13 + k * 2], kg = player[14 + k * 2];
    const key = '1234567890-='[k];
    slots.push(k < n
      ? `<div class="slot${selected === k ? ' on' : ''}" title="${codeName(code)}"><i style="background:${codeColor(code)}"></i><b>${key}</b><span>${codeName(code)}<br>${fmtMass(kg)}</span></div>`
      : `<div class="slot empty"><b>${key}</b></div>`);
  }
  bag.innerHTML = slots.join('');
}

function renderReadout(): void {
  if (!hover || !probe || probe.x !== hover[0] || probe.y !== hover[1]) { readout.classList.add('hidden'); return; }
  readout.classList.remove('hidden');
  const d = probe.data;
  const mat = d[0] | 0;
  const mass = d[5];
  const detail = cam.dist < 3 ? 2 : cam.dist < 8 ? 1 : 0; // closer looks show finer structure
  const lines: string[] = [];
  const room = roomAt(hover[0], hover[1]);
  let name = MATERIALS[mat];
  if (d[35] > 0) name = d[37] ? (d[36] === 0 ? 'a caterpillar' : 'a beetle') : (d[36] === 0 ? 'a dead caterpillar' : 'a dead beetle');
  if (d[71] > 0) name = d[74] ? (d[72] ? 'you' : 'a worker') : 'a dead worker';
  lines.push(`<div class="title">${name} <small>${room}</small></div>`);
  lines.push(`<div>${fmtC(d[1])}${mat === 0 || mat === 18 || mat >= 24 ? ` · ${(d[2] / 1000).toFixed(1)} kPa` : ''} · ${fmtMass(mass)}${d[4] > 0 ? ' · ⚡' : ''}</div>`);
  if (detail >= 1) {
    let gasMol = 0;
    for (let s = 0; s < 7; s++) gasMol += d[6 + s] / GAS_MM[s];
    const rows: [number, string][] = [];
    for (let s = 0; s < 19; s++) {
      const kg = d[s < 18 ? 6 + s : 89];
      if (kg < mass * 2e-4 || kg < 1e-9) continue;
      const share = s < 7 && gasMol > 0 ? ` (${((kg / GAS_MM[s] / gasMol) * 100).toFixed(1)}%)` : '';
      rows.push([kg, `<div class="cmp"><i style="background:${SPECIES_COLORS[s]}"></i>${SPECIES[s]}<span>${fmtMass(kg)}${share}</span></div>`]);
    }
    rows.sort((a, b) => b[0] - a[0]);
    lines.push(...rows.slice(0, detail >= 2 ? 19 : 6).map((r) => r[1]));
  }
  if (detail >= 2) {
    const els = ELEMENTS.map((n, e) => [n, d[e < 11 ? 24 + e : 87 + e - 11]] as const).filter(([, kg]) => kg > mass * 1e-4).sort((a, b) => b[1] - a[1]);
    lines.push(`<div class="els">${els.map(([n, kg]) => `${n} ${((kg / mass) * 100).toFixed(kg / mass > 0.1 ? 0 : 1)}%`).join(' · ')}</div>`);
    if (d[35] > 0) {
      lines.push(`<div class="sub">nerves ${(d[38] * 100).toFixed(0)}% · tastes salt ${(d[39] * 100).toFixed(2)}% sugar ${(d[40] * 100).toFixed(1)}%</div>`);
      for (let k = 0; k < 8; k++) lines.push(`<div class="cmp">${BUG_ORGANS[k]}<span>${fmtMass(d[42 + k * 3])} · ${(d[43 + k * 3] * 100).toFixed(0)}%</span></div>`);
    }
    if (d[66] > 0) lines.push(`<div class="sub">a severed ${BUG_ORGANS[d[67] | 0]}: ${d[68] > 0 ? `alive ${(d[68] * 100).toFixed(0)}%` : 'dead'}${d[67] === 6 ? `, tasting salt ${(d[69] * 100).toFixed(2)}%` : ''}</div>`);
    if (d[71] > 0) {
      lines.push(`<div class="sub">core ${fmtC(d[73])}</div>`);
      for (let k = 0; k < 11; k++) lines.push(`<div class="cmp">${HUMAN_ORGANS[k]}<span>${fmtMass(d[75 + k])}</span></div>`);
    }
  } else if (detail === 0) {
    lines.push('<div class="sub">zoom in to see what it is made of</div>');
  }
  readout.innerHTML = lines.join('');
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let probeTimer = 0, hudTimer = 0;
function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  // follow the player
  if (ready && !cam.free) {
    const c = cellToWorld(player[8], player[9]);
    cam.x += (c.x - cam.x) * Math.min(1, dt * 4);
    cam.z += (c.z - cam.z) * Math.min(1, dt * 4);
    reach.position.set(c.x, 0.004, c.z);
  }
  cam.yaw += (cam.yawTarget - cam.yaw) * Math.min(1, dt * 8);
  const horiz = Math.cos(cam.pitch) * cam.dist;
  camera.position.set(cam.x + Math.sin(cam.yaw) * horiz, Math.sin(cam.pitch) * cam.dist, cam.z + Math.cos(cam.yaw) * horiz);
  camera.lookAt(cam.x, 0, cam.z);
  floor.setView(cam.yaw, simTime);

  for (const b of bodies.values()) {
    const t = b.sprite.userData.target as THREE.Vector3 | undefined;
    if (t) b.pos.lerp(t, Math.min(1, dt * 10));
    b.sprite.position.copy(b.pos);
    b.dot.position.set(b.pos.x, b.sprite.scale.y * 0.95, b.pos.z);
    b.dot.quaternion.copy(camera.quaternion);
  }

  ray.setFromCamera(new THREE.Vector2((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1), camera);
  const p = new THREE.Vector3();
  hover = null;
  if (ray.ray.intersectPlane(ground, p)) {
    const [cx, cy] = worldToCell(p);
    if (cx >= 0 && cy >= 0 && cx < W && cy < H) hover = [cx, cy];
  }
  hoverBox.visible = !!hover;
  if (hover) { const c = cellToWorld(hover[0], hover[1]); hoverBox.position.set(c.x, 0.005, c.z); }

  probeTimer -= dt;
  if (hover && probeTimer <= 0) { post({ type: 'probe', x: hover[0], y: hover[1] }); probeTimer = 0.15; }
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.2;
    renderVitals();
    renderBag();
    renderReadout();
    document.getElementById('clock')!.textContent = `${Math.floor(simTime / 3600)}h ${String(Math.floor(simTime / 60) % 60).padStart(2, '0')}m · sim ${stepMs.toFixed(0)} ms · ${['matter', 'heat', 'pressure', 'oxygen'][viewMode]} (V)`;
  }
  toastTimer -= dt;
  if (toastTimer <= 0) toastEl.classList.add('hidden');
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { __game: unknown }).__game = { post, cam, look: (x: number, y: number, d = 4) => { const c = cellToWorld(x, y); cam.free = true; cam.x = c.x; cam.z = c.z; cam.dist = d; }, get player() { return player; }, get people() { return people; }, probeOf: () => probe };
void GOALS;
void PLANT_ORGANS;
void DRAINS;
