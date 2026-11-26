//! Rudon simulation core: Prototype 01.
//!
//! One "sector": three rooms cooled by a shared coolant loop (pump, chiller,
//! one valve branch per room). Server racks can stand anywhere and heat the
//! room they're in. Each room's branch has a **valve site**; a Reconciliation
//! Engine built there controls the branch with a purely mechanical controller:
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
//! Which of those parts are physically present is decided by the player (the
//! TypeScript side tells the sim). Nothing is scripted: the valve moves only
//! because the parts that are there make it move. A branch with no valve body
//! fitted is sealed by Rudon's self-closing couplings.
//! See the vault notes `Simulation` and `Reconciliation Engine`.

pub mod elements;

use std::f64::consts::TAU;

pub const ROOMS: usize = 3;
pub const MAX_RACKS: usize = 16;

// ---------- physical constants ----------
const RHO_WATER: f64 = 1000.0; // kg/m³
const CP_WATER: f64 = 4186.0; // J/(kg·K)
const KELVIN: f64 = 273.15;

// ---------- rooms ----------
const C_ROOM: f64 = 4.0e5; // J/K: air, furniture, rack chassis
const G_AMBIENT: f64 = 60.0; // W/K: leak to the (warm) surrounding building
const T_AMBIENT: f64 = 30.0; // °C
const G_ROOM_ROOM: f64 = 25.0; // W/K: through shared walls
const BLADE_HEAT: f64 = 700.0; // W per working server blade
const STOCK_BLADES: [u8; ROOMS] = [4, 6, 8]; // what Rudon installed in each room's rack

// ---------- coolant loop ----------
const PUMP_HEAD: f64 = 70_000.0; // Pa at zero flow
const R_PUMP: f64 = 0.3e8; // Pa/(m³/s): pump internal resistance (linear pump curve)
const R_PIPE: f64 = 0.5e8; // Pa/(m³/s) per branch
const R_VALVE_OPEN: f64 = 0.8e8; // Pa/(m³/s) for a fully open valve
const VALVE_MIN: f64 = 0.02; // a "closed" valve still weeps a little
const UA_COIL: f64 = 900.0; // W/K: room heat-exchanger coil
const C_COOLANT: f64 = 2.0e5; // J/K: ~50 L reservoir
const T_CHILL_SET: f64 = 8.0; // °C
const CHILL_MAX: f64 = 20_000.0; // W with one fan
const CHILL_GAIN: f64 = 4000.0; // W/K
const CHILL_FAN_FACTOR: [f64; 3] = [0.3, 1.0, 1.3]; // capacity vs. fans fitted (0, 1, 2)
const G_COOLANT_AMBIENT: f64 = 10.0; // W/K

// ---------- Reconciliation Engine ----------
const PB_MASS: f64 = 1.5; // kg of peanut butter in a full jar
const CP_PB: f64 = 2000.0; // J/(kg·K)
const C_JAR: f64 = 400.0; // J/K: brass jar itself
const G_PB: f64 = 6.0; // W/K: jar ↔ room air. Slow on its own: without beetles the engine hunts
const MU_REF: f64 = 300.0; // Pa·s at T_MU_REF
const T_MU_REF: f64 = 22.0; // °C
const MU_B: f64 = 5000.0; // K: Arrhenius activation temperature (Ea/R)
const K_GEOM: f64 = 1.0e-3; // N·m·s per Pa·s: drum shear geometry
const DRUM_J: f64 = 0.02; // kg·m²: ledger drum inertia
const OMEGA_REF: f64 = 1.0; // rad/s: escapement rate
/// Calibrated by Rudon so the drums agree at 22 °C with a full jar.
const MOTOR_TORQUE: f64 = K_GEOM * MU_REF * OMEGA_REF;
const HOLD_DAMPING: f64 = 2.0; // N·m·s: a hand gripping the drum
const BEARING_DAMPING: f64 = 0.005; // N·m·s: drum spinning with no jar fitted
const VALVE_GAIN: f64 = 0.004; // valve travel per radian of differential output
const DRAIN_RATE: f64 = 0.003; // jar fraction per second, tap open
const SUPPLY_RATE: f64 = 0.0005; // jar fraction per second, cafeteria supply line
const CHIME_ARM_ERR: f64 = 0.02; // rad/s of drum disagreement that arms the chime

// ---------- beetles: the engine's proportional term ----------
// A colony in the vivarium clusters toward the warm side; its weight on the
// balance lever pushes the valve stem in proportion to the temperature error.
// They only stay while the peanut butter they eat contains salt AND sugar.
const KP_BEETLES: f64 = 0.12; // valve travel per °C of error, full colony
const BEETLE_RATE: f64 = 0.0002; // colony change per s
const BEETLE_EAT: f64 = 0.00008; // jar fraction per s eaten by a full colony
const SALT_NEED: f64 = 0.010; // mass fraction that keeps them interested
const SUGAR_NEED: f64 = 0.040;
const PB_JAR_L: f64 = 1.5; // litres in a full jar

// ---------- air ----------
pub const ZONES: usize = 11;
pub const Z_CORRIDOR: usize = 0; // server rooms are zones 1..=3
pub const Z_PROCESS: usize = 4;
pub const Z_RECORDS: usize = 5;
pub const Z_WATER: usize = 6;
pub const Z_FARM: [usize; 2] = [7, 8];
pub const Z_MIXING: usize = 9;
pub const Z_CAFE: usize = 10;
const N_ROOM: f64 = 7900.0; // mol of air in an 8×8×3 m room
const N_CORRIDOR: f64 = 52000.0;
const K_DOOR: f64 = 0.0015; // fraction of a room's air swapped with the corridor per s
const K_OUT: f64 = 0.0005; // corridor ↔ the rest of the building
const O2_FRESH: f64 = 0.209;
const CO2_FRESH: f64 = 0.0004;

