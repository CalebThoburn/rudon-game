//! The building: one corridor of Rudon's plumbing company, built cell by cell
//! from the element world. Every room exists because another room needs it.
//!
//!   North: Archive (past) · Archive (future) · Peanut farm · Kitchen · Sugar plot
//!   South: Restrooms · Cafeteria · Brine well · Quarters
//!
//! - The water main (6 °C) runs as copper-jacketed pipe through both archives:
//!   its coils cool them and dew forms on them, running off into drip trays, so
//!   the archive air stays cool and dry. The water comes out the other side
//!   warm (the return line) and feeds the farm channels, fountains and soak vat.
//! - Farm soil wicks channel water to the roots. Caterpillars feed on nectar
//!   and carry pollen; pollinated flowers become peanut pods.
//! - The kitchen's digester tank turns sewage and dead matter into methane,
//!   which burns in the firebox under the pans (lit by a carbon igniter on a
//!   zinc–copper brine battery). The firebox breathes kitchen air through a
//!   mesh floor and exhausts through two flues: one into the peanut farm, one
//!   into the sugar plot. Its CO2 is what the plants are made of.
//! - Workers carry peanuts to the mill trough, flowers to the soak vat, brine
//!   to the salt pan, syrup to the syrup pan, salt and sugar to the trough, and
//!   peanut butter to the cafeteria counter. Idle, they wait in the quarters.
//! - A beetle antenna lies in the trough against a copper wire to a carbon
//!   lamp: once the paste is salty enough it fires, the lamp warms, and the
//!   salt job is skipped.
use super::*;
use humans::{Job, Person, Pick};

pub const ROOMS: &[(&str, [usize; 4])] = &[
    ("Archive: past", [1, 1, 54, 78]),
    ("Archive: future", [56, 1, 109, 78]),
    ("Peanut farm", [111, 1, 184, 78]),
    ("Kitchen", [186, 1, 240, 78]),
    ("Sugar plot", [242, 1, 286, 78]),
    ("Corridor", [1, 80, 286, 95]),
    ("Restrooms", [1, 97, 44, 174]),
    ("Cafeteria", [46, 97, 150, 174]),
    ("Brine well", [152, 97, 200, 174]),
    ("Quarters", [202, 97, 286, 174]),
];

/// Water on the return side of the main, warmed by the archive coils (K).
const RETURN_T: f32 = 291.0;

fn i(x: usize, y: usize) -> usize {
    Elements::idx(x, y)
}

