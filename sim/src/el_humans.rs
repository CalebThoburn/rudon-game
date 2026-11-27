//! People: humans made of organs, living in the element world.
//!
//! A person is ~69 kg of organs and blood, every gram of it compounds from the
//! element tables. They breathe (oxygen from the air around them, CO2 and
//! water back), burn sugar and fat for heat and work, keep their core near
//! 37 °C by sweating, shivering and flushing, digest what they eat, keep their
//! water and salt in balance with their kidneys, and need the toilet. They die
//! of bad air, heat, cold, thirst, hunger or salt imbalance.
//!
//! Workers are Rudon's conveyor belt: when nothing else is pressing, they take
//! hauling jobs (peanuts to the roaster, salt to the mixer, ...). They find
//! their way with distance maps over walkable cells. The player is the same
//! body, steered from outside.
use super::*;

pub const NHORG: usize = 11;
pub const SKIN: usize = 0;
pub const LUNGS: usize = 1;
pub const HEART: usize = 2;
pub const STOMACH: usize = 3;
pub const INTESTINES: usize = 4;
pub const LIVER: usize = 5;
pub const KIDNEYS: usize = 6;
pub const BRAIN: usize = 7;
pub const MUSCLE: usize = 8;
pub const FAT_TISSUE: usize = 9;
pub const BONE: usize = 10;
pub const HUMAN_ORGAN_NAMES: [&str; NHORG] = ["skin", "lungs", "heart", "stomach", "intestines", "liver", "kidneys", "brain", "muscle", "fat", "bone"];

/// An adult's organs (kg). Muscle is a quarter glycogen-ready; bone is apatite and collagen.
pub fn human_organ(o: usize) -> [f32; NSP] {
    match o {
        SKIN => comp(&[(WATER, 2.6), (PROTEIN, 1.2), (FAT, 0.2), (SALT, 0.01)]),
        LUNGS => comp(&[(WATER, 0.8), (PROTEIN, 0.2)]),
        HEART => comp(&[(WATER, 0.23), (PROTEIN, 0.06), (FAT, 0.01)]),
        STOMACH => comp(&[(WATER, 0.11), (PROTEIN, 0.04)]),
        INTESTINES => comp(&[(WATER, 1.5), (PROTEIN, 0.4), (FAT, 0.1)]),
        LIVER => comp(&[(WATER, 1.05), (PROTEIN, 0.3), (SUGAR, 0.1), (FAT, 0.05)]), // glycogen counted as sugar
        KIDNEYS => comp(&[(WATER, 0.24), (PROTEIN, 0.05), (SALT, 0.002)]),
        BRAIN => comp(&[(WATER, 1.08), (FAT, 0.15), (PROTEIN, 0.15), (SALT, 0.003), (SUGAR, 0.001)]),
        MUSCLE => comp(&[(WATER, 21.0), (PROTEIN, 5.6), (FAT, 1.4), (SUGAR, 0.3)]),
        FAT_TISSUE => comp(&[(FAT, 12.0), (WATER, 2.25), (PROTEIN, 0.75)]),
        _ => comp(&[(APATITE, 5.0), (PROTEIN, 2.5), (WATER, 2.5)]),
    }
}
pub fn human_blood() -> [f32; NSP] {
    comp(&[(WATER, 4.0), (PROTEIN, 0.8), (SUGAR, 0.005), (SALT, 0.036)])
}

/// What someone is carrying: a whole cell of something, or a scoop of fluid.
#[derive(Clone, Debug)]
pub enum Carry {
    None,
    Cell { mat: u8, m: [f32; NSP], hp: f32, aux: f32 },
    Fluid([f32; NSP]),
}
impl Carry {
    pub fn mass(&self) -> f32 {
        match self {
            Carry::None => 0.0,
            Carry::Cell { m, hp, mat, aux } => total(m) + base_mass_static(*mat, *hp, *aux),
            Carry::Fluid(m) => total(m),
        }
    }
}
fn base_mass_static(mat: u8, hp: f32, aux: f32) -> f32 {
    let mt = &MATS[mat as usize];
    match mt.base {
        Base::Fixed => mt.rho * V,
        Base::InHp => hp.max(0.0),
        Base::Consumed => mt.rho * V * (1.0 - aux).max(0.0),
        Base::None => 0.0,
    }
}

