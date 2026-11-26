//! Element-level simulation: Prototype 02.
//!
//! The world is a top-down grid of 10 cm cells. A cell is either a SOLID
//! material, or OPEN space holding a mixture of gases and liquids (and things
//! dissolved in them), at a temperature. Everything else emerges from a small
//! set of rules (see the vault note `Elements`):
//!
//! * **Pressure**: ideal gas law in whatever volume the liquids leave; liquids
//!   resist compression hard. Fluids flow down pressure differences; gases
//!   diffuse. One-way flaps only let flow pass in their direction.
//! * **Heat**: conducts between neighbours by material; rides along with flow.
//! * **Phase**: liquids evaporate until their vapour reaches saturation
//!   pressure (Clausius–Clapeyron); boiling is just that, fast. Ice melts.
//! * **Chemistry**: H and C burn with O (above ignition temperature, at a
//!   spark, or on gold); ammonia dissolves into cold water and leaves hot
//!   water; salt and sugar dissolve; steel rusts; dead matter rots: with
//!   oxygen into CO2 and heat, without it into methane.
//! * **Electricity**: zinc and copper in the same brine make a galvanic cell
//!   that sends sparks down conductors; sparks heat carbon, ignite gas, and
//!   split water.
//! * **Structure**: solids break when the pressure difference across them
//!   exceeds their strength; broken solids become powder, and powders are
//!   pushed around by pressure.
//! * **Life**: plants turn CO2 and water into oxygen and grow from soil;
//!   caterpillars breathe, eat plants and pollinate them (pollinated plants
//!   make peanuts); beetles seek 22 °C and salty-sweet peanut butter, and
//!   their bodies obstruct flow. Peanuts roasted past 430 K become paste.

pub const W: usize = 192;
pub const H: usize = 128;
pub const N: usize = W * H;
const V: f32 = 0.001; // m³ per cell (10 cm cube)
const RGAS: f32 = 8.314;
const P0: f32 = 101_325.0;
const T0: f32 = 293.15;
const SUBSTEP: f32 = 0.05; // s
const T_FLAME: f32 = 3200.0; // K: dissociation caps how hot a flame gets

// ---------------------------------------------------------------- species (in open cells)
pub const NSP: usize = 14;
pub const O2: usize = 0;
pub const N2: usize = 1;
pub const H2: usize = 2;
pub const CO2: usize = 3;
pub const STEAM: usize = 4;
pub const NH3G: usize = 5;
pub const CH4: usize = 6;
pub const WATER: usize = 7;
pub const NH3L: usize = 8;
pub const OIL: usize = 9;
pub const PB: usize = 10;
pub const SALT: usize = 11; // dissolved
pub const SUGAR: usize = 12; // dissolved
pub const NH3AQ: usize = 13; // ammonia dissolved in water
const NGAS: usize = 7;
const MM: [f32; NSP] = [0.032, 0.028, 0.002, 0.044, 0.018, 0.017, 0.016, 0.018, 0.017, 0.28, 0.30, 0.0585, 0.342, 0.017];
const CP: [f32; NSP] = [920., 1040., 14300., 840., 2000., 2100., 2200., 4186., 4700., 2000., 2000., 880., 1250., 4700.];
const RHO_LIQ: [f32; 4] = [1000., 680., 920., 1100.]; // water, liquid ammonia, oil, peanut butter

// ---------------------------------------------------------------- materials (solid cells)
pub const OPEN: u8 = 0;
pub const STEEL: u8 = 1;
pub const COPPER: u8 = 2;
pub const ZINC: u8 = 3;
pub const CARBON: u8 = 4;
pub const GLASS: u8 = 5;
pub const CONCRETE: u8 = 6;
pub const RUBBER: u8 = 7;
pub const GOLD: u8 = 8;
pub const ICE: u8 = 9;
pub const SOIL: u8 = 10;
pub const PLANT: u8 = 11;
pub const PEANUT: u8 = 12;
pub const RUBBLE: u8 = 13;
pub const SALT_X: u8 = 14;
pub const SUGAR_X: u8 = 15;
pub const ORGANIC: u8 = 16;
pub const RUST: u8 = 17;
pub const MESH: u8 = 18; // open: fluids pass; bodies and powders don't
pub const FLAP_E: u8 = 19; // open, one-way: east, south, west, north
pub const FLAP_S: u8 = 20;
pub const FLAP_W: u8 = 21;
pub const FLAP_N: u8 = 22;
pub const NMAT: usize = 23;

struct Mat {
    rho: f32,
    cp: f32,
    k: f32,
    strength: f32,
    conductor: bool,
    powder: bool,
    /// `hp` holds remaining mass (kg) instead of integrity.
    mass_hp: bool,
    color: [u8; 3],
}

const fn m(rho: f32, cp: f32, k: f32, strength: f32, conductor: bool, powder: bool, mass_hp: bool, color: [u8; 3]) -> Mat {
    Mat { rho, cp, k, strength, conductor, powder, mass_hp, color }
}

const MATS: [Mat; NMAT] = [
    m(0., 0., 0., 0., false, false, false, [52, 48, 42]),            // open (floor)
    m(7850., 470., 50., 3.0e6, true, false, false, [128, 136, 142]),  // steel
    m(8960., 385., 400., 1.5e6, true, false, false, [198, 107, 61]),  // copper
    m(7140., 388., 116., 5e5, true, false, true, [170, 178, 186]),    // zinc (hp = kg)
    m(2200., 710., 100., 2e5, true, false, false, [40, 40, 44]),      // carbon (graphite)
    m(2500., 840., 1.0, 2.5e5, false, false, false, [175, 210, 215]), // glass
    m(2400., 880., 1.5, 8e5, false, false, false, [120, 116, 108]),   // concrete
    m(1100., 2000., 0.15, 1e5, false, false, false, [46, 46, 46]),    // rubber
    m(19300., 129., 318., 5e5, true, false, false, [242, 201, 76]),   // gold
    m(917., 2100., 2.2, 2e5, false, false, true, [210, 235, 250]),    // ice (hp = kg water)
    m(1500., 800., 0.5, 3e4, false, false, false, [110, 82, 52]),     // soil
    m(800., 3000., 0.3, 2e4, false, false, false, [93, 138, 58]),     // plant
    m(600., 2000., 0.2, 0., false, true, false, [201, 164, 106]),     // peanut
    m(1600., 840., 0.4, 0., false, true, false, [96, 92, 86]),        // rubble
    m(2160., 880., 6.0, 0., false, true, true, [240, 240, 240]),      // salt crystals (hp = kg)
    m(1590., 1250., 0.5, 0., false, true, true, [217, 195, 154]),     // sugar (hp = kg)
    m(700., 2500., 0.2, 0., false, true, true, [70, 52, 30]),         // dead organic matter (hp = kg)
    m(5200., 650., 0.5, 0., false, true, false, [140, 70, 40]),       // rust
    m(0., 0., 0., 0., false, false, false, [90, 100, 104]),           // mesh (open)
    m(0., 0., 0., 0., false, false, false, [60, 60, 60]),             // flaps (open, one-way)
    m(0., 0., 0., 0., false, false, false, [60, 60, 60]),
    m(0., 0., 0., 0., false, false, false, [60, 60, 60]),
    m(0., 0., 0., 0., false, false, false, [60, 60, 60]),
];

#[inline]
pub fn is_open(mat: u8) -> bool {
    mat == OPEN || mat == MESH || (FLAP_E..=FLAP_N).contains(&mat)
}
#[inline]
fn passable(mat: u8) -> bool {
    mat == OPEN || (FLAP_E..=FLAP_N).contains(&mat)
}
/// Can an animal stand here? Open floor with air to breathe, not a pool of liquid.
#[inline]
fn walkable(mat: u8, c: &[f32; NSP]) -> bool {
    passable(mat) && liq_vol(c) < 0.5 * V
}
#[inline]
fn flap_dir(mat: u8) -> Option<usize> {
    if (FLAP_E..=FLAP_N).contains(&mat) { Some((mat - FLAP_E) as usize) } else { None }
}
const DIRS: [(i32, i32); 4] = [(1, 0), (0, 1), (-1, 0), (0, -1)]; // E S W N

#[inline]
fn liq_vol(c: &[f32; NSP]) -> f32 {
    c[WATER] / RHO_LIQ[0] + c[NH3L] / RHO_LIQ[1] + c[OIL] / RHO_LIQ[2] + c[PB] / RHO_LIQ[3]
}
#[inline]
fn gas_mol(c: &[f32; NSP]) -> f32 {
    let mut n = 0.0;
    for s in 0..NGAS {
        n += c[s] / MM[s];
    }
    n
}
#[inline]
fn free_vol(c: &[f32; NSP]) -> f32 {
    (V - liq_vol(c)).max(0.03 * V)
}
#[inline]
fn fluid_pressure(c: &[f32; NSP], t: f32) -> f32 {
    let vl = liq_vol(c);
    gas_mol(c) * RGAS * t / free_vol(c) + 3e6 * (vl / V - 0.97).max(0.0)
}
/// How easily the liquids in a cell flow (water = 1). Peanut butter thins with heat.
fn fluidity(c: &[f32; NSP], t: f32) -> f32 {
    let lw = c[WATER] + c[NH3L] + c[OIL] + c[PB];
    if lw < 1e-9 {
        return 1.0;
    }
    let pb = if c[PB] > 0.0 { lookup(&tables().pb_fluidity, t) } else { 0.0 };
    (c[WATER] + c[NH3L] * 1.2 + c[OIL] * 0.05 + c[PB] * pb) / lw
}
fn psat(l: f32, tb: f32, t: f32) -> f32 {
    P0 * ((l / RGAS) * (1.0 / tb - 1.0 / t.max(30.0))).min(30.0).exp()
}

