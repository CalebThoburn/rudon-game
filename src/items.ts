// Items (anything you can carry) and the player's inventory hotbar.
// An item may contain other items (`parts`): machines, blades, jars and motors
// are all just items with insides. Icons are drawn procedurally, with no text.

export type ItemType =
  // tools, in rough order of sophistication
  | 'screwdriver' | 'wrench' | 'pliers' | 'solder_iron'
  // fasteners
  | 'screw' | 'bolt'
  // raw materials (the bottom, until someone builds a refinery)
  | 'steel' | 'brass' | 'copper' | 'glass' | 'silicon' | 'gold' | 'plastic' | 'rubber' | 'peanut_butter'
  // Reconciliation Engine
  | 'engine_frame' | 'engine_plate' | 'ledger_drum' | 'ref_drum' | 'escapement' | 'differential'
  | 'lead_screw' | 'drive_motor' | 'pin' | 'jar' | 'jar_lid' | 'valve'
  // server rack
  | 'rack_frame' | 'rack_door' | 'blade' | 'blade_lid' | 'circuit_board' | 'chip'
  // pump
  | 'pump_frame' | 'pump_cover' | 'impeller' | 'motor' | 'motor_cap' | 'armature' | 'brush'
  // chiller
  | 'chiller_frame' | 'chiller_grille' | 'fan' | 'fuse' | 'compressor'
  | 'vivarium'
  // the plumber's luck
  | 'toolbox' | 'toolbox_lid'
  // water room
  | 'synth_frame' | 'synth_panel' | 'burner' | 'catalyst' | 'condenser' | 'igniter' | 'water_trap'
  | 'h2_tank' | 'water_tank'
  // caterpillar farms
  | 'irrigator_frame' | 'sprinkler' | 'grinder_frame' | 'grinder_guard' | 'grinder_blade' | 'hopper' | 'auger' | 'gearbox'
  // peanut processing: the separator
  | 'separator_frame' | 'crusher_roller' | 'sieve_coarse' | 'sieve_medium' | 'sieve_fine' | 'magnet_drum' | 'blower'
  | 'cyclone' | 'conveyor_belt' | 'pulley' | 'winnower' | 'float_tank' | 'skimmer' | 'press_plate' | 'optical_sorter'
  // mixing and distribution
  | 'mixer_frame' | 'mix_vat' | 'paddle' | 'salt_doser' | 'sugar_doser' | 'salt_silo' | 'sugar_silo' | 'hatch'
  | 'pb_pump_frame' | 'cafe_counter' | 'tap' | 'dispenser'
  // records
  | 'cabinet' | 'drawer' | 'letter' | 'paper';

export interface SlotContent {
  item: Item | null;
  /** Fixed in place (screwed, bolted, soldered). Only meaningful for slots with `fix`. */
  fixed?: boolean;
}

/** An item resting loose inside another (not in any slot, not connected to anything). */
export interface Loose {
  item: Item;
  x: number;
  y: number;
  /** The slot it's resting on; if that part is picked up, this falls. */
  on?: string;
}

export interface Item {
  type: ItemType;
  count: number;
  /** Peanut butter: how much (0..1), and what's mixed in (mass fractions). */
  fill?: number;
  salt?: number;
  sugar?: number;
  /** Valve body: how far open (0..1). */
  open?: number;
  /** Beetle vivarium: how many beetles are left (0..1). */
  colony?: number;
  /** Letters: what they say is generated from this. */
  seed?: number;
  /** Sub-items, for assemblies. */
  parts?: Record<string, SlotContent>;
  /** Things lying loose inside it. */
  loose?: Loose[];
}

const STACK: Partial<Record<ItemType, number>> = {
  screw: 99, bolt: 99, steel: 99, brass: 99, copper: 99, glass: 99, silicon: 99, gold: 99, plastic: 99, rubber: 99,
  chip: 16, pin: 16, fuse: 16, brush: 16, paper: 99, pulley: 8, grinder_blade: 8,
};

