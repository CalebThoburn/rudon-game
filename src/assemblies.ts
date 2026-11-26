// What everything is made of.
//
// An assembly is an item with slots for sub-items. Slots can be behind a plate
// or another part, can lock a plate, and can be fixed in place (screwed,
// bolted, soldered), which needs the right tool to undo. Leaf parts break down
// into raw materials with the right tool. Tools gate depth:
//   hands → screwdriver → wrench → pliers → soldering iron
// Raw materials are the bottom, for now; elements would need a refinery.
import type { Item, ItemType, SlotContent } from './items';

export interface SlotDef {
  id: string;
  kind: 'part' | 'plate';
  accepts: ItemType;
  x: number;
  y: number;
  r: number;
  /** Plates: hit/drop rectangle [x, y, w, h] in panel coordinates (800×560). */
  rect?: [number, number, number, number];
  /** Unreachable until this slot (a plate, or a lid) is empty. */
  behind?: string;
  /** While fixed, this part holds the named plate on. */
  locks?: string;
  /** Must be turned / soldered to free or secure. No tool = by hand.
   *  A part in a slot like this only connects once it's fixed. */
  fix?: { tool?: ItemType; hold: number };
  /** Rests on this slot's part: if that's picked up while this isn't fixed, this falls. */
  on?: string;
}

export interface AssemblyDef {
  slots: SlotDef[];
  /** Slot ids that must hold working parts for this item to work. */
  requires?: string[];
}

const fasteners = (plate: string, accepts: 'screw' | 'bolt', pts: [number, number][], tool: ItemType, hold: number): SlotDef[] =>
  pts.map(([x, y], k) => ({ id: `${plate}:f${k}`, kind: 'part', accepts, x, y, r: 16, locks: plate, fix: { tool, hold } }));

// ---------------------------------------------------------------- machines
// Panel layouts for the four machines match the art in machines.ts.
export const ENGINE = {
  REF: { x: 170, y: 210, r: 70 }, LEDGER: { x: 400, y: 210, r: 96 }, DIFF: { x: 285, y: 120 },
  JAR: { x: 340, y: 340, w: 120, h: 120 }, TAP: { x: 478, y: 448 }, COUPLING: { x: 300, y: 300 },
  SCREW: { x: 640, top: 130, bottom: 390 }, PIN: { x: 640, y: 104 }, VALVE: { x: 640, y: 470 },
  BELL: { x: 400, y: 52 }, MOTOR: { x: 525, y: 300 }, VIV: { x: 175, y: 420 },
};
export const RACK = { x: 250, y: 30, w: 300, h: 500, bays: Array.from({ length: 8 }, (_, k) => ({ x: 400, y: 86 + k * 56 })) };
export const PUMP = { VOL: { x: 540, y: 280, r: 130 }, MOTOR: { x: 215, y: 280 } };
export const CHILLER = { FANS: [{ x: 250, y: 200 }, { x: 550, y: 200 }], FUSE: { x: 400, y: 320 }, COMP: { x: 210, y: 440 } };

