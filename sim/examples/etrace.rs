use rudon_sim::elements::*;
fn main() {
    let mut e = Elements::new();
    e.boxed(0, 0, W - 1, H - 1, CONCRETE);
    e.boxed(10, 10, 30, 20, STEEL);
    e.rect(20, 11, 20, 19, STEEL);
    e.fill(11, 11, 19, 19, |c| { c[N2] *= 3.0; c[O2] *= 3.0; });
    let row = |e: &mut Elements| (11..=29).map(|x| format!("{:.0}", e.probe(15 * W + x)[2] / 1000.0)).collect::<Vec<_>>().join(" ");
    let col = |e: &mut Elements| (11..=19).map(|y| format!("{:.0}", e.probe(y * W + 15)[2] / 1000.0)).collect::<Vec<_>>().join(" ");
    println!("t=0 row {}\n    col {}", row(&mut e), col(&mut e));
    e.clear(15 * W + 20);
    for k in 0..3 { e.step(1.0); println!("t={} row {}\n    col {}", k + 1, row(&mut e), col(&mut e)); }
}