export function canStack(a: Item, b: Item): boolean {
  const plain = (i: Item) => !i.parts && !i.loose?.length && i.fill === undefined && i.seed === undefined && i.colony === undefined;
  return a.type === b.type && plain(a) && plain(b) && a.count + b.count <= (STACK[a.type] ?? 1);
}

// The newer parts are drawn from a small vocabulary of shapes.
type Shape = 'frame' | 'plate' | 'tank' | 'mesh' | 'coil' | 'roller' | 'disc' | 'funnel' | 'nozzle' | 'box' | 'blade' | 'auger'
  | 'magnet' | 'belt' | 'paddle' | 'eye' | 'spark' | 'doser' | 'drawer' | 'paper' | 'fanlike';
const SHAPES: Partial<Record<ItemType, [Shape, string, number?]>> = {
  synth_frame: ['frame', '#7a8c96'], h2_tank: ['tank', '#c9cfd4'], water_tank: ['tank', '#5d8fb8'],
  irrigator_frame: ['frame', '#4d7a4a'], grinder_frame: ['frame', '#6b5a3a'], separator_frame: ['frame', '#5f6b70'],
  mixer_frame: ['frame', '#8a6a3a'], salt_silo: ['tank', '#e8e8e8'], sugar_silo: ['tank', '#d9c39a'],
  pb_pump_frame: ['frame', '#8a5a2a'], cafe_counter: ['frame', '#b0a48a'], cabinet: ['frame', '#7d8a7a'],
  synth_panel: ['plate', '#8e9aa3'], grinder_guard: ['plate', '#7a6a4a'],
  burner: ['box', '#c0602a'], catalyst: ['mesh', '#e0c060', 3], condenser: ['coil', '#c66b3d'], igniter: ['spark', '#e9c46a'],
  water_trap: ['tank', '#7fb3d9'], sprinkler: ['nozzle', '#9aa3a8'], grinder_blade: ['blade', '#b9b9b9'], hopper: ['funnel', '#8d959b'],
  auger: ['auger', '#9a9a9a'], gearbox: ['box', '#6d7378'], crusher_roller: ['roller', '#8d959b'],
  sieve_coarse: ['mesh', '#a0a0a0', 3], sieve_medium: ['mesh', '#a0a0a0', 5], sieve_fine: ['mesh', '#a0a0a0', 8],
  magnet_drum: ['magnet', '#c0392b'], blower: ['fanlike', '#6d8a96'], cyclone: ['funnel', '#9aa3a8'], conveyor_belt: ['belt', '#3a3a3a'],
  pulley: ['disc', '#8c8c8c'], winnower: ['box', '#a08a5a'], float_tank: ['tank', '#6fa0c0'], skimmer: ['paddle', '#9aa3a8'],
  press_plate: ['plate', '#8d959b'], optical_sorter: ['eye', '#2e3a4a'], mix_vat: ['tank', '#b8893a'], paddle: ['paddle', '#c9c9c9'],
  salt_doser: ['doser', '#f1f1f1'], sugar_doser: ['doser', '#d9c39a'], hatch: ['disc', '#9aa3a8'], tap: ['nozzle', '#c9cfd4'],
  dispenser: ['doser', '#a8732f'], drawer: ['drawer', '#8d9a8a'], letter: ['paper', '#f1ead6'], paper: ['paper', '#e8e0cc'],
};

