// Flat vector rendering of the cell world.
//
// The sim hands over one texel per 10 cm cell: its flat colour (rgb) and a shape
// class (alpha). The shader treats each class as an indicator field, blends the
// four nearest cell centres bilinearly, and keeps whichever class wins: neighbouring
// cells of a class merge into one smooth shape with rounded corners, and where two
// classes meet it draws an ink outline a constant number of pixels wide. Crisp at
// any zoom, no pixels.
import * as THREE from 'three';

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment = /* glsl */ `
uniform sampler2D map;
uniform vec2 size;
uniform vec2 shadowDir;
uniform float time;
varying vec2 vUv;

vec4 cellAt(vec2 c) { return texture2D(map, (clamp(c, vec2(0.0), size - 1.0) + 0.5) / size); }
float cls(vec4 t) { return floor(t.a * 255.0 + 0.5); }
bool tall(float k) { return (k >= 1.0 && k <= 9.0) || k == 13.0 || k == 18.0 || k == 23.0 || (k >= 19.0 && k <= 22.0); }

void main() {
  vec2 q = vec2(vUv.x, 1.0 - vUv.y) * size;  // cell coordinates (row 0 = north edge): cell n spans [n, n+1)
  vec2 p = q - 0.5;
  vec2 i0 = floor(p);
  vec2 f = p - i0;
  vec4 a = cellAt(i0), b = cellAt(i0 + vec2(1.0, 0.0)), c = cellAt(i0 + vec2(0.0, 1.0)), d = cellAt(i0 + vec2(1.0, 1.0));
  float ka = cls(a), kb = cls(b), kc = cls(c), kd = cls(d);
  float wa = (1.0 - f.x) * (1.0 - f.y), wb = f.x * (1.0 - f.y), wc = (1.0 - f.x) * f.y, wd = f.x * f.y;
  float ta = wa + (kb == ka ? wb : 0.0) + (kc == ka ? wc : 0.0) + (kd == ka ? wd : 0.0);
  float tb = wb + (ka == kb ? wa : 0.0) + (kc == kb ? wc : 0.0) + (kd == kb ? wd : 0.0);
  float tc = wc + (ka == kc ? wa : 0.0) + (kb == kc ? wb : 0.0) + (kd == kc ? wd : 0.0);
  float td = wd + (ka == kd ? wa : 0.0) + (kb == kd ? wb : 0.0) + (kc == kd ? wc : 0.0);
  float best = ta; float bk = ka;
  if (tb > best) { best = tb; bk = kb; }
  if (tc > best) { best = tc; bk = kc; }
  if (td > best) { best = td; bk = kd; }
  float second = 0.0; float sk = bk;
  if (ka != bk && ta > second) { second = ta; sk = ka; }
  if (kb != bk && tb > second) { second = tb; sk = kb; }
  if (kc != bk && tc > second) { second = tc; sk = kc; }
  if (kd != bk && td > second) { second = td; sk = kd; }
  // colour: the winning class's corners, blended (so tints and heat vary smoothly inside a shape)
  vec3 sum = vec3(0.0); float ws = 0.0;
  if (ka == bk) { sum += wa * a.rgb; ws += wa; }
  if (kb == bk) { sum += wb * b.rgb; ws += wb; }
  if (kc == bk) { sum += wc * c.rgb; ws += wc; }
  if (kd == bk) { sum += wd * d.rgb; ws += wd; }
  vec3 col = sum / max(ws, 1e-5);

  // liquids shimmer a little
  if (bk >= 60.0) col *= 1.0 + 0.035 * sin(q.x * 2.1 + q.y * 1.3 + time * 1.5);
  // tall things (walls, shelves, machines) cast a short shadow on the floor
  if (!tall(bk)) {
    float k1 = cls(cellAt(floor(q - shadowDir * 0.45)));
    float k2 = cls(cellAt(floor(q - shadowDir * 0.9)));
    if (tall(k1)) col *= 0.72; else if (tall(k2)) col *= 0.86;
  } else {
    col *= 1.06;
  }

  // ink outline where shapes meet, a constant width on screen; fades when cells get tiny
  float edge = best - second;
  float px = 1.0 / max(fwidth(q.x), 1e-4);  // screen pixels per cell
  float aa = fwidth(edge);
  float line = 1.0 - smoothstep(aa * 0.6, aa * 2.0, edge);
  float strength = (bk == 0.0 || sk == 0.0) ? 0.85 : 0.6;
  if (bk >= 60.0 && sk >= 60.0) strength = 0.25;
  strength *= smoothstep(2.5, 7.0, px);
  vec3 ink = col * 0.28 + vec3(0.02, 0.015, 0.01);
  col = mix(col, ink, line * strength);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class VectorFloor {
  readonly mesh: THREE.Mesh;
  private tex: THREE.DataTexture | null = null;
  private mat: THREE.ShaderMaterial;
  w = 0;
  h = 0;

  constructor(private cell: number) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        map: { value: null },
        size: { value: new THREE.Vector2(1, 1) },
        shadowDir: { value: new THREE.Vector2(0, -1) },
        time: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
  }

  update(rgba: Uint8Array, w: number, h: number): void {
    if (!this.tex || w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
      this.tex.magFilter = THREE.NearestFilter;
      this.tex.minFilter = THREE.NearestFilter;
      this.tex.generateMipmaps = false;
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.mat.uniforms.map.value = this.tex;
      this.mat.uniforms.size.value.set(w, h);
      this.mesh.scale.set(w * this.cell, h * this.cell, 1);
    } else {
      (this.tex.image.data as Uint8Array).set(rgba);
    }
    this.tex.needsUpdate = true;
  }

  /// Which way is "up" on screen, in cell coordinates (for shadows).
  setView(yaw: number, time: number): void {
    // the camera sits at (sin yaw, cos yaw) from its target in world x/z, which is the
    // same direction in cell x/y: that's screen-down, the way shadows fall
    this.mat.uniforms.shadowDir.value.set(Math.sin(yaw), Math.cos(yaw));
    this.mat.uniforms.time.value = time;
  }
}
