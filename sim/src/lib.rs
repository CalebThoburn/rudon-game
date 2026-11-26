//! Rudon simulation core: Prototype 01.
//!
//! One "sector": three rooms with server racks, cooled by a shared coolant
//! loop (pump, chiller, one valve branch per room). Each room's valve is
//! driven by a Reconciliation Engine, a purely mechanical controller:
//!
//! * A jar of **peanut butter** sits in the room air. Its viscosity falls as it
//!   warms (Arrhenius law), so it acts as the temperature sensor.
//! * A constant-torque motor spins the **ledger drum** against the peanut
//!   butter's viscous drag. Warm room → thinner peanut butter → faster drum.
//! * An escapement spins the **reference drum** at a constant rate.
//! * A **differential gear** outputs half the difference of the two drum angles.
//!   That output turns a **lead screw** that opens or closes the coolant valve.
//!   In other words, a mechanical integral controller.
//!
//! Nothing is scripted: the valve moves only because the parts make it move.
//! See the vault notes `Simulation` and `Reconciliation Engine`.

use std::f64::consts::TAU;

pub const ROOMS: usize = 3;

// ---------- physical constants ----------
const RHO_WATER: f64 = 1000.0; // kg/m³
const CP_WATER: f64 = 4186.0; // J/(kg·K)
const KELVIN: f64 = 273.15;

// ---------- rooms ----------
const C_ROOM: f64 = 4.0e5; // J/K: air, furniture, rack chassis
const G_AMBIENT: f64 = 60.0; // W/K: leak to the (warm) surrounding building
const T_AMBIENT: f64 = 30.0; // °C
const G_ROOM_ROOM: f64 = 25.0; // W/K: through shared walls
const BASE_LOADS: [f64; ROOMS] = [2500.0, 4000.0, 6000.0]; // W per server rack

// ---------- coolant loop ----------
const PUMP_HEAD: f64 = 70_000.0; // Pa at zero flow
const R_PUMP: f64 = 0.3e8; // Pa/(m³/s): pump internal resistance (linear pump curve)
const R_PIPE: f64 = 0.5e8; // Pa/(m³/s) per branch
const R_VALVE_OPEN: f64 = 0.8e8; // Pa/(m³/s) for a fully open valve
const VALVE_MIN: f64 = 0.02; // a "closed" valve still weeps a little
const UA_COIL: f64 = 900.0; // W/K: room heat-exchanger coil
const C_COOLANT: f64 = 2.0e5; // J/K: ~50 L reservoir
const T_CHILL_SET: f64 = 8.0; // °C
const CHILL_MAX: f64 = 20_000.0; // W
const CHILL_GAIN: f64 = 4000.0; // W/K
const G_COOLANT_AMBIENT: f64 = 10.0; // W/K

// ---------- Reconciliation Engine ----------
const PB_MASS: f64 = 1.5; // kg of peanut butter in a full jar
const CP_PB: f64 = 2000.0; // J/(kg·K)
const C_JAR: f64 = 400.0; // J/K: brass jar itself
const G_PB: f64 = 15.0; // W/K: finned jar ↔ room air (too little coupling and the engine hunts)
const MU_REF: f64 = 300.0; // Pa·s at T_MU_REF
const T_MU_REF: f64 = 22.0; // °C
const MU_B: f64 = 5000.0; // K: Arrhenius activation temperature (Ea/R)
const K_GEOM: f64 = 1.0e-3; // N·m·s per Pa·s: drum shear geometry
const DRUM_J: f64 = 0.02; // kg·m²: ledger drum inertia
const OMEGA_REF: f64 = 1.0; // rad/s: escapement rate
/// Calibrated by Rudon so the drums agree at 22 °C with a full jar.
const MOTOR_TORQUE: f64 = K_GEOM * MU_REF * OMEGA_REF;
const HOLD_DAMPING: f64 = 2.0; // N·m·s: a hand gripping the drum
const VALVE_GAIN: f64 = 0.002; // valve travel per radian of differential output (too much and it hunts)
const DRAIN_RATE: f64 = 0.003; // jar fraction per second, tap open
const CHIME_ARM_ERR: f64 = 0.02; // rad/s of drum disagreement that arms the chime
const SUPPLY_RATE: f64 = 0.0005; // jar fraction per second, cafeteria supply line

