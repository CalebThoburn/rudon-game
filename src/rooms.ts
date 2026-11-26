// The building: one corridor and the rooms off it, and what each room is for.
//
//   north:  N0 N1 N2  server rooms (cooled by the coolant loop)
//           N3        peanut processing (the separator)
//           N4 N5     records (no other use: filing cabinets, past and future)
//   south:  S0        water (made from hydrogen and the room's own oxygen)
//           S1 S2     caterpillar farms (peanuts)
//           S3        mixing (paste + salt + sugar = peanut butter; the PB pump)
//           S4        cafeteria
//
// Overhead pipes carry water, mush, paste and peanut butter between them.
import * as THREE from 'three';
import * as S from './sprites';
import { P, plant, Z } from './simLayout';

export interface Box { x0: number; x1: number; z0: number; z1: number }

const WALL_H = 1.4;
const WALL_T = 0.25;
export const roomX = (i: number) => i * 10;
export const NORTH = 6;
export const SOUTH = 5;
export const CORRIDOR = { x0: -10, x1: 70 };

/** Which server room (0..2) a point is in, or -1. Racks heat the room they stand in. */
export function serverRoomAt(x: number, z: number): number {
  for (let i = 0; i < 3; i++) if (x > roomX(i) && x < roomX(i) + 8 && z > -11 && z < -3) return i;
  return -1;
}

/** Which air zone a point is in (see Z in simLayout). */
export function airZoneAt(x: number, z: number): number {
  const i = Math.floor(x / 10);
  const inRoom = x - roomX(i) > 0 && x - roomX(i) < 8;
  if (inRoom && z < -3 && z > -11) return i <= 2 ? i + 1 : i === 3 ? Z.process : Z.records;
  if (inRoom && z > 3 && z < 11) return [Z.water, Z.farmA, Z.farmB, Z.mixing, Z.cafe][i] ?? Z.corridor;
  return Z.corridor;
}

export class Building {
  readonly colliders: Box[] = [];
  readonly serverFloors: THREE.MeshLambertMaterial[] = [];
  readonly farmFloors: THREE.MeshLambertMaterial[] = [];
  private pipeGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  readonly pbMat = new THREE.MeshLambertMaterial({ color: 0xa8732f });
  readonly waterMat = new THREE.MeshLambertMaterial({ color: 0x9fd3ff });
  private wallMat = new THREE.MeshLambertMaterial({ map: S.wallTexture() });

  constructor(private scene: THREE.Scene) {
    this.floors();
    this.walls();
    this.overheadPipes();
  }

