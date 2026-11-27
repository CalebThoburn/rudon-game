// Flat vector sprites, drawn once onto canvases with paths (no pixels to scale up):
// people, animals and loose organs, all standing upright on the floor as billboards.
import * as THREE from 'three';

const INK = '#1d1813';
const S = 256; // canvas size; sprites stay crisp up close

type Draw = (g: CanvasRenderingContext2D) => void;

function texture(draw: Draw, w = S, h = S): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = 7;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function blob(g: CanvasRenderingContext2D, fill: string, path: () => void): void {
  g.beginPath();
  path();
  g.fillStyle = fill;
  g.fill();
  g.stroke();
}

function person(body: string, trim: string, skin: string): Draw {
  return (g) => {
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(128, 244, 52, 10, 0, 0, Math.PI * 2); g.fill();
    // legs
    blob(g, '#3a342c', () => { g.roundRect(98, 170, 24, 72, 10); });
    blob(g, '#3a342c', () => { g.roundRect(134, 170, 24, 72, 10); });
    // coverall
    blob(g, body, () => { g.roundRect(78, 92, 100, 100, 34); });
    // arms
    blob(g, body, () => { g.roundRect(58, 102, 26, 70, 13); });
    blob(g, body, () => { g.roundRect(172, 102, 26, 70, 13); });
    // collar / badge
    blob(g, trim, () => { g.roundRect(112, 112, 32, 16, 6); });
    // head
    blob(g, skin, () => { g.arc(128, 62, 36, 0, Math.PI * 2); });
    // eyes
    g.fillStyle = INK;
    g.beginPath(); g.arc(116, 62, 4.5, 0, Math.PI * 2); g.arc(140, 62, 4.5, 0, Math.PI * 2); g.fill();
  };
}

const deadPerson: Draw = (g) => {
  g.translate(128, 200);
  g.rotate(Math.PI / 2);
  g.translate(-128, -150);
  person('#7d7262', '#5a5246', '#b3a58e')(g);
};

const caterpillar = (alive: boolean): Draw => (g) => {
  const body = alive ? '#8fc04a' : '#7a7550';
  const spot = alive ? '#e7d34a' : '#5c5840';
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath(); g.ellipse(128, 236, 92, 10, 0, 0, Math.PI * 2); g.fill();
  for (let k = 4; k >= 0; k--) {
    const x = 60 + k * 34, y = 200 - (alive ? Math.sin(k * 0.9) * 10 : 0);
    blob(g, body, () => { g.arc(x, y, 30, 0, Math.PI * 2); });
    g.fillStyle = spot;
    g.beginPath(); g.arc(x, y - 12, 7, 0, Math.PI * 2); g.fill();
  }
  if (alive) {
    g.fillStyle = INK;
    g.beginPath(); g.arc(200, 190, 5, 0, Math.PI * 2); g.fill();
  }
};

const beetle = (alive: boolean): Draw => (g) => {
  const shell = alive ? '#3a2a1a' : '#5e5144';
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath(); g.ellipse(128, 238, 70, 10, 0, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6;
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    g.beginPath(); g.moveTo(128 + s * 30, 186 + k * 14); g.lineTo(128 + s * 70, 200 + k * 16); g.lineTo(128 + s * 80, 230); g.stroke();
  }
  // antennae: the organ that tastes salt
  g.strokeStyle = alive ? '#c9a46a' : '#7d6f5e';
  g.beginPath(); g.moveTo(112, 140); g.quadraticCurveTo(84, 96, 70, 92); g.moveTo(144, 140); g.quadraticCurveTo(172, 96, 186, 92); g.stroke();
  g.strokeStyle = INK;
  g.lineWidth = 7;
  blob(g, shell, () => { g.ellipse(128, 196, 48, 40, 0, 0, Math.PI * 2); });
  blob(g, '#24180e', () => { g.arc(128, 152, 20, 0, Math.PI * 2); });
  g.beginPath(); g.moveTo(128, 160); g.lineTo(128, 234); g.stroke();
};

const organ = (fill: string, antenna: boolean): Draw => (g) => {
  if (antenna) {
    g.lineWidth = 12;
    g.strokeStyle = INK;
    g.beginPath(); g.moveTo(70, 220); g.quadraticCurveTo(110, 120, 190, 100); g.stroke();
    g.lineWidth = 6;
    g.strokeStyle = fill;
    g.beginPath(); g.moveTo(70, 220); g.quadraticCurveTo(110, 120, 190, 100); g.stroke();
    return;
  }
  blob(g, fill, () => { g.ellipse(128, 200, 44, 30, 0.3, 0, Math.PI * 2); });
};

export interface SpriteSet {
  worker: THREE.SpriteMaterial;
  player: THREE.SpriteMaterial;
  dead: THREE.SpriteMaterial;
  animals: THREE.SpriteMaterial[]; // indexed by agent code (see Elements::agent_data)
}

export function makeSprites(): SpriteSet {
  const m = (d: Draw) => new THREE.SpriteMaterial({ map: texture(d), transparent: true, alphaTest: 0.05 });
  return {
    worker: m(person('#b8743a', '#e9c46a', '#d9b48c')),
    player: m(person('#3f8f8a', '#e9c46a', '#e0bf98')),
    dead: m(deadPerson),
    animals: [
      m(caterpillar(true)), m(beetle(true)), m(caterpillar(false)), m(beetle(false)),
      m(organ('#c9a46a', true)), m(organ('#b5564e', false)),
    ],
  };
}

/// A flat label lying on the floor.
export function floorLabel(label: string, cell: number): THREE.Mesh {
  const text = label.toUpperCase();
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = '600 64px ui-sans-serif, system-ui, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 40;
  c.width = w;
  c.height = 96;
  g.font = '600 64px ui-sans-serif, system-ui, sans-serif';
  g.fillStyle = 'rgba(255,248,230,0.32)';
  g.textBaseline = 'middle';
  g.fillText(text, 20, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const h = cell * 6;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * (w / 96), h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  // lying flat, reading the right way up for the default camera (looking north)
  mesh.rotation.set(-Math.PI / 2, 0, 0);
  return mesh;
}

/// A little round swatch for something carried.
export function carryDot(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  return mesh;
}
