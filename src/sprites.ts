// Procedurally drawn sprites: placeholder art in the target style
// (flat, thick ink outlines, muted corporate palette). No image assets needed.
import * as THREE from 'three';

const INK = '#2a2118';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return [c, g];
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipMapLinearFilter;
  return t;
}

function inked(g: CanvasRenderingContext2D, fill: string, width = 4): void {
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = width;
  g.stroke();
}


/** A billboard sprite anchored at its feet, with a soft ground shadow. */
export function makeSprite(tex: THREE.Texture, w: number, h: number): THREE.Group {
  const group = new THREE.Group();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
  sprite.center.set(0.5, 0.02);
  sprite.scale.set(w, h, 1);
  group.add(sprite);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(w * 0.42, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  shadow.scale.set(1, 0.6, 1);
  group.add(shadow);
  return group;
}

// ---------------- player: a plumber in overalls ----------------
export function playerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(96, 144);
  // legs
  g.beginPath(); g.roundRect(30, 96, 14, 38, 4); inked(g, '#2f4a6b');
  g.beginPath(); g.roundRect(52, 96, 14, 38, 4); inked(g, '#2f4a6b');
  // boots
  g.beginPath(); g.ellipse(36, 134, 11, 6, 0, 0, Math.PI * 2); inked(g, '#3a2a1c');
  g.beginPath(); g.ellipse(60, 134, 11, 6, 0, 0, Math.PI * 2); inked(g, '#3a2a1c');
  // body (overalls over a shirt)
  g.beginPath(); g.roundRect(24, 52, 48, 54, 10); inked(g, '#c9b98f');
  g.beginPath(); g.roundRect(28, 66, 40, 42, 6); inked(g, '#3d6a9e');
  g.fillStyle = '#e9c46a'; g.fillRect(31, 70, 5, 5); g.fillRect(60, 70, 5, 5);
  // arms
  g.beginPath(); g.roundRect(14, 56, 12, 36, 5); inked(g, '#c9b98f');
  g.beginPath(); g.roundRect(70, 56, 12, 36, 5); inked(g, '#c9b98f');
  // head
  g.beginPath(); g.arc(48, 36, 20, 0, Math.PI * 2); inked(g, '#e8c9a4');
  // cap
  g.beginPath(); g.arc(48, 30, 20, Math.PI, 0); g.lineTo(70, 32); g.lineTo(26, 32); inked(g, '#3d6a9e');
  g.beginPath(); g.ellipse(58, 31, 14, 4, 0, 0, Math.PI * 2); inked(g, '#2f4a6b', 3);
  // eyes: two dots, a little tired
  g.fillStyle = INK;
  g.beginPath(); g.arc(41, 40, 2.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(55, 40, 2.4, 0, Math.PI * 2); g.fill();
  g.lineWidth = 2; g.beginPath(); g.moveTo(43, 49); g.lineTo(53, 48); g.stroke();
  // badge
  g.beginPath(); g.rect(33, 80, 10, 8); inked(g, '#f1ead6', 2);
  return texture(c);
}

// ---------------- the transport you arrived in ----------------
export function wreckTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(384, 192);
  g.save(); g.translate(192, 110); g.rotate(-0.12);
  // hull: a long capsule, crumpled at the nose
  g.beginPath();
  g.moveTo(-170, -30); g.lineTo(120, -40); g.lineTo(150, -20); g.lineTo(135, 5); g.lineTo(160, 30); g.lineTo(-170, 40);
  g.quadraticCurveTo(-190, 5, -170, -30);
  inked(g, '#c9c2b0', 5);
  g.fillStyle = '#3d6a9e'; g.fillRect(-160, 8, 290, 10); // company stripe
  // windows, one smashed
  for (let k = 0; k < 6; k++) {
    g.beginPath(); g.roundRect(-140 + k * 42, -22, 30, 20, 5); inked(g, k === 4 ? '#1a1a1a' : '#5d7d96', 3);
  }
  g.strokeStyle = '#e9f4fb'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(32, -20); g.lineTo(40, -10); g.lineTo(36, -2); g.moveTo(40, -10); g.lineTo(52, -14); g.stroke();
  // torn panel and a dent
  g.beginPath(); g.moveTo(80, 20); g.lineTo(110, 26); g.lineTo(96, 40); g.closePath(); inked(g, '#8f897a', 3);
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(-60, 10, 30, -0.6, 0.6); g.stroke();
  g.restore();
  // scattered debris
  g.fillStyle = INK;
  for (const [x, y, w, h] of [[30, 170, 14, 6], [300, 176, 18, 5], [340, 160, 8, 8], [70, 182, 6, 6]]) g.fillRect(x, y, w, h);
  return texture(c);
}

// ---------------- surfaces ----------------
export function carpetTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#b8a67a'; g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = Math.random() < 0.5 ? '#a8966b' : '#c4b386';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.strokeStyle = '#9d8b60'; g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, 127, 127);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function tileTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? '#d9d2bf' : '#cfc7b1';
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  g.strokeStyle = '#b3aa92'; g.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32, 128); g.stroke();
    g.beginPath(); g.moveTo(0, k * 32); g.lineTo(128, k * 32); g.stroke();
  }
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function wallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#d8c98f'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#cbbb7f';
  for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64);
  g.fillStyle = '#8f7f52'; g.fillRect(0, 56, 64, 8);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Temperature → colour: blue (cold) → beige (comfortable) → orange → red (hot). */
export function tempColor(t: number, out = new THREE.Color()): THREE.Color {
  const stops: [number, number][] = [
    [5, 0x3f6fd1], [14, 0x5fb3c9], [22, 0xcfc6ad], [30, 0xe8963c], [45, 0xd8402a], [80, 0x8a1010],
  ];
  if (t <= stops[0][0]) return out.setHex(stops[0][1]);
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const [t0, c0] = stops[k - 1];
      const [t1, c1] = stops[k];
      return out.setHex(c0).lerp(new THREE.Color(c1), (t - t0) / (t1 - t0));
    }
  }
  return out.setHex(stops[stops.length - 1][1]);
}
