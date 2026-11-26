//! Element-level simulation: Prototype 02.
//!
//! Everything is made of eleven elements: H C N O Na Cl Si Fe Cu Zn Au.
//!
//! The world is a top-down grid of 10 cm cells. A cell is either SOLID (a base
//! material, plus any compounds lodged in it) or OPEN (a mixture of gases,
//! liquids and suspended or dissolved compounds), at a temperature. Every
//! compound has a chemical formula, and **every reaction is derived from those
//! formulas**, so every element is conserved:
//!
//! * Anything with C, H or N burns when hot (or sparked); the oxygen it needs
//!   follows from its formula, and the heat from the oxygen it consumes
//!   (~440 kJ per mol O2, Thornton's rule).
//! * Moist organic matter rots: the same oxidation, slowly, with nitrogen
//!   leaving as ammonia; without oxygen it becomes methane + CO2 (Buswell).
//! * Living things build compounds from sugar with element-balanced
//!   conversions (CO2/water/O2 balance the books).
//! * Physical behaviour also follows composition: pressure (gas law), how
//!   thick a fluid is (its fat, its suspended solids, temperature), what
//!   dissolves (salt and sugar in water), what conducts (dissolved salt).
//!
//! Animals are agents made of ORGANS, each a little mixture of compounds with
//! a job. A beetle needs salt because its nerves need sodium; its antennae
//! taste because whatever they touch dissolves into the watery lymph inside
//! them. Organs can be cut out (the scalpel) and keep working while kept wet,
//! fed and oxygenated. A severed antenna in sugar water fires nerve impulses
//! (sparks) into a wire when it tastes salt.
//!
//! See the vault notes `Elements` and `Organs`.

pub const W: usize = 192;
pub const H: usize = 128;
pub const N: usize = W * H;
const V: f32 = 0.001; // m³ per cell (10 cm cube)
const RGAS: f32 = 8.314;
const P0: f32 = 101_325.0;
const T0: f32 = 293.15;
const SUBSTEP: f32 = 0.05; // s
const T_FLAME: f32 = 3200.0; // K: dissociation caps how hot a flame gets
const HEAT_PER_O2: f32 = 440e3; // J per mol O2 consumed when organic matter oxidises

// ---------------------------------------------------------------- elements
pub const NEL: usize = 11;
pub const EH: usize = 0;
pub const EC: usize = 1;
pub const EN: usize = 2;
pub const EO: usize = 3;
pub const ENA: usize = 4;
pub const ECL: usize = 5;
pub const ESI: usize = 6;
pub const EFE: usize = 7;
pub const ECU: usize = 8;
pub const EZN: usize = 9;
pub const EAU: usize = 10;
pub const AMU: [f32; NEL] = [1.008, 12.011, 14.007, 15.999, 22.99, 35.45, 28.086, 55.845, 63.546, 65.38, 196.97];

// ---------------------------------------------------------------- compounds
pub const NSP: usize = 18;
pub const O2: usize = 0;
pub const N2: usize = 1;
pub const H2: usize = 2;
pub const CO2: usize = 3;
pub const STEAM: usize = 4;
pub const NH3G: usize = 5;
pub const CH4: usize = 6;
pub const WATER: usize = 7;
pub const NH3L: usize = 8;
pub const NH3AQ: usize = 9; // ammonia dissolved in water
pub const FAT: usize = 10; // triglyceride (peanut oil, insect fat)
pub const SUGAR: usize = 11; // sucrose
pub const SALT: usize = 12;
pub const PROTEIN: usize = 13; // average amino-acid residue
pub const CELLULOSE: usize = 14; // fibre, cell walls, starch
pub const CHITIN: usize = 15; // insect shells
pub const ZNOH2: usize = 16; // spent zinc (from batteries)
pub const FE2O3: usize = 17; // rust
const NGAS: usize = 7;

/// Atoms per molecule: [H, C, N, O, Na, Cl, Si, Fe, Cu, Zn, Au].
pub const FORMULA: [[f32; NEL]; NSP] = [
    [0., 0., 0., 2., 0., 0., 0., 0., 0., 0., 0.],   // O2
    [0., 0., 2., 0., 0., 0., 0., 0., 0., 0., 0.],   // N2
    [2., 0., 0., 0., 0., 0., 0., 0., 0., 0., 0.],   // H2
    [0., 1., 0., 2., 0., 0., 0., 0., 0., 0., 0.],   // CO2
    [2., 0., 0., 1., 0., 0., 0., 0., 0., 0., 0.],   // steam
    [3., 0., 1., 0., 0., 0., 0., 0., 0., 0., 0.],   // ammonia gas
    [4., 1., 0., 0., 0., 0., 0., 0., 0., 0., 0.],   // methane
    [2., 0., 0., 1., 0., 0., 0., 0., 0., 0., 0.],   // water
    [3., 0., 1., 0., 0., 0., 0., 0., 0., 0., 0.],   // liquid ammonia
    [3., 0., 1., 0., 0., 0., 0., 0., 0., 0., 0.],   // dissolved ammonia
    [98., 55., 0., 6., 0., 0., 0., 0., 0., 0., 0.], // fat C55H98O6
    [22., 12., 0., 11., 0., 0., 0., 0., 0., 0., 0.], // sucrose C12H22O11
    [0., 0., 0., 0., 1., 1., 0., 0., 0., 0., 0.],   // NaCl
    [8., 5., 1., 2., 0., 0., 0., 0., 0., 0., 0.],   // protein C5H8O2N
    [10., 6., 0., 5., 0., 0., 0., 0., 0., 0., 0.],  // cellulose C6H10O5
    [13., 8., 1., 5., 0., 0., 0., 0., 0., 0., 0.],  // chitin C8H13O5N
    [2., 0., 0., 2., 0., 0., 0., 0., 0., 1., 0.],   // Zn(OH)2
    [0., 0., 0., 3., 0., 0., 0., 2., 0., 0., 0.],   // Fe2O3
];
/// Density when condensed (kg/m³). Dissolved ammonia takes no extra room.
const RHO: [f32; NSP] = [0., 0., 0., 0., 0., 0., 0., 1000., 680., 0., 910., 1590., 2160., 1350., 1500., 1400., 3050., 5240.];
const CP: [f32; NSP] = [920., 1040., 14300., 840., 2000., 2100., 2200., 4186., 4700., 4700., 2000., 1250., 880., 1700., 1300., 1400., 700., 650.];
/// Compounds of life: they burn, they rot, they can be eaten.
const ORGANICS: [usize; 5] = [FAT, SUGAR, PROTEIN, CELLULOSE, CHITIN];
/// How fast microbes break each down when moist (fraction per second).
const ROT_RATE: [f32; 5] = [1e-5, 1e-4, 3e-5, 1e-5, 3e-6];

/// Molar mass (kg/mol) from the formula.
pub fn mm(s: usize) -> f32 {
    tables().mm[s]
}
/// Mass fraction of element `e` in compound `s`.
fn el_frac(s: usize, e: usize) -> f32 {
    FORMULA[s][e] * AMU[e] / 1000.0 / mm(s)
}

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
pub const RUST: u8 = 17; // (unused: rust now forms in place on steel)
pub const MESH: u8 = 18;
pub const FLAP_E: u8 = 19;
pub const FLAP_S: u8 = 20;
pub const FLAP_W: u8 = 21;
pub const FLAP_N: u8 = 22;
pub const NMAT: usize = 23;

#[derive(Clone, Copy, PartialEq)]
enum Base {
    /// Fixed mass rho·V (integrity in `hp`).
    Fixed,
    /// Mass in `hp` (kg).
    InHp,
    /// rho·V × (1 − `aux`): steel rusting, rubber and carbon burning away.
    Consumed,
    /// No base: the cell is entirely the compounds in `m`.
    None,
}

struct Mat {
    rho: f32,
    cp: f32,
    k: f32,
    strength: f32,
    conductor: bool,
    powder: bool,
    base: Base,
    /// Element mass fractions of the base material.
    comp: [f32; NEL],
    color: [u8; 3],
}

const fn el(h: f32, c: f32, n: f32, o: f32, na: f32, cl: f32, si: f32, fe: f32, cu: f32, zn: f32, au: f32) -> [f32; NEL] {
    [h, c, n, o, na, cl, si, fe, cu, zn, au]
}
const NOTHING: [f32; NEL] = [0.; NEL];
const SIO2: [f32; NEL] = el(0., 0., 0., 0.533, 0., 0., 0.467, 0., 0., 0., 0.);
const fn mat(rho: f32, cp: f32, k: f32, strength: f32, conductor: bool, powder: bool, base: Base, comp: [f32; NEL], color: [u8; 3]) -> Mat {
    Mat { rho, cp, k, strength, conductor, powder, base, comp, color }
}

const MATS: [Mat; NMAT] = [
    mat(0., 0., 0., 0., false, false, Base::None, NOTHING, [52, 48, 42]),                                  // open
    mat(7850., 470., 50., 3.0e6, true, false, Base::Consumed, el(0., 0., 0., 0., 0., 0., 0., 1., 0., 0., 0.), [128, 136, 142]), // steel (iron)
    mat(8960., 385., 400., 1.5e6, true, false, Base::Fixed, el(0., 0., 0., 0., 0., 0., 0., 0., 1., 0., 0.), [198, 107, 61]), // copper
    mat(7140., 388., 116., 5e5, true, false, Base::InHp, el(0., 0., 0., 0., 0., 0., 0., 0., 0., 1., 0.), [170, 178, 186]), // zinc
    mat(2200., 710., 100., 2e5, true, false, Base::Consumed, el(0., 1., 0., 0., 0., 0., 0., 0., 0., 0., 0.), [40, 40, 44]), // carbon (graphite)
    mat(2500., 840., 1.0, 2.5e5, false, false, Base::Fixed, SIO2, [175, 210, 215]),                     // glass
    mat(2400., 880., 1.5, 8e5, false, false, Base::Fixed, SIO2, [120, 116, 108]),                       // concrete (silica)
    mat(1100., 2000., 0.15, 1e5, false, false, Base::Consumed, el(0.118, 0.882, 0., 0., 0., 0., 0., 0., 0., 0., 0.), [46, 46, 46]), // rubber C5H8
    mat(19300., 129., 318., 5e5, true, false, Base::Fixed, el(0., 0., 0., 0., 0., 0., 0., 0., 0., 0., 1.), [242, 201, 76]), // gold
    mat(917., 2100., 2.2, 2e5, false, false, Base::InHp, el(0.112, 0., 0., 0.888, 0., 0., 0., 0., 0., 0., 0.), [210, 235, 250]), // ice H2O
    mat(1200., 800., 0.5, 3e4, false, false, Base::Fixed, SIO2, [110, 82, 52]),                         // soil: silica + lodged water, humus
    mat(0., 0., 0.3, 2e4, false, false, Base::None, NOTHING, [93, 138, 58]),                            // plant tissue
    mat(0., 0., 0.2, 0., false, true, Base::None, NOTHING, [201, 164, 106]),                            // peanut
    mat(0., 840., 0.4, 0., false, true, Base::InHp, SIO2, [96, 92, 86]),                                // rubble (made of `aux`)
    mat(2160., 880., 6.0, 0., false, true, Base::InHp, el(0., 0., 0., 0., 0.393, 0.607, 0., 0., 0., 0., 0.), [240, 240, 240]), // salt crystals
    mat(1590., 1250., 0.5, 0., false, true, Base::InHp, el(0.065, 0.421, 0., 0.514, 0., 0., 0., 0., 0., 0., 0.), [217, 195, 154]), // sugar crystals
    mat(0., 0., 0.2, 0., false, true, Base::None, NOTHING, [70, 52, 30]),                               // dead organic matter
    mat(0., 0., 0.5, 0., false, true, Base::None, NOTHING, [140, 70, 40]),                              // (unused)
    mat(0., 470., 0., 0., false, false, Base::Fixed, el(0., 0., 0., 0., 0., 0., 0., 1., 0., 0., 0.), [90, 100, 104]), // mesh (0.3 kg iron)
    mat(0., 2000., 0., 0., false, false, Base::Fixed, el(0.118, 0.882, 0., 0., 0., 0., 0., 0., 0., 0., 0.), [60, 60, 60]), // flaps (0.1 kg rubber)
    mat(0., 2000., 0., 0., false, false, Base::Fixed, el(0.118, 0.882, 0., 0., 0., 0., 0., 0., 0., 0., 0.), [60, 60, 60]),
    mat(0., 2000., 0., 0., false, false, Base::Fixed, el(0.118, 0.882, 0., 0., 0., 0., 0., 0., 0., 0., 0.), [60, 60, 60]),
    mat(0., 2000., 0., 0., false, false, Base::Fixed, el(0.118, 0.882, 0., 0., 0., 0., 0., 0., 0., 0., 0.), [60, 60, 60]),
];

#[inline]
pub fn is_open(mat: u8) -> bool {
    mat == OPEN || mat == MESH || (FLAP_E..=FLAP_N).contains(&mat)
}
#[inline]
fn passable(mat: u8) -> bool {
    mat == OPEN || (FLAP_E..=FLAP_N).contains(&mat)
}
#[inline]
fn flap_dir(mat: u8) -> Option<usize> {
    if (FLAP_E..=FLAP_N).contains(&mat) { Some((mat - FLAP_E) as usize) } else { None }
}
const DIRS: [(i32, i32); 4] = [(1, 0), (0, 1), (-1, 0), (0, -1)]; // E S W N