/// What a job picks up.
#[derive(Clone, Copy, Debug)]
pub enum Pick {
    /// Cells of this material.
    Solid(u8),
    /// Plant cells of this organ (harvested tissue dies).
    Plant(u8),
    /// A scoop from cells whose condensed part is at least `frac` of compound `s`.
    Fluid(usize, f32),
}

#[derive(Clone, Copy, Debug)]
pub struct Job {
    pub pick: Pick,
    pub from: [usize; 4],
    pub to: [usize; 4],
    /// Skip the job while this cell is warm (a lamp lit by a sensor).
    pub unless_warm: Option<usize>,
    /// Grind what's carried into a paste at the destination (a few seconds of hard work).
    pub grind: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Goal {
    Idle,
    Water,
    Toilet,
    Food,
    Fetch(usize),
    Deliver(usize),
    /// Nowhere to put it: take it back where it came from.
    Return(usize),
}

#[derive(Clone, Debug)]
pub struct Person {
    pub cell: usize,
    pub alive: bool,
    pub player: bool,
    pub organs: [Organ; NHORG],
    pub stomach: [f32; NSP],
    pub bowel: [f32; NSP],
    pub bladder: [f32; NSP],
    pub blood: [f32; NSP],
    pub core: f32,
    pub carry: Carry,
    pub bag: Vec<Carry>,
    pub goal: Goal,
    pub wish: (i32, i32),
    pub act: u8,
    pub moving: bool,
    pub work: u8,
    id: u32,
}

impl Person {
    pub fn new(cell: usize, player: bool, id: u32) -> Self {
        Person {
            cell,
            alive: true,
            player,
            organs: std::array::from_fn(|k| Organ { kind: k, comp: human_organ(k), health: 1.0 }),
            stomach: [0.0; NSP],
            bowel: [0.0; NSP],
            bladder: [0.0; NSP],
            blood: human_blood(),
            core: 310.0,
            carry: Carry::None,
            bag: Vec::new(),
            goal: Goal::Idle,
            wish: (0, 0),
            act: 0,
            moving: false,
            work: 0,
            id,
        }
    }
    pub fn mass(&self) -> f32 {
        self.organs.iter().map(|o| total(&o.comp)).sum::<f32>()
            + total(&self.stomach) + total(&self.bowel) + total(&self.bladder) + total(&self.blood)
            + self.carry.mass() + self.bag.iter().map(|c| c.mass()).sum::<f32>()
    }
    /// 0 = fed, 1 = starving (liver glycogen gone).
    pub fn hunger(&self) -> f32 {
        (1.0 - self.organs[LIVER].comp[SUGAR] / 0.1).clamp(0.0, 1.0)
    }
    /// 0 = fine, 1 = badly dehydrated.
    pub fn thirst(&self) -> f32 {
        ((1.0 - self.blood[WATER] / human_blood()[WATER]) / 0.15).clamp(0.0, 1.0)
    }
    fn sodium(&self) -> f32 {
        self.blood[SALT] / self.blood[WATER].max(1e-9)
    }
}

impl Elements {
    /// Cells within arm's reach (two cells: over a rim, into a basin).
    pub fn reach(i: usize) -> impl Iterator<Item = usize> {
        let (x, y) = ((i % W) as i32, (i / W) as i32);
        (-2i32..=2).flat_map(move |dy| (-2i32..=2).map(move |dx| (dx, dy)))
            .filter(|(dx, dy)| dx.abs() + dy.abs() <= 2)
            .filter_map(move |(dx, dy)| {
                let (cx, cy) = (x + dx, y + dy);
                (cx >= 0 && cy >= 0 && cx < W as i32 && cy < H as i32).then(|| cy as usize * W + cx as usize)
            })
    }
    fn walkable_h(&self, i: usize) -> bool {
        passable(self.mat[i]) && cond_vol(&self.m[i]) < 0.5 * V
    }

