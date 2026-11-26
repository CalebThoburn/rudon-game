// Prototype 02: the element world. Matter itself is simulated (see sim/src/elements.rs).
// There are no inspect panels: zoom in until you can see the 10 cm cells, then
// dig, build, pour, heat, spark. Pipes, walls and machines are all just cells.
import * as THREE from 'three';
import type { FromElem, ToElem } from './worker';

const CELL = 0.1; // metres

export const MATERIALS = [
  'open', 'steel', 'copper', 'zinc', 'carbon', 'glass', 'concrete', 'rubber', 'gold', 'ice', 'soil', 'plant', 'peanut',
  'rubble', 'salt', 'sugar', 'organic matter', 'rust', 'mesh', 'flap →', 'flap ↓', 'flap ←', 'flap ↑',
];
export const SPECIES = [
  'O₂', 'N₂', 'H₂', 'CO₂', 'steam', 'NH₃ gas', 'methane', 'water', 'liquid NH₃', 'NH₃ (dissolved)',
  'fat C₅₅H₉₈O₆', 'sugar C₁₂H₂₂O₁₁', 'salt NaCl', 'protein C₅H₈O₂N', 'cellulose C₆H₁₀O₅', 'chitin C₈H₁₃O₅N', 'spent zinc Zn(OH)₂', 'rust Fe₂O₃',
];
const ELEMENTS = ['H', 'C', 'N', 'O', 'Na', 'Cl', 'Si', 'Fe', 'Cu', 'Zn', 'Au'];
const ORGANS = ['cuticle', 'mandibles', 'gut', 'fat body', 'tracheae', 'ganglia', 'antennae', 'legs'];
const GAS_MM = [0.032, 0.028, 0.002, 0.044, 0.018, 0.017, 0.016];
const MAT_COLORS = [
  '#34302a', '#80888e', '#c66b3d', '#aab2ba', '#28282c', '#afd2d7', '#78746c', '#2e2e2e', '#f2c94c', '#d2ebfa', '#6e5234', '#5d8a3a', '#c9a46a',
  '#605c56', '#f0f0f0', '#d9c39a', '#46341e', '#8c4628', '#5a6468', '#3c3c3c', '#3c3c3c', '#3c3c3c', '#3c3c3c',
];
const BUILDABLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 19, 20, 21, 22];
const POURABLE: [number, string][] = [
  [0, 'O₂'], [1, 'N₂'], [2, 'H₂'], [3, 'CO₂'], [6, 'methane'], [7, 'water'], [8, 'liquid NH₃'],
  [10, 'fat'], [11, 'sugar'], [12, 'salt'], [13, 'protein'], [14, 'cellulose'],
  [100, 'peanut butter (plain)'], [101, 'peanut butter (salty-sweet)'],
];

// ------------------------------------------------------------------ scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app')!.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17140f);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 200);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

let W = 192, H = 128;
let tex: THREE.DataTexture | null = null;
const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

// animals
const agentGeo = new THREE.BufferGeometry();
const agentMat = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, sizeAttenuation: true });
const agentPts = new THREE.Points(agentGeo, agentMat);
agentPts.position.y = 0.01;
scene.add(agentPts);

// brush outline
const brush = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
  new THREE.LineBasicMaterial({ color: 0xe9c46a }),
);
brush.rotation.x = -Math.PI / 2;
brush.position.y = 0.012;
scene.add(brush);

const cellToWorld = (cx: number, cy: number) => new THREE.Vector3((cx + 0.5) * CELL - W * CELL / 2, 0, H * CELL / 2 - (cy + 0.5) * CELL);
const worldToCell = (p: THREE.Vector3) => [Math.floor((p.x + W * CELL / 2) / CELL), Math.floor((H * CELL / 2 - p.z) / CELL)] as const;