impl Elements {
    fn door(&mut self, x0: usize, x1: usize, y: usize) {
        for x in x0..=x1 {
            self.clear(i(x, y));
        }
    }
    fn set_kind(&mut self, x: usize, y: usize, mat: u8, aux: f32) {
        self.set_solid(i(x, y), mat);
        self.aux[i(x, y)] = aux;
    }
    fn plant(&mut self, x: usize, y: usize, kind: u8) {
        self.set_solid(i(x, y), PLANT);
        self.m[i(x, y)] = plant_organ(kind);
        self.aux[i(x, y)] = kind as f32;
    }
    /// A tap from the return main at (x, y). Callers make sure it only touches what it should fill.
    fn tap(&mut self, x: usize, y: usize) {
        self.set_solid(i(x, y), MAIN);
        self.aux[i(x, y)] = RETURN_T;
    }
    /// Planting bands, every 11 rows: soil / water channel / soil, then eight rows of
    /// air. Plants start as a root by the soil with a stem and a leaf beyond it; the
    /// middle two rows of air stay clear (plants can't reach that far): a walkway.
    fn beds(&mut self, x0: usize, x1: usize, y0: usize, y1: usize, main_x: usize, cap_x: usize, every: usize) {
        let (lo, hi) = (x0.min(main_x).min(cap_x), x1.max(main_x).max(cap_x));
        let mut y = y0;
        while y + 2 <= y1 {
            for x in lo..=hi {
                self.set_solid(i(x, y), SOIL);
                self.set_solid(i(x, y + 2), SOIL);
            }
            for x in x0..=x1 {
                self.set_solid(i(x, y + 1), OPEN);
                self.m[i(x, y + 1)] = [0.0; NSP];
                // an open channel: water with air over it at room pressure (a full or airless
                // channel would burst or crush its soil walls, which hold only ~30 kPa)
                let n = P0 * 0.4 * V / (RGAS * RETURN_T);
                self.m[i(x, y + 1)][WATER] = 0.6;
                self.m[i(x, y + 1)][O2] = 0.21 * n * mm(O2);
                self.m[i(x, y + 1)][N2] = 0.79 * n * mm(N2);
                self.temp[i(x, y + 1)] = RETURN_T;
            }
            self.tap(main_x, y + 1);
            self.set_solid(i(cap_x, y + 1), CONCRETE);
            for x in (x0 + 2..x1.saturating_sub(1)).step_by(every) {
                if y + 5 <= y1 {
                    self.plant(x, y + 3, ROOT);
                    self.plant(x, y + 4, STEM);
                    self.plant(x, y + 5, LEAF);
                }
                if y >= y0 + 11 {
                    self.plant(x, y - 1, ROOT);
                    self.plant(x, y - 2, LEAF);
                }
            }
            y += 11;
        }
    }
    /// A walled basin kept full by a source (return-main tap or brine spring) set into
    /// its east wall, with the source itself walled in behind.
    fn basin(&mut self, x0: usize, y0: usize, x1: usize, y1: usize, source: u8) {
        self.boxed(x0 - 1, y0 - 1, x1 + 1, y1 + 1, CONCRETE);
        let salt = if source == SPRING { 0.045 } else { 0.0 };
        self.fill(x0, y0, x1, y1, |c| {
            *c = [0.0; NSP];
            c[WATER] = 1.0;
            c[SALT] = salt;
        });
        if source == MAIN {
            self.tap(x1 + 1, y0);
        } else {
            self.set_solid(i(x1 + 1, y0), source);
        }
        self.set_solid(i(x1 + 2, y0), CONCRETE);
        self.set_solid(i(x1 + 2, y0.saturating_sub(1)), CONCRETE);
        self.set_solid(i(x1 + 2, y0 + 1), CONCRETE);
    }
    /// A duct along `path`: the path is cleared, and open cells around it walled, except
    /// around its two ends, which open into whatever they reach (a room, a firebox, a tank).
    fn duct(&mut self, path: &[(usize, usize)], wall: u8) {
        let on: std::collections::HashSet<(usize, usize)> = path.iter().cloned().collect();
        let inner = if path.len() > 2 { &path[1..path.len() - 1] } else { &path[0..0] };
        for &(x, y) in inner {
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    let (nx, ny) = ((x as i32 + dx) as usize, (y as i32 + dy) as usize);
                    if !on.contains(&(nx, ny)) && is_open(self.mat[i(nx, ny)]) {
                        self.set_solid(i(nx, ny), wall);
                    }
                }
            }
        }
        for &(x, y) in path {
            self.clear(i(x, y));
        }
    }
}

fn line(x0: usize, y0: usize, x1: usize, y1: usize) -> Vec<(usize, usize)> {
    let mut v = Vec::new();
    if y0 == y1 {
        for x in x0.min(x1)..=x0.max(x1) {
            v.push((x, y0));
        }
    } else {
        for y in y0.min(y1)..=y0.max(y1) {
            v.push((x0, y));
        }
    }
    v
}

/// Cells worth knowing about from outside (tests, HUD).
pub struct Layout {
    pub lamp: usize,
    pub trough: [usize; 4],
    pub counter: [usize; 4],
    pub salt_pan: [usize; 4],
    pub syrup_pan: [usize; 4],
    pub firebox: [usize; 4],
    pub hotplate: usize,
    pub tank: [usize; 4],
}

