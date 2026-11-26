//! Prints the temperature trajectory of one sector over 24 game hours.
use rudon_sim::Sector;
fn main() {
    let mut s = Sector::new(1.0);
    for h in 0..24 {
        for _ in 0..3600 { s.step(1.0); }
        println!("t={:>2}h rooms {:.2} {:.2} {:.2} °C | valves {:.2} {:.2} {:.2}", h + 1,
            s.rooms[0].temp, s.rooms[1].temp, s.rooms[2].temp,
            s.engines[0].valve, s.engines[1].valve, s.engines[2].valve);
    }
}