// ------------------------------------------------------------------ simulation
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const post = (m: ToElem) => worker.postMessage(m);
post({ type: 'init', wasmUrl: new URL(`sim.wasm?v=${__BUILD__}`, document.baseURI).href, which: 0 });
let simTime = 0, stepMs = 0, agentCount = 0;
let probe: { data: Float32Array; x: number; y: number } | null = null;

worker.onmessage = (e: MessageEvent<FromElem>) => {
  const m = e.data;
  if (m.type === 'probe') { probe = m; return; }
  if (!tex || m.w !== W || m.h !== H) {
    W = m.w; H = m.h;
    tex = new THREE.DataTexture(m.rgba, W, H, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    (plane.material as THREE.MeshBasicMaterial).map = tex;
    (plane.material as THREE.MeshBasicMaterial).needsUpdate = true;
    plane.scale.set(W * CELL, H * CELL, 1);
  } else {
    (tex.image.data as Uint8Array).set(m.rgba);
    tex.needsUpdate = true;
  }
  simTime = m.time; stepMs = m.stepMs;
  agentCount = m.agents.length / 3;
  const pos = new Float32Array(agentCount * 3), col = new Float32Array(agentCount * 3);
  for (let k = 0; k < agentCount; k++) {
    const p = cellToWorld(m.agents[k * 3], m.agents[k * 3 + 1]);
    pos.set([p.x, 0, p.z], k * 3);
    const MARK: number[][] = [[0.55, 0.85, 0.3], [0.08, 0.05, 0.02], [0.4, 0.45, 0.2], [0.35, 0.22, 0.1], [0.95, 0.85, 0.3], [0.9, 0.5, 0.55]];
    col.set(MARK[m.agents[k * 3 + 2]] ?? [1, 1, 1], k * 3);
  }
  agentGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  agentGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
};

// ------------------------------------------------------------------ tools (UI)
type Tool = 'inspect' | 'dig' | 'build' | 'pour' | 'heat' | 'cool' | 'spark' | 'caterpillar' | 'beetle' | 'scalpel';
const state = { tool: 'inspect' as Tool, mat: 1, species: 7, size: 1, speed: 1, mode: 0 };
const bar = document.getElementById('toolbar')!;
const sub = document.getElementById('palette')!;

function button(label: string, on: () => void, active: boolean, title = '', swatch?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title || label;
  if (swatch) { b.style.borderLeft = `14px solid ${swatch}`; }
  if (active) b.classList.add('on');
  b.onclick = () => { on(); renderUi(); };
  return b;
}
function renderUi(): void {
  bar.replaceChildren(
    ...(['inspect', 'dig', 'build', 'pour', 'heat', 'cool', 'spark', 'caterpillar', 'beetle', 'scalpel'] as Tool[]).map((t) =>
      button(t, () => (state.tool = t), state.tool === t, t === 'scalpel' ? 'cut an animal into its organs (only when zoomed right in)' : t)),
    sep(),
    ...[1, 3, 5].map((s) => button(`${s}×${s}`, () => (state.size = s), state.size === s, 'brush size')),
    sep(),
    ...[[0, '❚❚'], [1, '×1'], [4, '×4'], [16, '×16']].map(([v, l]) => button(String(l), () => { state.speed = Number(v); post({ type: 'speed', value: Number(v) }); }, state.speed === v, 'game time per real second')),
    sep(),
    ...['matter', 'heat', 'pressure', 'oxygen'].map((l, k) => button(l, () => { state.mode = k; post({ type: 'mode', value: k }); }, state.mode === k, 'view')),
    sep(),
    button('reset', () => post({ type: 'reset', which: 0 }), false, 'rebuild the demo room'),
    button('empty', () => post({ type: 'reset', which: 1 }), false, 'an empty room'),
  );
  sub.replaceChildren();
  if (state.tool === 'build') sub.append(...BUILDABLE.map((m) => button(MATERIALS[m], () => (state.mat = m), state.mat === m, '', MAT_COLORS[m])));
  if (state.tool === 'pour') sub.append(...POURABLE.map(([s, label]) => button(label, () => (state.species = s), state.species === s)));
  sub.classList.toggle('hidden', !sub.childElementCount);
}
function sep(): HTMLElement {
  const s = document.createElement('span');
  s.className = 'sep';
  return s;
}
renderUi();

// ------------------------------------------------------------------ camera & input
const cam = { x: 0, z: 0, dist: 16, yaw: 0, pitch: 1.05 };
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === 'q') cam.yaw -= Math.PI / 4;
  if (e.key === 'e') cam.yaw += Math.PI / 4;
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
renderer.domElement.addEventListener('wheel', (e) => {
  cam.dist = THREE.MathUtils.clamp(cam.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 0.8, 24);
}, { passive: true });