// ---------- the plant: water, peanuts, peanut butter ----------
pub const MACHINES: usize = 13;
pub const M_SYNTH: usize = 0; // water synthesiser (burns H2 in room oxygen)
pub const M_H2: usize = 1; // hydrogen tank
pub const M_WATER: usize = 2; // water tank
pub const M_IRRIGATOR: [usize; 2] = [3, 4];
pub const M_GRINDER: [usize; 2] = [5, 6]; // grinds a whole farm room at harvest
pub const M_SEPARATOR: usize = 7;
pub const M_MIXER: usize = 8; // extra bit 0: salt doser, bit 1: sugar doser
pub const M_SALT: usize = 9;
pub const M_SUGAR: usize = 10;
pub const M_PB_PUMP: usize = 11;
pub const M_CAFE: usize = 12;
const WATER_RATE: f64 = 0.01; // L/s at full oxygen
const H2_PER_L: f64 = 111.0; // mol H2 per litre of water
const O2_PER_L: f64 = 55.5;
const GROW_TIME: f64 = 43200.0; // s for a crop to ripen (fresh air, 100 caterpillars, wet soil)
const CAT_K: f64 = 100.0; // caterpillars for half-speed propagation
const CAT_MAX: f64 = 400.0;
const CAT_BREED: f64 = 0.0002;
const CAT_BREATH: f64 = 0.00005; // mol O2 → CO2 per caterpillar per s
const PHOTO: f64 = 0.06; // mol CO2 → O2 per s at full growth
const SOIL_USE: f64 = 0.00004;
const IRRIGATE: f64 = 0.0002; // soil fraction per s
const IRRIGATE_L: f64 = 20.0; // litres per unit of soil moisture
const YIELD_PEANUT: f64 = 80.0; // kg of peanuts in a ripe room
const YIELD_OTHER: f64 = 120.0; // kg of leaves, soil, caterpillars...
const SEP_RATE: f64 = 0.03; // kg of mush per s
const MIX_RATE: f64 = 0.01; // L of paste per s
const SALT_DOSE: f64 = 0.016; // per L of paste
const SUGAR_DOSE: f64 = 0.065;
const CAFE_PB: f64 = 0.003; // L/s eaten in the cafeteria
const CAFE_WATER: f64 = 0.003;

const MAX_SUBSTEP: f64 = 0.5; // s of game time

/// Peanut butter viscosity (Pa·s) at a temperature in °C.
pub fn pb_viscosity(t_c: f64) -> f64 {
    MU_REF * (MU_B * (1.0 / (t_c + KELVIN) - 1.0 / (T_MU_REF + KELVIN))).exp()
}

/// Wetted fraction of the drum: less peanut butter, less drag.
fn shear_area(fill: f64) -> f64 {
    0.05 + 0.95 * fill.clamp(0.0, 1.0)
}

// Engine part flags (command 21 / state field `engine_flags`).
pub const E_PRESENT: u32 = 1; // an engine frame stands on this room's valve site
pub const E_VALVE: u32 = 2; // valve body fitted in the branch
pub const E_ACTUATED: u32 = 4; // differential + lead screw + linkage pin all present
pub const E_LEDGER: u32 = 8; // ledger drum + its drive motor present
pub const E_REFERENCE: u32 = 16; // reference drum + escapement present
pub const E_JAR: u32 = 32; // peanut butter jar fitted
pub const E_VIVARIUM: u32 = 64; // beetle vivarium fitted
pub const E_ALL: u32 = 127;