  private wall(ax: number, az: number, bx: number, bz: number): void {
    const b = { x0: Math.min(ax, bx) - WALL_T / 2, x1: Math.max(ax, bx) + WALL_T / 2, z0: Math.min(az, bz) - WALL_T / 2, z1: Math.max(az, bz) + WALL_T / 2 };
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const geo = new THREE.BoxGeometry(w, WALL_H, d);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * Math.max(w, d) * 0.7, uv.getY(k));
    const m = new THREE.Mesh(geo, this.wallMat);
    m.position.set((b.x0 + b.x1) / 2, WALL_H / 2, (b.z0 + b.z1) / 2);
    this.scene.add(m);
    this.colliders.push(b);
  }

  private floor(x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, tile = 2): void {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * (x1 - x0)) / tile, (uv.getY(k) * (z1 - z0)) / tile);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.scene.add(m);
  }

  private floors(): void {
    this.floor(CORRIDOR.x0, -3, CORRIDOR.x1, 3, new THREE.MeshLambertMaterial({ map: S.carpetTexture() }), 1.5);
    const tile = S.tileTexture();
    const soil = S.soilTexture();
    const lam = (color: number, map: THREE.Texture = tile) => new THREE.MeshLambertMaterial({ map, color });
    for (let i = 0; i < NORTH; i++) {
      const mat = i <= 2 ? lam(0xffffff) : i === 3 ? lam(0xa9a9a0) : new THREE.MeshLambertMaterial({ map: S.carpetTexture(), color: 0x9a8f78 });
      if (i <= 2) this.serverFloors.push(mat);
      this.floor(roomX(i), -11, roomX(i) + 8, -3, mat, i >= 4 ? 1.5 : 2);
    }
    for (let i = 0; i < SOUTH; i++) {
      const mat = i === 0 ? lam(0xb8cbd6) : i <= 2 ? lam(0xffffff, soil) : i === 3 ? lam(0xe0cfa8) : lam(0xf4efe4);
      if (i === 1 || i === 2) this.farmFloors.push(mat);
      this.floor(roomX(i), 3, roomX(i) + 8, 11, mat, i <= 2 && i > 0 ? 3 : 2);
    }
  }

  private walls(): void {
    const { x0: cx0, x1: cx1 } = CORRIDOR;
    this.wall(cx0, -3, cx0, 3);
    this.wall(cx1, -3, cx1, 3);
    // corridor sides, with a gap for each room
    const north = [cx0, ...Array.from({ length: NORTH }, (_, i) => [roomX(i), roomX(i) + 8]).flat(), cx1];
    for (let k = 0; k < north.length; k += 2) if (north[k + 1] > north[k]) this.wall(north[k], -3, north[k + 1], -3);
    const south = [cx0, ...Array.from({ length: SOUTH }, (_, i) => [roomX(i), roomX(i) + 8]).flat(), cx1];
    for (let k = 0; k < south.length; k += 2) if (south[k + 1] > south[k]) this.wall(south[k], 3, south[k + 1], 3);
    const room = (x0: number, zNear: number, zFar: number) => {
      this.wall(x0, zNear, x0, zFar);
      this.wall(x0 + 8, zNear, x0 + 8, zFar);
      this.wall(x0, zFar, x0 + 8, zFar);
      this.wall(x0, zNear, x0 + 3, zNear); // door gap x0+3 .. x0+5
      this.wall(x0 + 5, zNear, x0 + 8, zNear);
    };
    for (let i = 0; i < NORTH; i++) room(roomX(i), -3, -11);
    for (let i = 0; i < SOUTH; i++) room(roomX(i), 3, 11);
  }

  /** A pipe along points at height y. */
  pipe(pts: [number, number][], mat: THREE.Material, y = 0.12, r = 0.07): THREE.Vector3[] {
    const v = pts.map(([x, z]) => new THREE.Vector3(x, y, z));
    for (let k = 0; k + 1 < v.length; k++) {
      const a = v[k], b = v[k + 1];
      const m = new THREE.Mesh(this.pipeGeo, mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(r, a.distanceTo(b) + r, r);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.scene.add(m);
    }
    return v;
  }

  flange(x: number, z: number): void {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), new THREE.MeshLambertMaterial({ color: 0x8d959b }));
    m.position.set(x, 0.03, z);
    this.scene.add(m);
  }

  private overheadPipes(): void {
    const mush = new THREE.MeshLambertMaterial({ color: 0x5a4a2a });
    const paste = new THREE.MeshLambertMaterial({ color: 0x8a5a2a });
    // Water: the water room to the farms' irrigators and the cafeteria.
    this.pipe([[6.8, 9.2], [6.8, 2.0], [44, 2.0], [44, 7.4]], this.waterMat, 1.25, 0.06);
    for (const x of [11.6, 21.6]) this.pipe([[x, 2.0], [x, 4.2]], this.waterMat, 1.25, 0.06);
    // Mush: each farm's grinder to the separator, across the corridor.
    this.pipe([[16.4, 4.6], [16.4, 2.6], [33, 2.6], [33, -7.2]], mush, 1.55, 0.12);
    this.pipe([[26.4, 4.6], [26.4, 2.6]], mush, 1.55, 0.12);
    // Paste: separator to mixer.
    this.pipe([[35, -7.2], [35, 7.6]], paste, 1.7, 0.08);
    // Peanut butter: the PB pump to every engine's supply line, and to the cafeteria.
    this.pipe([[31.6, 4.6], [31.6, 2.3], [2.6, 2.3]], this.pbMat, 1.4, 0.07);
    this.pipe([[31.6, 2.3], [44.6, 2.3], [44.6, 7.4]], this.pbMat, 1.4, 0.07);
    for (let i = 0; i < 3; i++) this.pipe([[roomX(i) + 2.6, 2.3], [roomX(i) + 2.6, -8.9]], this.pbMat, 1.4, 0.07);
  }

  /** Overhead pipes look alive when something flows in them. */
  update(state: Float64Array): void {
    this.pbMat.color.setHex(plant(state, P.pbFlowing) > 0.5 ? 0xb07a32 : 0x6a5a48);
    this.waterMat.color.setHex(plant(state, P.water) > 1 ? 0x9fd3ff : 0x6a7a84);
  }
}