    /// Distance (steps) from every walkable cell to the nearest walkable cell next to a target.
    fn field(&self, target: impl Fn(usize) -> bool) -> Vec<u16> {
        let mut dist = vec![u16::MAX; N];
        let mut queue = std::collections::VecDeque::new();
        for i in 0..N {
            if !self.walkable_h(i) {
                continue;
            }
            if Self::reach(i).any(&target) {
                dist[i] = 0;
                queue.push_back(i);
            }
        }
        while let Some(i) = queue.pop_front() {
            let d = dist[i];
            if d > 600 {
                continue;
            }
            for k in 0..4 {
                if let Some(j) = Self::nb(i, k) {
                    if dist[j] == u16::MAX && self.walkable_h(j) {
                        dist[j] = d + 1;
                        queue.push_back(j);
                    }
                }
            }
        }
        dist
    }

    fn in_rect(i: usize, r: &[usize; 4]) -> bool {
        let (x, y) = (i % W, i / W);
        x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]
    }
    fn is_water_source(&self, i: usize) -> bool {
        is_open(self.mat[i]) && self.mat[i] != MAIN && self.m[i][WATER] > 0.3 && self.m[i][WATER] / condensed_mass(&self.m[i]).max(1e-9) > 0.9
    }
    fn is_food(&self, i: usize) -> bool {
        if self.mat[i] == PEANUT {
            return true;
        }
        is_open(self.mat[i]) && self.m[i][FAT] + self.m[i][SUGAR] + self.m[i][PROTEIN] > 0.05
    }
    fn pickable(&self, i: usize, pick: Pick) -> bool {
        match pick {
            Pick::Solid(m) => self.mat[i] == m,
            Pick::Plant(k) => self.mat[i] == PLANT && self.aux[i] as u8 == k,
            Pick::Fluid(s, frac) => {
                is_open(self.mat[i]) && self.mat[i] != MAIN && self.mat[i] != SPRING && {
                    let cm = condensed_mass(&self.m[i]);
                    cm > 0.05 && self.m[i][s] / cm >= frac
                }
            }
        }
    }
    fn droppable(&self, i: usize, carry: &Carry) -> bool {
        match carry {
            Carry::Cell { .. } => passable(self.mat[i]) && self.crowd[i] == 0,
            // a container cell takes a pour only while it's under half full
            Carry::Fluid(f) => is_open(self.mat[i]) && self.mat[i] != MAIN && self.mat[i] != SPRING && self.mat[i] != DRAIN
                && cond_vol(&self.m[i]) + cond_vol(f) <= 0.6 * V,
            Carry::None => false,
        }
    }

    /// Take something from cell `i` into a carry (whole cell, or a scoop of up to 1 kg of fluid).
    pub fn take(&mut self, i: usize) -> Carry {
        let mat = self.mat[i];
        if is_open(mat) {
            let cm = condensed_mass(&self.m[i]);
            if cm < 1e-4 || mat == MAIN || mat == SPRING || mat == DRAIN {
                return Carry::None;
            }
            let k = (0.3 / cm).min(1.0); // a 300 g scoop
            let mut scoop = [0.0; NSP];
            for s in WATER..NSP {
                scoop[s] = self.m[i][s] * k;
                self.m[i][s] -= scoop[s];
            }
            return Carry::Fluid(scoop);
        }
        let mut m = self.m[i];
        let mut mat_out = mat;
        if mat == PLANT {
            mat_out = ORGANIC; // cut tissue dies
        }
        let carry = Carry::Cell { mat: mat_out, m: std::mem::take(&mut m), hp: self.hp[i], aux: self.aux[i] };
        self.m[i] = [0.0; NSP];
        self.vacate(i);
        carry
    }

    /// Put a carry into cell `i`. Returns false if it doesn't fit there.
    pub fn put(&mut self, i: usize, carry: &Carry) -> bool {
        match carry {
            Carry::None => false,
            Carry::Fluid(f) => {
                if !is_open(self.mat[i]) {
                    return false;
                }
                add(&mut self.m[i], f);
                true
            }
            Carry::Cell { mat, m, hp, aux } => {
                if !passable(self.mat[i]) || !self.displace(i) {
                    return false;
                }
                self.mat[i] = *mat;
                self.m[i] = *m;
                self.hp[i] = *hp;
                self.aux[i] = *aux;
                self.aux2[i] = 0;
                self.dmg[i] = 0.0;
                true
            }
        }
    }