// The separator, laid out as its process line: grind, sieve, de-metal, blow,
// spin, winnow, float, skim, sort, press. Driven by one motor through a
// gearbox, four pulleys and a belt along the bottom.
export const SEPARATOR_PROCESS = ['crush0', 'crush1', 'sieveC', 'sieveM', 'sieveF', 'magnet', 'blower', 'cyclone', 'winnower', 'float', 'skimmer', 'sorter', 'press0', 'press1'];
export const SEPARATOR_DRIVE = ['motor', 'gearbox', 'pulley0', 'pulley1', 'pulley2', 'pulley3'];
const W = { tool: 'wrench' as ItemType, hold: 1 };
const SD = { tool: 'screwdriver' as ItemType, hold: 0.6 };
const SEPARATOR_SLOTS: SlotDef[] = [
  { id: 'crush0', kind: 'part', accepts: 'crusher_roller', x: 90, y: 110, r: 34, fix: W },
  { id: 'crush1', kind: 'part', accepts: 'crusher_roller', x: 175, y: 110, r: 34, fix: W },
  { id: 'sieveC', kind: 'part', accepts: 'sieve_coarse', x: 270, y: 110, r: 36, fix: SD },
  { id: 'sieveM', kind: 'part', accepts: 'sieve_medium', x: 360, y: 110, r: 36, fix: SD },
  { id: 'sieveF', kind: 'part', accepts: 'sieve_fine', x: 450, y: 110, r: 36, fix: SD },
  { id: 'magnet', kind: 'part', accepts: 'magnet_drum', x: 550, y: 110, r: 36, fix: W },
  { id: 'blower', kind: 'part', accepts: 'blower', x: 660, y: 110, r: 40, fix: SD },
  { id: 'cyclone', kind: 'part', accepts: 'cyclone', x: 690, y: 260, r: 42, fix: W },
  { id: 'winnower', kind: 'part', accepts: 'winnower', x: 590, y: 260, r: 40, fix: SD },
  { id: 'float', kind: 'part', accepts: 'float_tank', x: 480, y: 260, r: 46, fix: W },
  { id: 'skimmer', kind: 'part', accepts: 'skimmer', x: 380, y: 260, r: 34, fix: { tool: 'pliers', hold: 0.6 }, on: 'float' },
  { id: 'sorter', kind: 'part', accepts: 'optical_sorter', x: 280, y: 260, r: 38, fix: SD },
  { id: 'press0', kind: 'part', accepts: 'press_plate', x: 160, y: 240, r: 30, fix: W },
  { id: 'press1', kind: 'part', accepts: 'press_plate', x: 160, y: 310, r: 30, fix: W },
  { id: 'motor', kind: 'part', accepts: 'motor', x: 110, y: 450, r: 80, fix: W },
  { id: 'gearbox', kind: 'part', accepts: 'gearbox', x: 260, y: 450, r: 40, fix: W },
  ...[370, 470, 570, 670].map((x, k): SlotDef => ({ id: `pulley${k}`, kind: 'part', accepts: 'pulley', x, y: 440, r: 26, fix: { tool: 'wrench', hold: 0.6 } })),
  { id: 'belt', kind: 'part', accepts: 'conveyor_belt', x: 520, y: 500, r: 36, on: 'pulley3' },
];

