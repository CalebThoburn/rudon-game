use rudon_sim::elements::*;
use std::time::Instant;
fn main() {
    let mut e = demo();
    e.step(1.0);
    let t = Instant::now();
    e.step(5.0); // 100 substeps
    let per = t.elapsed().as_secs_f64() / 100.0;
    println!("{}x{} cells: {:.2} ms per substep → {:.0} substeps/s on one core ({:.1}× real time)", W, H, per * 1e3, 1.0 / per, 0.05 / per);
}
