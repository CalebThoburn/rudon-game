// The inspect view: a layered 2D panel (Among Us-task style) over the world.
// Layer 0 is the brass housing (four screws). Layer 1 is the live mechanism.
// Every moving part is drawn from simulation state; nothing is labelled.
import { Cmd, H, R, room } from './simLayout';
import { tempColor } from './sprites';

const W = 800;
const HGT = 560;
const INK = '#2a2118';

// Mechanism layout (panel coordinates)
const REF = { x: 170, y: 210, r: 70 };
const LEDGER = { x: 400, y: 210, r: 96 };
const DIFF = { x: 285, y: 120 };
const JAR = { x: 340, y: 340, w: 120, h: 120 };
const TAP = { x: 478, y: 448 };
const COUPLING = { x: 300, y: 300 };
const SCREW = { x: 640, top: 130, bottom: 390 };
const PIN = { x: 640, y: 104 };
const VALVE = { x: 640, y: 470 };
const BELL = { x: 400, y: 52 };
const SCREWS = [
  { x: 70, y: 70 }, { x: 730, y: 70 }, { x: 70, y: 490 }, { x: 730, y: 490 },
];
const STOWED = { x: 24, y: 470, w: 96, h: 66 }; // removed housing, leaning in the corner

interface EngineUi {
  screwsOut: boolean[];
  screwAnim: number[]; // 0..1 unscrew progress
  plateOff: boolean;
  plateAnim: number; // 0 = on, 1 = off
}

export class InspectPanel {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private ui: EngineUi[] = [];
  private roomIndex = -1;
  private mouse = { x: -100, y: -100, down: false };
  private holding = false;
  private vis = { ledger: 0, ref: 0, screw: 0, coolant: 0, supply: 0, puddle: 0, bell: 0, lastChimes: -1 };
  private drips: { x: number; y: number; v: number }[] = [];