/** The caterpillar rooms: peanut plants that grow, caterpillars that crawl, soil that dries. */
export class Farms {
  private plants: THREE.Group[][] = [[], []];
  private cats: { obj: THREE.Group; x: number; z: number; tx: number; tz: number }[][] = [[], []];
  private plantTex: THREE.CanvasTexture[];
  private lastHarvests = [-1, -1];
  private flash = [0, 0];

  constructor(scene: THREE.Scene, private floors: THREE.MeshLambertMaterial[]) {
    this.plantTex = [S.peanutPlantTexture(false), S.peanutPlantTexture(true)];
    const catTex = S.caterpillarTexture();
    for (let k = 0; k < 2; k++) {
      const x0 = roomX(k + 1);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
        const p = S.makeSprite(this.plantTex[0], 0.9, 0.9);
        p.position.set(x0 + 1.4 + col * 1.75, 0, 6.2 + row * 1.6);
        scene.add(p);
        this.plants[k].push(p);
      }
      for (let c = 0; c < 14; c++) {
        const obj = S.makeSprite(catTex, 0.42, 0.21);
        const x = x0 + 1 + Math.random() * 6, z = 5.5 + Math.random() * 5;
        obj.position.set(x, 0, z);
        scene.add(obj);
        this.cats[k].push({ obj, x, z, tx: x, tz: z });
      }
    }
  }

  update(state: Float64Array, dt: number): void {
    for (let k = 0; k < 2; k++) {
      const base = P.farm + k * 4;
      const growth = plant(state, base);
      const cats = plant(state, base + 1);
      const soil = plant(state, base + 2);
      const harvests = plant(state, base + 3);
      if (this.lastHarvests[k] >= 0 && harvests > this.lastHarvests[k]) this.flash[k] = 1;
      this.lastHarvests[k] = harvests;
      this.flash[k] = Math.max(0, this.flash[k] - dt * 0.5);
      const ripe = growth > 0.65;
      for (const p of this.plants[k]) {
        const sprite = p.children[0] as THREE.Sprite;
        (sprite.material as THREE.SpriteMaterial).map = this.plantTex[ripe ? 1 : 0];
        const s = 0.2 + 0.9 * growth;
        sprite.scale.set(s, s, 1);
      }
      // Wet soil is darker; a fresh harvest leaves the floor churned.
      const wet = Math.max(0, Math.min(1, soil / 0.6));
      this.floors[k].color.setRGB(1 - 0.35 * wet - 0.3 * this.flash[k], 1 - 0.4 * wet - 0.3 * this.flash[k], 1 - 0.45 * wet - 0.3 * this.flash[k]);
      const visible = Math.min(14, Math.round(cats / 28));
      const x0 = roomX(k + 1);
      this.cats[k].forEach((c, i) => {
        c.obj.visible = i < visible;
        if (!c.obj.visible) return;
        if (Math.hypot(c.tx - c.x, c.tz - c.z) < 0.1) { c.tx = x0 + 0.8 + Math.random() * 6.4; c.tz = 4.2 + Math.random() * 6.2; }
        const d = Math.hypot(c.tx - c.x, c.tz - c.z);
        c.x += ((c.tx - c.x) / d) * 0.35 * dt;
        c.z += ((c.tz - c.z) / d) * 0.35 * dt;
        c.obj.position.set(c.x, 0, c.z);
      });
    }
  }
}