function drawShape(g: CanvasRenderingContext2D, item: Item, shape: Shape, color: string, n = 4): void {
  switch (shape) {
    case 'frame': rr(g, -20, -18, 40, 36, 4, color); rr(g, -14, -12, 28, 24, 2, '#00000055', 2); break;
    case 'plate': rr(g, -20, -14, 40, 28, 3, color); for (const [x, y] of [[-15, -9], [15, -9], [-15, 9], [15, 9]]) { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fillStyle = INK; g.fill(); } break;
    case 'tank': rr(g, -14, -20, 28, 40, 12, color); g.strokeStyle = '#00000044'; g.lineWidth = 2; g.beginPath(); g.moveTo(-14, -6); g.lineTo(14, -6); g.moveTo(-14, 8); g.lineTo(14, 8); g.stroke(); break;
    case 'mesh': rr(g, -18, -14, 36, 28, 2, '#00000022'); g.strokeStyle = color; g.lineWidth = 1.5;
      for (let k = 1; k < n * 2; k++) { const t = -18 + (36 * k) / (n * 2); g.beginPath(); g.moveTo(t, -14); g.lineTo(t, 14); g.stroke(); const u = -14 + (28 * k) / (n * 2); g.beginPath(); g.moveTo(-18, u); g.lineTo(18, u); g.stroke(); }
      g.beginPath(); g.roundRect(-18, -14, 36, 28, 2); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke(); break;
    case 'coil': g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); for (let k = 0; k < 5; k++) g.arc(-14 + k * 7, 0, 6, Math.PI, 0); g.stroke(); g.strokeStyle = color; g.lineWidth = 3; g.stroke(); break;
    case 'roller': rr(g, -20, -9, 40, 18, 9, color); g.strokeStyle = '#00000055'; g.lineWidth = 1.5; for (let k = -14; k < 16; k += 5) { g.beginPath(); g.moveTo(k, -8); g.lineTo(k + 3, 8); g.stroke(); } break;
    case 'disc': circ(g, 0, 0, 16, color); circ(g, 0, 0, 4, '#3a3a3a', 2); break;
    case 'funnel': g.beginPath(); g.moveTo(-18, -16); g.lineTo(18, -16); g.lineTo(5, 10); g.lineTo(5, 18); g.lineTo(-5, 18); g.lineTo(-5, 10); g.closePath(); inked(g, color); break;
    case 'nozzle': rr(g, -6, -18, 12, 22, 3, color); g.beginPath(); g.moveTo(-10, 4); g.lineTo(10, 4); g.lineTo(6, 14); g.lineTo(-6, 14); g.closePath(); inked(g, color); break;
    case 'box': rr(g, -16, -14, 32, 28, 4, color); circ(g, 0, 0, 6, '#00000044', 2); break;
    case 'blade': g.beginPath(); g.moveTo(0, -18); g.lineTo(6, 0); g.lineTo(0, 18); g.lineTo(-6, 0); g.closePath(); inked(g, color); break;
    case 'auger': g.beginPath(); g.rect(-3, -20, 6, 40); inked(g, '#666', 2); g.strokeStyle = color; g.lineWidth = 4; g.beginPath(); for (let y = -18; y < 20; y += 6) { g.moveTo(-12, y); g.lineTo(12, y + 4); } g.stroke(); break;
    case 'magnet': g.strokeStyle = INK; g.lineWidth = 12; g.beginPath(); g.arc(0, -2, 12, Math.PI, 0); g.lineTo(12, 14); g.moveTo(-12, -2); g.lineTo(-12, 14); g.stroke();
      g.strokeStyle = color; g.lineWidth = 7; g.stroke(); g.fillStyle = '#c9c9c9'; g.fillRect(-16, 10, 8, 6); g.fillRect(8, 10, 8, 6); break;
    case 'belt': g.beginPath(); g.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2); g.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2, true); inked(g, color); break;
    case 'paddle': g.beginPath(); g.rect(-2, -20, 4, 24); inked(g, '#777', 2); rr(g, -12, 2, 24, 14, 3, color); break;
    case 'eye': rr(g, -18, -12, 36, 24, 6, color); circ(g, 0, 0, 8, '#9fd3ff', 2); g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill(); break;
    case 'spark': rr(g, -5, -6, 10, 22, 2, '#e8e0cc'); g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -6); g.lineTo(-6, -14); g.lineTo(3, -12); g.lineTo(-2, -20); g.stroke(); break;
    case 'doser': g.beginPath(); g.moveTo(-14, -18); g.lineTo(14, -18); g.lineTo(14, 4); g.lineTo(4, 14); g.lineTo(-4, 14); g.lineTo(-14, 4); g.closePath(); inked(g, color); rr(g, -3, 12, 6, 8, 1, '#777', 2); break;
    case 'drawer': rr(g, -20, -12, 40, 24, 2, color); rr(g, -6, -3, 12, 6, 3, '#c9c9c9', 2);
      if (item.parts) { const n2 = Object.values(item.parts).filter((c) => c.item).length; g.fillStyle = '#f1ead6'; for (let k = 0; k < n2; k++) g.fillRect(-16 + k * 8, -16, 6, 6); } break;
    case 'paper':
      g.save(); g.rotate(-0.15); rr(g, -14, -18, 28, 36, 1, color, 2);
      g.strokeStyle = '#5a6b8a88'; g.lineWidth = 1.2;
      if (item.type === 'letter') for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(-9, -11 + k * 5); g.lineTo(9 - (k % 3) * 3, -11 + k * 5); g.stroke(); }
      g.restore(); break;
    case 'fanlike': circ(g, 0, 0, 18, '#3d4c56'); for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); g.lineTo(Math.cos(a + 0.4) * 15, Math.sin(a + 0.4) * 15); g.closePath(); inked(g, color, 1.5); } break;
  }
}

