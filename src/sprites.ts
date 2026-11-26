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

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
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

// ---------------- Reconciliation Engine (animated) ----------------
export class EngineSprite {
  readonly canvas: HTMLCanvasElement;
  readonly tex: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;

  constructor() {
    [this.canvas, this.g] = canvas(160, 160);
    this.tex = texture(this.canvas);
  }

  draw(ledgerAngle: number, refAngle: number, valve: number, fill: number, bellSwing: number): void {
    const g = this.g;
    g.clearRect(0, 0, 160, 160);
    // bell
    g.save(); g.translate(80, 14); g.rotate(Math.sin(bellSwing * 20) * bellSwing * 0.6);
    g.beginPath(); g.moveTo(-9, 16); g.quadraticCurveTo(-9, 0, 0, 0); g.quadraticCurveTo(9, 0, 9, 16); g.closePath();
    inked(g, '#d4a64a', 3); g.restore();
    // cabinet
    rrect(g, 18, 30, 124, 104, 8); inked(g, '#b8893a');
    rrect(g, 26, 38, 108, 60, 6); inked(g, '#5a4326', 3);
    // drums visible through the window
    const wheel = (x: number, y: number, r: number, a: number) => {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); inked(g, '#e0b860', 3);
      g.strokeStyle = INK; g.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        const t = a + (k * Math.PI) / 3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); g.stroke();
      }
    };
    wheel(56, 68, 20, refAngle);
    wheel(104, 68, 24, ledgerAngle);
    // jar
    rrect(g, 60, 104, 40, 26, 4); inked(g, '#cfe0dc', 3);
    g.fillStyle = '#a8732f'; g.fillRect(62, 128 - 22 * fill, 36, 22 * fill);
    // valve gauge
    g.beginPath(); g.arc(124, 116, 10, 0, Math.PI * 2); inked(g, '#f1ead6', 3);
    g.strokeStyle = '#a33'; g.lineWidth = 3; g.beginPath(); g.moveTo(124, 116);
    const va = Math.PI * (0.75 + 1.5 * valve); g.lineTo(124 + Math.cos(va) * 8, 116 + Math.sin(va) * 8); g.stroke();
    // feet
    g.fillStyle = INK; g.fillRect(26, 134, 14, 10); g.fillRect(120, 134, 14, 10);
    this.tex.needsUpdate = true;
  }
}

// ---------------- server rack (animated lights) ----------------
export class RackSprite {
  readonly tex: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private c: HTMLCanvasElement;
  constructor() {
    [this.c, this.g] = canvas(96, 176);
    this.tex = texture(this.c);
  }
  draw(on: boolean, roomTemp: number, t: number): void {
    const g = this.g;
    g.clearRect(0, 0, 96, 176);
    rrect(g, 10, 6, 76, 164, 6); inked(g, '#2d2f33');
    for (let k = 0; k < 9; k++) {
      const y = 16 + k * 17;
      rrect(g, 18, y, 60, 12, 2); inked(g, '#3c3f45', 2);
      if (on) {
        const hot = roomTemp > 30;
        for (let j = 0; j < 4; j++) {
          const blink = Math.sin(t * (3 + j * 1.7) + k * 2.3) > -0.2;
          g.fillStyle = blink ? (hot ? '#ff5a3c' : '#7dff8a') : '#1d3a22';
          g.fillRect(24 + j * 8, y + 4, 4, 4);
        }
      }
    }
    this.tex.needsUpdate = true;
  }
}

// ---------------- static props ----------------
export function chillerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(192, 160);
  rrect(g, 8, 20, 176, 128, 8); inked(g, '#7f97a6');
  g.beginPath(); g.arc(64, 84, 40, 0, Math.PI * 2); inked(g, '#4d6270');
  g.strokeStyle = INK; g.lineWidth = 3;
  for (let k = 0; k < 5; k++) {
    const a = (k * Math.PI * 2) / 5;
    g.beginPath(); g.moveTo(64, 84); g.quadraticCurveTo(64 + Math.cos(a + 0.6) * 30, 84 + Math.sin(a + 0.6) * 30, 64 + Math.cos(a) * 36, 84 + Math.sin(a) * 36); g.stroke();
  }
  for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(118, 44 + k * 12); g.lineTo(170, 44 + k * 12); g.stroke(); }
  // frost
  g.fillStyle = '#e9f4fbcc';
  for (let k = 0; k < 16; k++) { g.beginPath(); g.arc(14 + k * 11, 26 + (k % 3) * 3, 4, 0, Math.PI * 2); g.fill(); }
  return texture(c);
}

export function pumpTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 112);
  rrect(g, 12, 40, 60, 46, 8); inked(g, '#9c3b2e');
  g.strokeStyle = INK; g.lineWidth = 2;
  for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(20 + k * 11, 46); g.lineTo(20 + k * 11, 80); g.stroke(); }
  g.beginPath(); g.arc(90, 64, 26, 0, Math.PI * 2); inked(g, '#6d7f8a');
  g.beginPath(); g.arc(90, 64, 8, 0, Math.PI * 2); inked(g, '#3a4750', 3);
  rrect(g, 84, 20, 14, 20, 3); inked(g, '#6d7f8a', 3);
  g.fillStyle = INK; g.fillRect(16, 86, 70, 10);
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