/// Saturation pressure tables (1 K steps): WebAssembly has no fast exp().
struct PsatTables {
    water: Vec<f32>,
    ammonia: Vec<f32>,
    pb_fluidity: Vec<f32>,
}
fn tables() -> &'static PsatTables {
    static T: std::sync::OnceLock<PsatTables> = std::sync::OnceLock::new();
    T.get_or_init(|| PsatTables {
        water: (0..6002).map(|k| psat(40_700.0, 373.15, k as f32)).collect(),
        ammonia: (0..6002).map(|k| psat(23_350.0, 239.8, k as f32)).collect(),
        pb_fluidity: (0..6002).map(|k| 0.003 * (5000.0 * (1.0 / 295.0 - 1.0 / (k as f32).max(200.0))).exp().min(50.0)).collect(),
    })
}
#[inline]
fn lookup(table: &[f32], t: f32) -> f32 {
    let t = t.clamp(0.0, 6000.0);
    let k = t as usize;
    let f = t - k as f32;
    table[k] * (1.0 - f) + table[k + 1] * f
}

#[derive(Clone, Copy, Debug)]
pub struct Agent {
    pub kind: u8, // 0 caterpillar, 1 beetle
    pub cell: usize,
    pub energy: f32,
}
pub const CATERPILLAR: u8 = 0;
pub const BEETLE: u8 = 1;

pub struct Elements {
    pub mat: Vec<u8>,
    pub temp: Vec<f32>,
    pub m: Vec<[f32; NSP]>,
    pub hp: Vec<f32>,
    pub spark: Vec<u8>,
    pub aux: Vec<f32>,  // plants: stored energy
    pub aux2: Vec<u16>, // plants: pollinated (ticks remaining)
    pub agents: Vec<Agent>,
    pub time: f32,
    substeps: u64,
    rng: u32,
    pres: Vec<f32>,
    cap: Vec<f32>,
    kcond: Vec<f32>,
    /// Pressure last substep, and how many substeps since a sudden jump (a blast wave).
    pres_prev: Vec<f32>,
    shock: Vec<u8>,
    /// Connected open spaces: which one each cell is in, and its average pressure.
    region: Vec<u32>,
    region_p: Vec<f32>,
    fluid: Vec<f32>,
    /// Flow through each cell's east and south faces (fraction of upstream per substep),
    /// separately for gas and liquid. It has momentum: pressure accelerates it, friction slows it.
    flow_g: Vec<[f32; 2]>,
    flow_l: Vec<[f32; 2]>,
    dm: Vec<[f32; NSP]>,
    de: Vec<f32>,
    crowd: Vec<u8>,
    /// How far (in steps) to the nearest beetle food / plant: animals follow the smell.
    scent_food: Vec<u16>,
    scent_plant: Vec<u16>,
    life_ticks: u64,
    ignite: Vec<bool>,
    battery: Vec<bool>,
    rgba: Vec<u8>,
    agent_buf: Vec<f32>,
    probe_buf: [f32; 24],
}

impl Default for Elements {
    fn default() -> Self {
        Self::new()
    }
}

impl Elements {
    /// An empty world of still room air.
    pub fn new() -> Self {
        let mut e = Elements {
            mat: vec![OPEN; N],
            temp: vec![T0; N],
            m: vec![[0.0; NSP]; N],
            hp: vec![1.0; N],
            spark: vec![0; N],
            aux: vec![0.0; N],
            aux2: vec![0; N],
            agents: Vec::new(),
            time: 0.0,
            substeps: 0,
            rng: 0x9e37_79b9,
            pres: vec![P0; N],
            cap: vec![1.0; N],
            kcond: vec![0.026; N],
            pres_prev: vec![P0; N],
            shock: vec![0; N],
            region: vec![u32::MAX; N],
            region_p: Vec::new(),
            fluid: vec![1.0; N],
            flow_g: vec![[0.0; 2]; N],
            flow_l: vec![[0.0; 2]; N],
            dm: vec![[0.0; NSP]; N],
            de: vec![0.0; N],
            crowd: vec![0; N],
            scent_food: vec![u16::MAX; N],
            scent_plant: vec![u16::MAX; N],
            life_ticks: 0,
            ignite: vec![false; N],
            battery: vec![false; N],
            rgba: vec![0; N * 4],
            agent_buf: Vec::new(),
            probe_buf: [0.0; 24],
        };
        for i in 0..N {
            e.fill_air(i, 1.0);
        }
        e
    }

