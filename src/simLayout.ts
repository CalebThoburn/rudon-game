// Mirrors the state layout in sim/src/lib.rs (`write_state`). Keep in sync.
export const ROOMS = 3;
export const STATE_HEADER = 5;
export const ROOM_STRIDE = 17;
export const STATE_LEN = STATE_HEADER + ROOMS * ROOM_STRIDE;

export const H = { time: 0, coolantTemp: 1, chillerPower: 2, pumpHead: 3, flags: 4 } as const;

export const R = {
  temp: 0, load: 1, rackOn: 2, flow: 3, heatRemoved: 4,
  pbTemp: 5, pbFill: 6, viscosity: 7,
  ledgerOmega: 8, ledgerAngle: 9, refAngle: 10, valve: 11,
  linkage: 12, drain: 13, supply: 14, holding: 15, chimes: 16,
} as const;

export const Cmd = { Rack: 0, Drain: 1, Supply: 2, Hold: 3, Linkage: 4, Chiller: 5, Pump: 6 } as const;

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