pub fn building() -> (Elements, Layout) {
    let mut e = Elements::new();
    e.boxed(0, 0, W - 1, H - 1, CONCRETE);
    for x in 0..W {
        e.set_solid(i(x, 79), CONCRETE);
        e.set_solid(i(x, 96), CONCRETE);
    }
    for &(_, r) in ROOMS {
        if r[2] + 1 < W - 1 && r[1] != 80 {
            for y in r[1]..=r[3] {
                e.set_solid(i(r[2] + 1, y), CONCRETE);
            }
        }
    }

    // ---- the water main: copper-jacketed, through both archives along y = 3
    for x in 2..=108 {
        if x == 55 {
            continue;
        }
        e.set_solid(i(x, 2), COPPER);
        e.set_solid(i(x, 3), MAIN);
        e.set_solid(i(x, 4), COPPER);
    }
    // ---- the archives: cooling coils (branches of the main) between the shelves
    for (x0, x1) in [(1usize, 54usize), (56, 109)] {
        for y in 1..=78 {
            for x in x0..=x1 {
                e.insul[i(x, y)] = 0.5;
            }
        }
        let mut x = x0 + 3;
        while x + 8 <= x1 {
            for y in 5..=70 {
                e.set_solid(i(x, y), COPPER);
                e.set_solid(i(x + 1, y), MAIN);
                e.set_solid(i(x + 2, y), COPPER);
                // drip trays along both sides of the coil catch the dew
                e.set_kind(x - 1, y, DRAIN, PLAIN_DRAIN as f32);
                e.set_kind(x + 3, y, DRAIN, PLAIN_DRAIN as f32);
            }
            e.set_solid(i(x + 1, 71), COPPER); // capped
            for y in 8..=68 {
                if y % 12 != 0 {
                    e.set_solid(i(x + 5, y), PAPER);
                    e.set_solid(i(x + 6, y), PAPER);
                }
            }
            x += 10;
        }
        for y in 1..=78 {
            for x in x0..=x1 {
                if e.mat[i(x, y)] == OPEN {
                    e.m[i(x, y)][STEAM] *= 0.6; // freshly reconditioned air
                    e.temp[i(x, y)] = 287.0;
                }
            }
        }
        e.door(x0 + 24, x0 + 25, 79); // a narrow door lets less corridor air in
    }

    // ---- the peanut farm
    e.beds(112, 176, 3, 74, 111, 177, 6); // the tap sits against the west wall
    e.rect(179, 50, 183, 70, ORGANIC); // compost
    e.fill(111, 1, 184, 78, |c| {
        if c[WATER] < 0.1 {
            let n = P0 * V / (RGAS * T0);
            c[CO2] += 0.02 * n * mm(CO2); // air only: gas forced into a full channel would burst it
        }
    });
    e.door(179, 182, 79);
    for k in 0..12 {
        let (x, y) = (118 + (k % 6) * 10, 10 + (k / 6) * 22);
        if passable(e.mat[i(x, y)]) {
            e.agents.push(Agent::new(CATERPILLAR, i(x, y), 1.0));
        }
    }

    // ---- the sugar plot: the same beds, no caterpillars (flowers stay flowers)
    e.beds(251, 285, 3, 74, 286, 250, 5); // the tap sits against the east wall
    e.fill(242, 1, 286, 78, |c| {
        if c[WATER] < 0.1 {
            let n = P0 * V / (RGAS * T0);
            c[CO2] += 0.02 * n * mm(CO2); // air only: gas forced into a full channel would burst it
        }
    });
    e.door(243, 246, 79);

    // ---- the kitchen
    // the stove: a one-row firebox (y 20) between the copper hotplate (y 19) and a mesh floor
    // (y 21), so the gas burns right against the plate with air coming up beside it
    let firebox = [206usize, 20, 216, 20];
    e.boxed(205, 19, 217, 21, CONCRETE);
    for x in 206..=216 {
        e.set_solid(i(x, 19), COPPER);
        e.set_solid(i(x, 21), MESH);
    }
    // pans on the hotplate
    e.boxed(206, 17, 211, 19, CONCRETE);
    e.boxed(211, 17, 216, 19, CONCRETE);
    for x in 206..=216 {
        e.set_solid(i(x, 19), COPPER);
    }
    let salt_pan = [207usize, 18, 210, 18];
    let syrup_pan = [212usize, 18, 215, 18];
    // flues: firebox exhaust into the farm (west) and the sugar plot (east)
    e.duct(&line(185, 20, 205, 20), CONCRETE);
    e.duct(&line(217, 20, 241, 20), CONCRETE);
    // the digester tank: wet dead matter on shelves, a biogas headspace, the sewer outfall
    let tank = [223usize, 35, 237, 57];
    e.boxed(222, 34, 238, 58, CONCRETE);
    // four shelves: about as much gas as the firebox can burn on the air its mesh floor lets in
    for y in [40usize, 45, 50, 55] {
        e.rect(223, y, 237, y, ORGANIC);
    }
    e.set_kind(232, 35, DRAIN, OUTFALL as f32);
    // gas pipe: from the tank's headspace round to the firebox floor beside the igniter
    let mut gas = line(213, 21, 213, 31);
    gas.extend(line(214, 31, 229, 31));
    gas.extend(line(230, 31, 230, 34));
    e.duct(&gas, CONCRETE);
    {
        let n = P0 * V / (RGAS * T0);
        let biogas = |c: &mut [f32; NSP]| {
            *c = [0.0; NSP];
            c[CH4] = 0.6 * n * mm(CH4);
            c[CO2] = 0.4 * n * mm(CO2);
        };
        e.fill(tank[0], tank[1], tank[2], tank[3], biogas);
        for &(x, y) in &gas {
            biogas(&mut e.m[i(x, y)]);
        }
    }
    // the igniter: a wire from a zinc–copper battery in a brine cup to the gas inlet
    // the spark jumps from the bare end of the wire, right beside where the gas comes in
    // (a carbon element here would burn away in the flame)
    e.set_solid(i(214, 21), COPPER); // in the mesh floor, not touching the hotplate
    for y in 21..=26 {
        e.set_solid(i(215, y), COPPER);
    }
    e.set_solid(i(216, 26), COPPER);
    e.boxed(217, 24, 223, 28, CONCRETE);
    e.fill(218, 25, 222, 27, |c| {
        *c = [0.0; NSP];
        c[WATER] = 1.0;
        c[SALT] = 0.045;
    });
    e.set_solid(i(217, 26), COPPER);
    e.set_solid(i(218, 26), ZINC);
    e.set_solid(i(222, 26), COPPER);
    e.set_solid(i(223, 25), SPRING);
    e.set_solid(i(224, 25), CONCRETE);
    e.set_solid(i(224, 24), CONCRETE);
    e.set_solid(i(224, 26), CONCRETE);
    // mill trough with steel rollers, started with plain paste; the salt sensor in it
    let trough = [190usize, 40, 202, 46];
    e.boxed(189, 39, 203, 47, CONCRETE);
    e.fill(trough[0], trough[1], trough[2], trough[3], |c| add(c, &peanut_butter(false)));
    e.rect(189, 41, 189, 45, STEEL);
    let sensor = i(202, 43);
    let antenna = Agent::new(BEETLE, sensor, 1.0).organs[ANTENNAE];
    e.loose.push(Loose { kind: ANTENNAE, comp: antenna.comp, health: 1.0, cell: sensor, signal: 0.0, cooldown: 0 });
    for x in 203..=209 {
        e.set_solid(i(x, 43), COPPER);
    }
    e.set_solid(i(210, 43), CARBON);
    let lamp = i(210, 43);
    // soak vat, kept full from the return main
    let vat = [190usize, 60, 202, 70];
    e.basin(vat[0], vat[1], vat[2], vat[3], MAIN);
    e.door(210, 214, 79);

    // ---- restrooms: toilets in stalls and a wash basin
    for x in (4..=40).step_by(5) {
        e.set_kind(x, 172, DRAIN, TOILET as f32);
        e.rect(x - 2, 168, x - 2, 173, CONCRETE);
    }
    e.basin(10, 105, 16, 106, MAIN);
    e.door(20, 23, 96);

    // ---- the cafeteria: counter, fountain, tables
    let counter = [70usize, 102, 110, 104];
    e.boxed(counter[0] - 1, counter[1] - 1, counter[2] + 1, counter[3] + 1, CONCRETE);
    e.fill(counter[0], counter[1], counter[2], counter[3], |c| add(c, &peanut_butter(true)));
    e.canteen = Some(counter);
    e.basin(125, 102, 130, 103, MAIN);
    for ty in [120usize, 135, 150] {
        for tx in [60usize, 85, 110] {
            e.rect(tx, ty, tx + 14, ty + 3, STEEL);
        }
    }
    e.door(94, 98, 96);

    // ---- the brine well
    let well = [170usize, 120, 176, 130];
    e.basin(well[0], well[1], well[2], well[3], SPRING);
    e.door(174, 177, 96);

    // ---- quarters: bunks
    for by in (110..=165).step_by(11) {
        for bx in (210..=270).step_by(15) {
            e.rect(bx, by, bx + 8, by + 3, RUBBER);
        }
    }
    e.quarters = Some([205, 100, 283, 171]);
    e.door(240, 243, 96);

    // ---- jobs: what Rudon's people carry, from where to where
    let farm = [111usize, 1, 184, 78];
    let plot = [242usize, 1, 286, 78];
    e.jobs = vec![
        Job { pick: Pick::Solid(PEANUT), from: farm, to: trough, unless_warm: None, grind: true },
        Job { pick: Pick::Plant(FLOWER), from: plot, to: vat, unless_warm: None, grind: false },
        Job { pick: Pick::Fluid(SALT, 0.03), from: well, to: salt_pan, unless_warm: None, grind: false },
        Job { pick: Pick::Fluid(SALT, 0.6), from: salt_pan, to: trough, unless_warm: Some(lamp), grind: false },
        Job { pick: Pick::Fluid(SUGAR, 0.02), from: vat, to: syrup_pan, unless_warm: None, grind: false },
        Job { pick: Pick::Fluid(SUGAR, 0.6), from: syrup_pan, to: trough, unless_warm: None, grind: false },
        Job { pick: Pick::Fluid(FAT, 0.25), from: trough, to: counter, unless_warm: None, grind: false },
    ];

    // ---- people: eight workers in the quarters, the player in the corridor
    for k in 0..8u32 {
        let c = i(212 + 8 * k as usize, 104);
        e.people.push(Person::new(c, false, k + 1));
    }
    e.people.push(Person::new(i(40, 88), true, 0));
    let hotplate = i(211, 19);
    (e, Layout { lamp, trough, counter, salt_pan, syrup_pan, firebox, hotplate, tank })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Everything that comes in through the mains and springs, or leaves down the main
    /// sewer, is counted; every other gram of every element stays in the building.
    #[test]
    fn the_building_conserves_every_element() {
        let (mut e, _) = building();
        let before = e.element_totals();
        for _ in 0..60 {
            e.step(1.0);
        }
        let after = e.element_totals();
        for k in 0..NEL {
            let expected = before[k] + e.imported[k];
            let err = (after[k] - expected).abs() / expected.max(1e-3);
            assert!(err < 1e-3, "element {k}: {} → {} (imported {}), error {err}", before[k], after[k], e.imported[k]);
        }
    }

    #[test]
    fn people_breathe_stay_warm_and_work() {
        let (mut e, _) = building();
        let o2_before: f32 = (0..N).map(|i| e.m[i][O2]).sum();
        for _ in 0..120 {
            e.step(1.0);
        }
        for p in &e.people {
            assert!(p.alive, "someone died in two minutes");
            assert!((309.0..311.5).contains(&p.core), "core {}", p.core);
        }
        let o2_after: f32 = (0..N).map(|i| e.m[i][O2]).sum();
        assert!(o2_after < o2_before, "nobody used any oxygen");
        // somebody took a job
        assert!(e.people.iter().any(|p| !p.player && p.goal != Goal::Idle) || e.people.iter().any(|p| p.carry.mass() > 0.0)
            || (0..N).any(|i| e.m[i][SALT] > 0.0 && i % W >= 207 && i % W <= 210 && i / W == 18), "nobody worked");
    }

    #[test]
    fn archives_stay_dry_enough_for_paper() {
        let (mut e, _) = building();
        for _ in 0..240 {
            e.step(1.0);
        }
        let worst = (0..N).filter(|&i| e.mat[i] == PAPER).map(|i| e.m[i][WATER] / (e.m[i][WATER] + e.m[i][CELLULOSE])).fold(0.0, f32::max);
        assert!(worst < 0.1, "paper at {worst:.3} water: it would rot");
        let (mut t, mut n) = (0.0, 0);
        for y in 10..60 {
            for x in 5..50 {
                let i = Elements::idx(x, y);
                if e.mat[i] == OPEN {
                    t += e.temp[i];
                    n += 1;
                }
            }
        }
        assert!(t / (n as f32) < 293.0, "archive not cooled: {:.1} K", t / n as f32);
    }
}