// ---------------------------------------------------------------- composition helpers
/// How much salt and sugar the water present can actually hold in solution.
#[inline]
fn dissolved(c: &[f32; NSP]) -> (f32, f32) {
    (c[SALT].min(0.36 * c[WATER]), c[SUGAR].min(2.0 * c[WATER]))
}
/// Volume taken by everything that isn't gas.
#[inline]
fn cond_vol(c: &[f32; NSP]) -> f32 {
    let (sd, gd) = dissolved(c);
    let mut v = (c[SALT] - sd) / RHO[SALT] + (c[SUGAR] - gd) / RHO[SUGAR];
    for s in [WATER, NH3L, FAT, PROTEIN, CELLULOSE, CHITIN, ZNOH2, FE2O3] {
        v += c[s] / RHO[s];
    }
    v
}
#[inline]
fn gas_mol(c: &[f32; NSP]) -> f32 {
    let mut n = 0.0;
    for s in 0..NGAS {
        n += c[s] / mm(s);
    }
    n
}
#[inline]
fn free_vol(c: &[f32; NSP]) -> f32 {
    (V - cond_vol(c)).max(0.03 * V)
}
#[inline]
fn fluid_pressure(c: &[f32; NSP], t: f32) -> f32 {
    gas_mol(c) * RGAS * t / free_vol(c) + 3e6 * (cond_vol(c) / V - 0.97).max(0.0)
}
fn condensed_mass(c: &[f32; NSP]) -> f32 {
    let mut m = 0.0;
    for s in WATER..NSP {
        m += c[s];
    }
    m
}
/// How easily the condensed part flows (water = 1), derived from what it is:
/// the liquids carrying it (fat thickens with cold), how much solid is
/// suspended in them, and how syrupy the water is with sugar.
fn fluidity(c: &[f32; NSP], t: f32) -> f32 {
    let carrier = c[WATER] + c[NH3L] + c[FAT];
    let cv = cond_vol(c);
    if cv < 1e-9 {
        return 1.0;
    }
    if carrier < 1e-9 {
        return 0.0; // a pile of powder doesn't flow
    }
    let (_, gd) = dissolved(c);
    let water_f = 1.0 / (1.0 + 4.0 * gd / c[WATER].max(1e-9));
    let fat_f = lookup(&tables().fat_fluidity, t);
    let base = (c[WATER] * water_f + c[NH3L] * 1.2 + c[FAT] * fat_f) / carrier;
    let v_carrier = c[WATER] / RHO[WATER] + c[NH3L] / RHO[NH3L] + c[FAT] / RHO[FAT];
    let phi = ((cv - v_carrier) / cv).clamp(0.0, 1.0);
    let crowding = if phi < 0.62 { (1.0 - phi / 0.64).powf(2.5) } else { 0.0 };
    base * crowding
}
/// Fraction of a solute that is actually dissolved (and so goes wherever the water goes).
fn dissolved_share(c: &[f32; NSP], s: usize) -> f32 {
    let (sd, gd) = dissolved(c);
    match s {
        SALT => if c[SALT] > 0.0 { sd / c[SALT] } else { 0.0 },
        SUGAR => if c[SUGAR] > 0.0 { gd / c[SUGAR] } else { 0.0 },
        _ => 1.0,
    }
}
fn psat(l: f32, tb: f32, t: f32) -> f32 {
    P0 * ((l / RGAS) * (1.0 / tb - 1.0 / t.max(30.0))).min(30.0).exp()
}

struct Tables {
    mm: [f32; NSP],
    water: Vec<f32>,
    ammonia: Vec<f32>,
    fat_fluidity: Vec<f32>,
}
fn tables() -> &'static Tables {
    static T: std::sync::OnceLock<Tables> = std::sync::OnceLock::new();
    T.get_or_init(|| {
        let mut mm = [0.0; NSP];
        for s in 0..NSP {
            for e in 0..NEL {
                mm[s] += FORMULA[s][e] * AMU[e];
            }
            mm[s] /= 1000.0;
        }
        Tables {
            mm,
            water: (0..6002).map(|k| psat(40_700.0, 373.15, k as f32)).collect(),
            ammonia: (0..6002).map(|k| psat(23_350.0, 239.8, k as f32)).collect(),
            // fat (oil) is ~70× thicker than water at room temperature and thins as it warms
            fat_fluidity: (0..6002).map(|k| (0.015 * (3000.0 * (1.0 / 295.0 - 1.0 / (k as f32).max(200.0))).exp()).min(1.0)).collect(),
        }
    })
}
#[inline]
fn lookup(table: &[f32], t: f32) -> f32 {
    let t = t.clamp(0.0, 6000.0);
    let k = t as usize;
    let f = t - k as f32;
    table[k] * (1.0 - f) + table[k + 1] * f
}

// ---------------------------------------------------------------- reactions from formulas
/// Fully oxidise `mol` of compound `s` in `fuel`, taking O2 from `air` and putting products in `air`.
/// `bio`: nitrogen leaves as ammonia (respiration, aerobic rot) rather than N2 (fire).
/// Returns heat released (J). Limited by the O2 available.
fn oxidise(s: usize, mut mol: f32, fuel: &mut [f32; NSP], air: &mut [f32; NSP], bio: bool) -> f32 {
    let f = &FORMULA[s];
    let (c, h, o, n) = (f[EC], f[EH], f[EO], f[EN]);
    let need = c + h / 4.0 - o / 2.0 - if bio { 0.75 * n } else { 0.0 };
    if need <= 0.0 {
        return 0.0;
    }
    mol = mol.min(fuel[s] / mm(s)).min(air[O2] / mm(O2) / need);
    if mol <= 0.0 {
        return 0.0;
    }
    fuel[s] -= mol * mm(s);
    air[O2] -= mol * need * mm(O2);
    air[CO2] += mol * c * mm(CO2);
    if bio {
        air[STEAM] += mol * (h - 3.0 * n) / 2.0 * mm(STEAM);
        air[NH3G] += mol * n * mm(NH3G);
    } else {
        air[STEAM] += mol * h / 2.0 * mm(STEAM);
        air[N2] += mol * n / 2.0 * mm(N2);
    }
    mol * need * HEAT_PER_O2
}

/// Rot without oxygen (Buswell): CcHhOoNn + water → methane + CO2 + ammonia.
fn ferment(s: usize, mut mol: f32, fuel: &mut [f32; NSP], env: &mut [f32; NSP]) {
    let f = &FORMULA[s];
    let (c, h, o, n) = (f[EC], f[EH], f[EO], f[EN]);
    let water = c - h / 4.0 - o / 2.0 + 0.75 * n;
    mol = mol.min(fuel[s] / mm(s));
    if water > 0.0 {
        mol = mol.min(env[WATER] / mm(WATER) / water);
    }
    if mol <= 0.0 {
        return;
    }
    fuel[s] -= mol * mm(s);
    env[WATER] -= mol * water * mm(WATER);
    env[CH4] += mol * (c / 2.0 + h / 8.0 - o / 4.0 - 0.375 * n) * mm(CH4);
    env[CO2] += mol * (c / 2.0 - h / 8.0 + o / 4.0 + 0.375 * n) * mm(CO2);
    env[NH3G] += mol * n * mm(NH3G);
}

/// Build the compounds in `target` (kg) out of a living thing's reserves in `pool`:
/// carbon/hydrogen/oxygen from sugar, nitrogen from dissolved ammonia or from
/// breaking down protein. The books balance with water, CO2 and O2 (into `env`).
/// All-or-nothing: returns false (and changes nothing) if the reserves can't cover it.
fn build(pool: &mut [f32; NSP], env: &mut [f32; NSP], target: &[f32; NSP]) -> bool {
    let mut atoms = [0.0f32; 4]; // C H O N still to supply
    for s in 0..NSP {
        if s == WATER || s == SUGAR || s == SALT || target[s] <= 0.0 {
            continue;
        }
        let mol = target[s] / mm(s);
        atoms[0] += mol * FORMULA[s][EC];
        atoms[1] += mol * FORMULA[s][EH];
        atoms[2] += mol * FORMULA[s][EO];
        atoms[3] += mol * FORMULA[s][EN];
    }
    // nitrogen: dissolved ammonia first, then protein
    let nh3 = (pool[NH3AQ] / mm(NH3AQ)).min(atoms[3]);
    let prot = ((atoms[3] - nh3).max(0.0)).min(pool[PROTEIN] / mm(PROTEIN) - target[PROTEIN] / mm(PROTEIN).max(0.0));
    if nh3 + prot < atoms[3] - 1e-12 {
        return false;
    }
    let (cr, hr, or) = (atoms[0] - 5.0 * prot, atoms[1] - 3.0 * nh3 - 8.0 * prot, atoms[2] - 2.0 * prot);
    // balance with sugar, CO2 and water; switch to O2 if CO2 would have to be absorbed
    let mut s = (2.0 * cr - or + hr / 2.0) / 24.0;
    let mut co2 = 12.0 * s - cr;
    let mut o2 = 0.0;
    if co2 < 0.0 {
        s = cr / 12.0;
        co2 = 0.0;
        let w = (22.0 * s - hr) / 2.0;
        o2 = (11.0 * s - or - w) / 2.0;
    }
    s = s.max(0.0);
    let w = (22.0 * s - hr) / 2.0;
    let sugar_kg = s * mm(SUGAR) + target[SUGAR];
    let water_kg = target[WATER] - w * mm(WATER);
    if pool[SUGAR] < sugar_kg || pool[WATER] < water_kg || pool[SALT] < target[SALT] || (o2 < 0.0 && env[O2] < -o2 * mm(O2)) {
        return false;
    }
    pool[SUGAR] -= sugar_kg;
    pool[WATER] -= water_kg;
    pool[SALT] -= target[SALT];
    pool[NH3AQ] -= nh3 * mm(NH3AQ);
    pool[PROTEIN] -= prot * mm(PROTEIN);
    env[CO2] += co2 * mm(CO2);
    env[O2] += o2 * mm(O2);
    true
}

/// Oxidise a compound within a single cell's mixture (fuel and air in the same place).
fn oxidise_in(s: usize, mol: f32, c: &mut [f32; NSP], bio: bool) -> f32 {
    let mut fuel = *c;
    let mut air = *c;
    let heat = oxidise(s, mol, &mut fuel, &mut air, bio);
    air[s] = fuel[s];
    *c = air;
    heat
}
/// Ferment a compound within a single cell's mixture.
fn ferment_in(s: usize, mol: f32, c: &mut [f32; NSP]) {
    let mut fuel = *c;
    let mut env = *c;
    ferment(s, mol, &mut fuel, &mut env);
    env[s] = fuel[s];
    *c = env;
}

fn add(a: &mut [f32; NSP], b: &[f32; NSP]) {
    for s in 0..NSP {
        a[s] += b[s];
    }
}
fn scaled(a: &[f32; NSP], k: f32) -> [f32; NSP] {
    let mut o = *a;
    for v in o.iter_mut() {
        *v *= k;
    }
    o
}
fn total(a: &[f32; NSP]) -> f32 {
    a.iter().sum()
}
fn comp(parts: &[(usize, f32)]) -> [f32; NSP] {
    let mut c = [0.0; NSP];
    for &(s, kg) in parts {
        c[s] += kg;
    }
    c
}

// ---------------------------------------------------------------- recipes
/// A leafy plant shoot filling a 10 cm cell (mostly water, as plants are).
pub fn plant_tissue() -> [f32; NSP] {
    comp(&[(WATER, 0.016), (CELLULOSE, 0.0024), (SUGAR, 0.0008), (PROTEIN, 0.0006), (FAT, 0.0002), (SALT, 0.000008)])
}
/// A handful of peanuts: ~49% fat, 26% protein, 16% carbohydrate, 6% water.
pub fn peanuts() -> [f32; NSP] {
    comp(&[(FAT, 0.00049), (PROTEIN, 0.00026), (CELLULOSE, 0.00009), (SUGAR, 0.00007), (WATER, 0.00006), (SALT, 0.0000005)])
}
/// Peanut butter (per cell): roasted, ground peanuts; Rudon's adds salt and sugar.
pub fn peanut_butter(salty_sweet: bool) -> [f32; NSP] {
    let mut c = scaled(&peanuts(), 0.6 / total(&peanuts())); // 0.6 kg of paste per cell
    c[WATER] *= 0.25; // roasting drives most of the water off
    if salty_sweet {
        c[SALT] += 0.009;
        c[SUGAR] += 0.03;
    }
    c
}
/// Wet dead plant and animal matter.
pub fn organic_matter() -> [f32; NSP] {
    comp(&[(WATER, 0.30), (CELLULOSE, 0.12), (PROTEIN, 0.05), (SUGAR, 0.02), (FAT, 0.01)])
}
/// What lives in a soil cell besides its silica: water, humus, a trace of salt.
pub fn soil_extras() -> [f32; NSP] {
    comp(&[(WATER, 0.25), (PROTEIN, 0.02), (CELLULOSE, 0.05), (SALT, 0.001), (NH3AQ, 0.003)])
}

// ---------------------------------------------------------------- organs and animals
pub const NORGAN: usize = 8;
pub const CUTICLE: usize = 0;
pub const MANDIBLES: usize = 1;
pub const GUT: usize = 2;
pub const FAT_BODY: usize = 3;
pub const TRACHEAE: usize = 4;
pub const GANGLIA: usize = 5;
pub const ANTENNAE: usize = 6;
pub const LEGS: usize = 7;
pub const ORGAN_NAMES: [&str; NORGAN] = ["cuticle", "mandibles", "gut", "fat body", "tracheae", "ganglia", "antennae", "legs"];

pub const CATERPILLAR: u8 = 0;
pub const BEETLE: u8 = 1;

/// An adult's organs (kg of each compound). Caterpillar ~2 g, beetle ~1 g; both mostly water.
pub fn organ_template(kind: u8, organ: usize) -> [f32; NSP] {
    let m = |w: f32, p: f32, c: f32, f: f32, s: f32, salt: f32| comp(&[(WATER, w), (PROTEIN, p), (CHITIN, c), (FAT, f), (SUGAR, s), (SALT, salt)]);
    let t = match (kind, organ) {
        // caterpillar: soft-bodied, a big gut, a big fat body
        (CATERPILLAR, CUTICLE) => m(0.15, 0.10, 0.15, 0., 0., 0.0002),
        (CATERPILLAR, MANDIBLES) => m(0.005, 0.01, 0.02, 0., 0., 0.),
        (CATERPILLAR, GUT) => m(0.20, 0.10, 0., 0., 0., 0.0004),
        (CATERPILLAR, FAT_BODY) => m(0.10, 0.05, 0., 0.20, 0.05, 0.0002),
        (CATERPILLAR, TRACHEAE) => m(0.02, 0.005, 0.03, 0., 0., 0.),
        (CATERPILLAR, GANGLIA) => m(0.03, 0.02, 0., 0.005, 0.001, 0.0001),
        (CATERPILLAR, ANTENNAE) => m(0.01, 0.005, 0.005, 0., 0., 0.00003),
        (CATERPILLAR, _) => m(0.15, 0.15, 0.05, 0., 0.002, 0.0003),
        // beetle: armoured (more chitin), long legs, big antennae full of taste sensilla
        (_, CUTICLE) => m(0.05, 0.05, 0.15, 0., 0., 0.0001),
        (_, MANDIBLES) => m(0.003, 0.005, 0.02, 0., 0., 0.),
        (_, GUT) => m(0.08, 0.04, 0., 0., 0., 0.0002),
        (_, FAT_BODY) => m(0.05, 0.03, 0., 0.10, 0.03, 0.0001),
        (_, TRACHEAE) => m(0.01, 0.003, 0.02, 0., 0., 0.),
        (_, GANGLIA) => m(0.02, 0.012, 0., 0.003, 0.001, 0.00006),
        (_, ANTENNAE) => m(0.02, 0.006, 0.01, 0., 0., 0.00004),
        (_, _) => m(0.08, 0.10, 0.05, 0., 0.002, 0.0002),
    };
    scaled(&t, 1e-3)
}
/// Haemolymph: the body's water, carrying sugar, salt and protein between organs.
fn blood_template(kind: u8) -> [f32; NSP] {
    let k = if kind == CATERPILLAR { 1.0 } else { 0.5 };
    scaled(&comp(&[(WATER, 0.5e-3), (SUGAR, 0.01e-3), (SALT, 0.0015e-3), (PROTEIN, 0.02e-3)]), k)
}

