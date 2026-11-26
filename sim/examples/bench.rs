//! Native single-thread benchmark: how many sectors can one core step?
use rudon_sim::World;
use std::time::Instant;
fn main() {
    for &n in &[1_000usize, 10_000, 100_000] {
        let mut w = World::new(n, 1);
        w.step(1.0); // warm up
        let iters = 20;
        let t = Instant::now();
        for _ in 0..iters { w.step(0.5); } // one substep each
        let per = t.elapsed().as_secs_f64() / iters as f64;
        println!("{n:>7} sectors ({:>7} engines): {:.3} ms per substep, {:.0} ns per sector", n * 3, per * 1e3, per * 1e9 / n as f64);
    }
}