#[derive(Clone, Debug)]
pub struct Room {
    pub temp: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Rack {
    pub active: bool,
    /// Room index it stands in, or -1 (corridor: heat goes to the building).
    pub zone: i8,
    /// Working blades fitted.
    pub blades: u8,
    pub on: bool,
}

#[derive(Clone, Debug)]
pub struct Engine {
    pub parts: u32,
    pub pb_temp: f64,
    pub pb_fill: f64,
    pub ledger_omega: f64,
    pub ledger_angle: f64,
    pub ref_angle: f64,
    pub valve: f64,
    pub drain_open: bool,
    pub supply_connected: bool,
    pub holding: bool,
    pub chimes: u32,
    /// Beetle colony, 0..1.
    pub beetles: f64,
    pub jar_salt: f64,
    pub jar_sugar: f64,
    /// The valve's actual position: the lead screw's integral plus the beetles' push.
    pub valve_out: f64,
    last_err_positive: bool,
    chime_armed: bool,
}

#[derive(Clone, Debug, Default)]
pub struct Air {
    pub o2: f64,
    pub co2: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Farm {
    pub growth: f64,
    pub cats: f64,
    pub soil: f64,
    pub harvests: u32,
}

#[derive(Clone, Debug, Default)]
pub struct Plant {
    pub works: [bool; MACHINES],
    pub on: [bool; MACHINES],
    pub extra: [u32; MACHINES],
    pub air: [Air; ZONES],
    pub farms: [Farm; 2],
    pub water_l: f64,
    pub h2_mol: f64,
    pub mush_kg: f64,
    pub mush_peanut_kg: f64,
    pub paste_l: f64,
    pub pb_l: f64,
    pub pb_salt: f64,
    pub pb_sugar: f64,
    pub salt_kg: f64,
    pub sugar_kg: f64,
    pub synth_rate: f64,
    pub sep_rate: f64,
    pub mix_rate: f64,
    pub pb_flowing: bool,
}

impl Plant {
    fn new() -> Self {
        let mut p = Plant {
            works: [true; MACHINES],
            on: [true; MACHINES],
            extra: [0; MACHINES],
            water_l: 500.0,
            h2_mol: 200_000.0,
            paste_l: 10.0,
            pb_l: 150.0,
            pb_salt: 0.015,
            pb_sugar: 0.06,
            salt_kg: 40.0,
            sugar_kg: 150.0,
            ..Default::default()
        };
        p.extra[M_MIXER] = 3;
        for a in &mut p.air {
            *a = Air { o2: O2_FRESH, co2: CO2_FRESH };
        }
        p.farms = [Farm { growth: 0.3, cats: 200.0, soil: 0.6, harvests: 0 }, Farm { growth: 0.7, cats: 200.0, soil: 0.6, harvests: 0 }];
        p
    }
    fn running(&self, m: usize) -> bool {
        self.works[m] && self.on[m]
    }
}

impl Engine {
    fn has(&self, flag: u32) -> bool {
        self.parts & flag != 0
    }
    /// Is this branch open to flow at all?
    fn branch_open(&self) -> bool {
        self.has(E_PRESENT) && self.has(E_VALVE)
    }
}

#[derive(Clone, Debug)]
pub struct Sector {
    pub rooms: [Room; ROOMS],
    pub racks: [Rack; MAX_RACKS],
    pub engines: [Engine; ROOMS],
    pub coolant_temp: f64,
    /// Pump built on its site with motor, impeller and cover.
    pub pump_works: bool,
    pub pump_on: bool,
    /// Chiller built on its site with compressor and fuse.
    pub chiller_works: bool,
    pub chiller_on: bool,
    pub fans: u8,
    pub load_scale: f64,
    pub pump_head: f64,
    pub chiller_power: f64,
    pub flows: [f64; ROOMS],
    pub heat_removed: [f64; ROOMS],
    pub room_load: [f64; ROOMS],
    pub plant: Plant,
    pub time: f64,
}

impl Sector {
    pub fn new(load_scale: f64) -> Self {
        let engine = || Engine {
            parts: E_ALL,
            pb_temp: 26.0,
            pb_fill: 1.0,
            ledger_omega: OMEGA_REF,
            ledger_angle: 0.0,
            ref_angle: 0.0,
            valve: 0.3,
            drain_open: false,
            supply_connected: true,
            holding: false,
            chimes: 0,
            beetles: 1.0,
            jar_salt: 0.015,
            jar_sugar: 0.06,
            valve_out: 0.3,
            last_err_positive: true,
            chime_armed: false,
        };
        let mut racks: [Rack; MAX_RACKS] = Default::default();
        for i in 0..ROOMS {
            racks[i] = Rack { active: true, zone: i as i8, blades: STOCK_BLADES[i], on: true };
        }
        Sector {
            rooms: [Room { temp: 26.0 }, Room { temp: 26.0 }, Room { temp: 26.0 }],
            racks,
            engines: [engine(), engine(), engine()],
            coolant_temp: 10.0,
            pump_works: true,
            pump_on: true,
            chiller_works: true,
            chiller_on: true,
            fans: 1,
            load_scale,
            pump_head: 0.0,
            chiller_power: 0.0,
            flows: [0.0; ROOMS],
            heat_removed: [0.0; ROOMS],
            room_load: [0.0; ROOMS],
            plant: Plant::new(),
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
        // 0. Heat from racks, by the room they stand in.
        self.room_load = [0.0; ROOMS];
        for r in &self.racks {
            if r.active && r.on && r.zone >= 0 && (r.zone as usize) < ROOMS {
                self.room_load[r.zone as usize] += r.blades as f64 * BLADE_HEAT * self.load_scale;
            }
        }

        // 1. Hydraulics: parallel branches between supply and return headers,
        //    fed by a pump with a linear curve. One-node nodal analysis.
        let mut cond = [0.0; ROOMS];
        for (c, e) in cond.iter_mut().zip(&self.engines) {
            if e.branch_open() {
                let x = e.valve_out.max(VALVE_MIN);
                *c = 1.0 / (R_PIPE + R_VALVE_OPEN / (x * x));
            }
        }
        let g_pump = 1.0 / R_PUMP;
        let g_sum: f64 = cond.iter().sum();
        self.pump_head = if self.pump_works && self.pump_on { PUMP_HEAD * g_pump / (g_pump + g_sum) } else { 0.0 };

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
            let t = self.rooms[i].temp;
            let mut p = self.room_load[i] + G_AMBIENT * (T_AMBIENT - t);
            if i > 0 {
                p += G_ROOM_ROOM * (self.rooms[i - 1].temp - t);
            }
            if i + 1 < ROOMS {
                p += G_ROOM_ROOM * (self.rooms[i + 1].temp - t);
            }
            p -= self.heat_removed[i];
            d_room[i] = p / C_ROOM * dt;
        }
        for (r, d) in self.rooms.iter_mut().zip(d_room) {
            r.temp += d;
        }

        // 4. Coolant reservoir and chiller.
        self.chiller_power = if self.chiller_works && self.chiller_on {
            let cap = CHILL_MAX * CHILL_FAN_FACTOR[self.fans.min(2) as usize];
            (CHILL_GAIN * (ts - T_CHILL_SET)).clamp(0.0, cap)
        } else {
            0.0
        };
        self.coolant_temp +=
            (q_total - self.chiller_power + G_COOLANT_AMBIENT * (T_AMBIENT - ts)) / C_COOLANT * dt;

        // 5. The plant (air, water, peanuts, peanut butter) first: it decides
        //    whether there's peanut butter in the supply lines.
        self.plant_step(dt);
        let pb_available = self.plant.pb_flowing;

        // 6. Reconciliation Engines.
        for i in 0..ROOMS {
            let room_t = self.rooms[i].temp;
            let e = &mut self.engines[i];
            if !e.has(E_PRESENT) {
                continue;
            }
            let mut b = if e.has(E_JAR) {
                if e.drain_open {
                    e.pb_fill -= DRAIN_RATE * dt;
                }
                // Beetles eat what seeps from the jar.
                if e.has(E_VIVARIUM) {
                    e.pb_fill -= BEETLE_EAT * e.beetles * dt;
                }
                if e.supply_connected && pb_available && e.pb_fill < 1.0 {
                    let added = (SUPPLY_RATE * dt).min(1.0 - e.pb_fill);
                    let total = e.pb_fill.max(0.0) + added;
                    e.jar_salt = (e.jar_salt * e.pb_fill.max(0.0) + self.plant.pb_salt * added) / total;
                    e.jar_sugar = (e.jar_sugar * e.pb_fill.max(0.0) + self.plant.pb_sugar * added) / total;
                    e.pb_fill += added;
                    self.plant.pb_l = (self.plant.pb_l - added * PB_JAR_L).max(0.0);
                }
                e.pb_fill = e.pb_fill.clamp(0.0, 1.0);
                let c_pb = PB_MASS * CP_PB * e.pb_fill + C_JAR;
                e.pb_temp += G_PB * (room_t - e.pb_temp) / c_pb * dt;
                K_GEOM * pb_viscosity(e.pb_temp) * shear_area(e.pb_fill)
            } else {
                // Jar removed: the paddle spins in air. (The supply line spills on the floor.)
                e.pb_temp = room_t;
                BEARING_DAMPING
            };
            if e.holding {
                b += HOLD_DAMPING;
            }
            let torque = if e.has(E_LEDGER) { MOTOR_TORQUE } else { 0.0 };
            // Implicit update: J dω/dt = τ - bω (stable for any dt).
            e.ledger_omega = (DRUM_J * e.ledger_omega + dt * torque) / (DRUM_J + dt * b);
            if !e.has(E_LEDGER) {
                e.ledger_omega = 0.0; // no drum to turn
            }
            let ref_omega = if e.has(E_REFERENCE) { OMEGA_REF } else { 0.0 };
            e.ledger_angle = (e.ledger_angle + e.ledger_omega * dt) % TAU;
            e.ref_angle = (e.ref_angle + ref_omega * dt) % TAU;

            let err = e.ledger_omega - ref_omega;
            if e.has(E_ACTUATED) && e.has(E_VALVE) {
                // Differential output = half the speed difference → lead screw → valve.
                e.valve = (e.valve + VALVE_GAIN * 0.5 * err * dt).clamp(0.0, 1.0);
            }
            // Beetles come and go with the salt and sugar in their food.
            if e.has(E_VIVARIUM) {
                let lure = if e.has(E_JAR) && e.pb_fill > 0.01 {
                    (e.jar_salt / SALT_NEED).min(1.0) * (e.jar_sugar / SUGAR_NEED).min(1.0)
                } else {
                    0.0
                };
                e.beetles = (e.beetles + BEETLE_RATE * (2.0 * lure - 1.0) * dt).clamp(0.0, 1.0);
            }
            let push = if e.has(E_VIVARIUM) && e.has(E_VALVE) { KP_BEETLES * e.beetles * (room_t - T_MU_REF) } else { 0.0 };
            e.valve_out = (e.valve + push).clamp(0.0, 1.0);
            // The chime rings when a real imbalance has been reconciled.
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

    fn plant_step(&mut self, dt: f64) {
        let p = &mut self.plant;

        // Air: every room swaps air with the corridor through its door; the
        // corridor swaps with the rest of the building.
        let corr = p.air[Z_CORRIDOR].clone();
        let mut d_o2 = 0.0;
        let mut d_co2 = 0.0;
        for z in 1..ZONES {
            let a = &mut p.air[z];
            let x_o2 = K_DOOR * (corr.o2 - a.o2) * dt;
            let x_co2 = K_DOOR * (corr.co2 - a.co2) * dt;
            a.o2 += x_o2;
            a.co2 += x_co2;
            d_o2 -= x_o2 * N_ROOM;
            d_co2 -= x_co2 * N_ROOM;
        }
        let c = &mut p.air[Z_CORRIDOR];
        c.o2 += d_o2 / N_CORRIDOR + K_OUT * (O2_FRESH - c.o2) * dt;
        c.co2 += d_co2 / N_CORRIDOR + K_OUT * (CO2_FRESH - c.co2) * dt;

        // Water: H2 burnt in the water room's own oxygen.
        let o2w = p.air[Z_WATER].o2;
        let tank = p.works[M_WATER]; // no tank: nowhere to put water, nothing to draw from
        p.synth_rate = if p.running(M_SYNTH) && p.works[M_H2] && tank && p.h2_mol > 0.0 && p.water_l < 2000.0 {
            WATER_RATE * ((o2w - 0.10) / 0.08).clamp(0.0, 1.0)
        } else {
            0.0
        };
        p.water_l += p.synth_rate * dt;
        p.h2_mol = (p.h2_mol - p.synth_rate * H2_PER_L * dt).max(0.0);
        p.air[Z_WATER].o2 -= p.synth_rate * O2_PER_L * dt / N_ROOM;

        // Farms: caterpillars propagate the peanuts; plants need water and CO2.
        for k in 0..2 {
            let z = Z_FARM[k];
            let irrigating = p.running(M_IRRIGATOR[k]);
            let grinding = p.running(M_GRINDER[k]);
            let f = &mut p.farms[k];
            if irrigating && tank && f.soil < 0.6 && p.water_l > 0.0 {
                let ds = IRRIGATE * dt;
                f.soil += ds;
                p.water_l = (p.water_l - ds * IRRIGATE_L).max(0.0);
            }
            let water_ok = (f.soil / 0.3).clamp(0.0, 1.0);
            let co2 = p.air[z].co2;
            let co2_ok = co2 / (co2 + 0.0004) * 2.0; // 1.0 at fresh air
            let cat_ok = f.cats / (f.cats + CAT_K) * 2.0; // 1.0 at 100 caterpillars
            let grow = if f.growth < 1.0 { water_ok * co2_ok.min(2.0) * cat_ok / GROW_TIME } else { 0.0 };
            f.growth = (f.growth + grow * dt).min(1.0);
            f.soil = (f.soil - SOIL_USE * f.growth * dt).max(0.0);
            f.cats += CAT_BREED * f.cats * (1.0 - f.cats / CAT_MAX) * dt;
            let photo = PHOTO * f.growth * water_ok * (co2 / (co2 + 0.0004));
            p.air[z].o2 += (photo - CAT_BREATH * f.cats) * dt / N_ROOM;
            p.air[z].co2 += (CAT_BREATH * f.cats - photo) * dt / N_ROOM;
            p.air[z].co2 = p.air[z].co2.max(0.0);
            // Harvest: the whole room goes through the grinder.
            if f.growth >= 1.0 && grinding {
                let picked = (f.cats / CAT_K).min(1.0); // caterpillars gather the peanuts first
                p.mush_kg += YIELD_PEANUT * picked + YIELD_OTHER + YIELD_PEANUT * (1.0 - picked);
                p.mush_peanut_kg += YIELD_PEANUT * picked;
                f.growth = 0.02;
                f.cats = 20.0; // the egg reserve
                f.harvests += 1;
            }
        }

        // Separator: every part needed, no simpler way.
        p.sep_rate = if p.running(M_SEPARATOR) && p.mush_kg > 0.0 { SEP_RATE.min(p.mush_kg / dt) } else { 0.0 };
        if p.sep_rate > 0.0 {
            let processed = p.sep_rate * dt;
            let frac = p.mush_peanut_kg / p.mush_kg;
            p.paste_l += processed * frac;
            p.mush_peanut_kg = (p.mush_peanut_kg - processed * frac).max(0.0);
            p.mush_kg = (p.mush_kg - processed).max(0.0);
        }

        // Mixer: paste + salt + sugar.
        p.mix_rate = if p.running(M_MIXER) && p.paste_l > 0.0 && p.pb_l < 400.0 { MIX_RATE.min(p.paste_l / dt) } else { 0.0 };
        if p.mix_rate > 0.0 {
            let paste = p.mix_rate * dt;
            let salt = if p.extra[M_MIXER] & 1 != 0 && p.works[M_SALT] { (SALT_DOSE * paste).min(p.salt_kg) } else { 0.0 };
            let sugar = if p.extra[M_MIXER] & 2 != 0 && p.works[M_SUGAR] { (SUGAR_DOSE * paste).min(p.sugar_kg) } else { 0.0 };
            let added = paste + salt + sugar;
            let total = p.pb_l + added;
            p.pb_salt = (p.pb_salt * p.pb_l + salt) / total;
            p.pb_sugar = (p.pb_sugar * p.pb_l + sugar) / total;
            p.pb_l = total;
            p.paste_l -= paste;
            p.salt_kg -= salt;
            p.sugar_kg -= sugar;
        }

        // Distribution: the PB pump feeds the engines' supply lines and the cafeteria.
        p.pb_flowing = p.running(M_PB_PUMP) && p.pb_l > 0.0;
        if p.running(M_CAFE) {
            if p.pb_flowing {
                p.pb_l = (p.pb_l - CAFE_PB * dt).max(0.0);
            }
            if p.works[M_WATER] {
                p.water_l = (p.water_l - CAFE_WATER * dt).max(0.0);
            }
        }
    }

    pub fn command(&mut self, kind: u32, index: usize, value: f64) {
        let on = value > 0.5;
        let room = index.min(ROOMS - 1);
        let bits = value.max(0.0) as u32;
        match kind {
            1 => self.engines[room].drain_open = on,
            2 => self.engines[room].supply_connected = on,
            3 => self.engines[room].holding = on,
            20 => {
                // Rack: bit0 active, bit1 on, bits2-5 blades, bits6-7 zone+1.
                if let Some(r) = self.racks.get_mut(index) {
                    r.active = bits & 1 != 0;
                    r.on = bits & 2 != 0;
                    r.blades = ((bits >> 2) & 15) as u8;
                    r.zone = ((bits >> 6) & 3) as i8 - 1;
                }
            }
            21 => self.engines[room].parts = bits & E_ALL,
            22 => self.engines[room].pb_fill = value.clamp(0.0, 1.0),
            23 => self.engines[room].valve = value.clamp(0.0, 1.0),
            24 => {
                self.pump_works = bits & 1 != 0;
                self.pump_on = bits & 2 != 0;
            }
            25 => {
                self.chiller_works = bits & 1 != 0;
                self.chiller_on = bits & 2 != 0;
            }
            26 => self.fans = bits.min(2) as u8,
            27 => self.engines[room].jar_salt = value.max(0.0),
            28 => self.engines[room].jar_sugar = value.max(0.0),
            29 => self.engines[room].beetles = value.clamp(0.0, 1.0),
            30 => {
                if index < MACHINES {
                    self.plant.works[index] = bits & 1 != 0;
                    self.plant.on[index] = bits & 2 != 0;
                    self.plant.extra[index] = bits >> 2;
                }
            }
            _ => {}
        }
    }

    pub fn write_state(&self, out: &mut [f64]) {
        out[0] = self.time;
        out[1] = self.coolant_temp;
        out[2] = self.chiller_power;
        out[3] = self.pump_head;
        out[4] = ((self.pump_head > 0.0) as u8 | ((self.chiller_power > 0.0) as u8) << 1) as f64;
        out[5] = self.fans as f64;
        for i in 0..ROOMS {
            let e = &self.engines[i];
            let o = &mut out[STATE_HEADER + i * ROOM_STRIDE..STATE_HEADER + (i + 1) * ROOM_STRIDE];
            o[0] = self.rooms[i].temp;
            o[1] = self.room_load[i];
            o[2] = self.flows[i];
            o[3] = self.heat_removed[i];
            o[4] = e.pb_temp;
            o[5] = e.pb_fill;
            o[6] = if e.has(E_JAR) { pb_viscosity(e.pb_temp) } else { 0.0 };
            o[7] = e.ledger_omega;
            o[8] = e.ledger_angle;
            o[9] = e.ref_angle;
            o[10] = e.valve_out;
            o[11] = e.parts as f64;
            o[12] = e.drain_open as u8 as f64;
            o[13] = e.supply_connected as u8 as f64;
            o[14] = e.holding as u8 as f64;
            o[15] = e.chimes as f64;
            o[16] = e.beetles;
            o[17] = e.jar_salt;
            o[18] = e.jar_sugar;
        }
        // The plant block.
        let p = &self.plant;
        let o = &mut out[PLANT..PLANT + P_LEN];
        for z in 0..ZONES {
            o[P_O2 + z] = p.air[z].o2;
            o[P_CO2 + z] = p.air[z].co2;
        }
        o[P_WATER] = p.water_l;
        o[P_H2] = p.h2_mol;
        o[P_MUSH] = p.mush_kg;
        o[P_PASTE] = p.paste_l;
        o[P_PB] = p.pb_l;
        o[P_PB_SALT] = p.pb_salt;
        o[P_PB_SUGAR] = p.pb_sugar;
        o[P_SALT] = p.salt_kg;
        o[P_SUGAR] = p.sugar_kg;
        o[P_SYNTH] = p.synth_rate;
        o[P_SEP] = p.sep_rate;
        o[P_MIX] = p.mix_rate;
        o[P_PB_FLOWING] = p.pb_flowing as u8 as f64;
        for k in 0..2 {
            let f = &p.farms[k];
            let b = P_FARM + k * 4;
            o[b] = f.growth;
            o[b + 1] = f.cats;
            o[b + 2] = f.soil;
            o[b + 3] = f.harvests as f64;
        }
    }
}

// ---------- state layout shared with TypeScript (src/simLayout.ts) ----------
pub const STATE_HEADER: usize = 6;
pub const ROOM_STRIDE: usize = 19;
pub const PLANT: usize = STATE_HEADER + ROOMS * ROOM_STRIDE;
pub const P_O2: usize = 0;
pub const P_CO2: usize = ZONES;
pub const P_WATER: usize = 2 * ZONES;
pub const P_H2: usize = P_WATER + 1;
pub const P_MUSH: usize = P_WATER + 2;
pub const P_PASTE: usize = P_WATER + 3;
pub const P_PB: usize = P_WATER + 4;
pub const P_PB_SALT: usize = P_WATER + 5;
pub const P_PB_SUGAR: usize = P_WATER + 6;
pub const P_SALT: usize = P_WATER + 7;
pub const P_SUGAR: usize = P_WATER + 8;
pub const P_SYNTH: usize = P_WATER + 9;
pub const P_SEP: usize = P_WATER + 10;
pub const P_MIX: usize = P_WATER + 11;
pub const P_PB_FLOWING: usize = P_WATER + 12;
pub const P_FARM: usize = P_WATER + 13; // 2 farms × [growth, caterpillars, soil, harvests]
pub const P_LEN: usize = P_FARM + 8;
pub const STATE_LEN: usize = PLANT + P_LEN;

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
    let w = &mut *w;
    w.resize(n as usize);
}

/// # Safety
/// `w` must come from `world_new`.
#[no_mangle]
pub unsafe extern "C" fn world_step(w: *mut World, dt: f64) {
    let w = &mut *w;
    w.step(dt);
}

/// # Safety
/// `w` must come from `world_new`.
#[no_mangle]
pub unsafe extern "C" fn world_command(w: *mut World, sector: u32, kind: u32, index: u32, value: f64) {
    let w = &mut *w;
    if let Some(s) = w.sectors.get_mut(sector as usize) {
        s.command(kind, index as usize, value);
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
        for _ in 0..(hours * 3600.0) as usize {
            s.step(1.0);
        }
    }

    fn settled() -> Sector {
        let mut s = Sector::new(1.0);
        run(&mut s, 12.0);
        s
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

    fn rack_bits(active: bool, on: bool, blades: u8, zone: i8) -> f64 {
        (active as u32 | (on as u32) << 1 | (blades as u32) << 2 | ((zone + 1) as u32) << 6) as f64
    }

    #[test]
    fn viscosity_falls_with_heat() {
        assert!(pb_viscosity(30.0) < pb_viscosity(22.0));
        assert!(pb_viscosity(15.0) > pb_viscosity(22.0));
        assert!((pb_viscosity(22.0) - MU_REF).abs() < 1e-9);
    }

    #[test]
    fn engines_regulate_rooms_to_setpoint() {
        let s = settled();
        report("baseline", &s);
        for r in &s.rooms {
            assert!((r.temp - 22.0).abs() < 1.0, "room at {:.2}", r.temp);
        }
    }

    #[test]
    fn draining_peanut_butter_overcools_and_starves_neighbours() {
        let base = settled();
        let mut s = base.clone();
        s.command(2, 1, 0.0);
        s.command(1, 1, 1.0);
        run(&mut s, 6.0);
        report("drained room 1", &s);
        assert!(s.engines[1].pb_fill < 0.01);
        assert!(s.engines[1].valve > 0.95);
        assert!(s.rooms[1].temp < base.rooms[1].temp - 1.0);
        assert!(s.flows[2] < base.flows[2]);
    }

    #[test]
    fn holding_the_drum_closes_the_valve_and_heats_the_room() {
        let mut s = settled();
        let before = s.rooms[2].temp;
        s.command(3, 2, 1.0);
        run(&mut s, 2.0);
        assert!(s.engines[2].valve < 0.05);
        assert!(s.rooms[2].temp > before + 2.0);
    }

    #[test]
    fn moving_a_rack_moves_its_heat() {
        let mut s = settled();
        // Carry room 2's 8-blade rack into room 0 (which already has 4 blades).
        s.command(20, 2, rack_bits(true, true, 8, 0));
        run(&mut s, 6.0);
        report("rack moved 2 → 0", &s);
        assert!((s.room_load[0] - 12.0 * BLADE_HEAT).abs() < 1.0);
        assert_eq!(s.room_load[2], 0.0);
        assert!(s.engines[0].valve > 0.9, "room 0's engine opens up");
        assert!(s.rooms[0].temp > 23.0, "12 blades overwhelm room 0's branch even fully open");
        assert!((s.rooms[2].temp - 22.0).abs() < 1.0, "room 2 still gains heat from the building; its engine holds it");
        assert!(s.engines[2].valve < 0.3, "...with the valve nearly shut");
    }

    #[test]
    fn removing_the_engine_seals_the_branch() {
        let mut s = settled();
        s.command(21, 1, 0.0); // engine frame gone from room 1's site
        run(&mut s, 2.0);
        assert_eq!(s.flows[1], 0.0);
        assert!(s.rooms[1].temp > 30.0);
    }

    #[test]
    fn missing_drums_drive_the_valve_to_the_stops() {
        let mut a = settled();
        a.command(21, 0, (E_ALL & !E_REFERENCE) as f64); // no reference: ledger always "ahead"
        run(&mut a, 2.0);
        assert!(a.engines[0].valve > 0.99);
        let mut b = settled();
        b.command(21, 0, (E_ALL & !E_LEDGER) as f64); // no ledger drive: always "behind"
        run(&mut b, 2.0);
        assert!(b.engines[0].valve < 0.01);
        let mut c = settled();
        let v = c.engines[0].valve;
        c.command(21, 0, (E_ALL & !E_ACTUATED) as f64); // linkage broken: valve frozen
        c.command(1, 0, 1.0);
        run(&mut c, 2.0);
        assert!((c.engines[0].valve - v).abs() < 1e-9);
    }

    #[test]
    fn broken_pump_or_chiller_stops_cooling() {
        let mut a = settled();
        a.command(24, 0, 2.0); // switched on but not working (no impeller, say)
        run(&mut a, 0.1);
        assert_eq!(a.pump_head, 0.0);
        let mut b = settled();
        b.command(25, 0, 2.0);
        run(&mut b, 0.1);
        assert_eq!(b.chiller_power, 0.0);
        let mut c = settled();
        c.command(26, 0, 0.0);
        run(&mut c, 3.0);
        report("no chiller fans", &c);
        assert!(c.chiller_power <= CHILL_MAX * 0.3 + 1.0);
    }

    fn worst_deviation(s: &mut Sector, hours: f64) -> f64 {
        let mut m: f64 = 0.0;
        for _ in 0..(hours * 3600.0) as usize {
            s.step(1.0);
            for r in &s.rooms {
                m = m.max((r.temp - 22.0).abs());
            }
        }
        m
    }

    #[test]
    fn without_salt_the_beetles_leave_and_the_engines_hunt() {
        let mut s = settled();
        // A disturbance: room 2's rack switched off for an hour, then back on.
        let bump = |s: &mut Sector| {
            s.command(20, 2, (1 | 0 << 1 | 8 << 2 | 3 << 6) as f64);
            run(s, 1.0);
            s.command(20, 2, (1 | 1 << 1 | 8 << 2 | 3 << 6) as f64);
        };
        let mut calm = s.clone();
        bump(&mut calm);
        run(&mut calm, 6.0);
        let steady = worst_deviation(&mut calm, 12.0);
        // No salt anywhere: in the silo, the tank or the jars.
        s.plant.salt_kg = 0.0;
        s.plant.pb_salt = 0.0;
        for e in &mut s.engines {
            e.jar_salt = 0.0;
        }
        run(&mut s, 12.0);
        bump(&mut s);
        run(&mut s, 6.0);
        let hunting = worst_deviation(&mut s, 12.0);
        eprintln!("worst deviation with beetles {steady:.2} °C, after they left {hunting:.2} °C");
        assert!(s.engines.iter().all(|e| e.beetles < 0.01));
        assert!(steady < 0.5);
        assert!(hunting > 2.0);
    }

    #[test]
    fn the_peanut_butter_chain_keeps_the_jars_full() {
        let mut s = settled();
        run(&mut s, 36.0);
        let p = &s.plant;
        eprintln!(
            "after 48 h: harvests {} {}, mush {:.0} kg, paste {:.1} L, PB {:.1} L (salt {:.3}, sugar {:.3}), water {:.0} L",
            p.farms[0].harvests, p.farms[1].harvests, p.mush_kg, p.paste_l, p.pb_l, p.pb_salt, p.pb_sugar, p.water_l
        );
        assert!(p.farms[0].harvests >= 1 && p.farms[1].harvests >= 1);
        assert!(p.pb_l > 0.0, "PB tank never runs dry");
        assert!(s.engines.iter().all(|e| e.pb_fill > 0.9 && e.beetles > 0.9));
    }

    #[test]
    fn a_broken_separator_starves_everything_downstream() {
        let mut s = settled();
        s.command(30, M_SEPARATOR, 2.0); // switched on, not working
        s.command(24, 0, 3.0);
        run(&mut s, 60.0);
        eprintln!("PB {:.1} L, mush {:.0} kg, jar fills {:.2} {:.2} {:.2}", s.plant.pb_l, s.plant.mush_kg, s.engines[0].pb_fill, s.engines[1].pb_fill, s.engines[2].pb_fill);
        assert!(s.plant.mush_kg > 100.0, "ground-up rooms pile up");
        assert_eq!(s.plant.pb_l, 0.0);
        assert!(s.engines.iter().all(|e| e.pb_fill < 0.5), "beetles eat the jars down");
    }

    #[test]
    fn the_water_room_breathes_its_own_oxygen() {
        let mut s = settled();
        let o2 = s.plant.air[Z_WATER].o2;
        eprintln!("water room O2 {:.3}, corridor {:.3}", o2, s.plant.air[Z_CORRIDOR].o2);
        assert!(o2 < 0.19 && o2 > 0.13);
        s.command(30, M_SYNTH, 0.0);
        run(&mut s, 3.0);
        assert!(s.plant.air[Z_WATER].o2 > 0.2, "air recovers through the door");
    }

    #[test]
    fn world_exports_roundtrip() {
        unsafe {
            let w = world_new(4, 7);
            world_step(w, 10.0);
            world_command(w, 0, 21, 2, 0.0);
            let p = world_state(w, 0);
            assert!(!p.is_null());
            let st = std::slice::from_raw_parts(p, STATE_LEN);
            assert_eq!(st[STATE_HEADER + 2 * ROOM_STRIDE + 11], 0.0); // engine 2 parts gone
            assert!(world_state(w, 99).is_null());
            world_free(w);
        }
    }
}

// ---------- Prototype 02: element world exports ----------
use elements::Elements;

/// `which`: 0 = the demo room, 1 = empty room.
#[no_mangle]
pub extern "C" fn elem_new(which: u32) -> *mut Elements {
    let e = if which == 0 { elements::demo() } else {
        let mut e = Elements::new();
        e.boxed(0, 0, elements::W - 1, elements::H - 1, elements::CONCRETE);
        e
    };
    Box::into_raw(Box::new(e))
}

/// # Safety
/// `e` must come from `elem_new` and not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn elem_free(e: *mut Elements) {
    if !e.is_null() {
        drop(Box::from_raw(e));
    }
}

/// # Safety
/// `e` must come from `elem_new`.
#[no_mangle]
pub unsafe extern "C" fn elem_step(e: *mut Elements, dt: f32) {
    let e = &mut *e;
    e.step(dt);
}

/// RGBA pixels, W×H×4 bytes.
/// # Safety
/// `e` must come from `elem_new`.
#[no_mangle]
pub unsafe extern "C" fn elem_render(e: *mut Elements, mode: u32) -> *const u8 {
    let e = &mut *e;
    e.render(mode).as_ptr()
}

/// [x, y, kind] per animal; see `elem_agent_count`.
/// # Safety
/// `e` must come from `elem_new`.
#[no_mangle]
pub unsafe extern "C" fn elem_agents(e: *mut Elements) -> *const f32 {
    let e = &mut *e;
    e.agent_data().as_ptr()
}

/// # Safety
/// `e` must come from `elem_new`.
#[no_mangle]
pub unsafe extern "C" fn elem_agent_count(e: *mut Elements) -> u32 {
    let e = &*e;
    e.marker_count() as u32
}

/// 96 floats describing one cell (see `Elements::probe`).
/// # Safety
/// `e` must come from `elem_new`.
#[no_mangle]
pub unsafe extern "C" fn elem_probe(e: *mut Elements, x: u32, y: u32) -> *const f32 {
    let e = &mut *e;
    let i = (y as usize).min(elements::H - 1) * elements::W + (x as usize).min(elements::W - 1);
    e.probe(i).as_ptr()
}

/// # Safety
/// `e` must come from `elem_new`.
#[no_mangle]
pub unsafe extern "C" fn elem_edit(e: *mut Elements, x: u32, y: u32, tool: u32, value: f32) {
    let e = &mut *e;
    e.edit(x as usize, y as usize, tool, value);
}

/// # Safety
/// `e` must come from `elem_new`.
#[no_mangle]
pub unsafe extern "C" fn elem_time(e: *mut Elements) -> f32 {
    let e = &*e;
    e.time
}

#[no_mangle]
pub extern "C" fn elem_width() -> u32 {
    elements::W as u32
}

#[no_mangle]
pub extern "C" fn elem_height() -> u32 {
    elements::H as u32
}