    pub fn field_at(&self, f: usize, i: usize) -> u16 {
        self.fields.get(f).map(|v| v[i]).unwrap_or(u16::MAX)
    }
    pub(super) fn people_life(&mut self, dt: f32) {
        // Distance maps for needs and jobs, refreshed every few seconds.
        if self.life_ticks % 25 == 1 || self.fields.is_empty() {
            let mut fields = vec![
                self.field(|i| self.is_water_source(i)),
                self.field(|i| self.mat[i] == DRAIN && self.aux[i] as u8 == TOILET),
                self.field(|i| self.is_food(i) && self.canteen.is_none_or(|r| Self::in_rect(i, &r))),
            ];
            for j in self.jobs.clone() {
                fields.push(self.field(|i| Self::in_rect(i, &j.from) && self.pickable(i, j.pick)));
                fields.push(self.field(|i| Self::in_rect(i, &j.to) && is_open(self.mat[i]) && cond_vol(&self.m[i]) < 0.3 * V));
            }
            if let Some(q) = self.quarters {
                fields.push(self.field(|i| Self::in_rect(i, &q) && self.walkable_h(i)));
            }
            self.fields = fields;
        }
        let mut people = std::mem::take(&mut self.people);
        for p in people.iter_mut() {
            if p.alive {
                self.person(p, dt);
                self.crowd[p.cell] = self.crowd[p.cell].saturating_add(1);
            }
        }
        self.people = people;
    }