const E = ENGINE;
const ASSEMBLIES: Partial<Record<ItemType, AssemblyDef>> = {
  engine_frame: {
    slots: [
      { id: 'housing', kind: 'plate', accepts: 'engine_plate', x: 400, y: 280, r: 0, rect: [40, 40, 720, 480] },
      ...fasteners('housing', 'screw', [[70, 70], [730, 70], [70, 490], [730, 490]], 'screwdriver', 0.8),
      { id: 'ref', kind: 'part', accepts: 'ref_drum', x: E.REF.x, y: E.REF.y, r: 66, behind: 'housing', fix: { tool: 'wrench', hold: 1 } },
      { id: 'escapement', kind: 'part', accepts: 'escapement', x: E.REF.x, y: E.REF.y - E.REF.r - 18, r: 24, behind: 'housing', on: 'ref' },
      { id: 'ledger', kind: 'part', accepts: 'ledger_drum', x: E.LEDGER.x, y: E.LEDGER.y, r: 90, behind: 'housing', fix: { tool: 'wrench', hold: 1 } },
      { id: 'motor', kind: 'part', accepts: 'drive_motor', x: E.MOTOR.x, y: E.MOTOR.y, r: 30, behind: 'housing' },
      { id: 'diff', kind: 'part', accepts: 'differential', x: E.DIFF.x, y: E.DIFF.y + 6, r: 30, behind: 'housing', fix: { tool: 'wrench', hold: 0.8 } },
      { id: 'screw', kind: 'part', accepts: 'lead_screw', x: E.SCREW.x, y: 260, r: 34, behind: 'housing', fix: { tool: 'wrench', hold: 1 } },
      { id: 'pin', kind: 'part', accepts: 'pin', x: E.PIN.x, y: E.PIN.y, r: 18, behind: 'housing', on: 'screw' },
      { id: 'vivarium', kind: 'part', accepts: 'vivarium', x: E.VIV.x, y: E.VIV.y, r: 50, behind: 'housing' },
      { id: 'jar', kind: 'part', accepts: 'jar', x: E.JAR.x + E.JAR.w / 2, y: E.JAR.y + E.JAR.h / 2, r: 60, behind: 'housing' },
      { id: 'valve', kind: 'part', accepts: 'valve', x: E.VALVE.x, y: E.VALVE.y + 14, r: 36, behind: 'housing', fix: { tool: 'wrench', hold: 1.2 } },
    ],
  },
  rack_frame: {
    slots: [
      { id: 'door', kind: 'plate', accepts: 'rack_door', x: 400, y: 280, r: 0, rect: [RACK.x, RACK.y, RACK.w, RACK.h] },
      ...fasteners('door', 'screw', [[RACK.x + RACK.w - 22, 70], [RACK.x + RACK.w - 22, 490]], 'screwdriver', 0.6),
      ...RACK.bays.map((b, k): SlotDef => ({ id: `bay${k}`, kind: 'part', accepts: 'blade', x: b.x, y: b.y, r: 26, behind: 'door' })),
    ],
  },
  pump_frame: {
    slots: [
      { id: 'cover', kind: 'plate', accepts: 'pump_cover', x: PUMP.VOL.x, y: PUMP.VOL.y, r: 0, rect: [PUMP.VOL.x - 125, PUMP.VOL.y - 125, 250, 250] },
      ...fasteners('cover', 'bolt', [0, 1, 2, 3].map((k): [number, number] => {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        return [PUMP.VOL.x + Math.cos(a) * 100, PUMP.VOL.y + Math.sin(a) * 100];
      }), 'wrench', 1.2),
      { id: 'impeller', kind: 'part', accepts: 'impeller', x: PUMP.VOL.x, y: PUMP.VOL.y, r: 80, behind: 'cover' },
      { id: 'motor', kind: 'part', accepts: 'motor', x: PUMP.MOTOR.x, y: PUMP.MOTOR.y, r: 95, fix: { tool: 'wrench', hold: 1 } },
    ],
    requires: ['cover', 'impeller', 'motor'],
  },
  chiller_frame: {
    slots: [
      { id: 'grille', kind: 'plate', accepts: 'chiller_grille', x: 400, y: 210, r: 0, rect: [80, 60, 640, 300] },
      ...fasteners('grille', 'screw', [[100, 80], [700, 80], [100, 340], [700, 340]], 'screwdriver', 0.9),
      ...CHILLER.FANS.map((f, k): SlotDef => ({ id: `fan${k}`, kind: 'part', accepts: 'fan', x: f.x, y: f.y, r: 90, behind: 'grille' })),
      { id: 'fuse', kind: 'part', accepts: 'fuse', x: CHILLER.FUSE.x, y: CHILLER.FUSE.y, r: 28, behind: 'grille' },
      { id: 'compressor', kind: 'part', accepts: 'compressor', x: CHILLER.COMP.x, y: CHILLER.COMP.y, r: 60, fix: { tool: 'wrench', hold: 1.2 } },
    ],
    requires: ['compressor', 'fuse'],
  },
  toolbox: {
    slots: [
      { id: 'lid', kind: 'plate', accepts: 'toolbox_lid', x: 400, y: 280, r: 0, rect: [150, 140, 500, 280] },
      { id: 'tool0', kind: 'part', accepts: 'pliers', x: 300, y: 280, r: 60, behind: 'lid' },
      { id: 'tool1', kind: 'part', accepts: 'solder_iron', x: 500, y: 280, r: 60, behind: 'lid' },
    ],
  },

  // ---------------------------------------------------------------- the water room
  synth_frame: {
    slots: [
      { id: 'panel', kind: 'plate', accepts: 'synth_panel', x: 450, y: 210, r: 0, rect: [300, 80, 300, 260] },
      ...fasteners('panel', 'screw', [[320, 100], [580, 100], [320, 320], [580, 320]], 'screwdriver', 0.7),
      { id: 'intake', kind: 'part', accepts: 'fan', x: 140, y: 200, r: 70, fix: { tool: 'screwdriver', hold: 0.8 } },
      { id: 'h2valve', kind: 'part', accepts: 'valve', x: 140, y: 430, r: 40, fix: { tool: 'wrench', hold: 1 } },
      { id: 'igniter', kind: 'part', accepts: 'igniter', x: 380, y: 160, r: 30, behind: 'panel', fix: { tool: 'pliers', hold: 0.6 } },
      { id: 'burner', kind: 'part', accepts: 'burner', x: 450, y: 260, r: 55, behind: 'panel', fix: { tool: 'wrench', hold: 1 } },
      { id: 'catalyst', kind: 'part', accepts: 'catalyst', x: 530, y: 150, r: 35, behind: 'panel', on: 'burner' },
      { id: 'condenser', kind: 'part', accepts: 'condenser', x: 670, y: 250, r: 60, fix: { tool: 'wrench', hold: 1 } },
      { id: 'trap', kind: 'part', accepts: 'water_trap', x: 670, y: 440, r: 45, fix: { tool: 'wrench', hold: 0.8 } },
    ],
    requires: ['intake', 'h2valve', 'igniter', 'burner', 'catalyst', 'condenser', 'trap'],
  },
  h2_tank: {
    slots: [{ id: 'valve', kind: 'part', accepts: 'valve', x: 400, y: 120, r: 40, fix: { tool: 'wrench', hold: 1 } }],
    requires: ['valve'],
  },
  water_tank: {
    slots: [{ id: 'valve', kind: 'part', accepts: 'valve', x: 400, y: 480, r: 40, fix: { tool: 'wrench', hold: 1 } }],
    requires: ['valve'],
  },

  // ---------------------------------------------------------------- caterpillar farms
  irrigator_frame: {
    slots: [
      { id: 'valve', kind: 'part', accepts: 'valve', x: 200, y: 300, r: 40, fix: { tool: 'wrench', hold: 1 } },
      { id: 'spr0', kind: 'part', accepts: 'sprinkler', x: 450, y: 200, r: 36, fix: { tool: 'screwdriver', hold: 0.6 } },
      { id: 'spr1', kind: 'part', accepts: 'sprinkler', x: 610, y: 200, r: 36, fix: { tool: 'screwdriver', hold: 0.6 } },
    ],
    requires: ['valve', 'spr0', 'spr1'],
  },
  grinder_frame: {
    slots: [
      { id: 'guard', kind: 'plate', accepts: 'grinder_guard', x: 400, y: 270, r: 0, rect: [250, 120, 300, 300] },
      ...fasteners('guard', 'bolt', [[270, 140], [530, 140], [270, 400], [530, 400]], 'wrench', 1),
      { id: 'hopper', kind: 'part', accepts: 'hopper', x: 400, y: 70, r: 45, fix: { tool: 'wrench', hold: 0.8 } },
      ...[[340, 220], [460, 220], [340, 320], [460, 320]].map(([x, y], k): SlotDef => ({ id: `blade${k}`, kind: 'part', accepts: 'grinder_blade', x, y, r: 32, behind: 'guard', fix: { tool: 'wrench', hold: 0.8 } })),
      { id: 'auger', kind: 'part', accepts: 'auger', x: 400, y: 480, r: 40, fix: { tool: 'wrench', hold: 1 } },
      { id: 'motor', kind: 'part', accepts: 'motor', x: 140, y: 270, r: 90, fix: { tool: 'wrench', hold: 1 } },
      { id: 'gearbox', kind: 'part', accepts: 'gearbox', x: 650, y: 270, r: 45, fix: { tool: 'wrench', hold: 1 } },
    ],
    requires: ['hopper', 'blade0', 'blade1', 'blade2', 'blade3', 'auger', 'motor', 'gearbox'],
  },

  // ---------------------------------------------------------------- peanut processing
  // Twenty-one parts. Every one of them is needed; there is no simpler way.
  separator_frame: {
    slots: SEPARATOR_SLOTS,
    requires: SEPARATOR_SLOTS.map((s) => s.id),
  },

  // ---------------------------------------------------------------- mixing & distribution
  mixer_frame: {
    slots: [
      { id: 'motor', kind: 'part', accepts: 'motor', x: 150, y: 140, r: 85, fix: { tool: 'wrench', hold: 1 } },
      { id: 'paddle', kind: 'part', accepts: 'paddle', x: 400, y: 190, r: 34, fix: { tool: 'wrench', hold: 0.6 } },
      { id: 'vat', kind: 'part', accepts: 'mix_vat', x: 400, y: 360, r: 110, fix: { tool: 'wrench', hold: 1.2 } },
      { id: 'salt', kind: 'part', accepts: 'salt_doser', x: 640, y: 150, r: 40, fix: { tool: 'screwdriver', hold: 0.6 } },
      { id: 'sugar', kind: 'part', accepts: 'sugar_doser', x: 640, y: 330, r: 40, fix: { tool: 'screwdriver', hold: 0.6 } },
      { id: 'valve', kind: 'part', accepts: 'valve', x: 150, y: 430, r: 40, fix: { tool: 'wrench', hold: 1 } },
    ],
    requires: ['motor', 'paddle', 'vat', 'valve'],
  },
  salt_silo: {
    slots: [
      { id: 'hatch', kind: 'part', accepts: 'hatch', x: 400, y: 80, r: 40, fix: { hold: 0.6 } },
      { id: 'auger', kind: 'part', accepts: 'auger', x: 400, y: 480, r: 40, fix: { tool: 'wrench', hold: 1 } },
    ],
    requires: ['auger'],
  },
  sugar_silo: {
    slots: [
      { id: 'hatch', kind: 'part', accepts: 'hatch', x: 400, y: 80, r: 40, fix: { hold: 0.6 } },
      { id: 'auger', kind: 'part', accepts: 'auger', x: 400, y: 480, r: 40, fix: { tool: 'wrench', hold: 1 } },
    ],
    requires: ['auger'],
  },
  cafe_counter: {
    slots: [
      { id: 'tap', kind: 'part', accepts: 'tap', x: 300, y: 200, r: 40, fix: { tool: 'wrench', hold: 0.8 } },
      { id: 'dispenser', kind: 'part', accepts: 'dispenser', x: 520, y: 200, r: 45, fix: { tool: 'screwdriver', hold: 0.6 } },
    ],
    requires: ['tap', 'dispenser'],
  },

  // ---------------------------------------------------------------- records
  cabinet: {
    slots: [0, 1, 2, 3].map((k): SlotDef => ({ id: `drawer${k}`, kind: 'part', accepts: 'drawer', x: 400, y: 110 + k * 112, r: 48 })),
  },
  drawer: {
    slots: [0, 1, 2, 3].map((k): SlotDef => ({ id: `letter${k}`, kind: 'part', accepts: 'letter', x: 220 + k * 120, y: 280, r: 52 })),
  },

  // ---------------------------------------------------------------- sub-assemblies (opened on the bench)
  blade: {
    slots: [
      { id: 'lid', kind: 'plate', accepts: 'blade_lid', x: 400, y: 280, r: 0, rect: [140, 180, 520, 200] },
      ...fasteners('lid', 'screw', [[170, 280], [630, 280]], 'screwdriver', 0.6),
      { id: 'board', kind: 'part', accepts: 'circuit_board', x: 400, y: 280, r: 90, behind: 'lid' },
    ],
    requires: ['board'],
  },
  circuit_board: {
    slots: [
      { id: 'chip0', kind: 'part', accepts: 'chip', x: 300, y: 280, r: 44, fix: { tool: 'solder_iron', hold: 1.5 } },
      { id: 'chip1', kind: 'part', accepts: 'chip', x: 500, y: 280, r: 44, fix: { tool: 'solder_iron', hold: 1.5 } },
    ],
    requires: ['chip0', 'chip1'],
  },
  jar: {
    slots: [
      { id: 'lid', kind: 'part', accepts: 'jar_lid', x: 400, y: 150, r: 60, fix: { hold: 0.6 } }, // twist off by hand
      { id: 'butter', kind: 'part', accepts: 'peanut_butter', x: 400, y: 340, r: 80, behind: 'lid' },
    ],
  },
  motor: {
    slots: [
      { id: 'cap', kind: 'plate', accepts: 'motor_cap', x: 400, y: 280, r: 0, rect: [190, 130, 420, 300] },
      ...fasteners('cap', 'bolt', [[220, 160], [580, 400]], 'wrench', 0.8),
      { id: 'armature', kind: 'part', accepts: 'armature', x: 400, y: 280, r: 80, behind: 'cap' },
      { id: 'brush0', kind: 'part', accepts: 'brush', x: 250, y: 280, r: 26, behind: 'cap', fix: { tool: 'pliers', hold: 0.5 } },
      { id: 'brush1', kind: 'part', accepts: 'brush', x: 550, y: 280, r: 26, behind: 'cap', fix: { tool: 'pliers', hold: 0.5 } },
    ],
    requires: ['armature', 'brush0', 'brush1'],
  },
};