    fn rand(&mut self) -> f32 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 17;
        self.rng ^= self.rng << 5;
        (self.rng >> 8) as f32 / (1u32 << 24) as f32
    }

    #[inline]
    pub fn idx(x: usize, y: usize) -> usize {
        y * W + x
    }
    #[inline]
    fn nb(i: usize, d: usize) -> Option<usize> {
        let (x, y) = ((i % W) as i32 + DIRS[d].0, (i / W) as i32 + DIRS[d].1);
        if x < 0 || y < 0 || x >= W as i32 || y >= H as i32 { None } else { Some(y as usize * W + x as usize) }
    }

    // ---------------------------------------------------------------- building helpers
    /// Fresh room air (21% O2, 79% N2, 400 ppm CO2, half humidity) at `atm` atmospheres.
    pub fn fill_air(&mut self, i: usize, atm: f32) {
        let n = atm * P0 * V / (RGAS * T0);
        let c = &mut self.m[i];
        *c = [0.0; NSP];
        c[O2] = 0.21 * n * MM[O2];
        c[N2] = 0.79 * n * MM[N2];
        c[CO2] = 0.0004 * n * MM[CO2];
        c[STEAM] = 0.5 * psat(40_700.0, 373.15, T0) * V / (RGAS * T0) * MM[STEAM];
        self.temp[i] = T0;
    }
    pub fn set_solid(&mut self, i: usize, mat: u8) {
        self.mat[i] = mat;
        self.m[i] = [0.0; NSP];
        let mt = &MATS[mat as usize];
        self.hp[i] = if mt.mass_hp { mt.rho * V } else { 1.0 };
        self.spark[i] = 0;
        self.aux[i] = if mat == PLANT { 0.2 } else { 0.0 };
        self.aux2[i] = 0;
        if is_open(mat) {
            self.fill_air(i, 1.0);
        }
    }
    pub fn clear(&mut self, i: usize) {
        self.mat[i] = OPEN;
        self.hp[i] = 1.0;
        self.fill_air(i, 1.0);
    }
    pub fn rect(&mut self, x0: usize, y0: usize, x1: usize, y1: usize, mat: u8) {
        for y in y0..=y1 {
            for x in x0..=x1 {
                self.set_solid(Self::idx(x, y), mat);
            }
        }
    }
    /// Walls of `mat` around an open interior.
    pub fn boxed(&mut self, x0: usize, y0: usize, x1: usize, y1: usize, mat: u8) {
        for x in x0..=x1 {
            self.set_solid(Self::idx(x, y0), mat);
            self.set_solid(Self::idx(x, y1), mat);
        }
        for y in y0..=y1 {
            self.set_solid(Self::idx(x0, y), mat);
            self.set_solid(Self::idx(x1, y), mat);
        }
    }
    /// Fill open cells in a rectangle with a mixture: liquids replace air, gases add.
    pub fn fill(&mut self, x0: usize, y0: usize, x1: usize, y1: usize, f: impl Fn(&mut [f32; NSP])) {
        for y in y0..=y1 {
            for x in x0..=x1 {
                let i = Self::idx(x, y);
                if is_open(self.mat[i]) {
                    f(&mut self.m[i]);
                }
            }
        }
    }
    pub fn spawn(&mut self, x: usize, y: usize, kind: u8, count: usize) {
        for k in 0..count {
            let i = Self::idx((x + k % 5).min(W - 1), (y + k / 5).min(H - 1));
            if passable(self.mat[i]) {
                self.agents.push(Agent { kind, cell: i, energy: 1.0 });
            }
        }
    }

    // ---------------------------------------------------------------- physics
    fn heat_cap(&self, i: usize) -> f32 {
        let mat = self.mat[i];
        if is_open(mat) {
            let c = &self.m[i];
            let mut h = 0.2;
            for s in 0..NSP {
                h += c[s] * CP[s];
            }
            h
        } else {
            let mt = &MATS[mat as usize];
            if mt.mass_hp { (self.hp[i] * mt.cp).max(1.0) } else { mt.rho * mt.cp * V }
        }
    }
    fn conductivity(&self, i: usize) -> f32 {
        let mat = self.mat[i];
        if is_open(mat) {
            if liq_vol(&self.m[i]) > 0.3 * V { 0.6 } else { 0.026 }
        } else {
            MATS[mat as usize].k
        }
    }

    pub fn step(&mut self, dt: f32) {
        let n = (dt / SUBSTEP).ceil().max(1.0) as usize;
        for _ in 0..n {
            self.substep();
        }
    }

    fn substep(&mut self) {
        let dt = SUBSTEP;
        self.substeps += 1;
        for i in 0..N {
            let open = is_open(self.mat[i]);
            self.pres[i] = if open { fluid_pressure(&self.m[i], self.temp[i]) } else { 0.0 };
            self.fluid[i] = if open { fluidity(&self.m[i], self.temp[i]) } else { 1.0 };
            // A sudden jump in one substep is a blast wave: for a moment, that local
            // pressure is real. Anything slower would even out at the speed of sound.
            if open && self.pres[i] > self.pres_prev[i] * 1.3 + 5000.0 {
                self.shock[i] = 6;
            } else {
                self.shock[i] = self.shock[i].saturating_sub(1);
            }
            self.pres_prev[i] = self.pres[i];
        }
        self.flow(dt);
        for i in 0..N {
            self.cap[i] = self.heat_cap(i);
            self.kcond[i] = self.conductivity(i);
        }
        self.conduct(dt);
        self.sparks();
        if self.substeps % 30 == 1 {
            self.find_batteries();
        }
        self.react(dt);
        self.solids(dt);
        if self.substeps % 2 == 0 {
            self.structure(dt * 2.0);
            self.powders();
        }
        if self.substeps % 4 == 0 {
            self.life();
        }
        self.time += dt;
    }

    /// Pressure-driven flow, diffusion, and the heat carried with them.
    ///
    /// Each face has a flow rate with momentum (the "virtual pipes" method):
    /// a pressure difference accelerates it, friction slows it, viscous liquids
    /// slow it more. So pressure travels as a wave and a steady difference
    /// drives a steady flow. Mass moves out of the upstream cell only.
    fn flow(&mut self, _dt: f32) {
        for i in 0..N {
            self.dm[i] = [0.0; NSP];
            self.de[i] = 0.0;
        }
        const ACCEL_G: f32 = 0.02;
        const ACCEL_L: f32 = 0.03;
        const FRICTION_G: f32 = 0.06;
        const MAX_F: f32 = 0.2;
        const D_GAS: f32 = 0.04;
        let ok = |mat: u8, dir: usize| flap_dir(mat).map_or(true, |f| f == dir);
        for a in 0..N {
            for d in 0..2 {
                let Some(b) = Self::nb(a, d) else { continue };
                if !is_open(self.mat[a]) || !is_open(self.mat[b]) {
                    self.flow_g[a][d] = 0.0;
                    self.flow_l[a][d] = 0.0;
                    continue;
                }
                let fwd_ok = ok(self.mat[a], d) && ok(self.mat[b], d); // a → b allowed
                let back_ok = ok(self.mat[a], d + 2) && ok(self.mat[b], d + 2); // b → a allowed
                let dp = self.pres[a] - self.pres[b];
                let pavg = 0.5 * (self.pres[a] + self.pres[b]) + 1000.0;
                let crowd = 1.0 / (1.0 + 3.0 * (self.crowd[a] as f32 + self.crowd[b] as f32));
                let fl_a = self.fluid[a].min(self.fluid[b]);
                let mut fg = (self.flow_g[a][d] + ACCEL_G * dp / pavg) * (1.0 - FRICTION_G) * crowd;
                let mut fll = (self.flow_l[a][d] + ACCEL_L * dp / pavg * fl_a) * (1.0 - (0.05 + 0.6 * (1.0 - fl_a.min(1.0)))) * crowd;
                if !fwd_ok { fg = fg.min(0.0); fll = fll.min(0.0); }
                if !back_ok { fg = fg.max(0.0); fll = fll.max(0.0); }
                fg = fg.clamp(-MAX_F, MAX_F);
                fll = fll.clamp(-MAX_F, MAX_F);
                self.flow_g[a][d] = fg;
                self.flow_l[a][d] = fll;
                // move gas and liquid out of whichever cell is upstream
                for (f, range) in [(fg, 0..NGAS), (fll, NGAS..NSP)] {
                    if f == 0.0 {
                        continue;
                    }
                    let (u, w) = if f > 0.0 { (a, b) } else { (b, a) };
                    let frac = f.abs();
                    let tu = self.temp[u];
                    let mut e = 0.0;
                    for sp in range {
                        let x = self.m[u][sp] * frac;
                        self.dm[u][sp] -= x;
                        self.dm[w][sp] += x;
                        e += x * CP[sp] * tu;
                    }
                    self.de[u] -= e;
                    self.de[w] += e;
                }
                // gases mix by diffusion (a flap stops it going backwards)
                if fwd_ok || back_ok {
                    let mut e = 0.0;
                    for sp in 0..NGAS {
                        let x = D_GAS * (self.m[a][sp] - self.m[b][sp]);
                        if (x > 0.0 && !fwd_ok) || (x < 0.0 && !back_ok) {
                            continue;
                        }
                        self.dm[a][sp] -= x;
                        self.dm[b][sp] += x;
                        e += x * CP[sp] * if x > 0.0 { self.temp[a] } else { self.temp[b] };
                    }
                    let (la, lb) = (self.m[a][WATER] + self.m[a][PB], self.m[b][WATER] + self.m[b][PB]);
                    if la > 0.05 && lb > 0.05 {
                        for sp in SALT..=NH3AQ {
                            let x = 0.01 * (self.m[a][sp] - self.m[b][sp]);
                            self.dm[a][sp] -= x;
                            self.dm[b][sp] += x;
                        }
                    }
                    self.de[a] -= e;
                    self.de[b] += e;
                }
            }
        }
        for i in 0..N {
            if !is_open(self.mat[i]) {
                continue;
            }
            let c0 = self.heat_cap(i);
            let e = c0 * self.temp[i] + self.de[i];
            for sp in 0..NSP {
                self.m[i][sp] = (self.m[i][sp] + self.dm[i][sp]).max(0.0);
            }
            let c1 = self.heat_cap(i);
            self.temp[i] = (e / c1).clamp(20.0, 6000.0);
        }
    }

    /// Heat conduction between neighbours, and a slow leak to the building around.
    fn conduct(&mut self, dt: f32) {
        for a in 0..N {
            let ka = self.kcond[a];
            let ca = self.cap[a];
            for d in 0..2 {
                let Some(b) = Self::nb(a, d) else { continue };
                let kb = self.kcond[b];
                let k = 2.0 * ka * kb / (ka + kb + 1e-9) * 0.1;
                let cb = self.cap[b];
                let q = k * (self.temp[a] - self.temp[b]) * dt;
                let q = q.clamp(-0.2 * ca.min(cb) * (self.temp[b] - self.temp[a]).abs(), 0.2 * ca.min(cb) * (self.temp[a] - self.temp[b]).abs());
                self.temp[a] -= q / ca;
                self.temp[b] += q / cb;
            }
            self.temp[a] += (T0 - self.temp[a]) * (0.002 * dt / ca).min(0.5);
            // Hot things radiate (weakly emissive gas, ~0.02 m² of surface per cell): flames fade fast.
            let t = self.temp[a];
            if t > 500.0 {
                let q = (0.02 * 5.67e-8 * 0.02 * (t.powi(4) - T0.powi(4)) * dt).min(0.5 * ca * (t - T0));
                self.temp[a] -= q / ca;
            }
        }
    }

    /// Sparks run along conductors one cell per substep.
    fn sparks(&mut self) {
        let mut light = Vec::new();
        for i in 0..N {
            if self.spark[i] == 0 && MATS[self.mat[i] as usize].conductor {
                for d in 0..4 {
                    if let Some(j) = Self::nb(i, d) {
                        if self.spark[j] == 4 {
                            light.push(i);
                            break;
                        }
                    }
                }
            }
        }
        for s in self.spark.iter_mut() {
            *s = s.saturating_sub(1);
        }
        // A galvanic cell pushes a spark out every few substeps.
        if self.substeps % 6 == 0 {
            for i in 0..N {
                if self.battery[i] && self.hp[i] > 0.0 {
                    for d in 0..4 {
                        if let Some(j) = Self::nb(i, d) {
                            if MATS[self.mat[j] as usize].conductor && self.mat[j] != ZINC && self.spark[j] == 0 {
                                light.push(j);
                            }
                        }
                    }
                    self.hp[i] -= 0.0005; // the zinc is spent making it
                }
            }
        }
        for &i in &light {
            self.spark[i] = 4;
        }
        // What a spark does when it arrives.
        for &i in &light {
            if self.mat[i] == CARBON {
                let c = self.heat_cap(i);
                self.temp[i] += 4000.0 / c; // resistive heating
            }
            for d in 0..4 {
                let Some(j) = Self::nb(i, d) else { continue };
                if !is_open(self.mat[j]) {
                    continue;
                }
                self.ignite[j] = true;
                // Electrolysis: water split at the electrode, faster in brine.
                let c = &mut self.m[j];
                if c[WATER] > 0.01 {
                    let salinity = c[SALT] / c[WATER];
                    let w = (2e-6 * (1.0 + 50.0 * salinity)).min(c[WATER] * 0.1);
                    c[WATER] -= w;
                    c[H2] += w * 2.0 / 18.0;
                    c[O2] += w * 16.0 / 18.0;
                }
            }
        }
    }

    fn brine(&self, j: usize) -> bool {
        is_open(self.mat[j]) && self.m[j][WATER] > 0.05 && self.m[j][SALT] / self.m[j][WATER] > 0.005
    }

    /// Zinc touching brine that also touches copper (within reach) is a battery.
    fn find_batteries(&mut self) {
        for i in 0..N {
            self.battery[i] = false;
            if self.mat[i] != ZINC || self.hp[i] <= 0.0 {
                continue;
            }
            let wet = (0..4).any(|d| Self::nb(i, d).is_some_and(|j| self.brine(j)));
            if !wet {
                continue;
            }
            let (x, y) = ((i % W) as i32, (i / W) as i32);
            'search: for dy in -8..=8 {
                for dx in -8..=8 {
                    let (cx, cy) = (x + dx, y + dy);
                    if cx < 0 || cy < 0 || cx >= W as i32 || cy >= H as i32 {
                        continue;
                    }
                    let c = cy as usize * W + cx as usize;
                    if self.mat[c] == COPPER && (0..4).any(|d| Self::nb(c, d).is_some_and(|j| self.brine(j))) {
                        self.battery[i] = true;
                        break 'search;
                    }
                }
            }
        }
    }

    /// Chemistry and phase change in open cells.
    fn react(&mut self, _dt: f32) {
        for i in 0..N {
            if !is_open(self.mat[i]) {
                self.ignite[i] = false;
                continue;
            }
            let t = self.temp[i];
            let cap0 = self.heat_cap(i);
            let mut de = 0.0;
            let catalyst = (0..4).any(|d| Self::nb(i, d).is_some_and(|j| self.mat[j] == GOLD));
            let spark = self.ignite[i];
            self.ignite[i] = false;
            let c = &mut self.m[i];
            let ntot = gas_mol(c).max(1e-12);

            // Hydrogen burns: 2 H2 + O2 → 2 H2O, 242 kJ per mol of water.
            // Above ~3200 K the products split apart as fast as they form: no hotter.
            let room_to_burn = ((T_FLAME - t) * cap0).max(0.0);
            let (nh2, no2) = (c[H2] / MM[H2], c[O2] / MM[O2]);
            if (t > 773.0 || spark || (catalyst && t > 330.0)) && nh2 / ntot > 0.04 && no2 / ntot > 0.03 {
                let xi = (0.6 * (nh2 / 2.0).min(no2)).min(room_to_burn / (2.0 * 242e3));
                c[H2] -= 2.0 * xi * MM[H2];
                c[O2] -= xi * MM[O2];
                c[STEAM] += 2.0 * xi * MM[STEAM];
                de += 2.0 * xi * 242e3;
            }
            // Methane burns: CH4 + 2 O2 → CO2 + 2 H2O, 802 kJ per mol.
            let (nch4, no2) = (c[CH4] / MM[CH4], c[O2] / MM[O2]);
            if (t > 853.0 || spark) && nch4 / ntot > 0.05 && no2 / ntot > 0.05 {
                let xi = (0.6 * nch4.min(no2 / 2.0)).min(room_to_burn / 802e3);
                c[CH4] -= xi * MM[CH4];
                c[O2] -= 2.0 * xi * MM[O2];
                c[CO2] += xi * MM[CO2];
                c[STEAM] += 2.0 * xi * MM[STEAM];
                de += xi * 802e3;
            }
            // Oil and peanut butter burn when hot enough.
            if t > 600.0 && c[O2] > 1e-6 {
                for (s, mj) in [(OIL, 40e6), (PB, 25e6)] {
                    let burn = (c[s] * 0.02 + 1e-6).min(c[s]).min(c[O2] / 3.4).min(room_to_burn / mj);
                    if burn > 0.0 {
                        c[s] -= burn;
                        c[O2] -= burn * 3.4;
                        c[CO2] += burn * 3.1;
                        c[STEAM] += burn * 1.3;
                        de += burn * mj;
                    }
                }
            }
            // Evaporation and condensation toward saturation (water, ammonia).
            let vf = free_vol(c);
            for (liq, gas, l) in [(WATER, STEAM, 40_700.0), (NH3L, NH3G, 23_350.0)] {
                if c[liq] <= 0.0 && c[gas] <= 0.0 {
                    continue;
                }
                let ps = lookup(if liq == WATER { &tables().water } else { &tables().ammonia }, t);
                let pv = c[gas] / MM[gas] * RGAS * t / vf;
                if pv < ps && c[liq] > 0.0 {
                    let budget = (cap0 * (t - 150.0) * 0.3).max(0.0) / l; // don't freeze the cell in one go
                    let mol = (0.3 * (ps - pv) * vf / (RGAS * t)).min(c[liq] / MM[liq]).min(budget);
                    c[liq] -= mol * MM[liq];
                    c[gas] += mol * MM[gas];
                    de -= mol * l;
                } else if pv > ps {
                    let mol = (0.3 * (pv - ps) * vf / (RGAS * t)).min(c[gas] / MM[gas]);
                    c[gas] -= mol * MM[gas];
                    c[liq] += mol * MM[liq];
                    de += mol * l;
                }
            }
            // Ammonia dissolves into cold water and comes back out of hot water.
            if c[WATER] > 0.01 {
                if t < 330.0 && c[NH3G] > 0.0 {
                    let x = (0.05 * c[NH3G]).min((0.3 * c[WATER] - c[NH3AQ]).max(0.0));
                    c[NH3G] -= x;
                    c[NH3AQ] += x;
                    de += x / MM[NH3G] * 35e3;
                } else if t > 350.0 && c[NH3AQ] > 0.0 {
                    let x = 0.05 * c[NH3AQ];
                    c[NH3AQ] -= x;
                    c[NH3G] += x;
                    de -= x / MM[NH3G] * 35e3;
                }
            }
            let cap1 = self.heat_cap(i);
            self.temp[i] = ((cap0 * t + de) / cap1).clamp(20.0, 6000.0);
        }
    }

    /// Things that happen to solids: melting, freezing, dissolving, roasting, rotting, rusting.
    fn solids(&mut self, dt: f32) {
        for i in 0..N {
            let mat = self.mat[i];
            let t = self.temp[i];
            match mat {
                ICE if t > 273.15 => {
                    let water = self.hp[i];
                    self.mat[i] = OPEN;
                    self.m[i] = [0.0; NSP];
                    self.m[i][WATER] = water;
                    self.temp[i] = 273.2;
                }
                OPEN if self.m[i][WATER] > 0.5 && t < 273.15 => {
                    let water = self.m[i][WATER];
                    self.mat[i] = ICE;
                    self.m[i] = [0.0; NSP];
                    self.hp[i] = water;
                }
                SALT_X | SUGAR_X => {
                    let (s, per_water, per_pb) = if mat == SALT_X { (SALT, 0.36, 0.1) } else { (SUGAR, 2.0, 0.5) };
                    for d in 0..4 {
                        let Some(j) = Self::nb(i, d) else { continue };
                        if !is_open(self.mat[j]) {
                            continue;
                        }
                        let cap = per_water * self.m[j][WATER] + per_pb * self.m[j][PB];
                        let x = (cap - self.m[j][s]).max(0.0).min(self.hp[i]).min(0.004 * dt / SUBSTEP);
                        self.hp[i] -= x;
                        self.m[j][s] += x;
                    }
                    if self.hp[i] <= 1e-4 {
                        self.clear(i);
                        self.m[i] = [0.0; NSP];
                    }
                }
                PEANUT if t > 430.0 => {
                    // Roasted and broken down: the oils run out as paste.
                    self.mat[i] = OPEN;
                    self.m[i] = [0.0; NSP];
                    self.m[i][PB] = 0.5;
                    self.m[i][STEAM] = 0.02;
                }
                ORGANIC => {
                    for d in 0..4 {
                        let Some(j) = Self::nb(i, d) else { continue };
                        if !is_open(self.mat[j]) {
                            continue;
                        }
                        let x = (self.hp[i] * 2e-5 * dt).min(self.hp[i]);
                        let ntot = gas_mol(&self.m[j]).max(1e-12);
                        if self.m[j][O2] / MM[O2] / ntot > 0.05 {
                            // Rotting with oxygen: CO2 and heat (a compost heap is warm).
                            let o2 = (x * 1.07).min(self.m[j][O2]);
                            self.m[j][O2] -= o2;
                            self.m[j][CO2] += x * 1.47;
                            self.temp[i] += x * 3e5 / self.heat_cap(i);
                        } else {
                            // Without oxygen: methane.
                            self.m[j][CH4] += x * 0.27;
                            self.m[j][CO2] += x * 0.73;
                        }
                        self.hp[i] -= x;
                        break;
                    }
                    if self.hp[i] <= 0.0 {
                        self.clear(i);
                    }
                }
                STEEL => {
                    if (0..4).any(|d| Self::nb(i, d).is_some_and(|j| is_open(self.mat[j]) && self.m[j][WATER] > 0.05 && self.m[j][O2] > 1e-6)) {
                        self.hp[i] -= 2e-5 * dt;
                        if self.hp[i] <= 0.0 {
                            self.mat[i] = RUST;
                            self.hp[i] = 1.0;
                        }
                    }
                }
                ZINC if self.hp[i] <= 0.0 => self.clear(i),
                _ => {}
            }
        }
    }

    /// Find each connected open space and its average pressure.
    ///
    /// Real gas evens out pressure at the speed of sound (effectively at once at
    /// this scale), so a wall feels the pressure of the whole space it encloses,
    /// not of the one cell beside it. The flow model can't move gas that fast,
    /// so the average stands in for it.
    fn find_regions(&mut self) {
        self.region.iter_mut().for_each(|r| *r = u32::MAX);
        self.region_p.clear();
        let mut stack = Vec::new();
        for start in 0..N {
            if self.region[start] != u32::MAX || !is_open(self.mat[start]) {
                continue;
            }
            let id = self.region_p.len() as u32;
            let (mut sum, mut n) = (0.0f64, 0.0f64);
            self.region[start] = id;
            stack.push(start);
            while let Some(i) = stack.pop() {
                sum += self.pres[i] as f64;
                n += 1.0;
                for d in 0..4 {
                    if let Some(j) = Self::nb(i, d) {
                        if self.region[j] == u32::MAX && is_open(self.mat[j]) {
                            self.region[j] = id;
                            stack.push(j);
                        }
                    }
                }
            }
            self.region_p.push((sum / n) as f32);
        }
    }

    /// The pressure a wall feels from an open cell: its space's average, or the
    /// local pressure while a blast wave is passing (whichever is greater).
    #[inline]
    fn felt_pressure(&self, i: usize) -> f32 {
        let avg = self.region_p[self.region[i] as usize];
        if self.shock[i] > 0 { avg.max(self.pres[i]) } else { avg }
    }

    /// Solids break when the pressure difference across them exceeds their strength.
    fn structure(&mut self, dt: f32) {
        self.find_regions();
        for i in 0..N {
            let mat = self.mat[i];
            let mt = &MATS[mat as usize];
            if is_open(mat) || mt.powder || mt.strength <= 0.0 {
                continue;
            }
            let mut stress: f32 = 0.0;
            for d in 0..4 {
                let Some(a) = Self::nb(i, d) else { continue };
                if !is_open(self.mat[a]) {
                    continue;
                }
                let opp = (d + 2) % 4;
                let (p2, support) = match Self::nb(i, opp) {
                    Some(o) if is_open(self.mat[o]) => (self.felt_pressure(o), 1.0),
                    Some(o) => match Self::nb(o, opp) {
                        Some(o2) if is_open(self.mat[o2]) => (self.felt_pressure(o2), 2.0),
                        _ => (P0, 3.0),
                    },
                    None => (P0, 3.0),
                };
                stress = stress.max((self.felt_pressure(a) - p2).abs() / support);
            }
            if stress > mt.strength {
                self.hp[i] -= (stress / mt.strength - 1.0) * dt * 4.0;
                if self.hp[i] <= 0.0 {
                    self.mat[i] = RUBBLE;
                    self.hp[i] = 1.0;
                }
            }
        }
    }

    /// Powders get shoved toward lower pressure by strong pressure differences.
    fn powders(&mut self) {
        for i in 0..N {
            if !MATS[self.mat[i] as usize].powder {
                continue;
            }
            let (mut lo, mut lo_p, mut hi_p) = (usize::MAX, f32::MAX, 0.0f32);
            for d in 0..4 {
                let Some(j) = Self::nb(i, d) else { continue };
                if passable(self.mat[j]) {
                    if self.pres[j] < lo_p {
                        lo_p = self.pres[j];
                        lo = j;
                    }
                    hi_p = hi_p.max(self.pres[j]);
                }
            }
            if lo != usize::MAX && hi_p - lo_p > 15e3 {
                self.mat.swap(i, lo);
                self.m.swap(i, lo);
                self.temp.swap(i, lo);
                self.hp.swap(i, lo);
                self.pres.swap(i, lo);
            }
        }
    }

    // ---------------------------------------------------------------- life
    fn life(&mut self) {
        // Where the animals are right now (plants won't grow into them).
        for c in self.crowd.iter_mut() {
            *c = 0;
        }
        for a in &self.agents {
            self.crowd[a.cell] = self.crowd[a.cell].saturating_add(1);
        }
        // Plants: photosynthesise from a neighbouring open cell, grow along soil, set peanuts when pollinated.
        for i in 0..N {
            if self.mat[i] != PLANT {
                continue;
            }
            let t = self.temp[i];
            if !(268.0..=335.0).contains(&t) {
                self.set_solid(i, ORGANIC);
                self.hp[i] = 0.3;
                continue;
            }
            if self.aux2[i] > 0 {
                self.aux2[i] -= 1;
            }
            let mut best = usize::MAX;
            for d in 0..4 {
                if let Some(j) = Self::nb(i, d) {
                    if is_open(self.mat[j]) && (best == usize::MAX || self.m[j][CO2] > self.m[best][CO2]) {
                        best = j;
                    }
                }
            }
            if best != usize::MAX && (283.0..313.0).contains(&t) && self.m[best][WATER] > 0.002 {
                let c = &mut self.m[best];
                let x = (2e-6f32).min(c[CO2] * 0.5);
                c[CO2] -= x;
                c[WATER] -= x * 0.41;
                c[O2] += x * 0.727;
                self.aux[i] += x * 5e4;
            }
            if self.aux[i] > 0.6 {
                let d = (self.rand() * 4.0) as usize % 4;
                if let Some(j) = Self::nb(i, d) {
                    let by_soil = (0..4).any(|e| Self::nb(j, e).is_some_and(|k| self.mat[k] == SOIL));
                    if passable(self.mat[j]) && by_soil && self.crowd[j] == 0 {
                        self.set_solid(j, PLANT);
                        self.aux[i] -= 0.4;
                    }
                }
            }
            if self.aux2[i] > 0 && self.aux[i] > 0.5 {
                let d = (self.rand() * 4.0) as usize % 4;
                if let Some(j) = Self::nb(i, d) {
                    if passable(self.mat[j]) && self.crowd[j] == 0 {
                        self.set_solid(j, PEANUT);
                        self.aux[i] -= 0.3;
                        self.aux2[i] = 0;
                    }
                }
            }
        }

        // Animals smell their way to food (refreshed every few seconds).
        self.life_ticks += 1;
        if self.life_ticks % 25 == 1 {
            self.scent_food = self.smell(|i| self.food(i));
            self.scent_plant = self.smell(|i| self.mat[i] == PLANT);
        }
        let mut born = Vec::new();
        let mut agents = std::mem::take(&mut self.agents);
        let population = agents.len();
        for a in agents.iter_mut() {
            let cell = a.cell;
            let t = self.temp[cell];
            // Breathing.
            let need = if a.kind == CATERPILLAR { 3e-8 } else { 1e-8 };
            if self.m[cell][O2] > need * 3.0 {
                self.m[cell][O2] -= need;
                self.m[cell][CO2] += need * 1.375;
            } else {
                a.energy -= 0.05;
            }
            let (lo, hi) = if a.kind == CATERPILLAR { (278.0, 313.0) } else { (275.0, 318.0) };
            if t < lo || t > hi {
                a.energy -= 0.02;
            }
            // Moving.
            let mut best = cell;
            let mut best_s = self.score(a.kind, cell) + self.rand() * 0.6;
            for d in 0..4 {
                if let Some(j) = Self::nb(cell, d) {
                    if walkable(self.mat[j], &self.m[j]) {
                        let s = self.score(a.kind, j) + self.rand() * if a.kind == CATERPILLAR { 1.5 } else { 0.6 };
                        if s > best_s {
                            best_s = s;
                            best = j;
                        }
                    }
                }
            }
            a.cell = best;
            // Eating.
            if a.kind == CATERPILLAR {
                for d in 0..4 {
                    if let Some(p) = Self::nb(best, d) {
                        if self.mat[p] == PLANT {
                            self.aux[p] -= 0.003;
                            a.energy += 0.008;
                            self.aux2[p] = 1500; // pollinated
                            if self.aux[p] < -0.5 {
                                self.clear(p); // eaten down to nothing
                            }
                            break;
                        }
                    }
                }
                a.energy -= 0.002;
            } else {
                let meal = std::iter::once(best).chain((0..4).filter_map(|d| Self::nb(best, d))).find(|&j| self.food(j));
                if let Some(j) = meal {
                    let c = &mut self.m[j];
                    let bite = 2e-5f32.min(c[PB]);
                    let frac = bite / c[PB].max(1e-9);
                    c[SALT] -= c[SALT] * frac;
                    c[SUGAR] -= c[SUGAR] * frac;
                    c[PB] -= bite;
                    a.energy += 0.006;
                }
                a.energy -= 0.002;
            }
            let breed_at = if a.kind == CATERPILLAR { 3.0 } else { 2.0 };
            if a.energy > breed_at && born.len() + population < 3000 {
                a.energy = 1.0;
                born.push(Agent { kind: a.kind, cell: a.cell, energy: 1.0 });
            }
        }
        // The dead become organic matter where they fall.
        for a in agents.iter().filter(|a| a.energy <= 0.0) {
            if self.mat[a.cell] == OPEN {
                self.set_solid(a.cell, ORGANIC);
                self.hp[a.cell] = 0.05;
            }
        }
        agents.retain(|a| a.energy > 0.0);
        agents.extend(born);
        self.agents = agents;
    }

    /// Distance (through walkable cells) to the nearest cell matching `target`.
    fn smell(&self, target: impl Fn(usize) -> bool) -> Vec<u16> {
        let mut dist = vec![u16::MAX; N];
        let mut queue = std::collections::VecDeque::new();
        for i in 0..N {
            if target(i) {
                dist[i] = 0;
                queue.push_back(i);
            }
        }
        while let Some(i) = queue.pop_front() {
            let d = dist[i];
            if d > 60 {
                continue; // smells don't carry forever
            }
            for k in 0..4 {
                if let Some(j) = Self::nb(i, k) {
                    if dist[j] == u16::MAX && walkable(self.mat[j], &self.m[j]) {
                        dist[j] = d + 1;
                        queue.push_back(j);
                    }
                }
            }
        }
        dist
    }

    fn food(&self, i: usize) -> bool {
        let c = &self.m[i];
        c[PB] > 0.001 && c[SALT] / c[PB] >= 0.01 && c[SUGAR] / c[PB] >= 0.04
    }

    fn score(&self, kind: u8, i: usize) -> f32 {
        if kind == CATERPILLAR {
            (0..4).filter(|&d| Self::nb(i, d).is_some_and(|j| self.mat[j] == PLANT)).count() as f32
                - self.scent_plant[i].min(80) as f32 * 0.05
        } else {
            let mut s = -(self.temp[i] - 295.0).abs() * 0.15 - self.scent_food[i].min(80) as f32 * 0.08;
            if self.food(i) {
                s += 4.0;
            }
            s += (0..4).filter(|&d| Self::nb(i, d).is_some_and(|j| self.food(j))).count() as f32 * 1.0;
            s
        }
    }

    // ---------------------------------------------------------------- outputs
    /// Colour every cell for display. Modes: 0 normal, 1 temperature, 2 pressure, 3 oxygen, 4 sparks.
    pub fn render(&mut self, mode: u32) -> &[u8] {
        for i in 0..N {
            let mat = self.mat[i];
            let t = self.temp[i];
            let col: [f32; 3] = match mode {
                1 => ramp((t - 250.0) / 150.0),
                2 => if is_open(mat) { ramp(((self.pres[i] / P0).ln() + 1.0) / 3.0) } else { [30., 30., 30.] },
                3 => {
                    if is_open(mat) {
                        let x = self.m[i][O2] / MM[O2] / gas_mol(&self.m[i]).max(1e-12);
                        ramp(x / 0.25)
                    } else {
                        [30., 30., 30.]
                    }
                }
                _ => {
                    let base = MATS[mat as usize].color;
                    let mut col = [base[0] as f32, base[1] as f32, base[2] as f32];
                    let h = ((i * 2654435761) >> 13) % 13;
                    let noise = h as f32 - 6.0;
                    if is_open(mat) {
                        let c = &self.m[i];
                        let vl = (liq_vol(c) / V).min(1.0);
                        if vl > 0.01 {
                            let lw = c[WATER] + c[NH3L] + c[OIL] + c[PB] + 1e-9;
                            let mut lc = [0f32; 3];
                            for (s, cc) in [(WATER, [60., 120., 200.]), (NH3L, [200., 220., 240.]), (OIL, [210., 180., 60.]), (PB, [168., 115., 47.])] {
                                for k in 0..3 {
                                    lc[k] += cc[k] * c[s] / lw;
                                }
                            }
                            // dissolved salt and sugar cloud the water
                            let solute = ((c[SALT] + c[SUGAR]) / (c[WATER] + c[PB] + 1e-6)).min(0.3) * 2.0;
                            for k in 0..3 {
                                lc[k] = lc[k] * (1.0 - solute) + 235.0 * solute;
                                col[k] = col[k] * (1.0 - vl) + lc[k] * vl;
                            }
                        }
                        let steam = (c[STEAM] / (V * 0.6)).min(0.5) * 0.8;
                        for k in 0..3 {
                            col[k] = col[k] * (1.0 - steam) + 230.0 * steam;
                        }
                        if mat == MESH {
                            if (i % 2) ^ ((i / W) % 2) == 0 { col = [90., 100., 104.]; }
                        } else if let Some(d) = flap_dir(mat) {
                            let (x, y) = (i % W, i / W);
                            let mark = match d { 0 => x % 2 == 0, 1 => y % 2 == 0, 2 => x % 2 == 1, _ => y % 2 == 1 };
                            if mark { col = [30., 30., 30.]; }
                        }
                    }
                    for k in 0..3 {
                        col[k] += noise;
                    }
                    // hot things glow; flames glow brightest
                    if t > 700.0 {
                        let g = ((t - 700.0) / 1500.0).min(1.0);
                        col = [col[0] * (1.0 - g) + 255.0 * g, col[1] * (1.0 - g) + 170.0 * g, col[2] * (1.0 - g) + 60.0 * g];
                    }
                    if self.spark[i] >= 3 {
                        col = [255., 250., 180.];
                    }
                    // solids get a lit top edge so they read as raised
                    if !is_open(mat) && i >= W && is_open(self.mat[i - W]) {
                        for v in col.iter_mut() { *v += 25.0; }
                    }
                    col
                }
            };
            let o = i * 4;
            self.rgba[o] = col[0].clamp(0., 255.) as u8;
            self.rgba[o + 1] = col[1].clamp(0., 255.) as u8;
            self.rgba[o + 2] = col[2].clamp(0., 255.) as u8;
            self.rgba[o + 3] = 255;
        }
        &self.rgba
    }

    pub fn agent_data(&mut self) -> &[f32] {
        self.agent_buf.clear();
        for a in &self.agents {
            self.agent_buf.push((a.cell % W) as f32);
            self.agent_buf.push((a.cell / W) as f32);
            self.agent_buf.push(a.kind as f32);
        }
        &self.agent_buf
    }

    /// Readout for one cell: [mat, T, P, hp, spark, plant energy, 14 species masses...].
    pub fn probe(&mut self, i: usize) -> &[f32; 24] {
        let p = &mut self.probe_buf;
        p[0] = self.mat[i] as f32;
        p[1] = self.temp[i];
        p[2] = if is_open(self.mat[i]) { fluid_pressure(&self.m[i], self.temp[i]) } else { 0.0 };
        p[3] = self.hp[i];
        p[4] = self.spark[i] as f32;
        p[5] = self.aux[i];
        for s in 0..NSP {
            p[6 + s] = self.m[i][s];
        }
        p[20] = self.crowd[i] as f32;
        &self.probe_buf
    }

    /// A player's edit, from the zoomed-in view.
    pub fn edit(&mut self, x: usize, y: usize, tool: u32, value: f32) {
        if x >= W || y >= H {
            return;
        }
        let i = Self::idx(x, y);
        match tool {
            0 => self.clear(i),                       // dig out
            1 => self.set_solid(i, value as u8),       // place a material
            2 => {
                // pour a species (value = species index)
                let s = value as usize;
                if s < NSP && is_open(self.mat[i]) {
                    let amount = if s < NGAS { 0.0005 } else if s >= SALT { 0.01 } else { 0.2 };
                    self.m[i][s] += amount;
                }
            }
            3 => self.temp[i] += value,                // heat or cool
            4 => self.spark[i] = 4,                    // spark
            5 => self.agents.push(Agent { kind: value as u8, cell: i, energy: 1.0 }),
            _ => {}
        }
    }
}