    fn person(&mut self, p: &mut Person, dt: f32) {
        let cell = p.cell;
        let mut brain_damage = 0.0f32;

        // ---- breathing and burning fuel: P watts of work and heat
        let shiver = if p.core < 309.7 { (300.0 * (309.7 - p.core)).min(300.0) } else { 0.0 };
        let power = 80.0 + if p.moving { 120.0 } else { 0.0 } + if p.work > 0 { 200.0 } else { 0.0 } + shiver;
        let demand = power * dt / HEAT_PER_O2; // mol O2
        let lungs = (p.organs[LUNGS].health * p.organs[HEART].health).max(0.0);
        // breathe from this cell and its neighbours
        let around: Vec<usize> = std::iter::once(cell).chain((0..4).filter_map(|d| Self::nb(cell, d))).filter(|&j| is_open(self.mat[j])).collect();
        let mut breath = [0.0f32; NSP];
        let mut need = demand;
        for &j in &around {
            let take = (self.m[j][O2] * 0.3 * lungs).min(need * mm(O2));
            self.m[j][O2] -= take;
            breath[O2] += take;
            need -= take / mm(O2);
            if need <= 0.0 {
                break;
            }
        }
        let o2_in = breath[O2];
        let mut heat = 0.0;
        // fuel: blood sugar, liver glycogen, muscle glycogen, then fat
        for (src, s) in [(0usize, SUGAR), (1, SUGAR), (2, SUGAR), (3, FAT), (4, FAT)] {
            let left = breath[O2] / mm(O2);
            if left <= 1e-12 {
                break;
            }
            let per = FORMULA[s][EC] + FORMULA[s][EH] / 4.0 - FORMULA[s][EO] / 2.0;
            let pool = match src {
                0 => &mut p.blood,
                1 => &mut p.organs[LIVER].comp,
                2 => &mut p.organs[MUSCLE].comp,
                3 => &mut p.organs[FAT_TISSUE].comp,
                _ => &mut p.organs[LIVER].comp,
            };
            heat += oxidise(s, left / per, pool, &mut breath, true);
        }
        let used = (o2_in - breath[O2]) / mm(O2);
        if used < 0.6 * demand {
            brain_damage += 0.003; // not enough oxygen (or nothing left to burn)
        }
        // exhale: CO2, ammonia, unused O2, half the water; the other half stays in the blood
        let water = breath[STEAM];
        breath[STEAM] = water * 0.5;
        p.blood[WATER] += water * 0.5;
        let to = around[0];
        for s in 0..NGAS {
            self.m[to][s] += breath[s];
        }

        // ---- body temperature: heat made vs. heat lost (flushing, sweating, shivering above)
        let t_air = self.temp[cell];
        let body_cap = 3500.0 * p.mass().max(1.0);
        let k = (5.0 + 8.0 * (p.core - 310.0)).clamp(2.5, 20.0); // W/K, clothed; skin vessels open when hot
        let loss = k * (p.core - t_air) * dt;
        let mut sweat = 0.0;
        if p.core > 310.3 {
            sweat = (2e-4 * (p.core - 310.3) * dt).min(p.blood[WATER] * 0.001);
            p.blood[WATER] -= sweat;
            p.blood[SALT] -= (p.blood[SALT] * sweat / p.blood[WATER].max(1e-9) * 0.3).min(p.blood[SALT]);
            self.m[cell][STEAM] += sweat;
        }
        // some of the shed heat warms the air nearby (the rest radiates to walls and floor)
        let to_air = loss * 0.3 / around.len() as f32;
        for &j in &around {
            self.temp[j] += to_air / self.cap[j].max(1.0);
        }
        p.core += (heat - loss - sweat * 2.4e6) / body_cap;
        if p.core < 306.0 || p.core > 313.0 {
            brain_damage += 0.004; // hypothermia or heatstroke
        }

        // ---- water, salt and the kidneys
        let tw = human_blood()[WATER];
        let insensible = (9e-6 * dt).min(p.blood[WATER]);
        p.blood[WATER] -= insensible;
        self.m[cell][STEAM] += insensible;
        if p.blood[WATER] > 1.03 * tw {
            let x = (p.blood[WATER] - tw) * 0.05;
            p.blood[WATER] -= x;
            p.bladder[WATER] += x;
        }
        if p.sodium() > 0.0095 {
            let x = (p.blood[SALT] - 0.009 * p.blood[WATER]) * 0.05;
            let w = (x / 0.02).min(p.blood[WATER] * 0.01); // salt leaves dissolved in urine
            p.blood[SALT] -= x;
            p.bladder[SALT] += x;
            p.blood[WATER] -= w;
            p.bladder[WATER] += w;
        }
        if p.blood[WATER] < 0.85 * tw {
            brain_damage += 0.003;
        }
        if p.sodium() < 0.006 {
            brain_damage += 0.002;
        }

        // ---- digestion
        let k = 0.005 * p.organs[STOMACH].health.max(0.0);
        for s in [SUGAR, SALT, WATER, NH3AQ] {
            let x = p.stomach[s] * k;
            p.stomach[s] -= x;
            p.blood[s] += x;
        }
        for (s, organ) in [(FAT, FAT_TISSUE), (PROTEIN, MUSCLE)] {
            let x = p.stomach[s] * k;
            p.stomach[s] -= x;
            p.organs[organ].comp[s] += x;
        }
        for s in [CELLULOSE, CHITIN, APATITE, ZNOH2, FE2O3] {
            let x = p.stomach[s] * k;
            p.stomach[s] -= x;
            p.bowel[s] += x;
            let w = (x * 3.0).min(p.blood[WATER] * 0.001); // stool carries water
            p.blood[WATER] -= w;
            p.bowel[WATER] += w;
        }
        // blood sugar → glycogen stores
        let spare = p.blood[SUGAR] - 0.005;
        if spare > 0.0 {
            let to_liver = spare.min((0.15 - p.organs[LIVER].comp[SUGAR]).max(0.0));
            p.blood[SUGAR] -= to_liver;
            p.organs[LIVER].comp[SUGAR] += to_liver;
            let rest = (p.blood[SUGAR] - 0.005).max(0.0).min((0.5 - p.organs[MUSCLE].comp[SUGAR]).max(0.0));
            p.blood[SUGAR] -= rest;
            p.organs[MUSCLE].comp[SUGAR] += rest;
        } else if p.organs[LIVER].comp[SUGAR] > 0.0 {
            let x = (-spare).min(p.organs[LIVER].comp[SUGAR]);
            p.organs[LIVER].comp[SUGAR] -= x;
            p.blood[SUGAR] += x;
        }

        // ---- health
        p.organs[BRAIN].health -= brain_damage;
        if brain_damage == 0.0 {
            p.organs[BRAIN].health = (p.organs[BRAIN].health + 0.0005).min(1.0);
        }
        if p.organs[BRAIN].health <= 0.0 {
            p.alive = false;
            if !matches!(p.carry, Carry::None) {
                let c = std::mem::replace(&mut p.carry, Carry::None);
                if let Some(j) = std::iter::once(cell).chain((0..4).filter_map(|d| Self::nb(cell, d))).find(|&j| self.droppable(j, &c)) {
                    self.put(j, &c);
                }
            }
            return;
        }

        // ---- deciding and moving
        p.moving = false;
        if p.player {
            let (dx, dy) = p.wish;
            if dx != 0 || dy != 0 {
                for _ in 0..2 {
                    let (x, y) = ((p.cell % W) as i32 + dx, (p.cell / W) as i32 + dy);
                    if x >= 0 && y >= 0 && (x as usize) < W && (y as usize) < H {
                        let j = y as usize * W + x as usize;
                        if self.walkable_h(j) {
                            p.cell = j;
                            p.moving = true;
                        }
                    }
                }
            }
            match std::mem::take(&mut p.act) {
                1 => self.eat(p),
                2 => self.drink(p),
                3 => self.relieve(p),
                _ => {}
            }
            return;
        }
        // workers: needs first, then work
        let toilet_need = total(&p.bladder) > 0.35 || total(&p.bowel) > 0.25;
        p.goal = if p.thirst() > 0.15 {
            Goal::Water
        } else if toilet_need {
            Goal::Toilet
        } else if p.hunger() > 0.5 && total(&p.stomach) < 0.3 {
            Goal::Food
        } else {
            match p.goal {
                Goal::Fetch(j) | Goal::Deliver(j) if !matches!(p.carry, Carry::None) => {
                    if self.fields.get(4 + 2 * j).is_some_and(|f| f[p.cell] == u16::MAX) { Goal::Return(j) } else { Goal::Deliver(j) }
                }
                Goal::Return(j) if !matches!(p.carry, Carry::None) => Goal::Return(j),
                Goal::Fetch(j) => Goal::Fetch(j),
                _ if !matches!(p.carry, Carry::None) => p.goal,
                _ => self.choose_job(p),
            }
        };
        let field = match p.goal {
            Goal::Water => Some(0),
            Goal::Toilet => Some(1),
            Goal::Food => Some(2),
            Goal::Fetch(j) => Some(3 + 2 * j),
            Goal::Deliver(j) => Some(4 + 2 * j),
            Goal::Return(j) => Some(3 + 2 * j),
            Goal::Idle => self.quarters.map(|_| 3 + 2 * self.jobs.len()),
        };
        let Some(f) = field else { return };
        if f >= self.fields.len() {
            return;
        }
        if self.fields[f][p.cell] == u16::MAX {
            if let Goal::Deliver(j) = p.goal {
                p.goal = Goal::Return(j);
            } else if !matches!(p.goal, Goal::Return(_)) {
                p.goal = Goal::Idle; // can't get there from here
            }
            return;
        }
        if self.fields[f][p.cell] == 0 {
            match p.goal {
                Goal::Water => self.drink(p),
                Goal::Toilet => self.relieve(p),
                Goal::Food => self.eat(p),
                Goal::Fetch(j) => {
                    let job = self.jobs[j];
                    let spot = Self::reach(p.cell).find(|&i| Self::in_rect(i, &job.from) && self.pickable(i, job.pick));
                    match spot {
                        Some(i) => {
                            p.carry = self.take(i);
                            p.goal = if matches!(p.carry, Carry::None) { Goal::Idle } else { Goal::Deliver(j) };
                        }
                        None => p.goal = Goal::Idle,
                    }
                }
                Goal::Deliver(j) => {
                    let job = self.jobs[j];
                    if job.grind && p.work < 25 {
                        p.work += 1; // turning the mill
                        return;
                    }
                    p.work = 0;
                    let c = match (&p.carry, job.grind) {
                        (Carry::Cell { m, .. }, true) => Carry::Fluid(*m),
                        (c, _) => c.clone(),
                    };
                    let spot = Self::reach(p.cell).filter(|&i| i != p.cell).find(|&i| Self::in_rect(i, &job.to) && self.droppable(i, &c));
                    if let Some(i) = spot {
                        if self.put(i, &c) {
                            p.carry = Carry::None;
                            p.goal = Goal::Idle;
                        }
                    }
                }
                Goal::Return(j) => {
                    let job = self.jobs[j];
                    let c = p.carry.clone();
                    let spot = Self::reach(p.cell).filter(|&i| i != p.cell).find(|&i| Self::in_rect(i, &job.from) && (self.droppable(i, &c) || matches!(c, Carry::Fluid(_)) && is_open(self.mat[i])));
                    if let Some(i) = spot {
                        if self.put(i, &c) {
                            p.carry = Carry::None;
                            p.goal = Goal::Idle;
                        }
                    }
                }
                Goal::Idle => {}
            }
            return;
        }
        // walk downhill on the distance map (a step or two per tick)
        for _ in 0..2 {
            let here = self.fields[f][p.cell];
            let next = (0..4).filter_map(|d| Self::nb(p.cell, d)).filter(|&j| self.fields[f][j] < here).min_by_key(|&j| (self.fields[f][j], (j as u32 ^ p.id) % 7));
            match next {
                Some(j) => {
                    p.cell = j;
                    p.moving = true;
                }
                None => break,
            }
            if self.fields[f][p.cell] == 0 {
                break;
            }
        }
    }