#[derive(Clone, Copy, Debug)]
pub struct Organ {
    pub kind: usize,
    pub comp: [f32; NSP],
    pub health: f32,
}

#[derive(Clone, Debug)]
pub struct Agent {
    pub kind: u8,
    pub cell: usize,
    pub alive: bool,
    pub organs: [Organ; NORGAN],
    pub gut: [f32; NSP],
    pub blood: [f32; NSP],
    /// What the antennae tasted last (salt, sugar mass fraction at the best spot).
    pub taste: [f32; 2],
    grow_scale: f32,
}

impl Agent {
    pub fn new(kind: u8, cell: usize, scale: f32) -> Self {
        let organs = std::array::from_fn(|k| Organ { kind: k, comp: scaled(&organ_template(kind, k), scale), health: 1.0 });
        Agent { kind, cell, alive: true, organs, gut: [0.0; NSP], blood: scaled(&blood_template(kind), scale), taste: [0.0; 2], grow_scale: scale }
    }
    pub fn mass(&self) -> f32 {
        self.organs.iter().map(|o| total(&o.comp)).sum::<f32>() + total(&self.gut) + total(&self.blood)
    }
    /// How well the nerves work: they need sodium (from salt) in the blood.
    fn nerves(&self) -> f32 {
        let conc = self.blood[SALT] / self.blood[WATER].max(1e-12);
        (conc / 0.002).clamp(0.0, 1.0) * self.organs[GANGLIA].health.max(0.0)
    }
    /// An organ works if it's healthy and wet enough.
    fn works(&self, k: usize) -> f32 {
        let o = &self.organs[k];
        let wet = (o.comp[WATER] / total(&o.comp).max(1e-12) / 0.25).min(1.0);
        o.health.max(0.0) * wet
    }
}

/// An organ cut out of an animal, lying in a cell.
#[derive(Clone, Copy, Debug)]
pub struct Loose {
    pub kind: usize,
    pub comp: [f32; NSP],
    pub health: f32,
    pub cell: usize,
    pub signal: f32,
    cooldown: u8,
}

// ---------------------------------------------------------------- the world
pub struct Elements {
    pub mat: Vec<u8>,
    pub temp: Vec<f32>,
    pub m: Vec<[f32; NSP]>,
    pub hp: Vec<f32>,
    pub aux: Vec<f32>,
    pub aux2: Vec<u16>, // plants: pollinated (ticks remaining)
    /// Structural damage (0 = sound, 1 = broken), separate from mass.
    pub dmg: Vec<f32>,
    pub spark: Vec<u8>,
    pub agents: Vec<Agent>,
    pub loose: Vec<Loose>,
    pub time: f32,
    substeps: u64,
    life_ticks: u64,
    rng: u32,
    pres: Vec<f32>,
    cap: Vec<f32>,
    kcond: Vec<f32>,
    fluid: Vec<f32>,
    pres_prev: Vec<f32>,
    shock: Vec<u8>,
    region: Vec<u32>,
    region_p: Vec<f32>,
    flow_g: Vec<[f32; 2]>,
    flow_l: Vec<[f32; 2]>,
    dm: Vec<[f32; NSP]>,
    de: Vec<f32>,
    crowd: Vec<u8>,
    ignite: Vec<bool>,
    battery: Vec<bool>,
    rgba: Vec<u8>,
    agent_buf: Vec<f32>,
    probe_buf: [f32; 96],
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
            aux: vec![0.0; N],
            aux2: vec![0; N],
            dmg: vec![0.0; N],
            spark: vec![0; N],
            agents: Vec::new(),
            loose: Vec::new(),
            time: 0.0,
            substeps: 0,
            life_ticks: 0,
            rng: 0x9e37_79b9,
            pres: vec![P0; N],
            cap: vec![1.0; N],
            kcond: vec![0.026; N],
            fluid: vec![1.0; N],
            pres_prev: vec![P0; N],
            shock: vec![0; N],
            region: vec![u32::MAX; N],
            region_p: Vec::new(),
            flow_g: vec![[0.0; 2]; N],
            flow_l: vec![[0.0; 2]; N],
            dm: vec![[0.0; NSP]; N],
            de: vec![0.0; N],
            crowd: vec![0; N],
            ignite: vec![false; N],
            battery: vec![false; N],
            rgba: vec![0; N * 4],
            agent_buf: Vec::new(),
            probe_buf: [0.0; 96],
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
    fn open_nb(&self, i: usize) -> Option<usize> {
        (0..4).filter_map(|d| Self::nb(i, d)).find(|&j| is_open(self.mat[j]))
    }

