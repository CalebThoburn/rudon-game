# Rudon: Prototype 01

One sector of Thermal Accounting: a corridor, three server rooms, a pump, a chiller,
and a **Reconciliation Engine** in each room. The engine is a mechanical temperature
controller built from a peanut butter jar, two drums, a differential gear and a
lead screw. Everything is simulated literally; nothing is scripted.

Design docs live in the Obsidian vault next door (`../Rudon`), especially
`Simulation`, `Engine` and `Prototype 01`.

## Run it

Requirements: [Rust](https://rustup.rs) with the `wasm32-unknown-unknown` target, and Node 20+.

```sh
rustup target add wasm32-unknown-unknown   # once
npm install                                # once
npm run dev        # build the sim, start a dev server
npm run build      # production build into dist/
npm run test:sim   # physics tests (native Rust)
npm run bench:sim  # native single-core benchmark
```

## Controls
WASD move · Q/E rotate camera · scroll zoom · **F** inspect an engine / flip a rack, pump or chiller · Esc close · **`** toggle the debug panel

In an engine: click the four screws, then the plate. Inside, click the **supply tube collar**,
the **drain tap**, the **linkage pin**, or click and hold the **ledger drum**.

## Architecture

```
sim/            Rust simulation core → WebAssembly (no wasm-bindgen; plain C exports)
  src/lib.rs    physics: hydraulics, heat, peanut butter viscosity, drums, valve
src/
  sim.worker.ts one WASM World per Web Worker, fixed 20 Hz tick
  simClient.ts  worker pool: splits sectors across threads (no SharedArrayBuffer needed)
  simLayout.ts  state layout shared with Rust; keep in sync with write_state()
  main.ts       Three.js world: billboard sprites, camera, movement, pipes
  inspect.ts    the layered 2D inspect panel
  sprites.ts    procedurally drawn placeholder art
  hud.ts        debug overlay and benchmark controls
```

## Deploying to GitHub Pages
`.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`.
In the repo settings, set **Pages → Source** to **GitHub Actions**.

## Benchmark (first run, Apple Silicon, Chrome, 8 sim threads, ×30 time)
| Sectors | Engines | Busiest thread per 50 ms tick |
|---|---|---|
| 100,000 | 300,000 | 9.2 ms (18%) |
| 300,000 | 900,000 | 28.4 ms (57%) |

Rendering stayed at 60 fps. WASM ran about 2.3× slower than native Rust (110 ns vs ~250 ns per sector substep).