const MAX_SUBSTEP: f64 = 0.5; // s of game time

/// Peanut butter viscosity (Pa·s) at a temperature in °C.
pub fn pb_viscosity(t_c: f64) -> f64 {
    MU_REF * (MU_B * (1.0 / (t_c + KELVIN) - 1.0 / (T_MU_REF + KELVIN))).exp()
}

/// Wetted fraction of the drum: less peanut butter, less drag.
fn shear_area(fill: f64) -> f64 {
    0.05 + 0.95 * fill.clamp(0.0, 1.0)
}

#[derive(Clone, Debug)]
pub struct Room {
    pub temp: f64,
    pub heat_load: f64,
    pub rack_on: bool,
}

#[derive(Clone, Debug)]
pub struct Engine {
    pub pb_temp: f64,
    pub pb_fill: f64,
    pub ledger_omega: f64,
    pub ledger_angle: f64,
    pub ref_angle: f64,
    pub valve: f64,
    pub linkage_connected: bool,
    pub drain_open: bool,
    pub supply_connected: bool,
    pub holding: bool,
    pub chimes: u32,
    last_err_positive: bool,
    /// The chime is armed once the drums disagree noticeably.
    chime_armed: bool,
}

#[derive(Clone, Debug)]
pub struct Sector {
    pub rooms: [Room; ROOMS],
    pub engines: [Engine; ROOMS],
    pub coolant_temp: f64,
    pub pump_on: bool,
    pub chiller_on: bool,
    pub pump_head: f64,
    pub chiller_power: f64,
    pub flows: [f64; ROOMS],
    pub heat_removed: [f64; ROOMS],
    pub time: f64,
}

impl Sector {
    pub fn new(load_scale: f64) -> Self {
        let room = |i: usize| Room { temp: 26.0, heat_load: BASE_LOADS[i] * load_scale, rack_on: true };
        let engine = || Engine {
            pb_temp: 26.0,
            pb_fill: 1.0,
            ledger_omega: OMEGA_REF,
            ledger_angle: 0.0,
            ref_angle: 0.0,
            valve: 0.3,
            linkage_connected: true,
            drain_open: false,
            supply_connected: true,
            holding: false,
            chimes: 0,
            last_err_positive: true,
            chime_armed: false,
        };
        Sector {
            rooms: [room(0), room(1), room(2)],
            engines: [engine(), engine(), engine()],
            coolant_temp: 10.0,
            pump_on: true,
            chiller_on: true,
            pump_head: 0.0,
            chiller_power: 0.0,
            flows: [0.0; ROOMS],
            heat_removed: [0.0; ROOMS],
            time: 0.0,
        }
    }

    /// Advance by `dt` seconds of game time, in stable substeps.
    pub fn step(&mut self, dt: f64) {
        let n = (dt / MAX_SUBSTEP).ceil().max(1.0) as usize;
        let h = dt / n as f64;
        for _ in 0..n {
            self.substep(h);
        }
    }