// The peanut butter pump is built exactly like the coolant pump.
ASSEMBLIES.pb_pump_frame = ASSEMBLIES.pump_frame;

export const assemblyOf = (t: ItemType): AssemblyDef | undefined => ASSEMBLIES[t];

/** Leaves (and emptied assemblies) break into materials with the right tool. */
export const BREAKS: Partial<Record<ItemType, { tool?: ItemType; hold: number; into: [ItemType, number][] }>> = {
  // frames, once empty
  engine_frame: { tool: 'wrench', hold: 2, into: [['steel', 3]] },
  rack_frame: { tool: 'wrench', hold: 2, into: [['steel', 4]] },
  pump_frame: { tool: 'wrench', hold: 2, into: [['steel', 3]] },
  chiller_frame: { tool: 'wrench', hold: 2, into: [['steel', 4], ['copper', 2]] },
  toolbox: { tool: 'wrench', hold: 1.2, into: [['steel', 1]] },
  // plates and lids
  engine_plate: { tool: 'wrench', hold: 1, into: [['brass', 2]] },
  rack_door: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  pump_cover: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  chiller_grille: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  blade_lid: { tool: 'pliers', hold: 0.8, into: [['steel', 1]] },
  motor_cap: { tool: 'wrench', hold: 0.8, into: [['steel', 1]] },
  toolbox_lid: { tool: 'wrench', hold: 0.8, into: [['steel', 1]] },
  jar_lid: { tool: 'pliers', hold: 0.6, into: [['brass', 1]] },
  // engine parts
  ledger_drum: { tool: 'wrench', hold: 1.2, into: [['brass', 3]] },
  ref_drum: { tool: 'wrench', hold: 1, into: [['brass', 2]] },
  escapement: { tool: 'pliers', hold: 0.8, into: [['steel', 1], ['brass', 1]] },
  differential: { tool: 'wrench', hold: 1, into: [['brass', 2], ['steel', 1]] },
  lead_screw: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  drive_motor: { tool: 'pliers', hold: 1, into: [['copper', 1], ['steel', 1]] },
  pin: { tool: 'pliers', hold: 0.5, into: [['brass', 1]] },
  valve: { tool: 'wrench', hold: 1.2, into: [['brass', 2], ['rubber', 1]] },
  jar: { hold: 0.8, into: [['glass', 1]] }, // an empty jar smashes by hand
  // rack parts
  blade: { tool: 'pliers', hold: 1, into: [['steel', 1]] },
  circuit_board: { tool: 'pliers', hold: 1, into: [['copper', 1], ['plastic', 1]] },
  chip: { tool: 'pliers', hold: 1.2, into: [['silicon', 1], ['gold', 1]] },
  // pump parts
  impeller: { tool: 'wrench', hold: 1.2, into: [['brass', 2]] },
  motor: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  armature: { tool: 'pliers', hold: 1, into: [['copper', 2], ['steel', 1]] },
  brush: { hold: 0.5, into: [['copper', 1]] },
  // chiller parts
  fan: { tool: 'pliers', hold: 0.8, into: [['plastic', 1], ['copper', 1]] },
  fuse: { tool: 'pliers', hold: 0.5, into: [['glass', 1], ['copper', 1]] },
  compressor: { tool: 'wrench', hold: 1.5, into: [['steel', 2], ['copper', 2]] },
  vivarium: { hold: 0.8, into: [['glass', 1]] }, // the beetles are gone the moment it breaks
  // water room
  synth_frame: { tool: 'wrench', hold: 2, into: [['steel', 3]] },
  synth_panel: { tool: 'wrench', hold: 1, into: [['steel', 1]] },
  burner: { tool: 'wrench', hold: 1.2, into: [['steel', 2]] },
  catalyst: { tool: 'pliers', hold: 1.2, into: [['gold', 1], ['steel', 1]] },
  condenser: { tool: 'pliers', hold: 1, into: [['copper', 2]] },
  igniter: { tool: 'pliers', hold: 0.6, into: [['copper', 1], ['glass', 1]] },
  water_trap: { tool: 'wrench', hold: 1, into: [['steel', 1], ['glass', 1]] },
  h2_tank: { tool: 'wrench', hold: 2, into: [['steel', 4]] },
  water_tank: { tool: 'wrench', hold: 2, into: [['steel', 4]] },
  // farms
  irrigator_frame: { tool: 'wrench', hold: 1.5, into: [['steel', 2]] },
  sprinkler: { tool: 'pliers', hold: 0.6, into: [['brass', 1]] },
  grinder_frame: { tool: 'wrench', hold: 2, into: [['steel', 4]] },
  grinder_guard: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  grinder_blade: { tool: 'wrench', hold: 1, into: [['steel', 1]] },
  hopper: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  auger: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  gearbox: { tool: 'wrench', hold: 1.2, into: [['steel', 2], ['brass', 1]] },
  // separator
  separator_frame: { tool: 'wrench', hold: 3, into: [['steel', 6]] },
  crusher_roller: { tool: 'wrench', hold: 1.2, into: [['steel', 2]] },
  sieve_coarse: { tool: 'pliers', hold: 0.8, into: [['steel', 1]] },
  sieve_medium: { tool: 'pliers', hold: 0.8, into: [['steel', 1]] },
  sieve_fine: { tool: 'pliers', hold: 0.8, into: [['steel', 1]] },
  magnet_drum: { tool: 'wrench', hold: 1.2, into: [['steel', 1], ['copper', 1]] },
  blower: { tool: 'pliers', hold: 0.8, into: [['plastic', 1], ['copper', 1]] },
  cyclone: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  conveyor_belt: { tool: 'pliers', hold: 0.8, into: [['rubber', 2]] },
  pulley: { tool: 'wrench', hold: 0.6, into: [['steel', 1]] },
  winnower: { tool: 'wrench', hold: 1, into: [['steel', 1], ['plastic', 1]] },
  float_tank: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  skimmer: { tool: 'pliers', hold: 0.6, into: [['steel', 1]] },
  press_plate: { tool: 'wrench', hold: 1, into: [['steel', 2]] },
  optical_sorter: { tool: 'solder_iron', hold: 1.5, into: [['silicon', 1], ['glass', 1], ['gold', 1]] },
  // mixing & distribution
  mixer_frame: { tool: 'wrench', hold: 2, into: [['steel', 3]] },
  mix_vat: { tool: 'wrench', hold: 1.5, into: [['steel', 3]] },
  paddle: { tool: 'wrench', hold: 0.8, into: [['steel', 1]] },
  salt_doser: { tool: 'pliers', hold: 0.8, into: [['plastic', 1], ['steel', 1]] },
  sugar_doser: { tool: 'pliers', hold: 0.8, into: [['plastic', 1], ['steel', 1]] },
  salt_silo: { tool: 'wrench', hold: 2, into: [['steel', 4]] },
  sugar_silo: { tool: 'wrench', hold: 2, into: [['steel', 4]] },
  hatch: { tool: 'wrench', hold: 0.8, into: [['steel', 1]] },
  pb_pump_frame: { tool: 'wrench', hold: 2, into: [['steel', 3]] },
  cafe_counter: { tool: 'wrench', hold: 2, into: [['steel', 2], ['plastic', 2]] },
  tap: { tool: 'wrench', hold: 0.8, into: [['brass', 1]] },
  dispenser: { tool: 'pliers', hold: 0.8, into: [['plastic', 1], ['steel', 1]] },
  // records
  cabinet: { tool: 'wrench', hold: 1.5, into: [['steel', 3]] },
  drawer: { tool: 'wrench', hold: 0.8, into: [['steel', 1]] },
  letter: { hold: 0.4, into: [['paper', 1]] },
};