    // ---------------------------------------------------------------- building helpers
    /// Fresh room air (21% O2, 79% N2, 400 ppm CO2, half humidity) at `atm` atmospheres.
    pub fn fill_air(&mut self, i: usize, atm: f32) {
        let n = atm * P0 * V / (RGAS * T0);
        let c = &mut self.m[i];
        *c = [0.0; NSP];
        c[O2] = 0.21 * n * mm(O2);
        c[N2] = 0.79 * n * mm(N2);
        c[CO2] = 0.0004 * n * mm(CO2);
        c[STEAM] = 0.5 * psat(40_700.0, 373.15, T0) * V / (RGAS * T0) * mm(STEAM);
        self.temp[i] = T0;
    }
    pub fn set_solid(&mut self, i: usize, mat: u8) {
        self.mat[i] = mat;
        self.m[i] = [0.0; NSP];
        let mt = &MATS[mat as usize];
        self.hp[i] = if mt.base == Base::InHp { mt.rho * V } else { 1.0 };
        self.aux[i] = 0.0;
        self.aux2[i] = 0;
        self.dmg[i] = 0.0;
        self.spark[i] = 0;
        match mat {
            PLANT => self.m[i] = plant_tissue(),
            PEANUT => self.m[i] = peanuts(),
            ORGANIC => self.m[i] = organic_matter(),
            SOIL => self.m[i] = soil_extras(),
            RUBBLE => {
                self.aux[i] = CONCRETE as f32;
                self.hp[i] = MATS[CONCRETE as usize].rho * V;
            }
            _ => {}
        }
        if is_open(mat) {
            self.fill_air(i, 1.0);
        }
    }
    /// A player digging out a cell: it becomes fresh air.
    pub fn clear(&mut self, i: usize) {
        self.mat[i] = OPEN;
        self.hp[i] = 1.0;
        self.aux[i] = 0.0;
        self.fill_air(i, 1.0);
    }
    /// Something solid disappeared on its own: the cell becomes open and keeps only what was in it.
    fn vacate(&mut self, i: usize) {
        self.mat[i] = OPEN;
        self.hp[i] = 1.0;
        self.aux[i] = 0.0;
        self.aux2[i] = 0;
    }
    /// Push everything in an open cell into a neighbouring open cell (so a solid can form there).
    fn displace(&mut self, i: usize) -> bool {
        if total(&self.m[i]) < 1e-12 {
            return true;
        }
        let Some(j) = (0..4).filter_map(|d| Self::nb(i, d)).find(|&j| is_open(self.mat[j])) else { return false };
        let moved = self.m[i];
        add(&mut self.m[j], &moved);
        self.m[i] = [0.0; NSP];
        true
    }
    pub fn rect(&mut self, x0: usize, y0: usize, x1: usize, y1: usize, mat: u8) {
        for y in y0..=y1 {
            for x in x0..=x1 {
                self.set_solid(Self::idx(x, y), mat);
            }
        }
    }
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
                self.agents.push(Agent::new(kind, i, 1.0));
            }
        }
    }

    // ---------------------------------------------------------------- accounting
    fn base_mass(&self, i: usize) -> f32 {
        let mat = self.mat[i];
        let mt = &MATS[mat as usize];
        match mat {
            MESH => 0.3,
            FLAP_E..=FLAP_N => 0.1,
            _ => match mt.base {
                Base::Fixed => mt.rho * V,
                Base::InHp => self.hp[i].max(0.0),
                Base::Consumed => mt.rho * V * (1.0 - self.aux[i]).max(0.0),
                Base::None => 0.0,
            },
        }
    }
    fn base_comp(&self, i: usize) -> [f32; NEL] {
        let mut mat = self.mat[i];
        if mat == RUBBLE {
            mat = self.aux[i] as u8;
        }
        // materials that are one compound take their composition from its formula
        let compound = match mat { ICE => Some(WATER), SALT_X => Some(SALT), SUGAR_X => Some(SUGAR), _ => None };
        match compound {
            Some(s) => std::array::from_fn(|e| el_frac(s, e)),
            None => MATS[mat as usize].comp,
        }
    }
    /// Total mass of each element in the world (kg): cells, animals, loose organs.
    pub fn element_totals(&self) -> [f64; NEL] {
        let mut t = [0.0f64; NEL];
        let mut add_comp = |c: &[f32; NSP]| {
            for s in 0..NSP {
                if c[s] != 0.0 {
                    for e in 0..NEL {
                        t[e] += (c[s] * el_frac(s, e)) as f64;
                    }
                }
            }
        };
        for i in 0..N {
            add_comp(&self.m[i]);
        }
        for a in &self.agents {
            for o in &a.organs {
                add_comp(&o.comp);
            }
            add_comp(&a.gut);
            add_comp(&a.blood);
        }
        for l in &self.loose {
            add_comp(&l.comp);
        }
        for i in 0..N {
            let bm = self.base_mass(i);
            if bm > 0.0 {
                let bc = self.base_comp(i);
                for e in 0..NEL {
                    t[e] += (bm * bc[e]) as f64;
                }
            }
        }
        t
    }

    // ---------------------------------------------------------------- physics
    fn heat_cap(&self, i: usize) -> f32 {
        let mut h = 0.2 + self.base_mass(i) * MATS[self.mat[i] as usize].cp;
        let c = &self.m[i];
        for s in 0..NSP {
            h += c[s] * CP[s];
        }
        h
    }
    fn conductivity(&self, i: usize) -> f32 {
        let mat = self.mat[i];
        if is_open(mat) {
            if cond_vol(&self.m[i]) > 0.3 * V { 0.6 } else { 0.026 }
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
            if open && self.pres[i] > self.pres_prev[i] * 1.3 + 5000.0 {
                self.shock[i] = 6;
            } else {
                self.shock[i] = self.shock[i].saturating_sub(1);
            }
            self.pres_prev[i] = self.pres[i];
        }
        self.flow();
        for i in 0..N {
            self.cap[i] = self.heat_cap(i);
            self.kcond[i] = self.conductivity(i);
        }
        self.conduct(dt);
        self.sparks();
        if self.substeps % 30 == 1 {
            self.find_batteries();
        }
        self.react();
        self.solids(dt);
        if self.substeps % 2 == 0 {
            self.structure(dt * 2.0);
            self.powders();
        }
        if self.substeps % 4 == 0 {
            self.life(dt * 4.0);
        }
        self.time += dt;
    }

    /// Pressure-driven flow with momentum ("virtual pipes"), diffusion, and the heat carried along.
    fn flow(&mut self) {
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
                let fwd_ok = ok(self.mat[a], d) && ok(self.mat[b], d);
                let back_ok = ok(self.mat[a], d + 2) && ok(self.mat[b], d + 2);
                let dp = self.pres[a] - self.pres[b];
                let pavg = 0.5 * (self.pres[a] + self.pres[b]) + 1000.0;
                let crowd = 1.0 / (1.0 + 3.0 * (self.crowd[a] as f32 + self.crowd[b] as f32));
                let fl = self.fluid[a].min(self.fluid[b]);
                let mut fg = (self.flow_g[a][d] + ACCEL_G * dp / pavg) * (1.0 - FRICTION_G) * crowd;
                let mut fll = (self.flow_l[a][d] + ACCEL_L * dp / pavg * fl) * (1.0 - (0.05 + 0.6 * (1.0 - fl.min(1.0)))) * crowd;
                if !fwd_ok { fg = fg.min(0.0); fll = fll.min(0.0); }
                if !back_ok { fg = fg.max(0.0); fll = fll.max(0.0); }
                fg = fg.clamp(-MAX_F, MAX_F);
                fll = fll.clamp(-MAX_F, MAX_F);
                self.flow_g[a][d] = fg;
                self.flow_l[a][d] = fll;
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
                    // dissolved things spread through water
                    if self.m[a][WATER] > 0.05 && self.m[b][WATER] > 0.05 {
                        for sp in [SALT, SUGAR, NH3AQ] {
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
                let lim = 0.2 * ca.min(cb) * (self.temp[a] - self.temp[b]).abs();
                let q = q.clamp(-lim, lim);
                self.temp[a] -= q / ca;
                self.temp[b] += q / cb;
            }
            self.temp[a] += (T0 - self.temp[a]) * (0.002 * dt / ca).min(0.5);
            let t = self.temp[a];
            if t > 500.0 {
                let q = (0.02 * 5.67e-8 * 0.02 * (t.powi(4) - T0.powi(4)) * dt).min(0.5 * ca * (t - T0));
                self.temp[a] -= q / ca;
            }
        }
    }

    fn sparks(&mut self) {
        let mut light = Vec::new();
        for i in 0..N {
            if self.spark[i] == 0 && MATS[self.mat[i] as usize].conductor {
                if (0..4).any(|d| Self::nb(i, d).is_some_and(|j| self.spark[j] == 4)) {
                    light.push(i);
                }
            }
        }
        for s in self.spark.iter_mut() {
            *s = s.saturating_sub(1);
        }
        if self.substeps % 6 == 0 {
            for i in 0..N {
                if !self.battery[i] || self.hp[i] <= 0.0 {
                    continue;
                }
                for d in 0..4 {
                    if let Some(j) = Self::nb(i, d) {
                        if MATS[self.mat[j] as usize].conductor && self.mat[j] != ZINC && self.spark[j] == 0 {
                            light.push(j);
                        }
                    }
                }
                // The zinc pays for it: Zn + 2 H2O → Zn(OH)2 + H2, into the brine it touches.
                if let Some(j) = (0..4).filter_map(|d| Self::nb(i, d)).find(|&j| self.brine(j)) {
                    let zn = 1e-6f32.min(self.hp[i]);
                    let mol = zn / (AMU[EZN] / 1000.0);
                    let water = (mol * 2.0 * mm(WATER)).min(self.m[j][WATER]);
                    let mol = mol.min(water / (2.0 * mm(WATER)));
                    self.hp[i] -= mol * AMU[EZN] / 1000.0;
                    self.m[j][WATER] -= mol * 2.0 * mm(WATER);
                    self.m[j][ZNOH2] += mol * mm(ZNOH2);
                    self.m[j][H2] += mol * mm(H2);
                }
            }
        }
        for &i in &light {
            self.spark[i] = 4;
        }
        for &i in &light {
            if self.mat[i] == CARBON {
                self.temp[i] += 4000.0 / self.cap[i].max(1.0);
            }
            for d in 0..4 {
                let Some(j) = Self::nb(i, d) else { continue };
                if !is_open(self.mat[j]) {
                    continue;
                }
                self.ignite[j] = true;
                // electrolysis: 2 H2O → 2 H2 + O2, faster in salty water
                let c = &mut self.m[j];
                if c[WATER] > 0.01 {
                    let salinity = c[SALT] / c[WATER];
                    let w = (2e-6 * (1.0 + 50.0 * salinity)).min(c[WATER] * 0.1);
                    let mol = w / mm(WATER);
                    c[WATER] -= w;
                    c[H2] += mol * mm(H2);
                    c[O2] += mol * 0.5 * mm(O2);
                }
            }
        }
    }

    /// Water with enough dissolved salt to conduct.
    fn brine(&self, j: usize) -> bool {
        is_open(self.mat[j]) && self.m[j][WATER] > 0.05 && dissolved(&self.m[j]).0 / self.m[j][WATER] > 0.005
    }

    fn find_batteries(&mut self) {
        for i in 0..N {
            self.battery[i] = false;
            if self.mat[i] != ZINC || self.hp[i] <= 0.0 || !(0..4).any(|d| Self::nb(i, d).is_some_and(|j| self.brine(j))) {
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

    /// Chemistry and phase change in open cells, all derived from what's in them.
    fn react(&mut self) {
        let tb = tables();
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
            let mut c = self.m[i];
            let ntot = gas_mol(&c).max(1e-12);
            let room = ((T_FLAME - t) * cap0).max(0.0);

            // Burning gases (H2, CH4, NH3): above ~800 K, at a spark, or H2 on gold.
            for (s, limit) in [(H2, 0.04), (CH4, 0.05), (NH3G, 0.15)] {
                let lit = t > 800.0 || spark || (s == H2 && catalyst && t > 330.0);
                if lit && c[s] / mm(s) / ntot > limit && c[O2] / mm(O2) / ntot > 0.03 {
                    let mol = 0.6 * c[s] / mm(s);
                    let need = FORMULA[s][EC] + FORMULA[s][EH] / 4.0;
                    let mol = mol.min(room / (need * HEAT_PER_O2).max(1.0));
                    de += oxidise_in(s, mol, &mut c, false);
                }
            }
            // Burning condensed organic matter (fat, sugar, protein, fibre, chitin) when hot.
            if t > 550.0 && c[O2] > 1e-7 {
                for &s in &ORGANICS {
                    if c[s] > 1e-9 {
                        let mol = (0.02 * c[s] / mm(s) + 1e-7).min(room / (5.0 * HEAT_PER_O2));
                        de += oxidise_in(s, mol, &mut c, false);
                    }
                }
            }
            // Rot: moist organic matter (water ≥ 10% of what's condensed), at life-friendly temperatures.
            let cm = condensed_mass(&c);
            if cm > 1e-6 && c[WATER] / cm >= 0.1 && (275.0..333.0).contains(&t) {
                let aerobic = c[O2] / mm(O2) / ntot > 0.02;
                for (k, &s) in ORGANICS.iter().enumerate() {
                    if c[s] > 1e-9 {
                        let mol = c[s] / mm(s) * ROT_RATE[k] * SUBSTEP;
                        if aerobic {
                            de += oxidise_in(s, mol, &mut c, true);
                        } else {
                            ferment_in(s, mol, &mut c);
                        }
                    }
                }
            }
            // Evaporation and condensation toward saturation (water, ammonia).
            let vf = free_vol(&c);
            for (liq, gas, l) in [(WATER, STEAM, 40_700.0), (NH3L, NH3G, 23_350.0)] {
                if c[liq] <= 0.0 && c[gas] <= 0.0 {
                    continue;
                }
                let ps = lookup(if liq == WATER { &tb.water } else { &tb.ammonia }, t);
                let pv = c[gas] / mm(gas) * RGAS * t / vf;
                if pv < ps && c[liq] > 0.0 {
                    let budget = (cap0 * (t - 150.0) * 0.3).max(0.0) / l;
                    let mol = (0.3 * (ps - pv) * vf / (RGAS * t)).min(c[liq] / mm(liq)).min(budget);
                    c[liq] -= mol * mm(liq);
                    c[gas] += mol * mm(gas);
                    de -= mol * l;
                } else if pv > ps {
                    let mol = (0.3 * (pv - ps) * vf / (RGAS * t)).min(c[gas] / mm(gas));
                    c[gas] -= mol * mm(gas);
                    c[liq] += mol * mm(liq);
                    de += mol * l;
                }
            }
            // Ammonia dissolves into cold water and comes out of hot water.
            if c[WATER] > 0.01 {
                if t < 330.0 && c[NH3G] > 0.0 {
                    let x = (0.05 * c[NH3G]).min((0.3 * c[WATER] - c[NH3AQ]).max(0.0));
                    c[NH3G] -= x;
                    c[NH3AQ] += x;
                    de += x / mm(NH3G) * 35e3;
                } else if t > 350.0 && c[NH3AQ] > 0.0 {
                    let x = 0.05 * c[NH3AQ];
                    c[NH3AQ] -= x;
                    c[NH3G] += x;
                    de -= x / mm(NH3G) * 35e3;
                }
            }
            for v in c.iter_mut() {
                *v = v.max(0.0);
            }
            self.m[i] = c;
            let cap1 = self.heat_cap(i);
            self.temp[i] = ((cap0 * t + de) / cap1).clamp(20.0, 6000.0);
        }
    }

    /// Solids: melting, freezing, dissolving, roasting, burning, rotting, rusting.
    fn solids(&mut self, dt: f32) {
        for i in 0..N {
            self.solids_one(i, dt);
        }
    }

    fn solids_one(&mut self, i: usize, dt: f32) {
        {
            let mat = self.mat[i];
            let t = self.temp[i];
            match mat {
                ICE if t > 273.15 => {
                    let water = self.hp[i];
                    self.vacate(i);
                    self.m[i][WATER] += water;
                    self.temp[i] = 273.2;
                }
                OPEN if self.m[i][WATER] > 0.5 && t < 273.15 => {
                    let water = self.m[i][WATER];
                    self.m[i][WATER] = 0.0;
                    if self.displace(i) {
                        self.mat[i] = ICE;
                        self.hp[i] = water;
                    } else {
                        self.m[i][WATER] = water;
                    }
                }
                SALT_X | SUGAR_X => {
                    let (s, per_water, per_fat) = if mat == SALT_X { (SALT, 0.36, 0.0) } else { (SUGAR, 2.0, 0.0) };
                    for d in 0..4 {
                        let Some(j) = Self::nb(i, d) else { continue };
                        if !is_open(self.mat[j]) {
                            continue;
                        }
                        let cap = per_water * self.m[j][WATER] + per_fat * self.m[j][FAT];
                        let x = (cap - self.m[j][s]).max(0.0).min(self.hp[i]).min(0.004 * dt / SUBSTEP);
                        self.hp[i] -= x;
                        self.m[j][s] += x;
                    }
                    if self.hp[i] <= 1e-6 {
                        let left = self.hp[i].max(0.0);
                        self.vacate(i);
                        self.m[i][s] += left;
                    }
                }
                // Roasting breaks peanuts down: what they're made of runs out as paste.
                PEANUT if t > 430.0 => self.vacate(i),
                PLANT | PEANUT | ORGANIC | SOIL => self.composite_chemistry(i, dt),
                STEEL => {
                    // Rust: 4 Fe + 3 O2 → 2 Fe2O3, where water and oxygen touch it.
                    if let Some(j) = (0..4).filter_map(|d| Self::nb(i, d)).find(|&j| is_open(self.mat[j]) && self.m[j][WATER] > 0.05 && self.m[j][O2] > 1e-6) {
                        let fe = (MATS[STEEL as usize].rho * V * 2e-8 * dt).min(self.base_mass(i));
                        let mol_fe = fe / (AMU[EFE] / 1000.0);
                        let o2 = (mol_fe * 0.75 * mm(O2)).min(self.m[j][O2]);
                        let mol_fe = o2 / mm(O2) / 0.75;
                        self.m[j][O2] -= o2;
                        self.aux[i] += mol_fe * AMU[EFE] / 1000.0 / (MATS[STEEL as usize].rho * V);
                        self.m[i][FE2O3] += mol_fe / 2.0 * mm(FE2O3);
                        if self.aux[i] >= 1.0 {
                            self.mat[i] = RUBBLE;
                            self.aux[i] = STEEL as f32;
                            self.hp[i] = 0.0;
                        }
                    }
                }
                RUBBER | CARBON if t > if mat == RUBBER { 600.0 } else { 1000.0 } => {
                    // The base material itself burns: C and H from its own composition.
                    if let Some(j) = self.open_nb(i) {
                        let mt = &MATS[mat as usize];
                        let burn = (mt.rho * V * 0.002).min(self.base_mass(i));
                        let (cm, hm) = (burn * mt.comp[EC] / (AMU[EC] / 1000.0), burn * mt.comp[EH] / (AMU[EH] / 1000.0));
                        let need = cm + hm / 4.0;
                        let k = (self.m[j][O2] / mm(O2) / need.max(1e-12)).min(1.0);
                        if k > 0.0 {
                            self.m[j][O2] -= need * k * mm(O2);
                            self.m[j][CO2] += cm * k * mm(CO2);
                            self.m[j][STEAM] += hm / 2.0 * k * mm(STEAM);
                            self.aux[i] += burn * k / (mt.rho * V);
                            self.temp[i] += need * k * HEAT_PER_O2 / self.cap[i].max(1.0);
                            if self.aux[i] >= 1.0 {
                                self.vacate(i);
                            }
                        }
                    }
                }
                ZINC if self.hp[i] <= 0.0 => self.vacate(i),
                _ => {}
            }
        }
    }

    /// Compounds lodged in solids (plant tissue, peanuts, dead matter, soil humus)
    /// burn when hot and rot when moist, exchanging gases with a neighbouring open cell.
    fn composite_chemistry(&mut self, i: usize, dt: f32) {
        let Some(j) = self.open_nb(i) else { return };
        let mat = self.mat[i];
        let t = self.temp[i];
        let mut solid = self.m[i];
        let mut air = self.m[j];
        let mut heat = 0.0;
        if t > 550.0 {
            for &s in &ORGANICS {
                heat += oxidise(s, 0.02 * solid[s] / mm(s) + 1e-7, &mut solid, &mut air, false);
            }
            // water boils off into the air
            let w = solid[WATER] * 0.05;
            solid[WATER] -= w;
            air[STEAM] += w;
        }
        let living = mat == PLANT || mat == PEANUT;
        let cm = condensed_mass(&solid);
        if !living && cm > 1e-6 && solid[WATER] / cm >= 0.1 && (275.0..333.0).contains(&t) {
            let aerobic = air[O2] / mm(O2) / gas_mol(&air).max(1e-12) > 0.02;
            let slow = if mat == SOIL { 0.05 } else { 1.0 }; // humus resists rot
            for (k, &s) in ORGANICS.iter().enumerate() {
                let mol = solid[s] / mm(s) * ROT_RATE[k] * slow * dt;
                if aerobic {
                    heat += oxidise(s, mol, &mut solid, &mut air, true);
                } else {
                    ferment(s, mol, &mut solid, &mut air);
                }
            }
        }
        self.m[i] = solid;
        self.m[j] = air;
        self.temp[i] += heat / self.cap[i].max(0.5);
        if (mat == ORGANIC) && condensed_mass(&self.m[i]) < 1e-5 {
            let left = self.m[i];
            self.vacate(i);
            self.m[i] = left;
        }
    }

    // ---------------------------------------------------------------- structure
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
    #[inline]
    fn felt_pressure(&self, i: usize) -> f32 {
        let avg = self.region_p[self.region[i] as usize];
        if self.shock[i] > 0 { avg.max(self.pres[i]) } else { avg }
    }

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
                self.dmg[i] += (stress / mt.strength - 1.0) * dt * 4.0;
                if self.dmg[i] >= 1.0 {
                    // Broken: rubble, made of whatever it was.
                    let mass = self.base_mass_of(mat, i);
                    self.mat[i] = RUBBLE;
                    self.aux[i] = mat as f32;
                    self.hp[i] = mass;
                    self.dmg[i] = 0.0;
                }
            }
        }
    }
    fn base_mass_of(&self, mat: u8, i: usize) -> f32 {
        let mt = &MATS[mat as usize];
        match mt.base {
            Base::Fixed => mt.rho * V,
            Base::Consumed => mt.rho * V * (1.0 - self.aux[i]).max(0.0),
            Base::InHp => self.hp[i].max(0.0),
            Base::None => 0.0,
        }
    }

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
                self.aux.swap(i, lo);
                self.dmg.swap(i, lo);
                self.pres.swap(i, lo);
            }
        }
    }

    // ---------------------------------------------------------------- life
    fn walkable(&self, i: usize) -> bool {
        passable(self.mat[i]) && cond_vol(&self.m[i]) < 0.5 * V
    }

    fn life(&mut self, dt: f32) {
        self.life_ticks += 1;
        for c in self.crowd.iter_mut() {
            *c = 0;
        }
        for a in self.agents.iter().filter(|a| a.alive) {
            self.crowd[a.cell] = self.crowd[a.cell].saturating_add(1);
        }
        self.plants(dt);
        self.animals(dt);
        self.loose_organs(dt);
    }

    /// Plants: photosynthesise (CO2 + water → sugar + O2), take up water, ammonia
    /// and dissolved salt from their surroundings, grow along soil, and set peanuts when pollinated.
    fn plants(&mut self, dt: f32) {
        for i in 0..N {
            if self.mat[i] != PLANT {
                continue;
            }
            let t = self.temp[i];
            let mut p = self.m[i];
            let size = total(&p);
            if !(268.0..=335.0).contains(&t) || p[WATER] < 0.5 * size {
                self.mat[i] = ORGANIC; // dead: what it was made of stays
                continue;
            }
            if self.aux2[i] > 0 {
                self.aux2[i] -= 1;
            }
            let Some(j) = (0..4).filter_map(|d| Self::nb(i, d)).filter(|&j| is_open(self.mat[j])).max_by(|&a, &b| self.m[a][CO2].total_cmp(&self.m[b][CO2])) else { continue };
            let mut air = self.m[j];
            // drink: liquid water (and what's dissolved in it) from the air cell or a neighbouring soil cell
            let want = 0.8 * size - p[WATER];
            if want > 0.0 {
                let soil = (0..4).filter_map(|d| Self::nb(i, d)).find(|&k| self.mat[k] == SOIL && self.m[k][WATER] > 0.05);
                let src = soil.or(if air[WATER] > 1e-4 { Some(j) } else { None });
                if let Some(k) = src {
                    let take = want.min(self.m[k][WATER] * 0.05).min(2e-5 * dt);
                    let frac = take / self.m[k][WATER].max(1e-12);
                    let (salt, nh3) = (self.m[k][SALT] * frac * dissolved_share(&self.m[k], SALT), self.m[k][NH3AQ] * frac);
                    if k == j {
                        air[WATER] -= take;
                        air[SALT] -= salt;
                        air[NH3AQ] -= nh3;
                    } else {
                        self.m[k][WATER] -= take;
                        self.m[k][SALT] -= salt;
                        self.m[k][NH3AQ] -= nh3;
                    }
                    p[WATER] += take;
                    p[SALT] += salt;
                    p[NH3AQ] += nh3;
                }
            }
            // nitrogen for protein: roots draw dissolved ammonia from the soil; leaves take it from the air
            let nh3 = air[NH3G] * 0.2;
            air[NH3G] -= nh3;
            p[NH3AQ] += nh3;
            if p[NH3AQ] < 0.0005 {
                if let Some(k) = (0..4).filter_map(|d| Self::nb(i, d)).find(|&k| self.mat[k] == SOIL && self.m[k][NH3AQ] > 0.0) {
                    let x = self.m[k][NH3AQ] * 0.01;
                    self.m[k][NH3AQ] -= x;
                    p[NH3AQ] += x;
                }
            }
            // photosynthesis: 12 CO2 + 11 H2O → C12H22O11 + 12 O2
            if (283.0..313.0).contains(&t) && p[WATER] > 0.6 * size {
                // (game-accelerated: real leaves are ~500× slower)
                let mol = (air[CO2] * 0.3 / mm(CO2) / 12.0).min(2e-5 * dt).min(p[WATER] * 0.01 / mm(WATER) / 11.0);
                air[CO2] -= mol * 12.0 * mm(CO2);
                p[WATER] -= mol * 11.0 * mm(WATER);
                p[SUGAR] += mol * mm(SUGAR);
                air[O2] += mol * 12.0 * mm(O2);
            }
            // grow into a neighbouring open cell beside soil
            let shoot = plant_tissue();
            if p[SUGAR] > shoot[SUGAR] + 0.005 && self.rand() < 0.2 {
                let d = (self.rand() * 4.0) as usize % 4;
                if let Some(k) = Self::nb(i, d) {
                    let by_soil = (0..4).any(|e| Self::nb(k, e).is_some_and(|q| self.mat[q] == SOIL));
                    if k != j && self.walkable(k) && by_soil && self.crowd[k] == 0 && build(&mut p, &mut air, &shoot) && self.displace(k) {
                        self.mat[k] = PLANT;
                        self.m[k] = shoot;
                        self.temp[k] = t;
                        self.aux2[k] = 0;
                    } else if k == j || !self.walkable(k) {
                        // nowhere to grow: nothing spent
                    }
                }
            }
            // set peanuts when pollinated
            let nuts = peanuts();
            if self.aux2[i] > 0 && p[SUGAR] > 0.0025 {
                let d = (self.rand() * 4.0) as usize % 4;
                if let Some(k) = Self::nb(i, d) {
                    if k != j && self.walkable(k) && self.crowd[k] == 0 && build(&mut p, &mut air, &nuts) && self.displace(k) {
                        self.mat[k] = PEANUT;
                        self.m[k] = nuts;
                        self.temp[k] = t;
                        self.aux2[i] = 0;
                    }
                }
            }
            self.m[i] = p;
            self.m[j] = air;
        }
    }

    fn animals(&mut self, dt: f32) {
        let mut agents = std::mem::take(&mut self.agents);
        let population = agents.iter().filter(|a| a.alive).count();
        let mut born = Vec::new();
        for a in agents.iter_mut() {
            if !a.alive {
                self.decay_body(a, dt);
                continue;
            }
            self.live(a, dt, population + born.len(), &mut born);
        }
        // Corpses that have rotted away leave their last traces in the cell.
        for a in agents.iter().filter(|a| !a.alive && a.mass() < 2e-6) {
            let mut left = a.gut;
            add(&mut left, &a.blood);
            for o in &a.organs {
                add(&mut left, &o.comp);
            }
            let cell = if is_open(self.mat[a.cell]) { a.cell } else { self.open_nb(a.cell).unwrap_or(a.cell) };
            add(&mut self.m[cell], &left);
        }
        agents.retain(|a| a.alive || a.mass() >= 2e-6);
        agents.extend(born);
        self.agents = agents;
    }

    /// One living animal, one tick: breathe, sense, move, eat, digest, keep its organs going.
    fn live(&mut self, a: &mut Agent, dt: f32, population: usize, born: &mut Vec<Agent>) {
        let cell = a.cell;
        let t = self.temp[cell];
        let body = a.mass();
        let nerves = a.nerves();
        let template_water = blood_template(a.kind)[WATER] * a.grow_scale;
        let mut damage = 0.0f32;

        // Breathing and respiration: burn sugar (then fat) with oxygen from the air.
        let demand = 1e-4 * body * dt; // mol O2
        let mut air = self.m[cell];
        let breath = a.works(TRACHEAE);
        let o2_avail = air[O2] / mm(O2) * 0.5 * breath;
        let mut got = demand.min(o2_avail); // O2 still to use
        let mut heat = 0.0;
        for (pool_blood, s) in [(true, SUGAR), (false, SUGAR), (false, FAT)] {
            if got <= 1e-15 {
                break;
            }
            let need = FORMULA[s][EC] + FORMULA[s][EH] / 4.0 - FORMULA[s][EO] / 2.0;
            let pool = if pool_blood { &mut a.blood } else { &mut a.organs[FAT_BODY].comp };
            let before = air[O2];
            let mut out = air;
            heat += oxidise(s, got / need, pool, &mut out, true);
            got -= (before - out[O2]) / mm(O2);
            air = out;
        }
        // metabolic water goes into the blood, not the air
        let water = air[STEAM] - self.m[cell][STEAM];
        if water > 0.0 {
            air[STEAM] -= water;
            a.blood[WATER] += water;
        }
        let used = demand.min(o2_avail) - got;
        if used < demand * 0.5 {
            damage += 0.03; // suffocating or starving
        }
        // Losing water through the cuticle into dry air.
        let rh = {
            let pv = air[STEAM] / mm(STEAM) * RGAS * t / free_vol(&air);
            (pv / lookup(&tables().water, t)).min(1.0)
        };
        let loss = (1.0 - rh) * 4e-8 * dt * (1.0 - 0.5 * a.works(CUTICLE)) * a.grow_scale;
        let loss = loss.min(a.blood[WATER]);
        a.blood[WATER] -= loss;
        air[STEAM] += loss;
        if a.blood[WATER] < 0.4 * template_water {
            damage += 0.02; // drying out
        }
        // Heat cooks proteins; cold slows everything.
        let (cook, chill) = if a.kind == CATERPILLAR { (318.0, 278.0) } else { (322.0, 275.0) };
        if t > cook {
            damage += 0.01 * (t - cook);
        }
        let active = t > chill;
        // Nerves need sodium: without salt in the blood they fail.
        if nerves < 0.2 {
            damage += 0.004;
        }
        self.temp[cell] += heat / self.cap[cell].max(1.0);
        self.m[cell] = air;

        // Senses: the antennae touch the cell and its neighbours. Whatever they touch
        // dissolves into the watery lymph inside them: salt and sugar are tasted
        // that way. No lymph water, no taste.
        let ant = a.works(ANTENNAE) * nerves;
        let taste = |e: &Elements, j: usize| -> (f32, f32) {
            let c = &e.m[j];
            let cm = condensed_mass(c);
            if cm < 1e-6 { (0.0, 0.0) } else { (c[SALT] / cm, c[SUGAR] / cm) }
        };
        let thirst = (1.0 - a.blood[WATER] / template_water).clamp(0.0, 1.0);
        // Settle on food that has what the body lacks; get restless on food that doesn't.
        let salt_need = (1.0 - a.blood[SALT] / a.blood[WATER].max(1e-12) / 0.004).clamp(0.0, 1.0);
        let here_salty = a.taste[0] > 0.005;
        let restless = match a.kind {
            BEETLE if here_salty && thirst < 0.5 => 0.08,
            BEETLE => 0.4 + 0.5 * salt_need,
            _ => 0.7,
        };
        let mut best = cell;
        if active && a.works(LEGS) * nerves > 0.3 && self.rand() < restless {
            let mut best_s = f32::MIN;
            let mut seen = [0.0f32; 2];
            for j in std::iter::once(cell).chain((0..4).filter_map(|d| Self::nb(cell, d))) {
                // what's in that cell, and what's next to it (where the antennae reach)
                let mut salt = 0.0f32;
                let mut sugar = 0.0f32;
                let mut wet = 0.0f32;
                for k in std::iter::once(j).chain((0..4).filter_map(|d| Self::nb(j, d))) {
                    if is_open(self.mat[k]) {
                        let c = &self.m[k];
                        wet = wet.max(c[WATER] / condensed_mass(c).max(1e-9) * (c[WATER] > 0.02) as u8 as f32);
                    }
                    let (s, g) = if self.mat[k] == PLANT || self.mat[k] == PEANUT {
                        let c = &self.m[k];
                        (c[SALT] / total(c).max(1e-12), c[SUGAR] / total(c).max(1e-12))
                    } else { taste(self, k) };
                    salt = salt.max(s);
                    sugar = sugar.max(g);
                }
                salt *= ant;
                sugar *= ant;
                if j != cell && !self.walkable(j) {
                    continue;
                }
                let water_pull = thirst * wet * ant * 30.0;
                let s = if a.kind == CATERPILLAR {
                    sugar * 60.0 + water_pull + self.rand() * 0.6
                } else {
                    (1.0 - thirst) * (salt * 400.0 * (0.5 + salt_need) + sugar * 20.0 * (1.0 - salt_need)) + water_pull - (self.temp[j] - 295.0).abs() * 0.15 + self.rand() * 0.8
                };
                if s > best_s {
                    best_s = s;
                    best = j;
                    seen = [salt, sugar];
                }
            }
            a.taste = seen;
        }
        if best == cell {
            let mut salt = 0.0f32;
            let mut sugar = 0.0f32;
            for k in std::iter::once(cell).chain((0..4).filter_map(|d| Self::nb(cell, d))) {
                let (s, g) = taste(self, k);
                salt = salt.max(s);
                sugar = sugar.max(g);
            }
            a.taste = [salt * ant, sugar * ant];
        }
        a.cell = best;

        // Eating: real mass, taken in proportion to what the food is made of.
        let mouth = a.works(MANDIBLES) * nerves;
        let gut_room = 0.05e-3 * a.grow_scale - total(&a.gut);
        if mouth > 0.3 && gut_room > 0.0 {
            // about its own weight in food per game hour
            let bite = ((if a.kind == CATERPILLAR { 1e-7 } else { 5e-8 }) * a.grow_scale).min(gut_room);
            if a.kind == CATERPILLAR {
                if let Some(p) = (0..4).filter_map(|d| Self::nb(best, d)).find(|&p| self.mat[p] == PLANT) {
                    let plant = total(&self.m[p]);
                    let k = (bite / plant).min(1.0);
                    let eaten = scaled(&self.m[p], k);
                    for s in 0..NSP {
                        self.m[p][s] -= eaten[s];
                    }
                    add(&mut a.gut, &eaten);
                    self.aux2[p] = 1500; // pollinated in passing
                    if total(&self.m[p]) < 0.3 * total(&plant_tissue()) {
                        self.vacate(p); // eaten to the stalk: what's left lies there
                    }
                }
            } else {
                // beetles eat what they're standing in or touching: anything with fat or sugar in it
                let food = std::iter::once(best).chain((0..4).filter_map(|d| Self::nb(best, d)))
                    .find(|&j| is_open(self.mat[j]) && self.m[j][FAT] + self.m[j][SUGAR] > 1e-4);
                if let Some(j) = food {
                    let cm = condensed_mass(&self.m[j]);
                    let k = (bite / cm).min(1.0);
                    for s in WATER..NSP {
                        let x = self.m[j][s] * k;
                        self.m[j][s] -= x;
                        a.gut[s] += x;
                    }
                }
            }
        }

        // Digestion: sugar, fat, protein, salt and water are absorbed; fibre and chitin pass through.
        if a.works(GUT) > 0.2 {
            let k = 0.05 * a.works(GUT);
            for s in [SUGAR, SALT, WATER, NH3AQ] {
                let x = a.gut[s] * k;
                a.gut[s] -= x;
                a.blood[s] += x;
            }
            for s in [FAT, PROTEIN] {
                let x = a.gut[s] * k;
                a.gut[s] -= x;
                a.organs[FAT_BODY].comp[s] += x;
            }
            let frass = a.gut[CELLULOSE] + a.gut[CHITIN] + a.gut[ZNOH2] + a.gut[FE2O3];
            if frass > 0.03e-3 {
                // excrete it, with a little salt and water, into the cell
                let mut out = [0.0; NSP];
                for s in [CELLULOSE, CHITIN, ZNOH2, FE2O3] {
                    out[s] = a.gut[s];
                    a.gut[s] = 0.0;
                }
                out[WATER] = (frass * 0.5).min(a.blood[WATER] * 0.1);
                a.blood[WATER] -= out[WATER];
                add(&mut self.m[best], &out);
            }
        }
        // Too much water (a juicy diet): pass the excess. Too little: drink from a wet cell nearby.
        let excess = a.blood[WATER] - 1.5 * template_water;
        if excess > 0.0 {
            a.blood[WATER] -= excess;
            self.m[best][WATER] += excess;
        } else if a.blood[WATER] < template_water && a.works(MANDIBLES) > 0.2 {
            if let Some(j) = std::iter::once(best).chain((0..4).filter_map(|d| Self::nb(best, d))).find(|&j| is_open(self.mat[j]) && self.m[j][WATER] > 0.02) {
                let sip = (template_water - a.blood[WATER]).min(0.005e-3).min(self.m[j][WATER] * 0.1);
                let frac = sip / self.m[j][WATER];
                for s in [WATER, SALT, SUGAR, NH3AQ] {
                    let x = self.m[j][s] * if s == WATER { frac } else { frac.min(1.0) * dissolved_share(&self.m[j], s) };
                    self.m[j][s] -= x;
                    a.blood[s] += x;
                }
            }
        }
        // Salt is slowly lost (and must be eaten again); store spare blood sugar in the fat body.
        let salt_out = a.blood[SALT] * 0.0005; // about 1/e every 7 minutes: they must keep eating salt
        a.blood[SALT] -= salt_out;
        self.m[best][SALT] += salt_out;
        let spare = a.blood[SUGAR] - 0.03 * a.blood[WATER];
        if spare > 0.0 {
            a.blood[SUGAR] -= spare;
            a.organs[FAT_BODY].comp[SUGAR] += spare;
        }

        // Health: damaged organs, or slow repair when all is well.
        for o in a.organs.iter_mut() {
            if damage > 0.0 {
                o.health -= damage * if o.kind == GANGLIA { 1.0 } else { 0.5 };
            } else {
                o.health = (o.health + 0.002).min(1.0);
            }
        }
        if a.organs[GANGLIA].health <= 0.0 {
            a.alive = false;
            return;
        }

        // Growing up (offspring are born small) and reproducing, from the fat body's reserves.
        if a.grow_scale < 1.0 && a.organs[FAT_BODY].comp[FAT] > 0.5 * organ_template(a.kind, FAT_BODY)[FAT] {
            let step = 0.01;
            let mut need = [0.0; NSP];
            for k in 0..NORGAN {
                add(&mut need, &scaled(&organ_template(a.kind, k), step));
            }
            add(&mut need, &scaled(&blood_template(a.kind), step));
            let mut pool = a.organs[FAT_BODY].comp;
            add(&mut pool, &a.blood);
            let mut env = self.m[a.cell];
            if self.burn_fat_to_sugar(&mut pool, &mut env, need[SUGAR] * 3.0) && build(&mut pool, &mut env, &need) {
                for k in 0..NORGAN {
                    add(&mut a.organs[k].comp, &scaled(&organ_template(a.kind, k), step));
                }
                // put the pool back: blood keeps its share, the rest is fat body
                a.blood = scaled(&blood_template(a.kind), a.grow_scale + step);
                for s in 0..NSP {
                    pool[s] -= a.blood[s];
                }
                if pool.iter().all(|&v| v >= -1e-12) {
                    a.organs[FAT_BODY].comp = pool;
                    self.m[a.cell] = env;
                    a.grow_scale += step;
                }
            }
        }
        if a.grow_scale >= 1.0 && population < 1500 && a.organs[FAT_BODY].comp[FAT] > 1.6 * organ_template(a.kind, FAT_BODY)[FAT] {
            let child = Agent::new(a.kind, a.cell, 0.3);
            let mut need = [0.0; NSP];
            for o in &child.organs {
                add(&mut need, &o.comp);
            }
            add(&mut need, &child.blood);
            let mut pool = a.organs[FAT_BODY].comp;
            let mut env = self.m[a.cell];
            if self.burn_fat_to_sugar(&mut pool, &mut env, need[SUGAR] * 3.0 + 0.2e-3) && build(&mut pool, &mut env, &need) {
                a.organs[FAT_BODY].comp = pool;
                self.m[a.cell] = env;
                born.push(child);
            }
        }
    }

    /// Animals keep their energy as fat; to build, they turn some back into sugar
    /// (C55H98O6 + O2 → sugar + CO2 + water, balanced by formula).
    fn burn_fat_to_sugar(&self, pool: &mut [f32; NSP], env: &mut [f32; NSP], sugar_kg: f32) -> bool {
        if pool[SUGAR] >= sugar_kg {
            return true;
        }
        let need = sugar_kg - pool[SUGAR];
        let mut target = [0.0; NSP];
        target[SUGAR] = 0.0;
        // fat → sugar: run `build` backwards by hand: per mol sugar from fat, carbon 12 of 55
        let mol_sugar = need / mm(SUGAR);
        let mol_fat = mol_sugar * 12.0 / 55.0;
        if pool[FAT] < mol_fat * mm(FAT) {
            return false;
        }
        // atoms: fat gives C12 H(98·12/55) O(6·12/55); sugar needs C12 H22 O11 → balance with water and O2
        let h_from_fat = 98.0 * 12.0 / 55.0;
        let o_from_fat = 6.0 * 12.0 / 55.0;
        let water = (h_from_fat - 22.0) / 2.0; // >0: released
        let o2 = (11.0 + water - o_from_fat) / 2.0; // consumed
        if env[O2] < mol_sugar * o2 * mm(O2) {
            return false;
        }
        pool[FAT] -= mol_fat * mm(FAT);
        env[O2] -= mol_sugar * o2 * mm(O2);
        pool[WATER] += mol_sugar * water * mm(WATER);
        pool[SUGAR] += mol_sugar * mm(SUGAR);
        let _ = target;
        true
    }

    /// A dead body rots: each organ, the gut and the blood, by what they're made of.
    fn decay_body(&mut self, a: &mut Agent, dt: f32) {
        let cell = a.cell;
        let t = self.temp[cell];
        if !(275.0..333.0).contains(&t) {
            return;
        }
        let mut air = self.m[cell];
        let aerobic = air[O2] / mm(O2) / gas_mol(&air).max(1e-12) > 0.02;
        let mut heat = 0.0;
        let mut parts: Vec<&mut [f32; NSP]> = a.organs.iter_mut().map(|o| &mut o.comp).collect();
        parts.push(&mut a.gut);
        parts.push(&mut a.blood);
        for p in parts {
            for (k, &s) in ORGANICS.iter().enumerate() {
                let mol = p[s] / mm(s) * ROT_RATE[k] * 3.0 * dt;
                if aerobic {
                    heat += oxidise(s, mol, p, &mut air, true);
                } else {
                    ferment(s, mol, p, &mut air);
                }
            }
            // water and salt leak out as it breaks down
            let w = p[WATER] * 0.002 * dt;
            p[WATER] -= w;
            air[WATER] += w;
            let sl = p[SALT] * 0.002 * dt;
            p[SALT] -= sl;
            air[SALT] += sl;
        }
        self.m[cell] = air;
        self.temp[cell] += heat / self.cap[cell].max(1.0);
    }

    /// Organs cut out of an animal. Kept wet, fed (dissolved sugar) and oxygenated,
    /// they stay alive; otherwise they die and rot. A living antenna still tastes,
    /// and its nerve fires into any conductor it touches.
    fn loose_organs(&mut self, dt: f32) {
        let mut loose = std::mem::take(&mut self.loose);
        for o in loose.iter_mut() {
            let cell = o.cell;
            let mut bath = self.m[cell];
            let fed = bath[WATER] > 0.05 && dissolved(&bath).1 > 1e-5 && bath[O2] > 1e-7;
            if o.health > 0.0 && fed {
                // soak up sugar and water, and burn a little sugar to stay alive
                let s = (dissolved(&bath).1 * 0.01).min(1e-8 * dt);
                bath[SUGAR] -= s;
                o.comp[SUGAR] += s;
                let want = 0.5 * total(&o.comp) - o.comp[WATER];
                if want > 0.0 {
                    let w = want.min(bath[WATER] * 0.01);
                    bath[WATER] -= w;
                    o.comp[WATER] += w;
                }
                let mut air = bath;
                oxidise(SUGAR, 2e-9 * dt, &mut o.comp, &mut air, true);
                bath = air;
                o.health = (o.health + 0.001).min(1.0);
            } else {
                o.health -= 0.003;
            }
            if o.health <= 0.0 && (275.0..333.0).contains(&self.temp[cell]) {
                for (k, &s) in ORGANICS.iter().enumerate() {
                    let mol = o.comp[s] / mm(s) * ROT_RATE[k] * 3.0 * dt;
                    let mut air = bath;
                    oxidise(s, mol, &mut o.comp, &mut air, true);
                    bath = air;
                }
            }
            self.m[cell] = bath;
            // a severed antenna: taste, and fire into a wire
            o.cooldown = o.cooldown.saturating_sub(1);
            if o.kind == ANTENNAE {
                let lymph = o.comp[WATER] / total(&o.comp).max(1e-12) > 0.3;
                let mut salt = 0.0f32;
                for k in std::iter::once(cell).chain((0..4).filter_map(|d| Self::nb(cell, d))) {
                    let c = &self.m[k];
                    let cm = condensed_mass(c);
                    if cm > 1e-6 {
                        salt = salt.max(c[SALT] / cm);
                    }
                }
                o.signal = if o.health > 0.2 && lymph { salt } else { 0.0 };
                if o.signal > 0.004 && o.cooldown == 0 && o.comp[SUGAR] > 1e-10 {
                    for d in 0..4 {
                        if let Some(j) = Self::nb(cell, d) {
                            if MATS[self.mat[j] as usize].conductor && self.spark[j] == 0 {
                                self.spark[j] = 4;
                            }
                        }
                    }
                    let mut air = self.m[cell];
                    oxidise(SUGAR, 1e-11, &mut o.comp, &mut air, true);
                    self.m[cell] = air;
                    o.cooldown = 2;
                }
            }
        }
        // rotted away: the remains join the cell
        for o in loose.iter().filter(|o| o.health <= 0.0 && total(&o.comp) < 1e-7) {
            add(&mut self.m[o.cell], &o.comp);
        }
        loose.retain(|o| o.health > 0.0 || total(&o.comp) >= 1e-7);
        self.loose = loose;
    }

    /// The scalpel: an animal comes apart into its organs; its gut contents and blood spill.
    pub fn dissect(&mut self, i: usize) -> bool {
        let Some(k) = self.agents.iter().position(|a| a.cell == i) else { return false };
        let a = self.agents.remove(k);
        let mut spill = a.gut;
        add(&mut spill, &a.blood);
        let cell = if is_open(self.mat[i]) { i } else { self.open_nb(i).unwrap_or(i) };
        add(&mut self.m[cell], &spill);
        for o in a.organs.iter() {
            self.loose.push(Loose { kind: o.kind, comp: o.comp, health: if a.alive { 1.0 } else { 0.0 }, cell, signal: 0.0, cooldown: 0 });
        }
        true
    }

    // ---------------------------------------------------------------- outputs
    pub fn render(&mut self, mode: u32) -> &[u8] {
        for i in 0..N {
            let mat = self.mat[i];
            let t = self.temp[i];
            let col: [f32; 3] = match mode {
                1 => ramp((t - 250.0) / 150.0),
                2 => if is_open(mat) { ramp(((self.pres[i] / P0).ln() + 1.0) / 3.0) } else { [30., 30., 30.] },
                3 => {
                    if is_open(mat) {
                        ramp(self.m[i][O2] / mm(O2) / gas_mol(&self.m[i]).max(1e-12) / 0.25)
                    } else {
                        [30., 30., 30.]
                    }
                }
                _ => {
                    let base = MATS[mat as usize].color;
                    let mut col = [base[0] as f32, base[1] as f32, base[2] as f32];
                    let noise = (((i * 2654435761) >> 13) % 13) as f32 - 6.0;
                    let c = &self.m[i];
                    if is_open(mat) {
                        let fill = (cond_vol(c) / V).min(1.0);
                        if fill > 0.01 {
                            let cm = condensed_mass(c).max(1e-12);
                            let mut lc = [0f32; 3];
                            for (s, cc) in [
                                (WATER, [60., 120., 200.]), (NH3L, [200., 220., 240.]), (NH3AQ, [120., 160., 210.]), (FAT, [215., 185., 70.]),
                                (SUGAR, [235., 225., 200.]), (SALT, [240., 240., 240.]), (PROTEIN, [195., 160., 120.]), (CELLULOSE, [150., 120., 80.]),
                                (CHITIN, [90., 70., 40.]), (ZNOH2, [225., 225., 225.]), (FE2O3, [140., 70., 40.]),
                            ] {
                                for k in 0..3 {
                                    lc[k] += cc[k] * c[s] / cm;
                                }
                            }
                            for k in 0..3 {
                                col[k] = col[k] * (1.0 - fill) + lc[k] * fill;
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
                    } else if mat == PLANT {
                        let wet = (c[WATER] / total(c).max(1e-12)).clamp(0.5, 0.85);
                        col = [93. * (1.6 - wet), 138. * wet / 0.8, 58.];
                    } else if mat == STEEL && self.aux[i] > 0.0 {
                        let r = (self.aux[i] * 20.0).min(1.0);
                        col = [col[0] * (1.0 - r) + 140. * r, col[1] * (1.0 - r) + 70. * r, col[2] * (1.0 - r) + 40. * r];
                    } else if mat == RUBBLE {
                        let b = MATS[self.aux[i] as usize].color;
                        col = [b[0] as f32 * 0.8, b[1] as f32 * 0.8, b[2] as f32 * 0.8];
                    }
                    for k in 0..3 {
                        col[k] += noise;
                    }
                    if t > 700.0 {
                        let g = ((t - 700.0) / 1500.0).min(1.0);
                        col = [col[0] * (1.0 - g) + 255.0 * g, col[1] * (1.0 - g) + 170.0 * g, col[2] * (1.0 - g) + 60.0 * g];
                    }
                    if self.spark[i] >= 3 {
                        col = [255., 250., 180.];
                    }
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

    /// [x, y, code] for animals and loose organs. Codes: 0 caterpillar, 1 beetle,
    /// 2 dead caterpillar, 3 dead beetle, 4 loose antenna, 5 another loose organ.
    pub fn agent_data(&mut self) -> &[f32] {
        self.agent_buf.clear();
        for a in &self.agents {
            self.agent_buf.extend([(a.cell % W) as f32, (a.cell / W) as f32, (a.kind + if a.alive { 0 } else { 2 }) as f32]);
        }
        for o in &self.loose {
            self.agent_buf.extend([(o.cell % W) as f32, (o.cell / W) as f32, if o.kind == ANTENNAE { 4.0 } else { 5.0 }]);
        }
        &self.agent_buf
    }
    pub fn marker_count(&self) -> usize {
        self.agents.len() + self.loose.len()
    }

    /// Readout for one cell (96 floats):
    /// 0 material, 1 T, 2 P, 3 base mass, 4 spark, 5 total mass,
    /// 6..24 compounds (kg), 24..35 elements (kg),
    /// 35 animals here, 36 kind, 37 alive, 38 nerves, 39 tasted salt, 40 tasted sugar, 41 body mass,
    /// 42..66 organs × (mass, health, water fraction),
    /// 66 loose organs here, 67 first loose kind, 68 its health, 69 its signal, 70 its mass.
    pub fn probe(&mut self, i: usize) -> &[f32; 96] {
        let mut p = [0.0f32; 96];
        p[0] = self.mat[i] as f32;
        p[1] = self.temp[i];
        p[2] = if is_open(self.mat[i]) { fluid_pressure(&self.m[i], self.temp[i]) } else { 0.0 };
        p[3] = self.base_mass(i);
        p[4] = self.spark[i] as f32;
        p[5] = p[3] + total(&self.m[i]);
        for s in 0..NSP {
            p[6 + s] = self.m[i][s];
            for e in 0..NEL {
                p[24 + e] += self.m[i][s] * el_frac(s, e);
            }
        }
        let bc = self.base_comp(i);
        for e in 0..NEL {
            p[24 + e] += p[3] * bc[e];
        }
        let here: Vec<&Agent> = self.agents.iter().filter(|a| a.cell == i).collect();
        p[35] = here.len() as f32;
        if let Some(a) = here.first() {
            p[36] = a.kind as f32;
            p[37] = a.alive as u8 as f32;
            p[38] = a.nerves();
            p[39] = a.taste[0];
            p[40] = a.taste[1];
            p[41] = a.mass();
            for (k, o) in a.organs.iter().enumerate() {
                let m = total(&o.comp);
                p[42 + k * 3] = m;
                p[43 + k * 3] = o.health;
                p[44 + k * 3] = o.comp[WATER] / m.max(1e-12);
            }
        }
        let ls: Vec<&Loose> = self.loose.iter().filter(|o| o.cell == i).collect();
        p[66] = ls.len() as f32;
        if let Some(o) = ls.first() {
            p[67] = o.kind as f32;
            p[68] = o.health;
            p[69] = o.signal;
            p[70] = total(&o.comp);
        }
        self.probe_buf = p;
        &self.probe_buf
    }

    /// A player's edit from the zoomed-in view.
    pub fn edit(&mut self, x: usize, y: usize, tool: u32, value: f32) {
        if x >= W || y >= H {
            return;
        }
        let i = Self::idx(x, y);
        match tool {
            0 => self.clear(i),
            1 => self.set_solid(i, value as u8),
            2 => {
                if !is_open(self.mat[i]) {
                    return;
                }
                let v = value as usize;
                match v {
                    100 => add(&mut self.m[i], &scaled(&peanut_butter(false), 0.3)),
                    101 => add(&mut self.m[i], &scaled(&peanut_butter(true), 0.3)),
                    s if s < NSP => self.m[i][s] += if s < NGAS { 0.0005 } else if s == SALT || s == SUGAR { 0.01 } else { 0.2 },
                    _ => {}
                }
            }
            3 => self.temp[i] += value,
            4 => self.spark[i] = 4,
            5 => self.agents.push(Agent::new(value as u8, i, 1.0)),
            6 => {
                self.dissect(i);
            }
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
pub fn demo() -> Elements {
    let mut e = Elements::new();
    e.boxed(0, 0, W - 1, H - 1, CONCRETE);
    e.boxed(1, 1, W - 2, H - 2, CONCRETE);

    // 1. A galvanic cell wired to an electrolysis tank and (across a gap you
    //    bridge with copper) to a carbon igniter in a hydrogen–oxygen chamber.
    e.boxed(4, 4, 20, 20, CONCRETE);
    e.fill(5, 5, 19, 19, |c| { *c = [0.0; NSP]; c[WATER] = 0.95; c[SALT] = 0.05; });
    e.rect(7, 7, 7, 17, ZINC);
    e.rect(17, 7, 17, 17, COPPER);
    e.rect(7, 3, 7, 6, COPPER);
    for x in 7..=27 { e.set_solid(Elements::idx(x, 3), COPPER); }
    e.boxed(24, 5, 40, 20, GLASS);
    e.fill(25, 9, 39, 19, |c| { *c = [0.0; NSP]; c[WATER] = 0.95; c[SALT] = 0.01; });
    e.rect(27, 4, 27, 16, COPPER);
    for x in 28..=43 { e.set_solid(Elements::idx(x, 3), COPPER); }
    for x in 45..=60 { e.set_solid(Elements::idx(x, 3), COPPER); }
    e.boxed(50, 5, 72, 21, CONCRETE);
    e.rect(72, 10, 72, 16, GLASS);
    e.fill(51, 6, 71, 20, |c| {
        *c = [0.0; NSP];
        let n = P0 * V / (RGAS * T0);
        c[H2] = 0.66 * n * mm(H2);
        c[O2] = 0.34 * n * mm(O2);
    });
    e.rect(60, 4, 60, 12, CARBON);

    // 2. Ammonia in glass and steel bottles, inside a blast room.
    e.boxed(77, 3, 113, 21, CONCRETE);
    e.boxed(78, 4, 112, 20, CONCRETE);
    e.boxed(82, 6, 92, 16, GLASS);
    e.boxed(98, 6, 108, 16, STEEL);
    for (x0, x1) in [(83, 91), (99, 107)] {
        e.fill(x0, 7, x1, 15, |c| { *c = [0.0; NSP]; c[NH3L] = 0.64; });
    }

    // 3. Salt and sugar dissolving into water.
    e.boxed(116, 5, 140, 20, CONCRETE);
    e.fill(117, 6, 139, 19, |c| { *c = [0.0; NSP]; c[WATER] = 0.97; });
    e.rect(118, 7, 120, 18, SALT_X);
    e.rect(136, 7, 138, 18, SUGAR_X);

    // 4. Gold catalyst: hydrogen and air meeting over gold burn without a spark.
    e.boxed(148, 5, 170, 20, GLASS);
    e.rect(158, 12, 160, 13, GOLD);
    e.fill(149, 6, 169, 19, |c| {
        let n = P0 * V / (RGAS * T0);
        c[H2] = 0.08 * n * mm(H2);
    });

    // 5. A pressurised tank feeding two pipes with opposite flaps into a basin.
    e.boxed(4, 40, 22, 62, STEEL);
    e.fill(5, 41, 21, 61, |c| {
        *c = [0.0; NSP];
        c[WATER] = 0.6;
        let n = 6.0 * P0 * 0.4 * V / (RGAS * T0);
        c[O2] = 0.21 * n * mm(O2);
        c[N2] = 0.79 * n * mm(N2);
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

    // 6. Heat: copper and glass bars from a hot block.
    e.rect(92, 44, 98, 58, STEEL);
    for x in 92..=98 { for y in 44..=58 { e.temp[Elements::idx(x, y)] = 800.0; } }
    e.rect(99, 47, 130, 48, COPPER);
    e.rect(99, 54, 130, 55, GLASS);

    // 7. Ice melting; a wet floor cooling the air.
    e.rect(140, 44, 146, 50, ICE);
    e.fill(150, 44, 168, 60, |c| c[WATER] = 0.08);

    // 8. Severed beetle antennae as salt sensors: each lies in a bath of sugar
    //    water touching a copper wire to a carbon filament. One bath is salty.
    for (y0, salty) in [(42usize, true), (54usize, false)] {
        e.boxed(172, y0, 178, y0 + 6, GLASS);
        e.fill(173, y0 + 1, 177, y0 + 5, |c| {
            c[WATER] = 0.5;
            c[SUGAR] = 0.01;
            if salty { c[SALT] = 0.01; }
        });
        for x in 176..=186 { e.set_solid(Elements::idx(x, y0 + 3), COPPER); }
        e.set_solid(Elements::idx(186, y0 + 2), CARBON);
        let bath = Elements::idx(175, y0 + 3);
        let beetle = Agent::new(BEETLE, bath, 1.0);
        let antenna = beetle.organs[ANTENNAE];
        e.loose.push(Loose { kind: ANTENNAE, comp: antenna.comp, health: 1.0, cell: bath, signal: 0.0, cooldown: 0 });
    }

    // 9. A caterpillar farm. Its air is enriched with CO2 (Rudon pipes in the
    //    water room's exhaust), its soil holds water, humus and a trace of salt.
    e.boxed(4, 72, 70, 122, CONCRETE);
    e.clear(Elements::idx(70, 96));
    e.clear(Elements::idx(70, 97));
    for y in (76..=118).step_by(6) {
        e.rect(8, y, 66, y, SOIL);
    }
    e.fill(5, 73, 69, 121, |c| {
        c[WATER] += 0.01;
        let n = P0 * V / (RGAS * T0);
        c[CO2] += 0.05 * n * mm(CO2);
    });
    for y in (77..=119).step_by(6) {
        for x in (10..=64).step_by(9) {
            e.set_solid(Elements::idx(x, y), PLANT);
        }
    }
    e.spawn(30, 92, CATERPILLAR, 20);

    // 10. Beetles choosing: salty-sweet peanut butter on the left, plain on the right.
    e.boxed(80, 72, 130, 104, CONCRETE);
    e.fill(83, 76, 92, 100, |c| add(c, &peanut_butter(true)));
    e.fill(118, 76, 127, 100, |c| add(c, &peanut_butter(false)));
    e.fill(100, 101, 108, 102, |c| c[WATER] += 0.4); // a water dish
    e.spawn(103, 86, BEETLE, 30);

    // 11. A sealed box of wet dead matter: it uses up the oxygen, then makes methane.
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
    fn formulas_balance_every_reaction() {
        // oxidising, fermenting and building, each checked atom by atom
        let atoms = |c: &[f32; NSP]| {
            let mut t = [0.0f64; NEL];
            for s in 0..NSP {
                for e in 0..NEL {
                    t[e] += (c[s] * el_frac(s, e)) as f64;
                }
            }
            t
        };
        let check = |label: &str, a: [f64; NEL], b: [f64; NEL]| {
            for e in 0..NEL {
                assert!((a[e] - b[e]).abs() < 1e-9 + 1e-5 * a[e].abs(), "{label}: element {e} {:.3e} → {:.3e}", a[e], b[e]);
            }
        };
        for &s in &ORGANICS {
            let mut fuel = [0.0; NSP];
            fuel[s] = 1e-3;
            let mut air = [0.0; NSP];
            air[O2] = 1.0;
            air[WATER] = 1.0;
            let before = { let mut t = atoms(&fuel); let a = atoms(&air); for e in 0..NEL { t[e] += a[e]; } t };
            oxidise(s, 1.0, &mut fuel, &mut air, true);
            let after = { let mut t = atoms(&fuel); let a = atoms(&air); for e in 0..NEL { t[e] += a[e]; } t };
            check("respire", before, after);
            fuel[s] = 1e-3;
            ferment(s, 1.0, &mut fuel, &mut air);
            let after2 = { let mut t = atoms(&fuel); let a = atoms(&air); for e in 0..NEL { t[e] += a[e]; } t };
            let mut b2 = after;
            b2[EH] += (1e-3 * el_frac(s, EH)) as f64;
            b2[EC] += (1e-3 * el_frac(s, EC)) as f64;
            b2[EO] += (1e-3 * el_frac(s, EO)) as f64;
            b2[EN] += (1e-3 * el_frac(s, EN)) as f64;
            check("ferment", b2, after2);
        }
        let mut pool = comp(&[(SUGAR, 0.01), (PROTEIN, 0.01), (WATER, 0.05), (NH3AQ, 0.001)]);
        let mut env = comp(&[(O2, 0.1)]);
        let target = comp(&[(CHITIN, 0.001), (FAT, 0.0005), (PROTEIN, 0.0005), (WATER, 0.002)]);
        let before = { let mut t = atoms(&pool); for (e, v) in atoms(&env).iter().enumerate() { t[e] += v; } t };
        assert!(build(&mut pool, &mut env, &target));
        let after = { let mut t = atoms(&pool); for (e, v) in atoms(&env).iter().enumerate() { t[e] += v; } for (e, v) in atoms(&target).iter().enumerate() { t[e] += v; } t };
        check("build", before, after);
    }

    #[test]
    #[ignore]
    fn find_the_leak() {
        let mut e = demo();
        e.step(1.0);
        let h = |e: &Elements| e.element_totals()[EH];
        let mut acc = std::collections::BTreeMap::new();
        for _ in 0..2400 {
            e.substeps += 1;
            for i in 0..N {
                let open = is_open(e.mat[i]);
                e.pres[i] = if open { fluid_pressure(&e.m[i], e.temp[i]) } else { 0.0 };
                e.fluid[i] = if open { fluidity(&e.m[i], e.temp[i]) } else { 1.0 };
            }
            let mut t = h(&e);
            let mut note = |name: &'static str, e: &Elements, t: &mut f64| { let n = h(e); *acc.entry(name).or_insert(0.0) += n - *t; *t = n; };
            e.flow(); note("flow", &e, &mut t);
            for i in 0..N { e.cap[i] = e.heat_cap(i); e.kcond[i] = e.conductivity(i); }
            e.conduct(SUBSTEP); note("conduct", &e, &mut t);
            e.sparks(); note("sparks", &e, &mut t);
            if e.substeps % 30 == 1 { e.find_batteries(); }
            e.react(); note("react", &e, &mut t);
            e.solids(SUBSTEP); note("solids", &e, &mut t);
            if e.substeps % 2 == 0 { e.structure(0.1); note("structure", &e, &mut t); e.powders(); note("powders", &e, &mut t); }
            if e.substeps % 4 == 0 {
                e.life_ticks += 1;
                e.plants(0.2); note("plants", &e, &mut t);
                e.animals(0.2); note("animals", &e, &mut t);
                e.loose_organs(0.2); note("loose", &e, &mut t);
            }
        }
        for (k, v) in acc { eprintln!("{k:>10}: {v:+.6} kg H"); }
    }

    #[test]
    #[ignore]
    fn find_the_leak_in_solids() {
        let mut e = demo();
        e.step(1.0);
        let h = |e: &Elements| e.element_totals()[EH];
        let mut acc = std::collections::BTreeMap::new();
        for _ in 0..200 {
            e.step(0.05);
            for i in 0..N {
                let mat = e.mat[i];
                let before = h(&e);
                // run solids for this one cell only
                let saved: Vec<u8> = e.mat.clone();
                let _ = saved;
                let t = e.temp[i];
                match mat {
                    ICE | OPEN | SALT_X | SUGAR_X | PEANUT | PLANT | ORGANIC | SOIL | STEEL | RUBBER | CARBON | ZINC => {}
                    _ => continue,
                }
                let _ = t;
                e.solids_one(i, SUBSTEP);
                let d = h(&e) - before;
                if d.abs() > 1e-9 { *acc.entry(mat).or_insert(0.0) += d; }
            }
            if acc.len() > 0 { break; }
        }
        for (k, v) in acc { eprintln!("material {k}: {v:+.3e} kg H"); }
    }

    #[test]
    #[ignore]
    fn trace_a_beetle() {
        let mut e = fresh();
        e.boxed(10, 10, 40, 30, CONCRETE);
        e.fill(11, 11, 20, 29, |c| add(c, &peanut_butter(true)));
        e.fill(30, 11, 39, 12, |c| c[WATER] += 0.4);
        e.spawn(25, 18, BEETLE, 1);
        let tw = blood_template(BEETLE)[WATER];
        for k in 0..20 {
            e.step(30.0);
            let Some(a) = e.agents.first() else { eprintln!("gone"); break };
            let worst = a.organs.iter().enumerate().min_by(|x, y| x.1.health.total_cmp(&y.1.health)).unwrap();
            eprintln!("t={:>3}s alive={} nerves {:.2} blood water {:.0}% salt {:.4} sugar {:.2}mg | fat body fat {:.3}mg sugar {:.3}mg | gut {:.3}mg | worst organ {} {:.2} | taste {:.3}/{:.3} | cell {} T {:.1}",
                (k + 1) * 30, a.alive, a.nerves(), a.blood[WATER] / tw * 100.0, a.blood[SALT] / a.blood[WATER].max(1e-12), a.blood[SUGAR] * 1e6,
                a.organs[FAT_BODY].comp[FAT] * 1e6, a.organs[FAT_BODY].comp[SUGAR] * 1e6, total(&a.gut) * 1e6,
                ORGAN_NAMES[worst.0], worst.1.health, a.taste[0], a.taste[1], a.cell, e.temp[a.cell]);
            if !a.alive { break; }
        }
    }

    #[test]
    #[ignore]
    fn trace_the_farm() {
        let mut e = demo();
        for k in 0..6 {
            e.step(60.0);
            let plants: Vec<usize> = (0..N).filter(|&i| e.mat[i] == PLANT).collect();
            let max_sugar = plants.iter().map(|&i| e.m[i][SUGAR]).fold(0.0f32, f32::max);
            let pollinated = plants.iter().filter(|&&i| e.aux2[i] > 0).count();
            let nh3 = plants.iter().map(|&i| e.m[i][NH3AQ]).fold(0.0f32, f32::max);
            let water = plants.iter().map(|&i| e.m[i][WATER] / total(&e.m[i])).fold(1.0f32, f32::min);
            let co2: f32 = (0..N).filter(|&i| is_open(e.mat[i]) && (5..70).contains(&(i % W)) && (73..122).contains(&(i / W))).map(|i| e.m[i][CO2]).sum();
            let cats_near = e.agents.iter().filter(|a| a.kind == CATERPILLAR && a.alive && (0..4).any(|d| Elements::nb(a.cell, d).is_some_and(|j| e.mat[j] == PLANT))).count();
            eprintln!("t={}min plants {} max sugar {:.2} g, pollinated {}, max NH3 {:.3} g, min water {:.0}%, farm CO2 {:.1} g, caterpillars beside plants {}",
                k + 1, plants.len(), max_sugar * 1e3, pollinated, nh3 * 1e3, water * 100.0, co2 * 1e3, cats_near);
        }
    }

    #[test]
    #[ignore]
    fn one_plant() {
        let mut e = fresh();
        e.rect(10, 11, 20, 11, SOIL);
        let i = Elements::idx(15, 10);
        e.set_solid(i, PLANT);
        let n = P0 * V / (RGAS * T0);
        e.fill(5, 5, 25, 9, |c| c[CO2] += 0.05 * n * mm(CO2));
        e.fill(10, 10, 20, 10, |c| c[CO2] += 0.05 * n * mm(CO2));
        let j = Elements::idx(15, 9);
        eprintln!("start sugar {:.4} g, CO2 above {:.4} g, plant T {:.1}", e.m[i][SUGAR] * 1e3, e.m[j][CO2] * 1e3, e.temp[i]);
        for _ in 0..10 { e.life_ticks += 1; e.plants(0.2); }
        eprintln!("after 10 plant ticks: sugar {:.4} g, CO2 above {:.4} g", e.m[i][SUGAR] * 1e3, e.m[j][CO2] * 1e3);
        e.step(60.0);
        eprintln!("after 60 s of full sim: sugar {:.4} g", e.m[i][SUGAR] * 1e3);
    }

    #[test]
    fn every_element_is_conserved_in_the_whole_demo() {
        let mut e = demo();
        let before = e.element_totals();
        e.step(120.0);
        let after = e.element_totals();
        for k in 0..NEL {
            let rel = (after[k] - before[k]).abs() / before[k].max(1e-6);
            eprintln!("{:>2}: {:.6} → {:.6} kg ({:.2e})", ["H", "C", "N", "O", "Na", "Cl", "Si", "Fe", "Cu", "Zn", "Au"][k], before[k], after[k], rel);
            assert!(rel < 2e-3 || (after[k] - before[k]).abs() < 1e-6, "element {k} changed");
        }
    }

    #[test]
    fn peanut_butter_behaves_as_what_its_made_of() {
        let pb = peanut_butter(true);
        // thick (full of solids, carried by fat) and thinner when warm, because fat is
        let (cold, warm) = (fluidity(&pb, 295.0), fluidity(&pb, 330.0));
        eprintln!("peanut butter fluidity: {cold:.4} at 22 °C, {warm:.4} at 57 °C (water = 1)");
        assert!(cold < 0.01 && warm > cold * 1.5);
        // too dry to rot; wet dead matter does
        let mut e = fresh();
        e.boxed(9, 9, 15, 15, GLASS);
        e.fill(10, 10, 14, 14, |c| add(c, &peanut_butter(true)));
        e.rect(30, 10, 34, 14, ORGANIC);
        let pb0 = region_sum(&e, 10, 10, 14, 14, FAT) + region_sum(&e, 10, 10, 14, 14, PROTEIN);
        let co2_0 = region_sum(&e, 25, 5, 40, 20, CO2);
        e.step(300.0);
        let pb1 = region_sum(&e, 10, 10, 14, 14, FAT) + region_sum(&e, 10, 10, 14, 14, PROTEIN);
        let nh3 = region_sum(&e, 25, 5, 40, 20, NH3G) + region_sum(&e, 25, 5, 40, 20, NH3AQ);
        eprintln!("5 min: peanut butter fat+protein {:.4} → {:.4} kg; rotting matter released {:.3} g CO2 and {:.4} g ammonia", pb0, pb1, (region_sum(&e, 25, 5, 40, 20, CO2) - co2_0) * 1e3, nh3 * 1e3);
        assert!((pb0 - pb1).abs() / pb0 < 1e-3, "dry peanut butter doesn't rot");
        assert!(nh3 > 0.0, "protein's nitrogen leaves as ammonia");
        // and it burns, from its formula, into CO2 and steam
        let mut e = fresh();
        e.fill(10, 10, 12, 12, |c| add(c, &peanut_butter(true)));
        for x in 10..=12 { for y in 10..=12 { e.temp[Elements::idx(x, y)] = 700.0; } }
        let fat0 = region_sum(&e, 10, 10, 12, 12, FAT);
        e.step(2.0);
        let co2 = region_sum(&e, 5, 5, 20, 20, CO2);
        eprintln!("heated to 427 °C: fat {fat0:.3} → {:.3} kg, CO2 {:.2} g", region_sum(&e, 10, 10, 12, 12, FAT), co2 * 1e3);
        assert!(region_sum(&e, 10, 10, 12, 12, FAT) < fat0 && co2 > 1e-4);
    }

    #[test]
    fn beetles_taste_salt_and_need_it() {
        let run = |salty: bool| {
            let mut e = fresh();
            e.boxed(10, 10, 40, 30, CONCRETE);
            e.fill(11, 11, 20, 29, |c| add(c, &peanut_butter(salty)));
            e.fill(30, 11, 39, 12, |c| c[WATER] += 0.4);
            e.spawn(25, 18, BEETLE, 15);
            e.step(600.0);
            let alive = e.agents.iter().filter(|a| a.alive && a.kind == BEETLE).count();
            let nerves: f32 = e.agents.iter().filter(|a| a.alive).map(|a| a.nerves()).sum::<f32>() / alive.max(1) as f32;
            (alive, nerves)
        };
        let (with, n1) = run(true);
        let (without, n2) = run(false);
        eprintln!("10 min on salted peanut butter: {with} beetles alive (nerves {n1:.2}); on unsalted: {without} alive (nerves {n2:.2})");
        assert!(n1 > 0.8 && n2 < 0.5, "without salt their nerves fail");
        // the choice: salty-sweet vs plain
        let mut e = demo();
        e.step(900.0);
        let at = |x0: usize, x1: usize| e.agents.iter().filter(|a| a.kind == BEETLE && a.alive && (x0..=x1).contains(&(a.cell % W)) && (74..=102).contains(&(a.cell / W))).count();
        let (left, right) = (at(81, 95), at(115, 129));
        eprintln!("demo after 15 min: at the salty-sweet pool {left}, at the plain pool {right}");
        assert!(left > right * 2);
    }

    #[test]
    fn a_severed_antenna_in_sugar_water_is_a_salt_sensor() {
        let mut e = demo();
        e.step(20.0);
        let lit = |e: &Elements, y: usize| (176..=185).filter(|&x| e.spark[Elements::idx(x, y)] > 0).count();
        let mut salty = 0;
        let mut fresh_ = 0;
        for _ in 0..200 {
            e.step(0.05);
            salty += lit(&e, 45);
            fresh_ += lit(&e, 57);
        }
        let filament = e.temp[Elements::idx(186, 44)];
        eprintln!("10 s: salty bath wire lit {salty} cell-steps, unsalted {fresh_}; salty filament {filament:.0} K");
        assert!(salty > 50 && fresh_ == 0);
    }

    #[test]
    fn dissection_gives_the_organs_and_conserves_the_body() {
        let mut e = fresh();
        let i = Elements::idx(20, 20);
        e.agents.push(Agent::new(BEETLE, i, 1.0));
        let before = e.element_totals();
        assert!(e.dissect(i));
        let after = e.element_totals();
        assert_eq!(e.loose.len(), NORGAN);
        for k in 0..NEL {
            assert!((after[k] - before[k]).abs() < 1e-9 + 1e-6 * before[k]);
        }
        let ant = e.loose.iter().find(|o| o.kind == ANTENNAE).unwrap();
        eprintln!("antenna: {:.3} mg, {:.0}% water", total(&ant.comp) * 1e6, ant.comp[WATER] / total(&ant.comp) * 100.0);
    }

    #[test]
    fn caterpillars_eat_breathe_pollinate_and_plants_make_peanuts() {
        let mut e = demo();
        let plant_mass0: f32 = (0..N).filter(|&i| e.mat[i] == PLANT).map(|i| total(&e.m[i])).sum();
        e.step(600.0);
        let plants = count(&e, 5, 73, 69, 121, PLANT);
        let peanuts = count(&e, 5, 73, 69, 121, PEANUT);
        let cats = e.agents.iter().filter(|a| a.kind == CATERPILLAR && a.alive).count();
        let plant_mass: f32 = (0..N).filter(|&i| e.mat[i] == PLANT).map(|i| total(&e.m[i])).sum();
        eprintln!("10 min: plants {plants} ({:.1} → {:.1} g), peanuts {peanuts}, caterpillars alive {cats}", plant_mass0 * 1e3, plant_mass * 1e3);
        assert!(peanuts > 0, "pollinated plants set peanuts");
        assert!(cats > 0);
    }

    #[test]
    fn suffocated_animals_die_and_rot() {
        let mut e = fresh();
        e.boxed(10, 10, 16, 16, GLASS);
        e.fill(11, 11, 15, 15, |c| { c[O2] = 0.0; c[N2] *= 1.27; });
        e.spawn(12, 12, CATERPILLAR, 3);
        e.step(60.0);
        let dead = e.agents.iter().filter(|a| !a.alive).count();
        eprintln!("no oxygen, 1 min: {dead}/3 caterpillars dead");
        assert_eq!(dead, 3);
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
        assert!(p_hi > 2.5 * P0);
        assert!((a - b).abs() / a < 0.1);
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
        assert!(e.temp[Elements::idx(13, 10)] > e.temp[Elements::idx(13, 14)] + 30.0);
    }

    #[test]
    fn hydrogen_and_oxygen_explode_and_break_glass_not_steel() {
        let mut e = fresh();
        e.boxed(10, 10, 30, 24, STEEL);
        e.rect(30, 14, 30, 20, GLASS);
        e.fill(11, 11, 29, 23, |c| {
            *c = [0.0; NSP];
            let n = P0 * V / (RGAS * T0);
            c[H2] = 0.66 * n * mm(H2);
            c[O2] = 0.34 * n * mm(O2);
        });
        e.edit(20, 17, 3, 1000.0);
        let mut peak_t: f32 = 0.0;
        for _ in 0..40 {
            e.step(0.05);
            peak_t = peak_t.max(e.temp[Elements::idx(15, 17)]);
        }
        eprintln!("explosion peak {peak_t:.0} K, glass left {}", count(&e, 30, 14, 30, 20, GLASS));
        assert!(peak_t > 2000.0);
        assert!(count(&e, 30, 14, 30, 20, GLASS) < 4);
        assert_eq!(count(&e, 10, 10, 29, 24, STEEL), 53);
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
        assert!(count(&e, 10, 10, 20, 20, GLASS) < 38);
        assert_eq!(count(&e, 30, 10, 40, 20, STEEL), 40);
    }

    #[test]
    fn evaporation_boiling_and_dissolving() {
        let mut e = fresh();
        e.boxed(9, 9, 31, 31, GLASS);
        e.fill(10, 10, 30, 30, |c| { c[WATER] = 0.05; c[STEAM] = 0.0; });
        e.step(5.0);
        assert!(e.temp[Elements::idx(20, 20)] < T0 - 0.02);
        let mut e = fresh();
        e.boxed(9, 9, 15, 15, STEEL);
        e.fill(10, 10, 14, 14, |c| { c[WATER] = 0.3; });
        for x in 10..=14 { for y in 10..=14 { e.temp[Elements::idx(x, y)] = 420.0; } }
        e.step(0.5);
        assert!(e.pres[Elements::idx(12, 12)] > 3.0 * P0);
        let mut e = fresh();
        e.boxed(40, 10, 60, 20, CONCRETE);
        e.fill(41, 11, 59, 19, |c| { *c = [0.0; NSP]; c[WATER] = 0.97; });
        e.rect(41, 11, 42, 19, SALT_X);
        e.step(60.0);
        assert!(region_sum(&e, 43, 11, 59, 19, SALT) > 0.5);
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
            let spent = region_sum(&e, 11, 11, 23, 23, ZNOH2);
            if salty { assert!(sparks > 5 && spent > 0.0); } else { assert_eq!(sparks, 0); }
        }
    }

    #[test]
    fn flaps_only_let_water_one_way() {
        let mut e = demo();
        let basin0 = region_sum(&e, 61, 41, 79, 61, WATER);
        e.step(60.0);
        assert!(region_sum(&e, 41, 45, 59, 47, WATER) > 0.5);
        assert!(region_sum(&e, 41, 55, 59, 57, WATER) < 0.05);
        assert!(region_sum(&e, 61, 41, 79, 61, WATER) > basin0 + 0.5);
    }

    #[test]
    fn sealed_rot_makes_methane() {
        let mut e = demo();
        e.step(900.0);
        let ch4 = region_sum(&e, 141, 73, 185, 121, CH4);
        eprintln!("rot box after 15 min: methane {:.2} g", ch4 * 1e3);
        assert!(ch4 > 0.0);
    }

    #[test]
    fn where_you_heat_a_box_doesnt_matter_only_how_much() {
        let heat_box = |size: usize, brush: usize, spot: &str| {
            let mut e = fresh();
            let (x0, x1) = (20, 20 + size + 1);
            e.boxed(x0, x0, x1, x1, GLASS);
            let r = brush / 2;
            let (cx, cy) = match spot { "centre" => ((x0 + x1) / 2, (x0 + x1) / 2), "corner inside" => (x0 + 1 + r, x0 + 1 + r), _ => (x0, x0) };
            for _ in 0..1000 {
                for dy in 0..brush { for dx in 0..brush { e.edit(cx + dx - r, cy + dy - r, 3, 25.0); } }
                e.step(0.06);
            }
            let mut broken = 0;
            for y in x0..=x1 { for x in x0..=x1 {
                if (x == x0 || x == x1 || y == x0 || y == x1) && e.mat[Elements::idx(x, y)] != GLASS { broken += 1; }
            } }
            broken
        };
        for spot in ["centre", "corner inside", "on the wall"] {
            assert_eq!(heat_box(19, 5, spot), 0);
        }
        assert!(heat_box(5, 5, "centre") > 0 && heat_box(5, 5, "corner inside") > 0);
    }

    #[test]
    fn the_demo_stays_finite() {
        let mut e = demo();
        e.step(60.0);
        assert!(e.temp.iter().all(|t| t.is_finite()));
        assert!(e.m.iter().all(|c| c.iter().all(|v| v.is_finite())));
    }
}