const INK = '#2a2118';

function inked(g: CanvasRenderingContext2D, fill: string, w = 2.5): void {
  g.fillStyle = fill; g.fill(); g.strokeStyle = INK; g.lineWidth = w; g.stroke();
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, lw = 2.5): void {
  g.beginPath(); g.roundRect(x, y, w, h, r); inked(g, fill, lw);
}
function circ(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, lw = 2.5): void {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); inked(g, fill, lw);
}
function gearShape(g: CanvasRenderingContext2D, r: number, teeth: number, fill: string): void {
  g.beginPath();
  for (let k = 0; k < teeth * 2; k++) {
    const t = (k / (teeth * 2)) * Math.PI * 2;
    const q = k % 2 ? r : r + 3;
    g.lineTo(Math.cos(t) * q, Math.sin(t) * q);
  }
  g.closePath(); inked(g, fill);
}
const has = (it: Item, slot: string) => !!it.parts?.[slot]?.item;

/** Draw an item centred at (x, y), fitting in a box of size s. */
export function drawItem(g: CanvasRenderingContext2D, item: Item, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 48, s / 48);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (item.type) {
    // ---- tools
    case 'screwdriver':
      g.rotate(-0.7);
      rr(g, -5, -22, 10, 20, 4, '#d6452f');
      g.beginPath(); g.rect(-2, -2, 4, 22); inked(g, '#b9b9b9', 2);
      break;
    case 'wrench':
      g.rotate(-0.7);
      rr(g, -4, -6, 8, 30, 3, '#9aa3a8');
      circ(g, 0, -12, 10, '#9aa3a8');
      g.beginPath(); g.rect(-4, -24, 8, 11); g.fillStyle = '#2b2b2b'; g.fill();
      break;
    case 'pliers':
      g.strokeStyle = INK; g.lineWidth = 7;
      g.beginPath(); g.moveTo(-10, 20); g.lineTo(2, -4); g.lineTo(-2, -20); g.moveTo(10, 20); g.lineTo(-2, -4); g.lineTo(2, -20); g.stroke();
      g.strokeStyle = '#3c78c8'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(-10, 20); g.lineTo(0, 2); g.moveTo(10, 20); g.lineTo(0, 2); g.stroke();
      g.strokeStyle = '#b9b9b9'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-2, -20); g.moveTo(0, 0); g.lineTo(2, -20); g.stroke();
      break;
    case 'solder_iron':
      g.rotate(-0.7);
      rr(g, -5, -4, 10, 26, 4, '#333');
      g.beginPath(); g.rect(-2, -20, 4, 16); inked(g, '#c9c9c9', 2);
      g.fillStyle = '#ff7a3c'; g.beginPath(); g.arc(0, -21, 3, 0, Math.PI * 2); g.fill();
      break;
    // ---- fasteners
    case 'screw':
      g.beginPath(); g.rect(-3, -2, 6, 20); inked(g, '#b9b9b9');
      circ(g, 0, -8, 9, '#cfcfcf');
      g.beginPath(); g.moveTo(-6, -8); g.lineTo(6, -8); g.stroke();
      break;
    case 'bolt':
      g.beginPath(); g.rect(-4, -2, 8, 20); inked(g, '#8f969b');
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.lineTo(Math.cos(a) * 11, -8 + Math.sin(a) * 11); }
      g.closePath(); inked(g, '#a4abb0');
      break;
    // ---- materials
    case 'steel': rr(g, -18, -8, 36, 16, 2, '#8d959b'); g.strokeStyle = '#b8c0c6'; g.beginPath(); g.moveTo(-14, -4); g.lineTo(14, -4); g.stroke(); break;
    case 'brass':
      g.beginPath(); g.moveTo(-18, 8); g.lineTo(-12, -8); g.lineTo(12, -8); g.lineTo(18, 8); g.closePath(); inked(g, '#d4a64a'); break;
    case 'copper':
      g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#c66b3d'; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2); g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#c66b3d'; g.lineWidth = 2; g.stroke();
      break;
    case 'glass':
      g.beginPath(); g.moveTo(-12, 14); g.lineTo(-4, -16); g.lineTo(14, 4); g.closePath(); inked(g, '#cfe3e0aa'); break;
    case 'silicon': rr(g, -14, -14, 28, 28, 3, '#5d6b8a'); g.strokeStyle = '#8fa0c4'; g.lineWidth = 1.5;
      for (let k = -8; k <= 8; k += 8) { g.beginPath(); g.moveTo(-14, k); g.lineTo(14, k); g.moveTo(k, -14); g.lineTo(k, 14); g.stroke(); } break;
    case 'gold': g.beginPath(); g.ellipse(0, 2, 12, 9, 0.3, 0, Math.PI * 2); inked(g, '#f2c94c'); break;
    case 'plastic': for (const [px, py] of [[-8, 4], [6, 6], [0, -6]]) circ(g, px, py, 6, '#e8e0cc'); break;
    case 'rubber': g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.arc(0, 0, 7, 0, Math.PI * 2, true); inked(g, '#2e2e2e'); break;
    case 'peanut_butter': {
      const f = item.fill ?? 1;
      g.beginPath(); g.ellipse(0, 8, 18 * (0.4 + 0.6 * f), 10 * (0.4 + 0.6 * f), 0, 0, Math.PI * 2); inked(g, '#a8732f');
      g.beginPath(); g.ellipse(0, 2, 10 * (0.4 + 0.6 * f), 6 * (0.4 + 0.6 * f), 0, 0, Math.PI * 2); g.fillStyle = '#c08a45'; g.fill();
      break;
    }
    // ---- frames (a bare chassis)
    case 'engine_frame': rr(g, -20, -16, 40, 32, 5, '#7a5a2a'); rr(g, -14, -10, 28, 20, 3, '#3b2c1a', 2); break;
    case 'rack_frame': rr(g, -13, -21, 26, 42, 3, '#232529'); g.strokeStyle = '#4a4e56'; for (let k = -15; k < 18; k += 6) { g.beginPath(); g.moveTo(-8, k); g.lineTo(8, k); g.stroke(); } break;
    case 'pump_frame': rr(g, -20, 4, 40, 10, 2, '#4a4a4a'); circ(g, 8, -4, 10, '#56656e'); rr(g, -18, -10, 16, 14, 3, '#9c3b2e'); break;
    case 'chiller_frame': rr(g, -21, -16, 42, 32, 4, '#7f97a6'); rr(g, -17, -12, 34, 14, 2, '#26323a', 2); break;
    case 'toolbox': rr(g, -20, -8, 40, 24, 3, '#c0392b'); g.beginPath(); g.roundRect(-8, -16, 16, 10, 3); g.strokeStyle = INK; g.lineWidth = 3; g.stroke(); break;
    // ---- plates and lids
    case 'engine_plate': rr(g, -20, -15, 40, 30, 4, '#c99a45'); circ(g, 0, -2, 7, '#5a4326', 2); break;
    case 'rack_door': rr(g, -13, -20, 26, 40, 3, '#3c3f45'); g.fillStyle = '#26282d'; for (let y = -14; y < 16; y += 6) for (let x = -7; x < 9; x += 6) { g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill(); } break;
    case 'blade_lid': rr(g, -20, -7, 40, 14, 2, '#5a5e66'); break;
    case 'pump_cover': circ(g, 0, 0, 18, '#7d8f99'); circ(g, 0, 0, 6, '#56656e', 2); break;
    case 'motor_cap': circ(g, 0, 0, 16, '#9c3b2e'); circ(g, 0, 0, 5, '#666', 2); break;
    case 'chiller_grille': rr(g, -20, -16, 40, 32, 3, '#8ea5b3'); g.strokeStyle = INK; g.lineWidth = 1.5; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(-15, -10 + k * 4); g.lineTo(15, -10 + k * 4); g.stroke(); } break;
    case 'jar_lid': g.beginPath(); g.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2); inked(g, '#b8893a'); break;
    case 'toolbox_lid': rr(g, -20, -6, 40, 12, 3, '#c0392b'); break;
    // ---- engine parts
    case 'ledger_drum': gearShape(g, 17, 14, '#d9ad55'); circ(g, 0, 0, 10, '#efe3c4', 2); break;
    case 'ref_drum': gearShape(g, 13, 10, '#c99a45'); circ(g, 0, 0, 3, '#3a2f22', 2); break;
    case 'escapement': g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(-16, 10); g.lineTo(0, -8); g.lineTo(16, 10); g.stroke(); g.strokeStyle = '#d0a85a'; g.lineWidth = 3; g.stroke(); break;
    case 'differential': gearShape(g, 9, 8, '#b0b0b0'); g.save(); g.translate(-10, 10); gearShape(g, 6, 6, '#9c9c9c'); g.restore(); g.save(); g.translate(10, 10); gearShape(g, 6, 6, '#9c9c9c'); g.restore(); break;
    case 'lead_screw': g.rotate(0.6); g.beginPath(); g.rect(-4, -20, 8, 40); inked(g, '#9a9a9a'); g.strokeStyle = '#5a5a5a'; g.lineWidth = 1.5; for (let k = -18; k < 20; k += 5) { g.beginPath(); g.moveTo(-4, k); g.lineTo(4, k + 3); g.stroke(); } break;
    case 'drive_motor': rr(g, -14, -10, 28, 20, 4, '#5a6a3a'); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); for (let k = 0; k < 4; k++) g.arc(-6 + k * 4, 0, 4, 0, Math.PI); g.stroke(); break;
    case 'pin': g.rotate(0.6); rr(g, -3, -14, 6, 30, 3, '#e9c46a'); circ(g, 0, -14, 7, '#e9c46a'); break;
    case 'jar': {
      const butter = item.parts?.butter?.item;
      const f = butter ? butter.fill ?? 1 : 0;
      rr(g, -14, -14, 28, 32, 5, '#cfe3e066');
      g.fillStyle = '#a8732f'; g.fillRect(-12, 16 - 28 * f, 24, 28 * f);
      g.beginPath(); g.roundRect(-14, -14, 28, 32, 5); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
      if (has(item, 'lid')) { g.beginPath(); g.rect(-16, -20, 32, 7); inked(g, '#b8893a'); }
      break;
    }
    case 'valve': rr(g, -16, -6, 32, 18, 5, '#7a8c96'); g.beginPath(); g.rect(-3, -18, 6, 12); inked(g, '#b5b5b5', 2); circ(g, 0, -18, 6, '#a33b2c', 2); break;
    // ---- rack parts
    case 'blade':
      rr(g, -20, -6, 40, 12, 2, has(item, 'lid') ? '#4a4e56' : '#2e7d4f');
      if (has(item, 'board') || has(item, 'lid')) { g.fillStyle = '#7dff8a'; g.fillRect(10, -2, 3, 3); g.fillRect(15, -2, 3, 3); }
      break;
    case 'circuit_board':
      rr(g, -18, -12, 36, 24, 2, '#2e7d4f');
      for (const k of ['chip0', 'chip1']) if (has(item, k)) { g.fillStyle = '#1b1b1b'; g.fillRect(k === 'chip0' ? -12 : 2, -6, 10, 12); }
      break;
    case 'chip': rr(g, -10, -10, 20, 20, 2, '#1b1b1b'); g.strokeStyle = '#c9c9c9'; g.lineWidth = 2; for (let k = -6; k <= 6; k += 4) { g.beginPath(); g.moveTo(-14, k); g.lineTo(-10, k); g.moveTo(10, k); g.lineTo(14, k); g.stroke(); } break;
    // ---- pump parts
    case 'impeller':
      circ(g, 0, 0, 16, '#b07a3a');
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.beginPath(); g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); g.quadraticCurveTo(Math.cos(a + 0.5) * 12, Math.sin(a + 0.5) * 12, Math.cos(a + 0.9) * 15, Math.sin(a + 0.9) * 15); g.stroke(); }
      break;
    case 'motor': rr(g, -18, -12, 30, 24, 5, '#9c3b2e'); g.beginPath(); g.rect(12, -3, 8, 6); inked(g, '#8c8c8c', 2); break;
    case 'armature': rr(g, -16, -8, 32, 16, 3, '#c66b3d'); g.strokeStyle = INK; g.lineWidth = 1.5; for (let k = -12; k < 16; k += 4) { g.beginPath(); g.moveTo(k, -8); g.lineTo(k, 8); g.stroke(); } break;
    case 'brush': rr(g, -6, -9, 12, 18, 2, '#3a3a3a'); g.strokeStyle = '#c66b3d'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 9); g.lineTo(0, 18); g.stroke(); break;
    // ---- chiller parts
    case 'fan':
      circ(g, 0, 0, 18, '#56656e');
      for (let k = 0; k < 5; k++) { const a = (k * Math.PI * 2) / 5; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a + 0.7) * 14, Math.sin(a + 0.7) * 14, Math.cos(a) * 16, Math.sin(a) * 16); g.closePath(); inked(g, '#c4cfd6', 2); }
      break;
    case 'fuse':
      rr(g, -14, -6, 28, 12, 5, '#e8e0cc'); g.beginPath(); g.rect(-18, -5, 6, 10); inked(g, '#c9c9c9', 2); g.beginPath(); g.rect(12, -5, 6, 10); inked(g, '#c9c9c9', 2);
      break;
    case 'compressor': rr(g, -14, -18, 28, 36, 10, '#4d6270'); g.beginPath(); g.rect(-4, -24, 8, 8); inked(g, '#8c8c8c', 2); break;
    case 'vivarium': {
      rr(g, -18, -14, 36, 28, 4, '#cfe3e055');
      const n = Math.round((item.colony ?? 1) * 8);
      g.fillStyle = '#1a1208';
      for (let k = 0; k < n; k++) { g.beginPath(); g.ellipse(-12 + (k * 7) % 26, -6 + ((k * 13) % 14), 2.5, 1.8, k, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.roundRect(-18, -14, 36, 28, 4); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
      break;
    }
    default: {
      const spec = SHAPES[item.type];
      if (spec) drawShape(g, item, spec[0], spec[1], spec[2]);
    }
  }
  g.restore();
}