const DEFAULTS: Partial<Record<ItemType, () => Partial<Item>>> = {
  peanut_butter: () => ({ fill: 1, salt: 0.015, sugar: 0.06 }),
  valve: () => ({ open: 0.3 }),
  vivarium: () => ({ colony: 1 }),
  letter: () => ({ seed: Math.floor(Math.random() * 2 ** 31) }),
};

/** A brand-new, complete item (all sub-parts fitted and fixed). */
export function make(type: ItemType, extra: Partial<Item> = {}): Item {
  const item: Item = { type, count: 1, ...extra };
  const asm = ASSEMBLIES[type];
  if (asm && !item.parts) {
    item.parts = {};
    for (const s of asm.slots) {
      const sub = make(s.accepts, DEFAULTS[s.accepts]?.() ?? {});
      item.parts[s.id] = { item: sub, fixed: s.fix ? true : undefined };
    }
  }
  return item;
}

/** Empty out named slots of an assembly. */
export function without(item: Item, ...slots: string[]): Item {
  for (const s of slots) if (item.parts?.[s]) item.parts[s] = { item: null };
  return item;
}

/** Is the part in this slot actually connected? Present, and fixed if it needs fixing. */
export function connected(item: Item, slotId: string): boolean {
  const c = item.parts?.[slotId];
  if (!c?.item) return false;
  const def = ASSEMBLIES[item.type]?.slots.find((s) => s.id === slotId);
  return !def?.fix || !!c.fixed;
}

/** Does this item function? Its required parts must be connected and working themselves. */
export function works(item: Item | null | undefined): boolean {
  if (!item) return false;
  const req = ASSEMBLIES[item.type]?.requires;
  if (!req) return true;
  return req.every((id) => connected(item, id) && works(item.parts?.[id]?.item));
}

export const isEmptyAssembly = (item: Item): boolean =>
  !item.parts || Object.values(item.parts).every((c: SlotContent) => !c.item);

export const PLACEABLE: Partial<Record<ItemType, true>> = {
  engine_frame: true, rack_frame: true, pump_frame: true, chiller_frame: true, toolbox: true,
  synth_frame: true, h2_tank: true, water_tank: true, irrigator_frame: true, grinder_frame: true,
  separator_frame: true, mixer_frame: true, salt_silo: true, sugar_silo: true, pb_pump_frame: true,
  cafe_counter: true, cabinet: true,
};
