//! Beetle sweep: how much does the colony's proportional push steady the engines?
use rudon_sim::Sector;
fn maxdev(beetles: f64) -> f64 {
    let mut s = Sector::new(1.0);
    for e in &mut s.engines { e.beetles = beetles; }
    let mut m: f64 = 0.0;
    for t in 0..(36 * 3600) {
        for e in &mut s.engines { e.beetles = beetles; }
        s.step(1.0);
        if t > 12 * 3600 { for r in &s.rooms { m = m.max((r.temp - 22.0).abs()); } }
    }
    m
}
fn main() {
    for b in [0.0, 0.25, 0.5, 1.0] { println!("beetles {b:.2}: worst deviation over hours 12-36 = {:.2} °C", maxdev(b)); }
}
