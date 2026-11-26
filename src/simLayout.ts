// Mirrors the state layout and commands in sim/src/lib.rs. Keep in sync.
export const ROOMS = 3;
export const STATE_HEADER = 6;
export const ROOM_STRIDE = 19;
export const ZONES = 11;
/** Start of the plant block (air, water, peanuts, peanut butter). */
export const PLANT = STATE_HEADER + ROOMS * ROOM_STRIDE;
export const P = {
  o2: 0, co2: ZONES, water: 2 * ZONES, h2: 2 * ZONES + 1, mush: 2 * ZONES + 2, paste: 2 * ZONES + 3,
  pb: 2 * ZONES + 4, pbSalt: 2 * ZONES + 5, pbSugar: 2 * ZONES + 6, salt: 2 * ZONES + 7, sugar: 2 * ZONES + 8,
  synth: 2 * ZONES + 9, sep: 2 * ZONES + 10, mix: 2 * ZONES + 11, pbFlowing: 2 * ZONES + 12,
  /** 2 farms × [growth, caterpillars, soil, harvests] */
  farm: 2 * ZONES + 13,
} as const;
export const P_LEN = P.farm + 8;
export const STATE_LEN = PLANT + P_LEN;

/** Air zones. Server rooms 0..2 are zones 1..3. */
export const Z = { corridor: 0, process: 4, records: 5, water: 6, farmA: 7, farmB: 8, mixing: 9, cafe: 10 } as const;

/** Plant machines (Cmd.Machine index). */
export const M = {
  synth: 0, h2: 1, water: 2, irrigatorA: 3, irrigatorB: 4, grinderA: 5, grinderB: 6,
  separator: 7, mixer: 8, salt: 9, sugar: 10, pbPump: 11, cafe: 12,
} as const;

export const plant = (state: Float64Array, field: number) => state[PLANT + field];
export const MAX_RACKS = 16;

export const H = { time: 0, coolantTemp: 1, chillerPower: 2, pumpHead: 3, flags: 4, fans: 5 } as const;
/** Bits of state[H.flags]. */
export const F = { pumpRunning: 1, chillerRunning: 2 } as const;

export const R = {
  temp: 0, load: 1, flow: 2, heatRemoved: 3,
  pbTemp: 4, pbFill: 5, viscosity: 6,
  ledgerOmega: 7, ledgerAngle: 8, refAngle: 9, valve: 10,
  parts: 11, drain: 12, supply: 13, holding: 14, chimes: 15,
  beetles: 16, jarSalt: 17, jarSugar: 18,
} as const;

/** Engine part flags (Cmd.EngineParts, state R.parts). */
export const E = { present: 1, valve: 2, actuated: 4, ledger: 8, reference: 16, jar: 32, vivarium: 64 } as const;

export const Cmd = {
  Drain: 1, Supply: 2, Hold: 3,
  Rack: 20, EngineParts: 21, JarFill: 22, ValveSet: 23, Pump: 24, Chiller: 25, Fans: 26,
  JarSalt: 27, JarSugar: 28, Colony: 29, Machine: 30,
} as const;

export function rackBits(active: boolean, on: boolean, blades: number, zone: number): number {
  return (+active) | (+on << 1) | (Math.min(15, blades) << 2) | ((zone + 1) << 6);
}

export function room(state: Float64Array, i: number, field: number): number {
  return state[STATE_HEADER + i * ROOM_STRIDE + field];
}

/** Coolant temperature leaving room i's coil (°C), from flow and heat picked up. */
export function outletTemp(state: Float64Array, i: number): number {
  const flow = room(state, i, R.flow);
  const ts = state[H.coolantTemp];
  if (flow < 1e-7) return room(state, i, R.temp);
  return ts + room(state, i, R.heatRemoved) / (flow * 1000 * 4186);
}