    fn substep(&mut self, dt: f64) {
        // 1. Hydraulics: parallel branches between supply and return headers,
        //    fed by a pump with a linear curve. One-node nodal analysis.
        let mut cond = [0.0; ROOMS];
        for (c, e) in cond.iter_mut().zip(&self.engines) {
            let x = e.valve.max(VALVE_MIN);
            *c = 1.0 / (R_PIPE + R_VALVE_OPEN / (x * x));
        }
        let g_pump = 1.0 / R_PUMP;
        let g_sum: f64 = cond.iter().sum();
        self.pump_head = if self.pump_on { PUMP_HEAD * g_pump / (g_pump + g_sum) } else { 0.0 };

        // 2. Heat exchange at each room's coil (effectiveness-NTU).
        let ts = self.coolant_temp;
        let mut q_total = 0.0;
        for i in 0..ROOMS {
            let q_flow = self.pump_head * cond[i];
            self.flows[i] = q_flow;
            let mdc = q_flow * RHO_WATER * CP_WATER;
            let q = if mdc > 1e-9 {
                let eff = 1.0 - (-UA_COIL / mdc).exp();
                mdc * eff * (self.rooms[i].temp - ts)
            } else {
                0.0
            };
            self.heat_removed[i] = q;
            q_total += q;
        }

        // 3. Room temperatures (explicit, using old values).
        let mut d_room = [0.0; ROOMS];
        for i in 0..ROOMS {
            let r = &self.rooms[i];
            let mut p = if r.rack_on { r.heat_load } else { 0.0 };
            p += G_AMBIENT * (T_AMBIENT - r.temp);
            if i > 0 {
                p += G_ROOM_ROOM * (self.rooms[i - 1].temp - r.temp);
            }
            if i + 1 < ROOMS {
                p += G_ROOM_ROOM * (self.rooms[i + 1].temp - r.temp);
            }
            p -= self.heat_removed[i];
            d_room[i] = p / C_ROOM * dt;
        }
        for (r, d) in self.rooms.iter_mut().zip(d_room) {
            r.temp += d;
        }

        // 4. Coolant reservoir and chiller.
        self.chiller_power = if self.chiller_on {
            (CHILL_GAIN * (ts - T_CHILL_SET)).clamp(0.0, CHILL_MAX)
        } else {
            0.0
        };
        self.coolant_temp +=
            (q_total - self.chiller_power + G_COOLANT_AMBIENT * (T_AMBIENT - ts)) / C_COOLANT * dt;

        // 5. Reconciliation Engines.
        for i in 0..ROOMS {
            let room_t = self.rooms[i].temp;
            let e = &mut self.engines[i];

            if e.drain_open {
                e.pb_fill -= DRAIN_RATE * dt;
            }
            if e.supply_connected {
                e.pb_fill += SUPPLY_RATE * dt;
            }
            e.pb_fill = e.pb_fill.clamp(0.0, 1.0);

            let c_pb = PB_MASS * CP_PB * e.pb_fill + C_JAR;
            e.pb_temp += G_PB * (room_t - e.pb_temp) / c_pb * dt;

            let mut b = K_GEOM * pb_viscosity(e.pb_temp) * shear_area(e.pb_fill);
            if e.holding {
                b += HOLD_DAMPING;
            }
            // Implicit update: J dω/dt = τ - bω (stable for any dt).
            e.ledger_omega = (DRUM_J * e.ledger_omega + dt * MOTOR_TORQUE) / (DRUM_J + dt * b);
            e.ledger_angle = (e.ledger_angle + e.ledger_omega * dt) % TAU;
            e.ref_angle = (e.ref_angle + OMEGA_REF * dt) % TAU;

            let err = e.ledger_omega - OMEGA_REF;
            if e.linkage_connected {
                // Differential output = half the speed difference → lead screw → valve.
                e.valve = (e.valve + VALVE_GAIN * 0.5 * err * dt).clamp(0.0, 1.0);
            }
            // The chime rings when a real imbalance has been reconciled:
            // the drums disagreed noticeably, then the error crossed zero.
            if err.abs() > CHIME_ARM_ERR {
                e.chime_armed = true;
            }
            let positive = err > 0.0;
            if positive != e.last_err_positive {
                if e.chime_armed {
                    e.chimes = e.chimes.wrapping_add(1);
                    e.chime_armed = false;
                }
                e.last_err_positive = positive;
            }
        }

        self.time += dt;
    }

    pub fn command(&mut self, kind: u32, room: usize, value: f64) {
        let on = value > 0.5;
        let room = room.min(ROOMS - 1);
        match kind {
            0 => self.rooms[room].rack_on = on,
            1 => self.engines[room].drain_open = on,
            2 => self.engines[room].supply_connected = on,
            3 => self.engines[room].holding = on,
            4 => self.engines[room].linkage_connected = on,
            5 => self.chiller_on = on,
            6 => self.pump_on = on,
            _ => {}
        }
    }