    fn choose_job(&self, p: &Person) -> Goal {
        let n = self.jobs.len();
        for k in 0..n {
            let j = (p.id as usize + k) % n;
            let job = &self.jobs[j];
            if let Some(c) = job.unless_warm {
                if self.temp[c] > 320.0 {
                    continue;
                }
            }
            let (src, dst) = (3 + 2 * j, 4 + 2 * j);
            if dst < self.fields.len() && self.fields[src][p.cell] < 2000 && self.fields[dst][p.cell] < 2000 {
                return Goal::Fetch(j);
            }
        }
        Goal::Idle
    }

    fn eat(&mut self, p: &mut Person) {
        if total(&p.stomach) > 1.0 {
            return;
        }
        let spot = Self::reach(p.cell).find(|&i| self.is_food(i) && (p.player || self.canteen.is_none_or(|r| Self::in_rect(i, &r))));
        let Some(i) = spot else { return };
        let bite = 0.01f32;
        if self.mat[i] == PEANUT {
            let k = (bite / total(&self.m[i]).max(1e-9)).min(1.0);
            let food = scaled(&self.m[i], k);
            for s in 0..NSP {
                self.m[i][s] -= food[s];
            }
            add(&mut p.stomach, &food);
            if total(&self.m[i]) < 1e-5 {
                self.vacate(i);
            }
        } else {
            let cm = condensed_mass(&self.m[i]);
            let k = (bite / cm).min(1.0);
            for s in WATER..NSP {
                let x = self.m[i][s] * k;
                self.m[i][s] -= x;
                p.stomach[s] += x;
            }
        }
    }