  constructor(canvas: HTMLCanvasElement, private send: (kind: number, room: number, value: number) => void) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = HGT;
    this.g = canvas.getContext('2d')!;
    this.fit();
    window.addEventListener('resize', () => this.fit());
    canvas.addEventListener('pointerdown', (e) => this.pointer(e, 'down'));
    canvas.addEventListener('pointermove', (e) => this.pointer(e, 'move'));
    window.addEventListener('pointerup', (e) => this.pointer(e, 'up'));
    canvas.addEventListener('pointerleave', () => this.release());
  }

  get isOpen(): boolean {
    return this.roomIndex >= 0;
  }
  get room(): number {
    return this.roomIndex;
  }

  open(i: number): void {
    while (this.ui.length <= i) {
      this.ui.push({ screwsOut: [false, false, false, false], screwAnim: [0, 0, 0, 0], plateOff: false, plateAnim: 0 });
    }
    this.roomIndex = i;
    this.vis.lastChimes = -1;
    this.drips = [];
    this.canvas.classList.remove('hidden');
  }

  close(): void {
    this.release();
    this.roomIndex = -1;
    this.canvas.classList.add('hidden');
  }

  /** Ring the bell (called by main when the sim reports a chime). */
  ring(): void {
    this.vis.bell = 1;
  }

  private fit(): void {
    const s = Math.min((window.innerWidth * 0.92) / W, (window.innerHeight * 0.86) / HGT, 1.4);
    this.canvas.style.width = `${W * s}px`;
    this.canvas.style.height = `${HGT * s}px`;
  }

  private release(): void {
    if (this.holding && this.roomIndex >= 0) this.send(Cmd.Hold, this.roomIndex, 0);
    this.holding = false;
    this.mouse.down = false;
  }

  private pointer(e: PointerEvent, kind: 'down' | 'move' | 'up'): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * W;
    this.mouse.y = ((e.clientY - rect.top) / rect.height) * HGT;
    if (kind === 'up') return this.release();
    if (kind !== 'down' || this.roomIndex < 0) return;
    this.mouse.down = true;
    this.click(this.mouse.x, this.mouse.y);
  }

  private click(x: number, y: number): void {
    const i = this.roomIndex;
    const ui = this.ui[i];
    const near = (p: { x: number; y: number }, r: number) => Math.hypot(x - p.x, y - p.y) < r;

    if (!ui.plateOff) {
      // Housing layer: unscrew, then lift the plate off.
      for (let k = 0; k < 4; k++) {
        if (!ui.screwsOut[k] && near(SCREWS[k], 22)) {
          ui.screwsOut[k] = true;
          return;
        }
      }
      if (ui.screwsOut.every(Boolean) && x > 40 && x < 760 && y > 40 && y < 520) ui.plateOff = true;
      return;
    }

    // Mechanism layer.
    if (x > STOWED.x && x < STOWED.x + STOWED.w && y > STOWED.y && y < STOWED.y + STOWED.h) {
      ui.plateOff = false;
      ui.screwsOut = [false, false, false, false];
      ui.screwAnim = [0, 0, 0, 0];
      return;
    }
    const st = this.lastState;
    if (!st) return;
    if (near(TAP, 22)) return this.send(Cmd.Drain, i, room(st, i, R.drain) > 0.5 ? 0 : 1);
    if (near(COUPLING, 24)) return this.send(Cmd.Supply, i, room(st, i, R.supply) > 0.5 ? 0 : 1);
    if (near(PIN, 22)) return this.send(Cmd.Linkage, i, room(st, i, R.linkage) > 0.5 ? 0 : 1);
    if (near(LEDGER, LEDGER.r)) {
      this.holding = true;
      this.send(Cmd.Hold, i, 1);
    }
  }

  private lastState: Float64Array | null = null;

  draw(state: Float64Array, dt: number, timeScale: number): void {
    if (this.roomIndex < 0) return;
    this.lastState = state;
    const i = this.roomIndex;
    const ui = this.ui[i];
    const g = this.g;

    // ---- advance visual-only animation from real simulation rates ----
    const visScale = Math.min(timeScale, 6); // keep fast drums readable
    const omega = room(state, i, R.ledgerOmega);
    const linked = room(state, i, R.linkage) > 0.5;
    const valve = room(state, i, R.valve);
    this.vis.ledger += omega * visScale * dt;
    this.vis.ref += 1.0 * visScale * dt;
    const atStop = (valve <= 0.0005 && omega < 1) || (valve >= 0.9995 && omega > 1);
    if (linked && !atStop) this.vis.screw += (omega - 1) * 0.5 * visScale * dt * 6;
    this.vis.coolant += room(state, i, R.flow) * 1000 * 160 * dt;
    this.vis.supply += dt * 0.6;
    this.vis.bell = Math.max(0, this.vis.bell - dt * 0.9);
    const chimes = room(state, i, R.chimes);
    if (this.vis.lastChimes >= 0 && chimes > this.vis.lastChimes) this.vis.bell = 1;
    this.vis.lastChimes = chimes;
    for (let k = 0; k < 4; k++) if (ui.screwsOut[k]) ui.screwAnim[k] = Math.min(1, ui.screwAnim[k] + dt * 2.5);
    ui.plateAnim = ui.plateOff ? Math.min(1, ui.plateAnim + dt * 3) : Math.max(0, ui.plateAnim - dt * 4);

    // ---- background: machine interior ----
    const bg = g.createLinearGradient(0, 0, 0, HGT);
    bg.addColorStop(0, '#3b2c1a');
    bg.addColorStop(1, '#1f170e');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, HGT);
    g.strokeStyle = '#00000055';
    g.lineWidth = 1;
    for (let y = 20; y < HGT; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

    this.drawMechanism(state, i, dt);

    // ---- housing layer on top, sliding away when removed ----
    if (ui.plateAnim < 1) this.drawHousing(ui, state, i);
    if (ui.plateOff && ui.plateAnim >= 1) this.drawStowedPlate();

    this.drawHand();
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, HGT - 6);
  }

  // ---------------------------------------------------------------- mechanism
  private drawMechanism(st: Float64Array, i: number, dt: number): void {
    const g = this.g;
    const fill = room(st, i, R.pbFill);
    const pbTemp = room(st, i, R.pbTemp);
    const valve = room(st, i, R.valve);
    const linked = room(st, i, R.linkage) > 0.5;
    const drain = room(st, i, R.drain) > 0.5;
    const supply = room(st, i, R.supply) > 0.5;
    const holding = room(st, i, R.holding) > 0.5;

    // Coolant pipe through the valve (bottom right), coloured by temperature.
    const coolant = tempColor(st[H.coolantTemp]).getStyle();
    g.lineWidth = 26; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(520, VALVE.y + 18); g.lineTo(W, VALVE.y + 18); g.stroke();
    g.lineWidth = 18; g.strokeStyle = coolant;
    g.beginPath(); g.moveTo(520, VALVE.y + 18); g.lineTo(W, VALVE.y + 18); g.stroke();
    g.fillStyle = '#ffffffaa';
    for (let k = 0; k < 9; k++) {
      const x = 520 + ((this.vis.coolant * 1 + k * 34) % 280);
      g.beginPath(); g.arc(x, VALVE.y + 18, 3, 0, Math.PI * 2); g.fill();
    }

    // Shaft: ledger drum → jar paddle.
    g.lineWidth = 8; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(LEDGER.x, LEDGER.y); g.lineTo(LEDGER.x, JAR.y + 20); g.stroke();
    g.lineWidth = 4; g.strokeStyle = '#9a9a9a';
    g.beginPath(); g.moveTo(LEDGER.x, LEDGER.y); g.lineTo(LEDGER.x, JAR.y + 20); g.stroke();

    // Gear train along the top: drums → differential → pin → lead screw.
    g.lineWidth = 7; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(REF.x, REF.y); g.lineTo(DIFF.x, DIFF.y); g.lineTo(LEDGER.x, LEDGER.y); g.stroke();
    g.beginPath(); g.moveTo(DIFF.x, DIFF.y); g.lineTo(DIFF.x, 90); g.lineTo(PIN.x, 90); g.lineTo(PIN.x, PIN.y); g.stroke();
    g.lineWidth = 3; g.strokeStyle = '#8c8c8c';
    g.beginPath(); g.moveTo(DIFF.x, DIFF.y); g.lineTo(DIFF.x, 90); g.lineTo(PIN.x, 90); g.lineTo(PIN.x, PIN.y); g.stroke();

    this.gear(REF.x, REF.y, REF.r, 24, this.vis.ref, '#c99a45');
    this.escapement(this.vis.ref);
    this.ledgerDrum(this.vis.ledger, holding);
    this.gear(DIFF.x, DIFF.y, 22, 10, (this.vis.ledger - this.vis.ref) / 2, '#b0b0b0');
    this.gear(DIFF.x - 18, DIFF.y + 18, 12, 8, -this.vis.ref * 1.8, '#9c9c9c');
    this.gear(DIFF.x + 18, DIFF.y + 18, 12, 8, -this.vis.ledger * 1.8, '#9c9c9c');

    this.jar(fill, pbTemp, this.vis.ledger);
    this.supplyTube(supply, fill);
    this.tap(drain, fill, dt);
    this.leadScrew(valve, linked);
    this.valveBody(valve);
    this.bell();
  }

  private gear(x: number, y: number, r: number, teeth: number, a: number, color: string): void {
    const g = this.g;
    g.save(); g.translate(x, y); g.rotate(a);
    g.beginPath();
    for (let k = 0; k < teeth * 2; k++) {
      const t = (k / (teeth * 2)) * Math.PI * 2;
      const rr = k % 2 ? r : r + Math.max(3, r * 0.09);
      g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr);
    }
    g.closePath();
    g.fillStyle = color; g.fill();
    g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    g.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      const t = (k * Math.PI) / 2;
      g.beginPath(); g.moveTo(Math.cos(t) * r * 0.2, Math.sin(t) * r * 0.2); g.lineTo(Math.cos(t) * r * 0.75, Math.sin(t) * r * 0.75); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, r * 0.18, 0, Math.PI * 2); g.fillStyle = '#3a2f22'; g.fill(); g.stroke();
    g.restore();
  }

  private escapement(refAngle: number): void {
    const g = this.g;
    const rock = Math.sin(refAngle * 8) * 0.28;
    g.save(); g.translate(REF.x, REF.y - REF.r - 26); g.rotate(rock);
    g.strokeStyle = INK; g.lineWidth = 6;
    g.beginPath(); g.moveTo(-26, 18); g.lineTo(0, 0); g.lineTo(26, 18); g.stroke();
    g.strokeStyle = '#d0a85a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-26, 18); g.lineTo(0, 0); g.lineTo(26, 18); g.stroke();
    g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    g.restore();
  }

  private ledgerDrum(a: number, holding: boolean): void {
    const g = this.g;
    this.gear(LEDGER.x, LEDGER.y, LEDGER.r, 36, a, '#d9ad55');
    // number wheel ring
    g.save(); g.translate(LEDGER.x, LEDGER.y); g.rotate(a);
    g.beginPath(); g.arc(0, 0, LEDGER.r * 0.62, 0, Math.PI * 2); g.fillStyle = '#efe3c4'; g.fill();
    g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    g.fillStyle = INK; g.font = 'bold 15px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k < 20; k++) {
      const t = (k / 20) * Math.PI * 2;
      g.save(); g.rotate(t); g.translate(0, -LEDGER.r * 0.48); g.fillText(String((k * 7) % 10), 0, 0); g.restore();
    }
    g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fillStyle = '#3a2f22'; g.fill(); g.stroke();
    g.restore();
    if (holding) {
      g.strokeStyle = '#e76f5199'; g.lineWidth = 6;
      g.beginPath(); g.arc(LEDGER.x, LEDGER.y, LEDGER.r + 10, 0, Math.PI * 2); g.stroke();
    }
  }

  private jar(fill: number, pbTemp: number, paddle: number): void {
    const g = this.g;
    const { x, y, w, h } = JAR;
    // cooling fins
    g.fillStyle = '#a77d36'; g.strokeStyle = INK; g.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      g.fillRect(x - 18, y + 14 + k * 17, 18, 8); g.strokeRect(x - 18, y + 14 + k * 17, 18, 8);
      g.fillRect(x + w, y + 14 + k * 17, 18, 8); g.strokeRect(x + w, y + 14 + k * 17, 18, 8);
    }
    // glass
    g.beginPath(); g.roundRect(x, y, w, h, 10); g.fillStyle = '#cfe3e04d'; g.fill();
    // peanut butter (lighter when warm, i.e. thinner)
    const warm = Math.max(0, Math.min(1, (pbTemp - 14) / 20));
    const r = Math.round(150 + 40 * warm), gg = Math.round(98 + 34 * warm), b = Math.round(40 + 22 * warm);
    const lvl = (h - 12) * fill;
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.beginPath(); g.roundRect(x + 6, y + h - 6 - lvl, w - 12, lvl, 6); g.fill();
    // paddle, seen edge-on as it rotates
    const span = Math.abs(Math.cos(paddle)) * (w / 2 - 14) + 4;
    g.fillStyle = '#8f8f8f'; g.strokeStyle = INK; g.lineWidth = 2;
    g.fillRect(x + w / 2 - span, y + h - 44, span * 2, 22); g.strokeRect(x + w / 2 - span, y + h - 44, span * 2, 22);
    // glass outline and lid
    g.beginPath(); g.roundRect(x, y, w, h, 10); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#b8893a'; g.fillRect(x - 6, y - 10, w + 12, 16); g.strokeRect(x - 6, y - 10, w + 12, 16);
    g.fillStyle = '#ffffff55'; g.fillRect(x + 10, y + 10, 8, h - 30);
  }

  private supplyTube(connected: boolean, fill: number): void {
    const g = this.g;
    const end = connected ? { x: JAR.x + 20, y: JAR.y - 10 } : { x: COUPLING.x - 30, y: COUPLING.y + 60 };
    const path = (stroke: string, width: number) => {
      g.strokeStyle = stroke; g.lineWidth = width;
      g.beginPath(); g.moveTo(0, 330); g.bezierCurveTo(140, 330, 200, 270, COUPLING.x, COUPLING.y);
      if (connected) g.quadraticCurveTo(JAR.x + 20, COUPLING.y, end.x, end.y);
      g.stroke();
    };
    path(INK, 16);
    path('#c2a06a', 10);
    // dangling end, or a dollop travelling down the line toward the jar
    if (!connected) {
      g.strokeStyle = INK; g.lineWidth = 16;
      g.beginPath(); g.moveTo(COUPLING.x, COUPLING.y); g.quadraticCurveTo(COUPLING.x + 6, COUPLING.y + 40, end.x, end.y); g.stroke();
      g.strokeStyle = '#c2a06a'; g.lineWidth = 10; g.stroke();
      g.fillStyle = '#a8732f'; g.beginPath(); g.arc(end.x, end.y + 8, 5 + Math.sin(this.vis.supply * 3), 0, Math.PI * 2); g.fill();
    } else if (fill < 0.999) {
      const t = this.vis.supply % 1;
      const px = t < 0.7 ? (t / 0.7) * COUPLING.x : COUPLING.x + ((t - 0.7) / 0.3) * (end.x - COUPLING.x);
      const py = t < 0.7 ? 330 - (t / 0.7) * 30 : COUPLING.y + ((t - 0.7) / 0.3) * (end.y - COUPLING.y);
      g.fillStyle = '#a8732f'; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
    }
    // coupling collar
    g.beginPath(); g.roundRect(COUPLING.x - 14, COUPLING.y - 10, 28, 20, 4);
    g.fillStyle = '#b8893a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
  }

  private tap(open: boolean, fill: number, dt: number): void {
    const g = this.g;
    // spout
    g.fillStyle = '#b8893a'; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.roundRect(JAR.x + JAR.w - 4, TAP.y - 6, 30, 12, 3); g.fill(); g.stroke();
    // handle: horizontal when closed, vertical when open
    g.save(); g.translate(TAP.x, TAP.y - 14); g.rotate(open ? Math.PI / 2 : 0);
    g.beginPath(); g.roundRect(-16, -4, 32, 8, 4); g.fillStyle = '#a33b2c'; g.fill(); g.stroke();
    g.restore();
    // drips and puddle
    if (open && fill > 0.001 && Math.random() < dt * 9) this.drips.push({ x: TAP.x + 10, y: TAP.y + 8, v: 0 });
    for (const d of this.drips) { d.v += 900 * dt; d.y += d.v * dt; }
    this.drips = this.drips.filter((d) => {
      if (d.y > HGT - 30) { this.vis.puddle = Math.min(1, this.vis.puddle + 0.01); return false; }
      return true;
    });
    g.fillStyle = '#a8732f';
    for (const d of this.drips) { g.beginPath(); g.ellipse(d.x, d.y, 3.5, 5, 0, 0, Math.PI * 2); g.fill(); }
    if (this.vis.puddle > 0) {
      g.beginPath(); g.ellipse(TAP.x + 10, HGT - 26, 10 + 60 * this.vis.puddle, 4 + 7 * this.vis.puddle, 0, 0, Math.PI * 2);
      g.fillStyle = '#8d5f27'; g.fill();
    }
  }

  private leadScrew(valve: number, linked: boolean): void {
    const g = this.g;
    const { x, top, bottom } = SCREW;
    // threaded rod
    g.fillStyle = '#9a9a9a'; g.strokeStyle = INK; g.lineWidth = 3;
    g.fillRect(x - 9, top, 18, bottom - top + 60); g.strokeRect(x - 9, top, 18, bottom - top + 60);
    g.strokeStyle = '#5a5a5a'; g.lineWidth = 2;
    const phase = ((this.vis.screw % 1) + 1) % 1;
    for (let y = top + phase * 14; y < bottom + 60; y += 14) {
      g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y + 6); g.stroke();
    }
    // nut + stem, pushed down as the valve closes
    const ny = top + 20 + (1 - valve) * (bottom - top - 40);
    g.fillStyle = '#c99a45'; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.roundRect(x - 26, ny - 14, 52, 28, 4); g.fill(); g.stroke();
    // guide rail
    g.fillStyle = '#5a4326'; g.fillRect(x + 34, top, 8, bottom - top + 40); g.strokeRect(x + 34, top, 8, bottom - top + 40);
    // linkage pin at the top coupling
    g.fillStyle = '#7d7d7d';
    g.beginPath(); g.roundRect(x - 18, PIN.y - 10, 36, 20, 4); g.fill(); g.stroke();
    if (linked) {
      g.fillStyle = '#e9c46a'; g.beginPath(); g.arc(x, PIN.y, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    } else {
      g.save(); g.translate(x + 44, PIN.y - 26); g.rotate(0.6);
      g.fillStyle = '#e9c46a'; g.beginPath(); g.roundRect(-4, -18, 8, 36, 3); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, -18, 7, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
      g.fillStyle = INK; g.beginPath(); g.arc(x, PIN.y, 5, 0, Math.PI * 2); g.fill();
    }
  }

  private valveBody(valve: number): void {
    const g = this.g;
    const { x, y } = VALVE;
    // stem reaching from screw bottom into the valve
    g.fillStyle = '#b5b5b5'; g.strokeStyle = INK; g.lineWidth = 3;
    g.fillRect(x - 5, y - 40, 10, 30); g.strokeRect(x - 5, y - 40, 10, 30);
    g.beginPath(); g.roundRect(x - 34, y - 12, 68, 60, 10); g.fillStyle = '#7a8c96'; g.fill(); g.stroke();
    // gate: covers the bore more as the valve closes
    const gateH = 30 * (1 - valve);
    g.fillStyle = '#3a4750'; g.fillRect(x - 16, y + 3, 32, gateH); g.strokeRect(x - 16, y + 3, 32, gateH);
  }

  private bell(): void {
    const g = this.g;
    const swing = Math.sin(this.vis.bell * 24) * this.vis.bell * 0.5;
    g.save(); g.translate(BELL.x, BELL.y - 30); g.rotate(swing);
    g.beginPath(); g.moveTo(-22, 46); g.quadraticCurveTo(-22, 8, 0, 6); g.quadraticCurveTo(22, 8, 22, 46); g.closePath();
    g.fillStyle = '#e0b04a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
    g.beginPath(); g.arc(0, 48 + swing * 10, 5, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    g.restore();
  }

  // ------------------------------------------------------------------ housing
  private drawHousing(ui: EngineUi, st: Float64Array, i: number): void {
    const g = this.g;
    const slide = ui.plateAnim;
    g.save();
    g.translate(-slide * 120, slide * 640);
    g.rotate(-slide * 0.25);
    g.beginPath(); g.roundRect(40, 40, 720, 480, 18);
    const brass = g.createLinearGradient(40, 40, 760, 520);
    brass.addColorStop(0, '#d8b260'); brass.addColorStop(0.5, '#b8893a'); brass.addColorStop(1, '#8f6526');
    g.fillStyle = brass; g.fill(); g.strokeStyle = INK; g.lineWidth = 6; g.stroke();
    // rivets
    g.fillStyle = '#7a5520';
    for (let x = 110; x < 700; x += 40) { g.beginPath(); g.arc(x, 56, 3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x, 504, 3, 0, Math.PI * 2); g.fill(); }
    // porthole: a glimpse of the ledger drum turning
    g.save();
    g.beginPath(); g.arc(LEDGER.x, LEDGER.y, 70, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2b2116'; g.fillRect(LEDGER.x - 70, LEDGER.y - 70, 140, 140);
    this.ledgerDrum(this.vis.ledger, room(st, i, R.holding) > 0.5);
    g.restore();
    g.beginPath(); g.arc(LEDGER.x, LEDGER.y, 70, 0, Math.PI * 2); g.strokeStyle = INK; g.lineWidth = 10; g.stroke();
    g.strokeStyle = '#e9d9a8'; g.lineWidth = 3; g.stroke();
    // embossed company mark: a pipe fitting
    g.strokeStyle = '#8f6526'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(370, 400); g.lineTo(430, 400); g.moveTo(400, 400); g.lineTo(400, 440); g.stroke();
    // screws
    for (let k = 0; k < 4; k++) {
      const p = SCREWS[k];
      const a = ui.screwAnim[k];
      if (a >= 1) { g.beginPath(); g.arc(p.x, p.y, 7, 0, Math.PI * 2); g.fillStyle = '#3a2a14'; g.fill(); continue; }
      g.save(); g.translate(p.x, p.y - a * 30); g.rotate(a * 12); g.globalAlpha = 1 - a * 0.8;
      g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fillStyle = '#c9c9c9'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke();
      g.restore();
    }
    g.restore();
  }

  private drawStowedPlate(): void {
    const g = this.g;
    const { x, y, w, h } = STOWED;
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(-0.12);
    g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 6); g.fillStyle = '#b8893a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  private drawHand(): void {
    const g = this.g;
    const { x, y, down } = this.mouse;
    g.save(); g.translate(x, y);
    g.fillStyle = '#e8c9a4'; g.strokeStyle = INK; g.lineWidth = 3;
    if (down) {
      g.beginPath(); g.roundRect(-14, -10, 28, 24, 9); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-8, -4); g.lineTo(8, -4); g.stroke();
    } else {
      g.beginPath(); g.roundRect(-12, -2, 24, 22, 8); g.fill(); g.stroke();
      for (let k = 0; k < 4; k++) { g.beginPath(); g.roundRect(-11 + k * 6, -18 + (k === 0 || k === 3 ? 4 : 0), 5, 18, 2.5); g.fill(); g.stroke(); }
      g.beginPath(); g.roundRect(10, 2, 12, 6, 3); g.fill(); g.stroke();
    }
    g.restore();
  }
}
