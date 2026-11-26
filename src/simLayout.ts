// Mirrors the state layout and commands in sim/src/lib.rs. Keep in sync.
export const ROOMS = 3;
export const STATE_HEADER = 6;
export const ROOM_STRIDE = 16;
export const STATE_LEN = STATE_HEADER + ROOMS * ROOM_STRIDE;
export const MAX_RACKS = 16;

export const H = { time: 0, coolantTemp: 1, chillerPower: 2, pumpHead: 3, flags: 4, fans: 5 } as const;
/** Bits of state[H.flags]. */
export const F = { pumpRunning: 1, chillerRunning: 2 } as const;

export const R = {
  temp: 0, load: 1, flow: 2, heatRemoved: 3,
  pbTemp: 4, pbFill: 5, viscosity: 6,
  ledgerOmega: 7, ledgerAngle: 8, refAngle: 9, valve: 10,
  parts: 11, drain: 12, supply: 13, holding: 14, chimes: 15,
} as const;

/** Engine part flags (Cmd.EngineParts, state R.parts). */
export const E = { present: 1, valve: 2, actuated: 4, ledger: 8, reference: 16, jar: 32 } as const;

export const Cmd = {
  Drain: 1, Supply: 2, Hold: 3,
  Rack: 20, EngineParts: 21, JarFill: 22, ValveSet: 23, Pump: 24, Chiller: 25, Fans: 26,
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
