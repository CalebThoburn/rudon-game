// Developer overlay. The game itself has no labels or numbers; this panel is
// for us, to see the simulation and benchmark it.
import type { SimClient } from './simClient';
import { E, F, H, R, ROOMS, room } from './simLayout';

const SECTOR_PRESETS = [1, 1_000, 10_000, 100_000, 300_000];
const TIME_PRESETS = [1, 10, 30, 120, 600];
const TICK_MS = 50;

export class Hud {
  private el: HTMLElement;
  private body: HTMLElement;
  private buttons: HTMLElement;
  private fps = 60;

  constructor(el: HTMLElement, private sim: SimClient) {
    this.el = el;
    el.innerHTML = '<h3>RUDON · PROTOTYPE 01 · DEBUG</h3>';
    this.buttons = document.createElement('div');
    this.body = document.createElement('div');
    el.append(this.buttons, this.body);
    this.renderButtons();
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') el.classList.toggle('hidden');
    });
  }

  private renderButtons(): void {
    const row = (label: string, values: number[], current: number, fmt: (v: number) => string, on: (v: number) => void) => {
      const div = document.createElement('div');
      div.append(label);
      for (const v of values) {
        const b = document.createElement('button');
        b.textContent = fmt(v);
        if (v === current) b.className = 'on';
        b.onclick = () => { on(v); this.renderButtons(); };
        div.append(b);
      }
      return div;
    };
    this.buttons.replaceChildren(
      row('sectors   ', SECTOR_PRESETS, this.sim.totalSectors, (v) => (v >= 1000 ? `${v / 1000}k` : `${v}`), (v) => this.sim.setTotalSectors(v)),
      row('time      ', TIME_PRESETS, this.sim.timeScale, (v) => `×${v}`, (v) => this.sim.setTimeScale(v)),
    );
  }

  update(dt: number): void {
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
    if (this.el.classList.contains('hidden')) return;
    const s = this.sim;
    if (s.error) { this.body.innerHTML = `<span class="warn">sim error: ${s.error}</span>`; return; }
    const st = s.state;
    const total = s.sectorCounts.reduce((a, b) => a + b, 0);
    const maxStep = Math.max(...s.stepMs);
    const load = (maxStep / TICK_MS) * 100;
    const substeps = Math.max(1, Math.ceil((TICK_MS / 1000) * s.timeScale / 0.5));
    const lines: string[] = [];
    lines.push(`fps ${this.fps.toFixed(0)}   sim threads ${s.workers.length}`);
    lines.push(`sectors ${total.toLocaleString()}   engines ${(total * 3).toLocaleString()}`);
    const cls = load > 100 ? 'warn' : '';
    lines.push(`<span class="${cls}">step ${maxStep.toFixed(2)} ms / ${TICK_MS} ms tick (${load.toFixed(0)}% busiest thread)</span>`);
    lines.push(`substeps/tick ${substeps}   sector-steps/s ${(total * substeps * 1000 / TICK_MS).toLocaleString()}`);
    if (load > 100) lines.push('<span class="warn">sim can\'t keep up: game time slows down</span>');
    if (st) {
      const t = st[H.time];
      const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60);
      const flags = st[H.flags];
      lines.push('');
      lines.push(`game time ${hh}h${String(mm).padStart(2, '0')}   pump ${flags & F.pumpRunning ? 'running' : 'STOPPED'}   chiller ${flags & F.chillerRunning ? 'running' : 'STOPPED'}   fans ${st[H.fans]}`);
      lines.push(`coolant ${st[H.coolantTemp].toFixed(2)} °C   chiller ${(st[H.chillerPower] / 1000).toFixed(1)} kW   head ${(st[H.pumpHead] / 1000).toFixed(1)} kPa`);
      lines.push('room  temp   load kW  valve  flow L/s  jar   drum   engine');
      for (let i = 0; i < ROOMS; i++) {
        const f = (k: number) => room(st, i, k);
        const parts = f(R.parts);
        const missing = Object.entries(E).filter(([, bit]) => !(parts & bit)).map(([n]) => n);
        lines.push(
          `${i}    ${f(R.temp).toFixed(2).padStart(5)}  ${(f(R.load) / 1000).toFixed(1).padStart(5)}    ${f(R.valve).toFixed(2)}   ${(f(R.flow) * 1000).toFixed(3)}    ${(f(R.pbFill) * 100).toFixed(0).padStart(3)}%  ${f(R.ledgerOmega).toFixed(2).padStart(5)}  ` +
            `${missing.length ? 'missing ' + missing.join(',') : 'complete'}${f(R.holding) ? ' HELD' : ''}${f(R.drain) ? ' draining' : ''}${f(R.supply) ? '' : ' no-supply'}`,
        );
      }
    }
    this.body.innerHTML = lines.join('\n');
  }
}