fn ramp(x: f32) -> [f32; 3] {
    let x = x.clamp(0.0, 1.0);
    let stops = [[40., 60., 160.], [60., 170., 200.], [210., 205., 180.], [235., 150., 60.], [210., 50., 40.]];
    let f = x * 4.0;
    let k = (f as usize).min(3);
    let t = f - k as f32;
    let (a, b) = (stops[k], stops[k + 1]);
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

// ---------------------------------------------------------------- the demo room
/// One room of experiments, each showing a rule doing something.
pub fn demo() -> Elements {
    let mut e = Elements::new();
    e.boxed(0, 0, W - 1, H - 1, CONCRETE);
    e.boxed(1, 1, W - 2, H - 2, CONCRETE);

    // 1. A galvanic cell: zinc and copper in brine. Its wire runs to an
    //    electrolysis tank, and (through a gap you can bridge) to a carbon
    //    igniter inside a chamber of hydrogen and oxygen with a glass window.
    e.boxed(4, 4, 20, 20, CONCRETE);
    e.fill(5, 5, 19, 19, |c| {
        *c = [0.0; NSP];
        c[WATER] = 0.95;
        c[SALT] = 0.05;
    });
    e.rect(7, 7, 7, 17, ZINC);
    e.rect(17, 7, 17, 17, COPPER);
    e.rect(7, 3, 7, 6, COPPER); // wire up out of the cell through the wall
    for x in 7..=27 { e.set_solid(Elements::idx(x, 3), COPPER); }
    // electrolysis tank (glass, so you can see; concrete would do)
    e.boxed(24, 5, 40, 20, GLASS);
    e.fill(25, 9, 39, 19, |c| {
        *c = [0.0; NSP];
        c[WATER] = 0.95;
        c[SALT] = 0.01;
    });
    e.rect(27, 4, 27, 16, COPPER); // electrode down into the water
    // on toward the explosion chamber, with a gap at x = 44 to bridge
    for x in 28..=43 { e.set_solid(Elements::idx(x, 3), COPPER); }
    for x in 45..=60 { e.set_solid(Elements::idx(x, 3), COPPER); }
    e.boxed(50, 5, 72, 21, CONCRETE);
    e.rect(72, 10, 72, 16, GLASS);
    e.fill(51, 6, 71, 20, |c| {
        *c = [0.0; NSP];
        let n = P0 * V / (RGAS * T0);
        c[H2] = 0.66 * n * MM[H2];
        c[O2] = 0.34 * n * MM[O2];
    });
    e.rect(60, 4, 60, 12, CARBON); // the igniter, fed from the wire above

    // 2. Ammonia: in a glass bottle it boils at room temperature and bursts it;
    //    the steel bottle beside it holds. Both sit in a thick concrete blast room.
    e.boxed(77, 3, 113, 21, CONCRETE);
    e.boxed(78, 4, 112, 20, CONCRETE);
    e.boxed(82, 6, 92, 16, GLASS);
    e.boxed(98, 6, 108, 16, STEEL);
    for (x0, x1) in [(83, 91), (99, 107)] {
        e.fill(x0, 7, x1, 15, |c| {
            *c = [0.0; NSP];
            c[NH3L] = 0.64;
        });
    }

    // 3. Salt and sugar dissolving into water.
    e.boxed(116, 5, 140, 20, CONCRETE);
    e.fill(117, 6, 139, 19, |c| {
        *c = [0.0; NSP];
        c[WATER] = 0.97;
    });
    e.rect(118, 7, 120, 18, SALT_X);
    e.rect(136, 7, 138, 18, SUGAR_X);

    // 4. Gold catalyst: hydrogen and air meeting over gold burn without a spark.
    e.boxed(148, 5, 170, 20, GLASS);
    e.rect(158, 12, 160, 13, GOLD);
    e.fill(149, 6, 169, 19, |c| {
        let n = P0 * V / (RGAS * T0);
        c[H2] = 0.08 * n * MM[H2];
    });

    // 5. Pressure and one-way flaps: a tank of water under compressed air
    //    feeds two pipes into an open basin. The flap in the upper pipe points
    //    downstream; the one in the lower pipe points back.
    e.boxed(4, 40, 22, 62, STEEL);
    e.fill(5, 41, 21, 61, |c| {
        *c = [0.0; NSP];
        c[WATER] = 0.6;
        let n = 6.0 * P0 * 0.4 * V / (RGAS * T0);
        c[O2] = 0.21 * n * MM[O2];
        c[N2] = 0.79 * n * MM[N2];
    });
    for (y, flap) in [(46, FLAP_E), (56, FLAP_W)] {
        e.rect(22, y - 2, 60, y - 2, STEEL);
        e.rect(22, y + 2, 60, y + 2, STEEL);
        for yy in y - 1..=y + 1 { e.clear(Elements::idx(22, yy)); }
        for x in 23..=59 { for yy in y - 1..=y + 1 { e.clear(Elements::idx(x, yy)); } }
        for yy in y - 1..=y + 1 { e.set_solid(Elements::idx(40, yy), flap); }
    }
    e.boxed(60, 40, 80, 62, CONCRETE);
    for y in [45, 46, 47, 55, 56, 57] { e.clear(Elements::idx(60, y)); }

    // 6. Heat: a copper bar and a glass bar from a hot block.
    e.rect(92, 44, 98, 58, STEEL);
    for x in 92..=98 { for y in 44..=58 { e.temp[Elements::idx(x, y)] = 800.0; } }
    e.rect(99, 47, 130, 48, COPPER);
    e.rect(99, 54, 130, 55, GLASS);

    // 7. Ice melting in warm water, and a wet floor cooling the air as it dries.
    e.rect(140, 44, 146, 50, ICE);
    e.fill(150, 44, 170, 60, |c| c[WATER] = 0.08);

    // 8. A caterpillar farm: soil rows, peanut plants, moist air, caterpillars.
    e.boxed(4, 72, 70, 122, CONCRETE);
    e.clear(Elements::idx(70, 96));
    e.clear(Elements::idx(70, 97));
    for y in (76..=118).step_by(6) {
        e.rect(8, y, 66, y, SOIL);
    }
    e.fill(5, 73, 69, 121, |c| {
        c[WATER] += 0.01;
        c[CO2] += 4e-6;
    });
    for y in (77..=119).step_by(6) {
        for x in (10..=64).step_by(9) {
            e.set_solid(Elements::idx(x, y), PLANT);
        }
    }
    e.spawn(30, 92, CATERPILLAR, 20);

    // 9. Beetles choosing: peanut butter with salt and sugar on the left,
    //    plain peanut butter on the right.
    e.boxed(80, 72, 130, 104, CONCRETE);
    e.fill(83, 76, 92, 100, |c| {
        c[PB] = 0.6;
        c[SALT] = 0.009;
        c[SUGAR] = 0.036;
    });
    e.fill(118, 76, 127, 100, |c| c[PB] = 0.6);
    e.spawn(103, 86, BEETLE, 30);

    // 10. A sealed box of dead organic matter: it uses up the oxygen, then makes methane.
    e.boxed(140, 72, 186, 122, CONCRETE);
    e.rect(150, 85, 176, 110, ORGANIC);
    e
}

#[cfg(test)]
mod tests {
    use super::*;

    fn region_sum(e: &Elements, x0: usize, y0: usize, x1: usize, y1: usize, s: usize) -> f32 {
        let mut t = 0.0;
        for y in y0..=y1 {
            for x in x0..=x1 {
                t += e.m[Elements::idx(x, y)][s];
            }
        }
        t
    }
    fn count(e: &Elements, x0: usize, y0: usize, x1: usize, y1: usize, mat: u8) -> usize {
        let mut n = 0;
        for y in y0..=y1 {
            for x in x0..=x1 {
                if e.mat[Elements::idx(x, y)] == mat {
                    n += 1;
                }
            }
        }
        n
    }
    fn fresh() -> Elements {
        let mut e = Elements::new();
        e.boxed(0, 0, W - 1, H - 1, CONCRETE);
        e
    }

    #[test]
    fn pressure_equalises_through_an_opening() {
        let mut e = fresh();
        e.boxed(10, 10, 30, 20, STEEL);
        e.rect(20, 11, 20, 19, STEEL);
        e.fill(11, 11, 19, 19, |c| { c[N2] *= 3.0; c[O2] *= 3.0; });
        e.step(1.0);
        let p_hi = e.pres[Elements::idx(15, 15)];
        e.clear(Elements::idx(20, 15));
        e.step(90.0);
        let (a, b) = (e.pres[Elements::idx(15, 15)], e.pres[Elements::idx(25, 15)]);
        eprintln!("before {p_hi:.0} Pa; after {a:.0} / {b:.0} Pa");
        assert!(p_hi > 2.5 * P0);
        assert!((a - b).abs() / a < 0.1, "equalised");
    }

    #[test]
    fn copper_carries_heat_glass_does_not() {
        let mut e = fresh();
        e.rect(10, 10, 40, 10, COPPER);
        e.rect(10, 14, 40, 14, GLASS);
        for _ in 0..600 {
            e.temp[Elements::idx(10, 10)] = 800.0;
            e.temp[Elements::idx(10, 14)] = 800.0;
            e.step(0.5);
        }
        let (cu, gl) = (e.temp[Elements::idx(13, 10)], e.temp[Elements::idx(13, 14)]);
        eprintln!("30 cm along after 5 min: copper {cu:.0} K, glass {gl:.0} K");
        assert!(cu > gl + 30.0);
    }

    #[test]
    fn hydrogen_and_oxygen_explode_and_break_glass_not_steel() {
        let mut e = fresh();
        e.boxed(10, 10, 30, 24, STEEL);
        e.rect(30, 14, 30, 20, GLASS);
        e.fill(11, 11, 29, 23, |c| {
            *c = [0.0; NSP];
            let n = P0 * V / (RGAS * T0);
            c[H2] = 0.66 * n * MM[H2];
            c[O2] = 0.34 * n * MM[O2];
        });
        e.edit(20, 17, 4, 0.0); // a spark... on an open cell does nothing; heat it instead
        e.edit(20, 17, 3, 1000.0);
        let mut peak_t: f32 = 0.0;
        let mut peak_p: f32 = 0.0;
        for _ in 0..40 {
            e.step(0.05);
            peak_t = peak_t.max(e.temp[Elements::idx(15, 17)]);
            peak_p = peak_p.max(e.pres[Elements::idx(15, 17)]);
        }
        let glass_left = count(&e, 30, 14, 30, 20, GLASS);
        let steel_left = count(&e, 10, 10, 29, 24, STEEL);
        eprintln!("peak {peak_t:.0} K, {:.1} atm; glass cells left {glass_left}/7; steel cells {steel_left}", peak_p / P0);
        assert!(peak_t > 2000.0);
        assert!(peak_p > 5.0 * P0);
        assert!(glass_left < 4, "the window blew out");
        assert_eq!(steel_left, 53, "the steel held");
    }

    #[test]
    fn liquid_ammonia_bursts_glass_but_not_steel() {
        let mut e = fresh();
        e.boxed(10, 10, 20, 20, GLASS);
        e.boxed(30, 10, 40, 20, STEEL);
        for (x0, x1) in [(11, 19), (31, 39)] {
            e.fill(x0, 11, x1, 19, |c| { *c = [0.0; NSP]; c[NH3L] = 0.64; });
        }
        e.step(60.0);
        let (g, s) = (count(&e, 10, 10, 20, 20, GLASS), count(&e, 30, 10, 40, 20, STEEL));
        eprintln!("glass cells {g}/40, steel cells {s}/40, steel-bottle pressure {:.1} atm", e.pres[Elements::idx(35, 15)] / P0);
        assert!(g < 38);
        assert_eq!(s, 40);
    }

    #[test]
    fn evaporation_cools_and_salt_dissolves() {
        let mut e = fresh();
        e.boxed(9, 9, 31, 31, GLASS);
        e.fill(10, 10, 30, 30, |c| { c[WATER] = 0.05; c[STEAM] = 0.0; });
        e.step(5.0);
        let i = Elements::idx(20, 20);
        let t = e.temp[i];
        let pv = e.m[i][STEAM] / 0.018 * RGAS * t / free_vol(&e.m[i]);
        let rh = pv / psat(40_700.0, 373.15, t);
        eprintln!("wet, dry air after 5 s: humidity {:.0}%, {t:.3} K (room is {T0})", rh * 100.0);
        assert!(rh > 0.9, "the air saturates");
        assert!(t < T0 - 0.02, "evaporating cooled it a little");
        // and hot water boils
        let mut e = fresh();
        e.boxed(9, 9, 15, 15, STEEL);
        e.fill(10, 10, 14, 14, |c| { c[WATER] = 0.3; });
        for x in 10..=14 { for y in 10..=14 { e.temp[Elements::idx(x, y)] = 420.0; } }
        e.step(0.5);
        let p = e.pres[Elements::idx(12, 12)];
        eprintln!("water at 420 K in a sealed box: {:.1} atm", p / P0);
        assert!(p > 3.0 * P0);

        let mut e = fresh();
        e.boxed(40, 10, 60, 20, CONCRETE);
        e.fill(41, 11, 59, 19, |c| { *c = [0.0; NSP]; c[WATER] = 0.97; });
        e.rect(41, 11, 42, 19, SALT_X);
        let before = e.hp[Elements::idx(42, 15)];
        e.step(60.0);
        let salt = region_sum(&e, 43, 11, 59, 19, SALT);
        eprintln!("salt dissolved {salt:.3} kg; crystal {before:.2} → {:.2} kg", e.hp[Elements::idx(42, 15)]);
        assert!(salt > 0.5);
    }

    #[test]
    fn zinc_and_copper_in_brine_make_sparks_and_split_water() {
        for salty in [false, true] {
            let mut e = fresh();
            e.boxed(10, 10, 24, 24, CONCRETE);
            e.fill(11, 11, 23, 23, |c| { *c = [0.0; NSP]; c[WATER] = 0.95; c[SALT] = if salty { 0.05 } else { 0.0 }; });
            e.rect(13, 12, 13, 22, ZINC);
            e.rect(21, 12, 21, 22, COPPER);
            e.rect(13, 5, 13, 11, COPPER);
            for x in 13..=40 { e.set_solid(Elements::idx(x, 5), COPPER); }
            e.boxed(36, 7, 46, 17, CONCRETE);
            e.fill(37, 8, 45, 16, |c| { *c = [0.0; NSP]; c[WATER] = 0.95; c[SALT] = 0.01; });
            e.rect(40, 5, 40, 14, COPPER);
            let mut sparks = 0;
            for _ in 0..200 {
                e.step(0.05);
                if e.spark[Elements::idx(30, 5)] == 4 { sparks += 1; }
            }
            let h2 = region_sum(&e, 37, 8, 45, 16, H2);
            eprintln!("salty={salty}: {sparks} sparks passed; {:.2} mg hydrogen made", h2 * 1e6);
            if salty { assert!(sparks > 5 && h2 > 1e-8); } else { assert_eq!(sparks, 0); }
        }
    }

    #[test]
    fn flaps_only_let_water_one_way() {
        let mut e = demo();
        let basin0 = region_sum(&e, 61, 41, 79, 61, WATER);
        e.step(60.0);
        let upper = region_sum(&e, 41, 45, 59, 47, WATER);
        let lower = region_sum(&e, 41, 55, 59, 57, WATER);
        let basin = region_sum(&e, 61, 41, 79, 61, WATER);
        eprintln!("past the flaps after 60 s: forward pipe {upper:.2} kg, reversed pipe {lower:.2} kg; basin {basin0:.1} → {basin:.1} kg");
        assert!(upper > 0.5);
        assert!(lower < 0.05);
        assert!(basin > basin0 + 0.5);
    }

    #[test]
    fn caterpillars_pollinate_and_plants_make_oxygen_and_peanuts() {
        let mut e = demo();
        let o2_0 = region_sum(&e, 5, 73, 69, 121, O2);
        let plants0 = count(&e, 5, 73, 69, 121, PLANT);
        e.step(600.0);
        let o2 = region_sum(&e, 5, 73, 69, 121, O2);
        let plants = count(&e, 5, 73, 69, 121, PLANT);
        let peanuts = count(&e, 5, 73, 69, 121, PEANUT);
        let cats = e.agents.iter().filter(|a| a.kind == CATERPILLAR).count();
        eprintln!("10 min: plants {plants0} → {plants}, peanuts {peanuts}, caterpillars {cats}, farm O2 {:.3} → {:.3} g", o2_0 * 1e3, o2 * 1e3);
        assert!(plants as f32 > plants0 as f32 * 0.8, "the farm sustains itself");
        assert!(peanuts > 0, "pollinated plants set peanuts");
        assert!(cats > 0, "and the caterpillars live");
    }

    #[test]
    fn beetles_go_where_the_salt_and_sugar_are() {
        let mut e = demo();
        e.step(300.0);
        let left = e.agents.iter().filter(|a| a.kind == BEETLE && a.cell % W < 105).count();
        let right = e.agents.iter().filter(|a| a.kind == BEETLE && a.cell % W >= 105).count();
        let dead = count(&e, 81, 73, 129, 103, ORGANIC);
        eprintln!("beetles after 5 min: salty-sweet side {left}, plain side {right}, died {dead}");
        assert!(left > right * 2);
        assert!(left >= 25, "they find the food instead of starving");
    }

    #[test]
    fn sealed_rot_makes_methane() {
        let mut e = demo();
        e.step(900.0);
        let o2 = region_sum(&e, 141, 73, 185, 121, O2);
        let ch4 = region_sum(&e, 141, 73, 185, 121, CH4);
        eprintln!("rot box after 15 min: O2 {:.2} g, methane {:.3} g", o2 * 1e3, ch4 * 1e3);
        assert!(ch4 > 0.0);
    }

    /// Heat a sealed glass box with the heat tool's pattern; returns broken wall cells.
    fn heat_box(size: usize, brush: usize, spot: &str) -> usize {
        let mut e = fresh();
        let (x0, x1) = (20, 20 + size + 1);
        e.boxed(x0, x0, x1, x1, GLASS);
        let r = brush / 2;
        let (cx, cy) = match spot {
            "centre" => ((x0 + x1) / 2, (x0 + x1) / 2),
            "corner inside" => (x0 + 1 + r, x0 + 1 + r),
            _ => (x0, x0), // brush centred on the corner of the wall itself
        };
        for _ in 0..1000 {
            for dy in 0..brush { for dx in 0..brush { e.edit(cx + dx - r, cy + dy - r, 3, 25.0); } }
            e.step(0.06);
        }
        let mut broken = 0;
        for y in x0..=x1 { for x in x0..=x1 {
            if (x == x0 || x == x1 || y == x0 || y == x1) && e.mat[Elements::idx(x, y)] != GLASS { broken += 1; }
        } }
        broken
    }

    #[test]
    fn where_you_heat_a_box_doesnt_matter_only_how_much() {
        // A big box barely warms on average: wherever you heat it, it holds.
        for spot in ["centre", "corner inside", "on the wall"] {
            let b = heat_box(19, 5, spot);
            eprintln!("19×19 box, heated {spot}: {b} glass cells broken");
            assert_eq!(b, 0, "heating {spot} must not burst a box whose average pressure stays low");
        }
        // A small box heats up as a whole and bursts, whether heated in the middle or the corner.
        let (c, k) = (heat_box(5, 5, "centre"), heat_box(5, 5, "corner inside"));
        eprintln!("5×5 box: centre {c} broken, corner {k} broken");
        assert!(c > 0 && k > 0);
    }

    #[test]
    fn the_demo_stays_finite() {
        let mut e = demo();
        e.step(60.0);
        assert!(e.temp.iter().all(|t| t.is_finite()));
        assert!(e.m.iter().all(|c| c.iter().all(|v| v.is_finite())));
    }
}