    pub fn write_state(&self, out: &mut [f64]) {
        out[0] = self.time;
        out[1] = self.coolant_temp;
        out[2] = self.chiller_power;
        out[3] = self.pump_head;
        out[4] = (self.pump_on as u8 | (self.chiller_on as u8) << 1) as f64;
        for i in 0..ROOMS {
            let r = &self.rooms[i];
            let e = &self.engines[i];
            let o = &mut out[STATE_HEADER + i * ROOM_STRIDE..STATE_HEADER + (i + 1) * ROOM_STRIDE];
            o[0] = r.temp;
            o[1] = r.heat_load;
            o[2] = r.rack_on as u8 as f64;
            o[3] = self.flows[i];
            o[4] = self.heat_removed[i];
            o[5] = e.pb_temp;
            o[6] = e.pb_fill;
            o[7] = pb_viscosity(e.pb_temp);
            o[8] = e.ledger_omega;
            o[9] = e.ledger_angle;
            o[10] = e.ref_angle;
            o[11] = e.valve;
            o[12] = e.linkage_connected as u8 as f64;
            o[13] = e.drain_open as u8 as f64;
            o[14] = e.supply_connected as u8 as f64;
            o[15] = e.holding as u8 as f64;
            o[16] = e.chimes as f64;
        }
    }
}

// ---------- state layout shared with TypeScript (src/simLayout.ts) ----------
pub const STATE_HEADER: usize = 5;
pub const ROOM_STRIDE: usize = 17;
pub const STATE_LEN: usize = STATE_HEADER + ROOMS * ROOM_STRIDE;

pub struct World {
    sectors: Vec<Sector>,
    seed: u32,
    buf: [f64; STATE_LEN],
}

impl World {
    pub fn new(n: usize, seed: u32) -> Self {
        let mut w = World { sectors: Vec::new(), seed, buf: [0.0; STATE_LEN] };
        w.resize(n);
        w
    }

    /// Grow or shrink the world. Existing sectors keep their state.
    pub fn resize(&mut self, n: usize) {
        while self.sectors.len() < n {
            // Cheap LCG so benchmark sectors aren't identical copies.
            self.seed = self.seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let jitter = (self.seed >> 8) as f64 / (1u32 << 24) as f64; // 0..1
            let scale = if self.sectors.is_empty() { 1.0 } else { 0.85 + 0.3 * jitter };
            self.sectors.push(Sector::new(scale));
        }
        self.sectors.truncate(n);
    }

    pub fn step(&mut self, dt: f64) {
        for s in &mut self.sectors {
            s.step(dt);
        }
    }

    pub fn sector(&self, i: usize) -> Option<&Sector> {
        self.sectors.get(i)
    }
}

// ---------- WebAssembly exports (plain C ABI, no bindgen) ----------

#[no_mangle]
pub extern "C" fn world_new(n: u32, seed: u32) -> *mut World {
    Box::into_raw(Box::new(World::new(n as usize, seed)))
}

/// # Safety
/// `w` must come from `world_new` and not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn world_free(w: *mut World) {
    if !w.is_null() {
        drop(Box::from_raw(w));
    }
}

/// # Safety
/// `w` must come from `world_new`.
#[no_mangle]
pub unsafe extern "C" fn world_resize(w: *mut World, n: u32) {
    (*w).resize(n as usize);
}

/// # Safety
/// `w` must come from `world_new`.
#[no_mangle]
pub unsafe extern "C" fn world_step(w: *mut World, dt: f64) {
    (*w).step(dt);
}

/// # Safety
/// `w` must come from `world_new`.
#[no_mangle]
pub unsafe extern "C" fn world_command(w: *mut World, sector: u32, kind: u32, room: u32, value: f64) {
    let w = &mut *w;
    if let Some(s) = w.sectors.get_mut(sector as usize) {
        s.command(kind, room as usize, value);
    }
}