/** The hotbar. The selected slot is what's in the player's hand. */
export class Inventory {
  readonly slots: (Item | null)[] = Array(12).fill(null);
  selected = 0;
  private cells: { el: HTMLElement; canvas: HTMLCanvasElement; badge: HTMLElement }[] = [];

  /** Set by the inspect panel. */
  onPointerDown: (i: number, e: PointerEvent) => void = () => {};
  onOpen: (i: number) => void = () => {};

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
      el.addEventListener('dblclick', () => this.onOpen(i));
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
    for (const s of this.slots) if (s && canStack(s, item)) { s.count += item.count; this.render(); return true; }
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
    if (canStack(s, item)) { s.count += item.count; this.render(); return true; }
    return false;
  }

  /** Take one item off the stack in slot i. */
  takeOne(i: number): Item | null {
    const s = this.slots[i];
    if (!s) return null;
    if (s.count <= 1) { this.slots[i] = null; this.render(); return s; }
    s.count -= 1;
    this.render();
    return { ...s, count: 1 };
  }

  /** Remove one of this exact item (by reference) from the inventory. */
  consume(item: Item): void {
    const i = this.slots.indexOf(item);
    if (i < 0) return;
    if (item.count > 1) item.count -= 1;
    else this.slots[i] = null;
    this.render();
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