const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let hover: [number, number] | null = null;
let painting = false;
let panning: { x: number; y: number } | null = null;
let lastPaint = 0;

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 2 || e.button === 1) { panning = { x: e.clientX, y: e.clientY }; return; }
  painting = state.tool !== 'inspect';
  lastPaint = 0;
});
addEventListener('pointerup', () => { painting = false; panning = null; });
addEventListener('pointermove', (e) => {
  if (panning) {
    const k = cam.dist * 0.0016;
    const dx = (e.clientX - panning.x) * k, dz = (e.clientY - panning.y) * k;
    cam.x -= dx * Math.cos(cam.yaw) + dz * Math.sin(cam.yaw);
    cam.z -= -dx * Math.sin(cam.yaw) + dz * Math.cos(cam.yaw);
    panning = { x: e.clientX, y: e.clientY };
  }
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const p = new THREE.Vector3();
  if (ray.ray.intersectPlane(ground, p)) {
    const [cx, cy] = worldToCell(p);
    hover = cx >= 0 && cy >= 0 && cx < W && cy < H ? [cx, cy] : null;
  }
});

function applyTool(): void {
  if (!hover) return;
  const r = Math.floor(state.size / 2);
  const edits: [number, number, number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = hover[0] + dx, y = hover[1] + dy;
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
    switch (state.tool) {
      case 'dig': edits.push([x, y, 0, 0]); break;
      case 'build': edits.push([x, y, 1, state.mat]); break;
      case 'pour': edits.push([x, y, 2, state.species]); break;
      case 'heat': edits.push([x, y, 3, 25]); break;
      case 'cool': edits.push([x, y, 3, -25]); break;
      case 'spark': edits.push([x, y, 4, 0]); break;
      case 'caterpillar': if (dx === 0 && dy === 0) edits.push([x, y, 5, 0]); break;
      case 'beetle': if (dx === 0 && dy === 0) edits.push([x, y, 5, 1]); break;
      // the scalpel is delicate work: it only works zoomed right in, one cell at a time
      case 'scalpel': if (dx === 0 && dy === 0 && cam.dist < 2.5) edits.push([x, y, 6, 0]); break;
    }
  }
  if (edits.length) post({ type: 'edits', edits });
}