/// Writes the sector's state into an internal buffer and returns a pointer to
/// it (STATE_LEN f64 values), or null if the sector doesn't exist.
///
/// # Safety
/// `w` must come from `world_new`.
#[no_mangle]
pub unsafe extern "C" fn world_state(w: *mut World, sector: u32) -> *const f64 {
    let w = &mut *w;
    match w.sectors.get(sector as usize) {
        Some(s) => {
            s.write_state(&mut w.buf);
            w.buf.as_ptr()
        }
        None => std::ptr::null(),
    }
}

#[no_mangle]
pub extern "C" fn world_state_len() -> u32 {
    STATE_LEN as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(s: &mut Sector, hours: f64) {
        let steps = (hours * 3600.0) as usize;
        for _ in 0..steps {
            s.step(1.0);
        }
    }

    fn report(label: &str, s: &Sector) {
        eprintln!(
            "{label}: rooms {:.2} {:.2} {:.2} °C | valves {:.2} {:.2} {:.2} | flow L/s {:.3} {:.3} {:.3} | coolant {:.2} °C | chiller {:.0} W",
            s.rooms[0].temp, s.rooms[1].temp, s.rooms[2].temp,
            s.engines[0].valve, s.engines[1].valve, s.engines[2].valve,
            s.flows[0] * 1000.0, s.flows[1] * 1000.0, s.flows[2] * 1000.0,
            s.coolant_temp, s.chiller_power
        );
    }

    #[test]
    fn viscosity_falls_with_heat() {
        assert!(pb_viscosity(30.0) < pb_viscosity(22.0));
        assert!(pb_viscosity(15.0) > pb_viscosity(22.0));
        assert!((pb_viscosity(22.0) - MU_REF).abs() < 1e-9);
    }

    #[test]
    fn engines_regulate_rooms_to_setpoint() {
        let mut s = Sector::new(1.0);
        run(&mut s, 12.0);
        report("baseline", &s);
        for r in &s.rooms {
            assert!((r.temp - 22.0).abs() < 1.0, "room at {:.2}", r.temp);
        }
    }

    #[test]
    fn draining_peanut_butter_overcools_and_starves_neighbours() {
        let mut base = Sector::new(1.0);
        run(&mut base, 12.0);
        let mut s = base.clone();
        s.command(2, 1, 0.0); // cut supply line to room 1's jar
        s.command(1, 1, 1.0); // open the drain tap
        run(&mut s, 6.0);
        report("drained room 1", &s);
        assert!(s.engines[1].pb_fill < 0.01);
        assert!(s.engines[1].valve > 0.95, "valve pegs open");
        assert!(s.rooms[1].temp < base.rooms[1].temp - 1.0, "room 1 over-cools");
        assert!(s.flows[2] < base.flows[2], "room 2 loses coolant flow");
    }

    #[test]
    fn holding_the_drum_closes_the_valve_and_heats_the_room() {
        let mut s = Sector::new(1.0);
        run(&mut s, 12.0);
        let before = s.rooms[0].temp;
        s.command(3, 0, 1.0);
        run(&mut s, 2.0);
        report("held drum 0", &s);
        assert!(s.engines[0].valve < 0.05);
        assert!(s.rooms[0].temp > before + 2.0);
    }

    #[test]
    fn pump_failure_heats_everything() {
        let mut s = Sector::new(1.0);
        run(&mut s, 12.0);
        s.command(6, 0, 0.0);
        run(&mut s, 3.0);
        report("pump off", &s);
        assert!(s.rooms.iter().all(|r| r.temp > 28.0));
    }

    #[test]
    fn world_exports_roundtrip() {
        unsafe {
            let w = world_new(4, 7);
            world_step(w, 10.0);
            world_command(w, 0, 0, 2, 0.0);
            let p = world_state(w, 0);
            assert!(!p.is_null());
            let st = std::slice::from_raw_parts(p, STATE_LEN);
            assert_eq!(st[STATE_HEADER + 2 * ROOM_STRIDE + 2], 0.0); // rack 2 off
            assert!(world_state(w, 99).is_null());
            world_free(w);
        }
    }
}
