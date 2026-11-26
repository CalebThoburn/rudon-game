// Items (parts you can carry) and the player's inventory hotbar.
// Icons are drawn procedurally. No text anywhere: you know a screw when you see one.

export type ItemType =
  | 'screw' | 'bolt' | 'wrench' | 'pin' | 'jar'
  | 'engine_plate' | 'rack_door' | 'blade'
  | 'pump_cover' | 'impeller'
  | 'chiller_grille' | 'fuse' | 'fan';

export interface Item {
  type: ItemType;
  count: number;
  /** Peanut butter fill, for jars. */
  fill?: number;
}

const STACKABLE: Partial<Record<ItemType, number>> = { screw: 99, bolt: 99, blade: 16, fuse: 16, pin: 16 };
export const stackLimit = (t: ItemType) => STACKABLE[t] ?? 1;
export const one = (type: ItemType, extra: Partial<Item> = {}): Item => ({ type, count: 1, ...extra });

const INK = '#2a2118';

function inked(g: CanvasRenderingContext2D, fill: string, w = 2.5): void {
  g.fillStyle = fill; g.fill(); g.strokeStyle = INK; g.lineWidth = w; g.stroke();
}

/** Draw an item centred at (x, y), fitting in a box of size s. */
export function drawItem(g: CanvasRenderingContext2D, item: Item, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 48, s / 48);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (item.type) {
    case 'screw':
      g.beginPath(); g.rect(-3, -2, 6, 20); inked(g, '#b9b9b9');
      g.strokeStyle = '#777'; g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-3, 2 + k * 4); g.lineTo(3, 4 + k * 4); g.stroke(); }
      g.beginPath(); g.arc(0, -8, 9, 0, Math.PI * 2); inked(g, '#cfcfcf');
      g.beginPath(); g.moveTo(-6, -8); g.lineTo(6, -8); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
      break;
    case 'bolt':
      g.beginPath(); g.rect(-4, -2, 8, 20); inked(g, '#8f969b');
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.lineTo(Math.cos(a) * 11, -8 + Math.sin(a) * 11); }
      g.closePath(); inked(g, '#a4abb0');
      break;
    case 'wrench':
      g.rotate(-0.7);
      g.beginPath(); g.roundRect(-4, -6, 8, 30, 3); inked(g, '#9aa3a8');
      g.beginPath(); g.arc(0, -12, 10, 0, Math.PI * 2); inked(g, '#9aa3a8');
      g.beginPath(); g.rect(-4, -24, 8, 11); g.fillStyle = '#2b2b2b'; g.fill();
      break;
    case 'pin':
      g.rotate(0.6);
      g.beginPath(); g.roundRect(-3, -14, 6, 30, 3); inked(g, '#e9c46a');
      g.beginPath(); g.arc(0, -14, 7, 0, Math.PI * 2); inked(g, '#e9c46a');
      break;
    case 'jar': {
      const f = item.fill ?? 0;
      g.beginPath(); g.roundRect(-14, -14, 28, 32, 5); inked(g, '#cfe3e066');
      g.fillStyle = '#a8732f'; g.fillRect(-12, 16 - 28 * f, 24, 28 * f);
      g.beginPath(); g.roundRect(-14, -14, 28, 32, 5); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
      g.beginPath(); g.rect(-16, -20, 32, 7); inked(g, '#b8893a');
      break;
    }
    case 'engine_plate':
      g.beginPath(); g.roundRect(-20, -15, 40, 30, 4); inked(g, '#c99a45');
      g.beginPath(); g.arc(0, -2, 7, 0, Math.PI * 2); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      for (const [px, py] of [[-15, -10], [15, -10], [-15, 10], [15, 10]]) { g.beginPath(); g.arc(px, py, 2, 0, Math.PI * 2); g.fillStyle = INK; g.fill(); }
      break;
    case 'rack_door':
      g.beginPath(); g.roundRect(-13, -20, 26, 40, 3); inked(g, '#3c3f45');
      g.strokeStyle = '#5a5e66'; g.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(-8, -14 + k * 5); g.lineTo(8, -14 + k * 5); g.stroke(); }
      break;
    case 'blade':
      g.beginPath(); g.roundRect(-20, -6, 40, 12, 2); inked(g, '#4a4e56');
      g.fillStyle = '#2e7d4f'; g.fillRect(-16, -3, 22, 6);
      g.fillStyle = '#7dff8a'; g.fillRect(10, -2, 3, 3); g.fillRect(15, -2, 3, 3);
      break;
    case 'pump_cover':
      g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); inked(g, '#7d8f99');
      g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); inked(g, '#56656e', 2);
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; g.beginPath(); g.arc(Math.cos(a) * 13, Math.sin(a) * 13, 2.2, 0, Math.PI * 2); g.fillStyle = INK; g.fill(); }
      break;
    case 'impeller':
      g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); inked(g, '#b07a3a');
      g.strokeStyle = INK; g.lineWidth = 2.5;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        g.beginPath(); g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
        g.quadraticCurveTo(Math.cos(a + 0.5) * 12, Math.sin(a + 0.5) * 12, Math.cos(a + 0.9) * 15, Math.sin(a + 0.9) * 15); g.stroke();
      }
      g.beginPath(); g.arc(0, 0, 4, 0, Math.PI * 2); inked(g, '#666');
      break;
    case 'chiller_grille':
      g.beginPath(); g.roundRect(-20, -16, 40, 32, 3); inked(g, '#8ea5b3');
      g.strokeStyle = INK; g.lineWidth = 1.5;
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(-15, -10 + k * 4); g.lineTo(15, -10 + k * 4); g.stroke(); }
      break;
    case 'fuse':
      g.beginPath(); g.roundRect(-14, -6, 28, 12, 5); inked(g, '#e8e0cc');
      g.beginPath(); g.rect(-18, -5, 6, 10); inked(g, '#c9c9c9', 2);
      g.beginPath(); g.rect(12, -5, 6, 10); inked(g, '#c9c9c9', 2);
      g.strokeStyle = '#a33'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.stroke();
      break;
    case 'fan':
      g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); inked(g, '#56656e');
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a + 0.7) * 14, Math.sin(a + 0.7) * 14, Math.cos(a) * 16, Math.sin(a) * 16);
        g.closePath(); inked(g, '#c4cfd6', 2);
      }
      break;
  }
  g.restore();
}