// ------------------------------------------------------------------ HUD
const hud = document.getElementById('hud')!;
let probeTimer = 0;
function hudText(): string {
  const lines = [
    'RUDON · PROTOTYPE 02 · ELEMENTS (debug readout)',
    `game time ${simTime.toFixed(1)} s   step ${stepMs.toFixed(1)} ms   animals & organs ${agentCount}   cell ${hover ? hover.join(',') : '-'}${state.tool === 'scalpel' && cam.dist >= 2.5 ? '   (zoom in to use the scalpel)' : ''}`,
  ];
  if (probe && hover && probe.x === hover[0] && probe.y === hover[1]) {
    const d = probe.data;
    const mat = d[0] | 0;
    const mass = d[5];
    lines.push(`${MATERIALS[mat]}   ${(d[1] - 273.15).toFixed(1)} °C${mat === 0 || mat >= 18 ? `   ${(d[2] / 1000).toFixed(1)} kPa` : ''}${d[4] > 0 ? '   ⚡' : ''}   ${(mass * 1000).toPrecision(3)} g`);
    // what it's made of, element by element
    const els = ELEMENTS.map((n, e) => [n, d[24 + e]] as const).filter(([, kg]) => kg > mass * 1e-4).sort((a, b) => b[1] - a[1]);
    lines.push('  elements: ' + els.map(([n, kg]) => `${n} ${((kg / mass) * 100).toFixed(kg / mass > 0.1 ? 0 : 1)}%`).join('  '));
    let gasMol = 0;
    for (let s = 0; s < 7; s++) gasMol += d[6 + s] / GAS_MM[s];
    for (let s = 0; s < 18; s++) {
      const kg = d[6 + s];
      if (kg < 1e-9) continue;
      const share = s < 7 && gasMol > 0 ? `  ${((d[6 + s] / GAS_MM[s] / gasMol) * 100).toFixed(1)}%` : '';
      lines.push(`  ${SPECIES[s].padEnd(22)} ${(kg * 1000).toPrecision(3)} g${share}`);
    }
    if (d[35] > 0) {
      const kind = d[36] === 0 ? 'caterpillar' : 'beetle';
      lines.push(`${d[37] ? '' : 'dead '}${kind}${d[35] > 1 ? ` (+${d[35] - 1} more)` : ''}   ${(d[41] * 1000).toFixed(2)} g   nerves ${(d[38] * 100).toFixed(0)}%   tastes salt ${(d[39] * 100).toFixed(2)}%, sugar ${(d[40] * 100).toFixed(1)}%`);
      for (let k = 0; k < 8; k++) {
        lines.push(`  ${ORGANS[k].padEnd(10)} ${(d[42 + k * 3] * 1e6).toFixed(1).padStart(6)} mg   health ${(d[43 + k * 3] * 100).toFixed(0).padStart(3)}%   water ${(d[44 + k * 3] * 100).toFixed(0)}%`);
      }
    }
    if (d[66] > 0) {
      lines.push(`loose ${ORGANS[d[67] | 0]}${d[66] > 1 ? ` (+${d[66] - 1} more)` : ''}: ${(d[70] * 1e6).toFixed(1)} mg, ${d[68] > 0 ? `alive ${(d[68] * 100).toFixed(0)}%` : 'dead'}${d[67] === 6 ? `, tastes salt ${(d[69] * 100).toFixed(2)}%` : ''}`);
    }
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  const speedPan = cam.dist * 0.8 * dt;
  let fx = 0, fz = 0;
  if (keys.has('w') || keys.has('arrowup')) fz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) fz += 1;
  if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
  if (keys.has('d') || keys.has('arrowright')) fx += 1;
  cam.x += (fx * Math.cos(cam.yaw) + fz * Math.sin(cam.yaw)) * speedPan;
  cam.z += (-fx * Math.sin(cam.yaw) + fz * Math.cos(cam.yaw)) * speedPan;
  const horiz = Math.cos(cam.pitch) * cam.dist;
  camera.position.set(cam.x + Math.sin(cam.yaw) * horiz, Math.sin(cam.pitch) * cam.dist, cam.z + Math.cos(cam.yaw) * horiz);
  camera.lookAt(cam.x, 0, cam.z);
  agentMat.size = Math.max(0.05, Math.min(0.12, cam.dist * 0.01));

  if (hover) {
    const c = cellToWorld(hover[0], hover[1]);
    brush.visible = true;
    brush.position.set(c.x, 0.012, c.z);
    brush.scale.set(state.size * CELL, state.size * CELL, 1);
  } else brush.visible = false;

  if (painting) {
    lastPaint -= dt;
    if (lastPaint <= 0) { applyTool(); lastPaint = 0.06; }
  }
  probeTimer -= dt;
  if (hover && probeTimer <= 0) { post({ type: 'probe', x: hover[0], y: hover[1] }); probeTimer = 0.15; }
  hud.textContent = hudText();

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Debug handle for tests from the browser console.
(window as unknown as { __elem: unknown }).__elem = { post, cam, state, probeOf: () => probe };
