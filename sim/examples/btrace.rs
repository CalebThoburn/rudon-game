//! Run the building headless and report on every system.
//! cargo run --release --example btrace -- [minutes]
use rudon_sim::elements::world::{building, ROOMS};
use rudon_sim::elements::*;

fn rect_stats(e: &Elements, r: [usize; 4]) -> (f32, f32, usize) {
    let (mut t, mut n, mut rh) = (0.0, 0usize, 0.0);
    for y in r[1]..=r[3] {
        for x in r[0]..=r[2] {
            let i = Elements::idx(x, y);
            if e.mat[i] == OPEN && cond_vol_pub(&e.m[i]) < 0.0005 {
                t += e.temp[i];
                rh += e.humidity(i);
                n += 1;
            }
        }
    }
    (t / n.max(1) as f32, rh / n.max(1) as f32, n)
}
fn sum(e: &Elements, r: [usize; 4], s: usize) -> f32 {
    let mut t = 0.0;
    for y in r[1]..=r[3] {
        for x in r[0]..=r[2] {
            t += e.m[Elements::idx(x, y)][s];
        }
    }
    t
}
fn count(e: &Elements, r: [usize; 4], f: impl Fn(usize) -> bool) -> usize {
    let mut n = 0;
    for y in r[1]..=r[3] {
        for x in r[0]..=r[2] {
            if f(Elements::idx(x, y)) {
                n += 1;
            }
        }
    }
    n
}

fn main() {
    let minutes: f32 = std::env::args().nth(1).and_then(|a| a.parse().ok()).unwrap_or(10.0);
    let (mut e, l) = building();
    let t0 = std::time::Instant::now();
    let steps = (minutes * 60.0 / 1.0) as usize;
    for s in 0..=steps {
        if s % 60 == 0 {
            let m = s / 60;
            println!("=== {m} min  (wall {:.1}s)", t0.elapsed().as_secs_f32());
            for &(name, r) in ROOMS {
                let (t, rh, _) = rect_stats(&e, r);
                let paper_w = sum(&e, r, WATER) ;
                let _ = paper_w;
                let co2 = sum(&e, r, CO2);
                let ch4 = sum(&e, r, CH4);
                println!("  {name:16} T {:5.1}C RH {:3.0}% CO2 {:.4}kg CH4 {:.4}kg", t - 273.15, rh * 100.0, co2, ch4);
            }
            let papers: Vec<f32> = (0..N).filter(|&i| e.mat[i] == PAPER).map(|i| e.m[i][WATER] / e.m[i][CELLULOSE]).collect();
            let pmax = papers.iter().cloned().fold(0.0, f32::max);
            let pavg = papers.iter().sum::<f32>() / papers.len().max(1) as f32;
            println!("  paper moisture avg {:.3} max {:.3} ({} cells)", pavg, pmax, papers.len());
            let farm = [111, 1, 184, 78];
            let plot = [242, 1, 286, 78];
            for (nm, r) in [("farm", farm), ("plot", plot)] {
                let k = |kind: u8| count(&e, r, |i| e.mat[i] == PLANT && e.aux[i] as u8 == kind);
                let mut sug = 0.0; let mut wat = 0.0; let mut nn = 0;
                for y in r[1]..=r[3] { for x in r[0]..=r[2] { let i = Elements::idx(x, y); if e.mat[i] == PLANT { sug += e.m[i][SUGAR]; wat += e.m[i][WATER] / e.m[i].iter().sum::<f32>(); nn += 1; } } }
                println!("  {nm}: roots {} stems {} leaves {} flowers {} pods {} organic {} | avg sugar {:.2}g water {:.2}", k(ROOT), k(STEM), k(LEAF), k(FLOWER),
                    count(&e, r, |i| e.mat[i] == PEANUT), count(&e, r, |i| e.mat[i] == ORGANIC), 1000.0 * sug / nn.max(1) as f32, wat / nn.max(1) as f32);
            }
            let cats = e.agents.iter().filter(|a| a.alive && a.kind == CATERPILLAR).count();
            println!("  caterpillars alive {cats}");
            println!("  digester P {:.0} Pa", e.probe(Elements::idx(230, 36))[2]);
            let fb = l.firebox;
            let fbt = (fb[1]..=fb[3]).flat_map(|y| (fb[0]..=fb[2]).map(move |x| (x, y))).map(|(x, y)| e.temp[Elements::idx(x, y)]).fold(0.0, f32::max);
            println!("  firebox max T {:.0}K CH4 {:.5} O2 {:.5} | hotplate {:.0}K", fbt, sum(&e, fb, CH4), sum(&e, fb, O2), e.temp[l.hotplate]);
            let tr = l.trough;
            let tm = sum(&e, tr, FAT) + sum(&e, tr, PROTEIN) + sum(&e, tr, SUGAR) + sum(&e, tr, SALT) + sum(&e, tr, WATER) + sum(&e, tr, CELLULOSE);
            println!("  trough {:.3}kg salt {:.2}% sugar {:.2}% | lamp {:.0}K | antenna sig {:.4} hp {:.2}",
                tm, 100.0 * sum(&e, tr, SALT) / tm.max(1e-9), 100.0 * sum(&e, tr, SUGAR) / tm.max(1e-9), e.temp[l.lamp],
                e.loose.first().map(|o| o.signal).unwrap_or(-1.0), e.loose.first().map(|o| o.health).unwrap_or(-1.0));
            println!("  salt pan water {:.3} salt {:.3} | syrup pan water {:.3} sugar {:.3} | counter fat {:.3}",
                sum(&e, l.salt_pan, WATER), sum(&e, l.salt_pan, SALT), sum(&e, l.syrup_pan, WATER), sum(&e, l.syrup_pan, SUGAR), sum(&e, l.counter, FAT));
            println!("  sewer {:.3}kg", e.sewer.iter().sum::<f32>());
            for p in &e.people {
                println!("  {} cell ({:3},{:3}) {:?} alive {} core {:.1}C hunger {:.2} thirst {:.2} brain {:.2} stomach {:.3} bladder {:.3} carry {:.3}",
                    if p.player { "P" } else { "W" }, p.cell % W, p.cell / W, p.goal, p.alive, p.core - 273.15, p.hunger(), p.thirst(),
                    p.organs[humans::BRAIN].health, p.stomach.iter().sum::<f32>(), p.bladder.iter().sum::<f32>(), p.carry.mass());
            }
        }
        e.step(1.0);
    }
}