/** The hotbar. The selected slot is what's in the player's hand. */
export class Inventory {
  readonly slots: (Item | null)[] = Array(12).fill(null);
  selected = 0;
  private cells: { el: HTMLElement; canvas: HTMLCanvasElement; badge: HTMLElement }[] = [];

  /** Set by the inspect panel: begin a drag of slot `i`. */
  onPointerDown: (i: number, e: PointerEvent) => void = () => {};

  constructor(root: HTMLElement) {
    this.slots.forEach((_, i) => {
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.slot = String(i);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 96;
      const badge = document.createElement('span');
      badge.className = 'badge';
      el.append(canvas, badge);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onPointerDown(i, e); });
      root.append(el);
      this.cells.push({ el, canvas, badge });
    });
    addEventListener('keydown', (e) => {
      const k = '1234567890-='.indexOf(e.key);
      if (k >= 0) this.select(k);
    });
    root.addEventListener('wheel', (e) => { e.preventDefault(); this.select((this.selected + Math.sign(e.deltaY) + 12) % 12); });
    this.render();
  }

  get hand(): Item | null {
    return this.slots[this.selected];
  }

  select(i: number): void {
    this.selected = i;
    this.render();
  }

  /** Add to an existing stack, else the first empty slot. Returns false if full. */
  add(item: Item): boolean {
    const limit = stackLimit(item.type);
    if (limit > 1) {
      for (const s of this.slots) {
        if (s && s.type === item.type && s.count + item.count <= limit) { s.count += item.count; this.render(); return true; }
      }
    }
    const i = this.slots.indexOf(null);
    if (i < 0) return false;
    this.slots[i] = item;
    this.render();
    return true;
  }

  /** Put an item in a specific slot (merging stacks); false if it doesn't fit. */
  placeAt(i: number, item: Item): boolean {
    const s = this.slots[i];
    if (!s) { this.slots[i] = item; this.render(); return true; }
    if (s.type === item.type && s.count + item.count <= stackLimit(s.type)) { s.count += item.count; this.render(); return true; }
    return false;
  }

  /** Take one item off the stack in slot i. */
  takeOne(i: number): Item | null {
    const s = this.slots[i];
    if (!s) return null;
    const taken: Item = { ...s, count: 1 };
    s.count -= 1;
    if (s.count <= 0) this.slots[i] = null;
    this.render();
    return taken;
  }

  render(): void {
    this.cells.forEach(({ el, canvas, badge }, i) => {
      const g = canvas.getContext('2d')!;
      g.clearRect(0, 0, 96, 96);
      const it = this.slots[i];
      if (it) drawItem(g, it, 48, 48, 76);
      badge.textContent = it && it.count > 1 ? String(it.count) : '';
      el.classList.toggle('selected', i === this.selected);
    });
  }
}