    fn drink(&mut self, p: &mut Person) {
        let spot = Self::reach(p.cell).find(|&i| self.is_water_source(i));
        let Some(i) = spot else { return };
        let sip = 0.02f32.min(self.m[i][WATER] * 0.2);
        let frac = sip / self.m[i][WATER];
        for s in [WATER, SALT, SUGAR, NH3AQ] {
            let x = self.m[i][s] * frac * if s == WATER { 1.0 } else { dissolved_share(&self.m[i], s) };
            self.m[i][s] -= x;
            p.stomach[s] += x;
        }
    }

    fn relieve(&mut self, p: &mut Person) {
        let spot = Self::reach(p.cell).find(|&i| self.mat[i] == DRAIN && self.aux[i] as u8 != OUTFALL);
        let Some(i) = spot else { return };
        let mut out = std::mem::take(&mut p.bladder);
        add(&mut out, &std::mem::take(&mut p.bowel));
        add(&mut self.m[i], &out); // the drain carries it away
    }

    /// The player picks something up from within reach (2 m).
    pub fn player_pick(&mut self, x: usize, y: usize) -> bool {
        let Some(k) = self.people.iter().position(|p| p.player && p.alive) else { return false };
        let i = Self::idx(x.min(W - 1), y.min(H - 1));
        let pc = self.people[k].cell;
        if dist(pc, i) > 20.0 || self.people[k].bag.len() >= 12 {
            return false;
        }
        let c = self.take(i);
        if matches!(c, Carry::None) {
            return false;
        }
        self.people[k].bag.push(c);
        true
    }

    /// The player puts an item from their bag into a cell within reach.
    pub fn player_place(&mut self, x: usize, y: usize, slot: usize) -> bool {
        let Some(k) = self.people.iter().position(|p| p.player && p.alive) else { return false };
        let i = Self::idx(x.min(W - 1), y.min(H - 1));
        if dist(self.people[k].cell, i) > 20.0 || slot >= self.people[k].bag.len() || i == self.people[k].cell {
            return false;
        }
        let c = self.people[k].bag[slot].clone();
        if self.put(i, &c) {
            self.people[k].bag.remove(slot);
            true
        } else {
            false
        }
    }
}

/// A code for what something is, for drawing it: a material, or 60 + the compound most of a fluid is.
pub fn carry_code(c: &Carry) -> f32 {
    match c {
        Carry::None => 0.0,
        Carry::Cell { mat, .. } => *mat as f32,
        Carry::Fluid(m) => {
            let mut best = WATER;
            for s in WATER..NSP {
                if m[s] > m[best] {
                    best = s;
                }
            }
            60.0 + best as f32
        }
    }
}

impl Elements {
    /// Per person, 8 floats: x, y, player?, alive?, goal (0 idle 1 water 2 toilet 3 food 4 fetch 5 deliver 6 return),
    /// what they carry (see `carry_code`), core temperature (K), id.
    pub fn people_data(&mut self) -> &[f32] {
        let mut buf = std::mem::take(&mut self.people_buf);
        buf.clear();
        for p in &self.people {
            let goal = match p.goal {
                Goal::Idle => 0.0,
                Goal::Water => 1.0,
                Goal::Toilet => 2.0,
                Goal::Food => 3.0,
                Goal::Fetch(_) => 4.0,
                Goal::Deliver(_) => 5.0,
                Goal::Return(_) => 6.0,
            };
            buf.extend([(p.cell % W) as f32, (p.cell / W) as f32, p.player as u8 as f32, p.alive as u8 as f32, goal, carry_code(&p.carry), p.core, p.id as f32]);
        }
        self.people_buf = buf;
        &self.people_buf
    }

    /// The player's body (96 floats): 0 alive, 1 core K, 2 hunger, 3 thirst, 4 brain health,
    /// 5 stomach kg, 6 bladder kg, 7 bowel kg, 8 x, 9 y, 10 blood sodium (kg/kg water), 11 body mass,
    /// 12 bag size, 13..37 bag (code, kg) × 12, 40..62 organs (kg, health) × 11, 64 air O2 fraction here,
    /// 65 air temperature here, 66 humidity here, 67 liver glycogen kg, 68 body fat kg.
    pub fn player_state(&mut self) -> &[f32; 96] {
        let mut o = [0.0f32; 96];
        if let Some(p) = self.people.iter().find(|p| p.player) {
            o[0] = p.alive as u8 as f32;
            o[1] = p.core;
            o[2] = p.hunger();
            o[3] = p.thirst();
            o[4] = p.organs[BRAIN].health;
            o[5] = total(&p.stomach);
            o[6] = total(&p.bladder);
            o[7] = total(&p.bowel);
            o[8] = (p.cell % W) as f32;
            o[9] = (p.cell / W) as f32;
            o[10] = p.sodium();
            o[11] = p.mass();
            o[12] = p.bag.len() as f32;
            for (k, c) in p.bag.iter().take(12).enumerate() {
                o[13 + k * 2] = carry_code(c);
                o[14 + k * 2] = c.mass();
            }
            for (k, org) in p.organs.iter().enumerate() {
                o[40 + k * 2] = total(&org.comp);
                o[41 + k * 2] = org.health;
            }
            let c = &self.m[p.cell];
            o[64] = c[O2] / mm(O2) / gas_mol(c).max(1e-12);
            o[65] = self.temp[p.cell];
            o[66] = self.humidity(p.cell);
            o[67] = p.organs[LIVER].comp[SUGAR];
            o[68] = p.organs[FAT_TISSUE].comp[FAT];
        }
        self.player_buf = o;
        &self.player_buf
    }

    /// Steer the player: a direction to walk, and an action (1 eat, 2 drink, 3 toilet).
    pub fn player_input(&mut self, dx: i32, dy: i32, act: u8) {
        if let Some(p) = self.people.iter_mut().find(|p| p.player && p.alive) {
            p.wish = (dx.signum(), dy.signum());
            if act > 0 {
                p.act = act;
            }
        }
    }
}

fn dist(a: usize, b: usize) -> f32 {
    let (ax, ay, bx, by) = ((a % W) as f32, (a / W) as f32, (b % W) as f32, (b / W) as f32);
    ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt()
}
