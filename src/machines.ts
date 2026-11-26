// Machine definitions for the inspect panel: what each machine is made of,
// what you can do to it, and how it looks. Part changes go to the simulation
// through `sync`, so the physics only knows what's physically there.
import { one, type Item } from './items';
import { PW, PH, type Ctx, type MachineDef, type SlotContent, type SlotDef } from './inspect';
import { Cmd, F, H, R, ROOMS, room } from './simLayout';
import { tempColor } from './sprites';

const INK = '#2a2118';

// ---------------------------------------------------------------- helpers
function inked(g: CanvasRenderingContext2D, fill: string, w = 3): void {
  g.fillStyle = fill; g.fill(); g.strokeStyle = INK; g.lineWidth = w; g.stroke();
}

function background(g: CanvasRenderingContext2D, top = '#3b2c1a', bottom = '#1f170e'): void {
  const bg = g.createLinearGradient(0, 0, 0, PH);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  g.fillStyle = bg;
  g.fillRect(0, 0, PW, PH);
  g.strokeStyle = '#00000055';
  g.lineWidth = 1;
  for (let y = 20; y < PH; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(PW, y); g.stroke(); }
}

function gear(g: CanvasRenderingContext2D, x: number, y: number, r: number, teeth: number, a: number, color: string): void {
  g.save(); g.translate(x, y); g.rotate(a);
  g.beginPath();
  for (let k = 0; k < teeth * 2; k++) {
    const t = (k / (teeth * 2)) * Math.PI * 2;
    const rr = k % 2 ? r : r + Math.max(3, r * 0.09);
    g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr);
  }
  g.closePath();
  inked(g, color);
  for (let k = 0; k < 4; k++) {
    const t = (k * Math.PI) / 2;
    g.beginPath(); g.moveTo(Math.cos(t) * r * 0.2, Math.sin(t) * r * 0.2); g.lineTo(Math.cos(t) * r * 0.75, Math.sin(t) * r * 0.75); g.stroke();
  }
  g.beginPath(); g.arc(0, 0, r * 0.18, 0, Math.PI * 2); inked(g, '#3a2f22');
  g.restore();
}

/** An empty socket where a part could go. */
function socket(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#00000055'; g.fill();
  g.setLineDash([6, 6]); g.strokeStyle = '#ffffff22'; g.lineWidth = 2; g.stroke();
  g.restore();
}

/** A pull lever: up = on. `drag` nudges the handle while the player pulls it. */
function lever(g: CanvasRenderingContext2D, x: number, y: number, on: boolean, drag: number): void {
  g.beginPath(); g.roundRect(x - 22, y - 50, 44, 100, 8); inked(g, '#4a4a4a');
  g.fillStyle = on ? '#7dff8a' : '#ff5a3c';
  g.beginPath(); g.arc(x, y - 38, 5, 0, Math.PI * 2); g.fill();
  const a = (on ? -0.9 : 0.9) + Math.max(-0.5, Math.min(0.5, drag / 80));
  g.save(); g.translate(x, y + 10); g.rotate(a);
  g.beginPath(); g.roundRect(-5, -52, 10, 52, 4); inked(g, '#9aa3a8');
  g.beginPath(); g.arc(0, -52, 11, 0, Math.PI * 2); inked(g, '#c0392b');
  g.restore();
}

/** Lever gesture: drag up switches on, down switches off. */
function leverDrag(send: (c: Ctx, on: boolean) => void) {
  return (c: Ctx, _dx: number, dy: number): boolean => {
    if (dy < -28) { send(c, true); return true; }
    if (dy > 28) { send(c, false); return true; }
    return false;
  };
}

function fastenersAround(plate: string, accepts: 'screw' | 'bolt', pts: [number, number][], hold: number, tool?: 'wrench'): SlotDef[] {
  return pts.map(([x, y], k) => ({ id: `${plate}:f${k}`, kind: 'fastener', accepts, x, y, r: 16, plate, hold, tool }));
}

function fitted(slots: SlotDef[], items: Record<string, Item | null>): Record<string, SlotContent> {
  const out: Record<string, SlotContent> = {};
  for (const s of slots) {
    if (s.kind === 'fastener') out[s.id] = { item: one(s.accepts), fastener: 'tight' };
    else out[s.id] = { item: s.id in items ? items[s.id] : one(s.accepts) };
  }
  return out;
}

function flowDots(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, offset: number, n = 8): void {
  g.fillStyle = '#ffffffaa';
  const len = Math.hypot(x1 - x0, y1 - y0);
  for (let k = 0; k < n; k++) {
    const s = ((offset + (k * len) / n) % len) / len;
    g.beginPath(); g.arc(x0 + (x1 - x0) * s, y0 + (y1 - y0) * s, 3, 0, Math.PI * 2); g.fill();
  }
}

function pipe(g: CanvasRenderingContext2D, pts: [number, number][], color: string, w = 18): void {
  g.lineJoin = 'round';
  for (const [stroke, width] of [[INK, w + 8], [color, w]] as const) {
    g.strokeStyle = stroke; g.lineWidth = width;
    g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  }
}

const totalFlow = (st: Float64Array) => {
  let f = 0;
  for (let i = 0; i < ROOMS; i++) f += room(st, i, R.flow);
  return f;
};

// ======================================================================
// Reconciliation Engine
// ======================================================================
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
const DANGLE = { x: COUPLING.x - 30, y: COUPLING.y + 60 };

const engineSlots: SlotDef[] = [
  { id: 'housing', kind: 'plate', accepts: 'engine_plate', x: 400, y: 280, r: 0, rect: [40, 40, 720, 480] },
  ...fastenersAround('housing', 'screw', [[70, 70], [730, 70], [70, 490], [730, 490]], 0.9),
  {
    id: 'jar', kind: 'part', accepts: 'jar', x: JAR.x + JAR.w / 2, y: JAR.y + JAR.h / 2, r: 60, plate: 'housing',
    onRemove: (c, it) => { it.fill = room(c.state, c.room, R.pbFill); },
    onInstall: (c, it) => c.send(Cmd.JarFill, c.room, it.fill ?? 0),
  },
  { id: 'pin', kind: 'part', accepts: 'pin', x: PIN.x, y: PIN.y, r: 18, plate: 'housing' },
];

export const engineDef: MachineDef = {
  slots: engineSlots,
  initial: () => fitted(engineSlots, { jar: one('jar', { fill: 1 }) }),
  sync(c) {
    c.send(Cmd.JarPresent, c.room, c.has('jar') ? 1 : 0);
    c.send(Cmd.Linkage, c.room, c.has('pin') ? 1 : 0);
  },
  controls: [
    {
      id: 'drum', kind: 'hold', r: LEDGER.r, plate: 'housing', pos: () => [LEDGER.x, LEDGER.y],
      onHold: (c, on) => c.send(Cmd.Hold, c.room, on ? 1 : 0),
    },
    {
      id: 'tap', kind: 'drag', r: 24, plate: 'housing', pos: () => [TAP.x, TAP.y - 14],
      enabled: (c) => c.has('jar'),
      onDrag: (c, _dx, dy) => {
        if (Math.abs(dy) < 24) return false;
        c.send(Cmd.Drain, c.room, dy > 0 ? 1 : 0); // turn the handle down to open
        return true;
      },
    },
    {
      id: 'coupling', kind: 'drag', r: 26, plate: 'housing',
      pos: (c) => (room(c.state, c.room, R.supply) > 0.5 ? [COUPLING.x, COUPLING.y] : [DANGLE.x, DANGLE.y]),
      onDrag: (c, dx, dy) => {
        const connected = room(c.state, c.room, R.supply) > 0.5;
        if (connected && Math.hypot(dx, dy) > 45) { c.send(Cmd.Supply, c.room, 0); return true; }
        // Reconnect: drag the loose end back up to the collar.
        if (!connected && Math.hypot(DANGLE.x + dx - COUPLING.x, DANGLE.y + dy - COUPLING.y) < 22) { c.send(Cmd.Supply, c.room, 1); return true; }
        return false;
      },
    },
  ],

  drawInterior(g, c) {
    const st = c.state, i = c.room, v = c.vis;
    const dt = c.dt;
    const visScale = Math.min(c.timeScale, 6);
    const omega = room(st, i, R.ledgerOmega);
    const linked = c.has('pin');
    const valve = room(st, i, R.valve);
    v.ledger = (v.ledger ?? 0) + omega * visScale * dt;
    v.ref = (v.ref ?? 0) + visScale * dt;
    const atStop = (valve <= 0.0005 && omega < 1) || (valve >= 0.9995 && omega > 1);
    if (linked && !atStop) v.screw = (v.screw ?? 0) + (omega - 1) * 0.5 * visScale * dt * 6;
    v.coolant = (v.coolant ?? 0) + room(st, i, R.flow) * 1000 * 160 * dt;
    v.supply = (v.supply ?? 0) + dt * 0.6;
    v.bell = Math.max(0, (v.bell ?? 0) - dt * 0.9);
    const chimes = room(st, i, R.chimes);
    if (v.lastChimes !== undefined && chimes > v.lastChimes) v.bell = 1;
    v.lastChimes = chimes;

    background(g);

    // coolant pipe through the valve
    pipe(g, [[520, VALVE.y + 18], [PW, VALVE.y + 18]], tempColor(st[H.coolantTemp]).getStyle());
    flowDots(g, 520, VALVE.y + 18, PW, VALVE.y + 18, v.coolant, 9);

    // shafts and gear train
    const shaft = (pts: [number, number][]) => {
      g.lineWidth = 7; g.strokeStyle = INK; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.lineWidth = 3; g.strokeStyle = '#8c8c8c'; g.stroke();
    };
    shaft([[LEDGER.x, LEDGER.y], [LEDGER.x, JAR.y + 20]]);
    shaft([[REF.x, REF.y], [DIFF.x, DIFF.y], [LEDGER.x, LEDGER.y]]);
    shaft([[DIFF.x, DIFF.y], [DIFF.x, 90], [PIN.x, 90], [PIN.x, PIN.y]]);

    gear(g, REF.x, REF.y, REF.r, 24, v.ref, '#c99a45');
    // escapement
    g.save(); g.translate(REF.x, REF.y - REF.r - 26); g.rotate(Math.sin(v.ref * 8) * 0.28);
    g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(-26, 18); g.lineTo(0, 0); g.lineTo(26, 18); g.stroke();
    g.strokeStyle = '#d0a85a'; g.lineWidth = 3; g.stroke();
    g.restore();
    ledgerDrum(g, v.ledger, c.active?.id === 'drum');
    gear(g, DIFF.x, DIFF.y, 22, 10, (v.ledger - v.ref) / 2, '#b0b0b0');
    gear(g, DIFF.x - 18, DIFF.y + 18, 12, 8, -v.ref * 1.8, '#9c9c9c');
    gear(g, DIFF.x + 18, DIFF.y + 18, 12, 8, -v.ledger * 1.8, '#9c9c9c');

    const hasJar = c.has('jar');
    if (hasJar) jar(g, room(st, i, R.pbFill), room(st, i, R.pbTemp), v.ledger);
    else {
      socket(g, JAR.x + JAR.w / 2, JAR.y + JAR.h / 2, 58);
      // bare paddle spinning in air
      const span = Math.abs(Math.cos(v.ledger)) * 46 + 4;
      g.fillStyle = '#8f8f8f'; g.fillRect(LEDGER.x - span, JAR.y + 76, span * 2, 22); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(LEDGER.x - span, JAR.y + 76, span * 2, 22);
    }
    supplyTube(g, c, room(st, i, R.supply) > 0.5, hasJar ? room(st, i, R.pbFill) : 1, hasJar);
    if (hasJar) tap(g, c, room(st, i, R.drain) > 0.5, room(st, i, R.pbFill));
    leadScrew(g, v.screw ?? 0, valve, linked);
    valveBody(g, valve);
    // bell
    const swing = Math.sin(v.bell * 24) * v.bell * 0.5;
    g.save(); g.translate(BELL.x, BELL.y - 30); g.rotate(swing);
    g.beginPath(); g.moveTo(-22, 46); g.quadraticCurveTo(-22, 8, 0, 6); g.quadraticCurveTo(22, 8, 22, 46); g.closePath(); inked(g, '#e0b04a', 4);
    g.beginPath(); g.arc(0, 48 + swing * 10, 5, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    g.restore();
  },

  drawPlate(g, c) {
    g.beginPath(); g.roundRect(40, 40, 720, 480, 18);
    const brass = g.createLinearGradient(40, 40, 760, 520);
    brass.addColorStop(0, '#d8b260'); brass.addColorStop(0.5, '#b8893a'); brass.addColorStop(1, '#8f6526');
    g.fillStyle = brass; g.fill(); g.strokeStyle = INK; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#7a5520';
    for (let x = 110; x < 700; x += 40) { g.beginPath(); g.arc(x, 56, 3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x, 504, 3, 0, Math.PI * 2); g.fill(); }
    // porthole onto the ledger drum
    g.save();
    g.beginPath(); g.arc(LEDGER.x, LEDGER.y, 70, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2b2116'; g.fillRect(LEDGER.x - 70, LEDGER.y - 70, 140, 140);
    ledgerDrum(g, c.vis.ledger ?? 0, false);
    g.restore();
    g.beginPath(); g.arc(LEDGER.x, LEDGER.y, 70, 0, Math.PI * 2); g.strokeStyle = INK; g.lineWidth = 10; g.stroke();
    g.strokeStyle = '#e9d9a8'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = '#8f6526'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(370, 400); g.lineTo(430, 400); g.moveTo(400, 400); g.lineTo(400, 440); g.stroke();
  },
};

function ledgerDrum(g: CanvasRenderingContext2D, a: number, holding: boolean): void {
  gear(g, LEDGER.x, LEDGER.y, LEDGER.r, 36, a, '#d9ad55');
  g.save(); g.translate(LEDGER.x, LEDGER.y); g.rotate(a);
  g.beginPath(); g.arc(0, 0, LEDGER.r * 0.62, 0, Math.PI * 2); inked(g, '#efe3c4');
  g.fillStyle = INK; g.font = 'bold 15px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = 0; k < 20; k++) {
    g.save(); g.rotate((k / 20) * Math.PI * 2); g.translate(0, -LEDGER.r * 0.48); g.fillText(String((k * 7) % 10), 0, 0); g.restore();
  }
  g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); inked(g, '#3a2f22');
  g.restore();
  if (holding) {
    g.strokeStyle = '#e76f5199'; g.lineWidth = 6;
    g.beginPath(); g.arc(LEDGER.x, LEDGER.y, LEDGER.r + 10, 0, Math.PI * 2); g.stroke();
  }
}

function jar(g: CanvasRenderingContext2D, fill: number, pbTemp: number, paddle: number): void {
  const { x, y, w, h } = JAR;
  g.fillStyle = '#a77d36'; g.strokeStyle = INK; g.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    g.fillRect(x - 18, y + 14 + k * 17, 18, 8); g.strokeRect(x - 18, y + 14 + k * 17, 18, 8);
    g.fillRect(x + w, y + 14 + k * 17, 18, 8); g.strokeRect(x + w, y + 14 + k * 17, 18, 8);
  }
  g.beginPath(); g.roundRect(x, y, w, h, 10); g.fillStyle = '#cfe3e04d'; g.fill();
  const warm = Math.max(0, Math.min(1, (pbTemp - 14) / 20)); // thinner and paler when warm
  const lvl = (h - 12) * fill;
  g.fillStyle = `rgb(${Math.round(150 + 40 * warm)},${Math.round(98 + 34 * warm)},${Math.round(40 + 22 * warm)})`;
  g.beginPath(); g.roundRect(x + 6, y + h - 6 - lvl, w - 12, lvl, 6); g.fill();
  const span = Math.abs(Math.cos(paddle)) * (w / 2 - 14) + 4;
  g.fillStyle = '#8f8f8f'; g.lineWidth = 2;
  g.fillRect(x + w / 2 - span, y + h - 44, span * 2, 22); g.strokeRect(x + w / 2 - span, y + h - 44, span * 2, 22);
  g.beginPath(); g.roundRect(x, y, w, h, 10); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#b8893a'; g.fillRect(x - 6, y - 10, w + 12, 16); g.strokeRect(x - 6, y - 10, w + 12, 16);
  g.fillStyle = '#ffffff55'; g.fillRect(x + 10, y + 10, 8, h - 30);
}

function supplyTube(g: CanvasRenderingContext2D, c: Ctx, connected: boolean, fill: number, hasJar: boolean): void {
  const v = c.vis;
  const a = c.active?.id === 'coupling' ? c.active : null;
  const lid = { x: JAR.x + 20, y: JAR.y - 10 };
  const end = connected ? lid : { x: DANGLE.x + (a?.dx ?? 0), y: DANGLE.y + (a?.dy ?? 0) };
  const collar = connected && a ? { x: COUPLING.x + a.dx * 0.3, y: COUPLING.y + a.dy * 0.3 } : COUPLING;
  for (const [stroke, w] of [[INK, 16], ['#c2a06a', 10]] as const) {
    g.strokeStyle = stroke; g.lineWidth = w;
    g.beginPath(); g.moveTo(0, 330); g.bezierCurveTo(140, 330, 200, 270, collar.x, collar.y);
    if (connected) g.quadraticCurveTo(lid.x, collar.y, lid.x, lid.y);
    else g.quadraticCurveTo(collar.x + 6, collar.y + 40, end.x, end.y);
    g.stroke();
  }
  if (!connected || !hasJar) {
    // dripping peanut butter (onto the floor, if there's no jar)
    const dx = connected ? lid.x : end.x, dy = connected ? lid.y : end.y;
    g.fillStyle = '#a8732f'; g.beginPath(); g.arc(dx, dy + 8, 5 + Math.sin((v.supply ?? 0) * 3), 0, Math.PI * 2); g.fill();
  } else if (fill < 0.999) {
    const t = (v.supply ?? 0) % 1;
    const px = t < 0.7 ? (t / 0.7) * COUPLING.x : COUPLING.x + ((t - 0.7) / 0.3) * (lid.x - COUPLING.x);
    const py = t < 0.7 ? 330 - (t / 0.7) * 30 : COUPLING.y + ((t - 0.7) / 0.3) * (lid.y - COUPLING.y);
    g.fillStyle = '#a8732f'; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
  }
  g.beginPath(); g.roundRect(collar.x - 14, collar.y - 10, 28, 20, 4); inked(g, '#b8893a');
}

function tap(g: CanvasRenderingContext2D, c: Ctx, open: boolean, fill: number): void {
  const v = c.vis;
  const a = c.active?.id === 'tap' ? c.active : null;
  g.beginPath(); g.roundRect(JAR.x + JAR.w - 4, TAP.y - 6, 30, 12, 3); inked(g, '#b8893a');
  const turn = (open ? Math.PI / 2 : 0) + (a ? Math.max(-0.6, Math.min(0.6, a.dy / 50)) : 0);
  g.save(); g.translate(TAP.x, TAP.y - 14); g.rotate(turn);
  g.beginPath(); g.roundRect(-16, -4, 32, 8, 4); inked(g, '#a33b2c');
  g.restore();
  // drips and a growing puddle (purely visual; the sim tracks the jar level)
  if (open && fill > 0.001) v.drip = ((v.drip ?? 0) + c.dt * 3) % 1;
  if (open && fill > 0.001) {
    g.fillStyle = '#a8732f';
    const yy = TAP.y + 8 + (v.drip ?? 0) * (PH - 40 - TAP.y);
    g.beginPath(); g.ellipse(TAP.x + 10, yy, 3.5, 5, 0, 0, Math.PI * 2); g.fill();
    v.puddle = Math.min(1, (v.puddle ?? 0) + c.dt * 0.02);
  }
  if ((v.puddle ?? 0) > 0) {
    g.beginPath(); g.ellipse(TAP.x + 10, PH - 26, 10 + 60 * v.puddle, 4 + 7 * v.puddle, 0, 0, Math.PI * 2);
    g.fillStyle = '#8d5f27'; g.fill();
  }
}

function leadScrew(g: CanvasRenderingContext2D, screwAngle: number, valve: number, linked: boolean): void {
  const { x, top, bottom } = SCREW;
  g.fillStyle = '#9a9a9a'; g.strokeStyle = INK; g.lineWidth = 3;
  g.fillRect(x - 9, top, 18, bottom - top + 60); g.strokeRect(x - 9, top, 18, bottom - top + 60);
  g.strokeStyle = '#5a5a5a'; g.lineWidth = 2;
  const phase = ((screwAngle % 1) + 1) % 1;
  for (let y = top + phase * 14; y < bottom + 60; y += 14) { g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y + 6); g.stroke(); }
  const ny = top + 20 + (1 - valve) * (bottom - top - 40);
  g.beginPath(); g.roundRect(x - 26, ny - 14, 52, 28, 4); inked(g, '#c99a45');
  g.fillStyle = '#5a4326'; g.fillRect(x + 34, top, 8, bottom - top + 40); g.strokeRect(x + 34, top, 8, bottom - top + 40);
  g.beginPath(); g.roundRect(x - 18, PIN.y - 10, 36, 20, 4); inked(g, '#7d7d7d');
  if (linked) { g.beginPath(); g.arc(x, PIN.y, 7, 0, Math.PI * 2); inked(g, '#e9c46a'); }
  else { g.fillStyle = INK; g.beginPath(); g.arc(x, PIN.y, 5, 0, Math.PI * 2); g.fill(); }
}

function valveBody(g: CanvasRenderingContext2D, valve: number): void {
  const { x, y } = VALVE;
  g.fillStyle = '#b5b5b5'; g.strokeStyle = INK; g.lineWidth = 3;
  g.fillRect(x - 5, y - 40, 10, 30); g.strokeRect(x - 5, y - 40, 10, 30);
  g.beginPath(); g.roundRect(x - 34, y - 12, 68, 60, 10); inked(g, '#7a8c96');
  const gateH = 30 * (1 - valve);
  g.fillStyle = '#3a4750'; g.fillRect(x - 16, y + 3, 32, gateH); g.strokeRect(x - 16, y + 3, 32, gateH);
}

// ======================================================================
// Server rack: eight bays, six blades from the factory. Each blade is heat.
// ======================================================================
const RACK = { x: 250, y: 30, w: 300, h: 500 };
const BAYS = Array.from({ length: 8 }, (_, k) => ({ x: 400, y: 86 + k * 56 }));

const rackSlots: SlotDef[] = [
  { id: 'door', kind: 'plate', accepts: 'rack_door', x: 400, y: 280, r: 0, rect: [RACK.x, RACK.y, RACK.w, RACK.h] },
  ...fastenersAround('door', 'screw', [[RACK.x + RACK.w - 22, 70], [RACK.x + RACK.w - 22, 490]], 0.6),
  ...BAYS.map((b, k): SlotDef => ({ id: `bay${k}`, kind: 'part', accepts: 'blade', x: b.x, y: b.y, r: 26, plate: 'door' })),
];

export const rackDef: MachineDef = {
  slots: rackSlots,
  initial: () => fitted(rackSlots, { bay6: null, bay7: null }),
  sync(c) {
    c.send(Cmd.Blades, c.room, BAYS.filter((_, k) => c.has(`bay${k}`)).length);
  },
  controls: [
    {
      id: 'power', kind: 'drag', r: 60, pos: () => [650, 280],
      onDrag: leverDrag((c, on) => c.send(Cmd.Rack, c.room, on ? 1 : 0)),
    },
  ],
  drawInterior(g, c) {
    const st = c.state, i = c.room;
    const on = room(st, i, R.rackOn) > 0.5;
    const temp = room(st, i, R.temp);
    c.vis.t = (c.vis.t ?? 0) + c.dt;
    background(g, '#2c2a26', '#16140f');
    // heat haze above the cabinet, coloured by room temperature
    g.strokeStyle = tempColor(temp).getStyle(); g.lineWidth = 3; g.globalAlpha = 0.5;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      for (let yy = 0; yy < 26; yy += 2) g.lineTo(300 + k * 50 + Math.sin(yy * 0.4 + c.vis.t * 4 + k) * 4, 26 - yy);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.beginPath(); g.roundRect(RACK.x, RACK.y, RACK.w, RACK.h, 8); inked(g, '#232529', 5);
    for (let k = 0; k < BAYS.length; k++) {
      const b = BAYS[k];
      g.fillStyle = '#121316'; g.fillRect(RACK.x + 24, b.y - 22, RACK.w - 48, 44);
      g.strokeStyle = '#3c3f45'; g.lineWidth = 2; g.strokeRect(RACK.x + 24, b.y - 22, RACK.w - 48, 44);
      if (!c.has(`bay${k}`)) { socket(g, b.x, b.y, 20); continue; }
      g.beginPath(); g.roundRect(RACK.x + 30, b.y - 18, RACK.w - 60, 36, 3); inked(g, '#4a4e56', 2);
      g.fillStyle = '#2e7d4f'; g.fillRect(RACK.x + 44, b.y - 10, 130, 20);
      for (let j = 0; j < 5; j++) {
        const blink = on && Math.sin(c.vis.t * (3 + j * 1.7) + k * 2.3) > -0.2;
        g.fillStyle = blink ? (temp > 30 ? '#ff5a3c' : '#7dff8a') : '#1d3a22';
        g.fillRect(RACK.x + 190 + j * 12, b.y - 4, 7, 7);
      }
    }
  },
  drawPlate(g) {
    g.beginPath(); g.roundRect(RACK.x, RACK.y, RACK.w, RACK.h, 8); inked(g, '#3c3f45', 5);
    g.fillStyle = '#26282d';
    for (let y = RACK.y + 30; y < RACK.y + RACK.h - 20; y += 14) for (let x = RACK.x + 30; x < RACK.x + RACK.w - 40; x += 14) {
      g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
    }
    g.beginPath(); g.roundRect(RACK.x + RACK.w - 30, 250, 12, 60, 4); inked(g, '#9aa3a8', 2);
  },
  drawExterior(g, c) {
    lever(g, 650, 280, room(c.state, c.room, R.rackOn) > 0.5, c.active?.id === 'power' ? c.active.dy : 0);
  },
};

// ======================================================================
// Pump: motor, volute and impeller. The cover is bolted (wrench).
// ======================================================================
const VOL = { x: 540, y: 280, r: 130 };
const pumpSlots: SlotDef[] = [
  { id: 'cover', kind: 'plate', accepts: 'pump_cover', x: VOL.x, y: VOL.y, r: 0, rect: [VOL.x - 125, VOL.y - 125, 250, 250] },
  ...fastenersAround('cover', 'bolt', [0, 1, 2, 3].map((k): [number, number] => {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    return [VOL.x + Math.cos(a) * 100, VOL.y + Math.sin(a) * 100];
  }), 1.2, 'wrench'),
  { id: 'impeller', kind: 'part', accepts: 'impeller', x: VOL.x, y: VOL.y, r: 80, plate: 'cover' },
];

export const pumpDef: MachineDef = {
  slots: pumpSlots,
  initial: () => fitted(pumpSlots, {}),
  sync(c) { c.send(Cmd.Impeller, 0, c.has('impeller') ? 1 : 0); },
  controls: [
    {
      id: 'power', kind: 'drag', r: 60, pos: () => [160, 450],
      onDrag: leverDrag((c, on) => c.send(Cmd.Pump, 0, on ? 1 : 0)),
    },
  ],
  drawInterior(g, c) {
    const st = c.state;
    const on = (st[H.flags] & F.pumpOn) !== 0;
    const flow = totalFlow(st);
    c.vis.spin = (c.vis.spin ?? 0) + (on ? 1 : 0) * c.dt * 9;
    c.vis.flow = (c.vis.flow ?? 0) + flow * 1000 * 120 * c.dt;
    background(g, '#2e2a24', '#16130e');
    const water = tempColor(st[H.coolantTemp]).getStyle();
    pipe(g, [[VOL.x, PH], [VOL.x, VOL.y]], water, 40);
    pipe(g, [[VOL.x + 90, VOL.y - 90], [VOL.x + 90, 0]], water, 40);
    flowDots(g, VOL.x, PH, VOL.x, VOL.y + 60, c.vis.flow, 6);
    flowDots(g, VOL.x + 90, VOL.y - 120, VOL.x + 90, 0, c.vis.flow, 6);
    // motor
    g.beginPath(); g.roundRect(90, 190, 260, 180, 16); inked(g, '#9c3b2e', 4);
    g.strokeStyle = INK; g.lineWidth = 3;
    for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(112 + k * 26, 205); g.lineTo(112 + k * 26, 355); g.stroke(); }
    g.beginPath(); g.rect(350, VOL.y - 14, 70, 28); inked(g, '#8c8c8c');
    // volute casing
    g.beginPath(); g.arc(VOL.x, VOL.y, VOL.r, 0, Math.PI * 2); inked(g, '#56656e', 5);
    g.beginPath(); g.arc(VOL.x, VOL.y, 100, 0, Math.PI * 2); g.fillStyle = water; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
    if (c.has('impeller')) {
      g.save(); g.translate(VOL.x, VOL.y); g.rotate(c.vis.spin);
      g.beginPath(); g.arc(0, 0, 78, 0, Math.PI * 2); inked(g, '#b07a3a');
      g.lineWidth = 6;
      for (let k = 0; k < 7; k++) {
        const a = (k * Math.PI * 2) / 7;
        g.beginPath(); g.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
        g.quadraticCurveTo(Math.cos(a + 0.5) * 55, Math.sin(a + 0.5) * 55, Math.cos(a + 0.9) * 74, Math.sin(a + 0.9) * 74); g.stroke();
      }
      g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); inked(g, '#666');
      g.restore();
    } else {
      socket(g, VOL.x, VOL.y, 78);
      // the shaft still turns, uselessly
      g.save(); g.translate(VOL.x, VOL.y); g.rotate(c.vis.spin);
      g.beginPath(); g.rect(-6, -16, 12, 32); inked(g, '#8c8c8c'); g.restore();
    }
  },
  drawPlate(g) {
    g.beginPath(); g.arc(VOL.x, VOL.y, 122, 0, Math.PI * 2); inked(g, '#7d8f99', 5);
    g.beginPath(); g.arc(VOL.x, VOL.y, 40, 0, Math.PI * 2); inked(g, '#56656e', 3);
    g.strokeStyle = '#5f707a'; g.lineWidth = 4;
    g.beginPath(); g.arc(VOL.x, VOL.y, 80, 0, Math.PI * 2); g.stroke();
  },
  drawExterior(g, c) {
    lever(g, 160, 450, (c.state[H.flags] & F.pumpOn) !== 0, c.active?.id === 'power' ? c.active.dy : 0);
  },
};

// ======================================================================
// Chiller: two fan mounts (one fitted), a fuse, a compressor and coil.
// ======================================================================
const FANS = [{ x: 250, y: 200 }, { x: 550, y: 200 }];
const FUSE = { x: 400, y: 320 };
const chillerSlots: SlotDef[] = [
  { id: 'grille', kind: 'plate', accepts: 'chiller_grille', x: 400, y: 210, r: 0, rect: [80, 60, 640, 300] },
  ...fastenersAround('grille', 'screw', [[100, 80], [700, 80], [100, 340], [700, 340]], 0.9),
  ...FANS.map((f, k): SlotDef => ({ id: `fan${k}`, kind: 'part', accepts: 'fan', x: f.x, y: f.y, r: 90, plate: 'grille' })),
  { id: 'fuse', kind: 'part', accepts: 'fuse', x: FUSE.x, y: FUSE.y, r: 28, plate: 'grille' },
];

export const chillerDef: MachineDef = {
  slots: chillerSlots,
  initial: () => fitted(chillerSlots, { fan1: null }),
  sync(c) {
    c.send(Cmd.Fans, 0, FANS.filter((_, k) => c.has(`fan${k}`)).length);
    c.send(Cmd.Fuse, 0, c.has('fuse') ? 1 : 0);
  },
  controls: [
    {
      id: 'power', kind: 'drag', r: 60, pos: () => [690, 450],
      onDrag: leverDrag((c, on) => c.send(Cmd.Chiller, 0, on ? 1 : 0)),
    },
  ],
  drawInterior(g, c) {
    const st = c.state;
    const running = (st[H.flags] & F.chillerOn) !== 0 && c.has('fuse');
    c.vis.spin = (c.vis.spin ?? 0) + (running ? 1 : 0) * c.dt * 14;
    background(g, '#2a3036', '#14181b');
    g.beginPath(); g.roundRect(60, 40, 680, 480, 14); inked(g, '#7f97a6', 5);
    g.beginPath(); g.roundRect(80, 60, 640, 300, 8); g.fillStyle = '#26323a'; g.fill();
    FANS.forEach((f, k) => {
      if (!c.has(`fan${k}`)) { socket(g, f.x, f.y, 88); return; }
      g.beginPath(); g.arc(f.x, f.y, 92, 0, Math.PI * 2); inked(g, '#3d4c56');
      g.save(); g.translate(f.x, f.y); g.rotate(c.vis.spin + k);
      for (let b = 0; b < 5; b++) {
        const a = (b * Math.PI * 2) / 5;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a + 0.7) * 70, Math.sin(a + 0.7) * 70, Math.cos(a) * 82, Math.sin(a) * 82);
        g.closePath(); inked(g, '#c4cfd6');
      }
      g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); inked(g, '#56656e');
      g.restore();
    });
    // fuse clips
    g.beginPath(); g.roundRect(FUSE.x - 46, FUSE.y - 18, 92, 36, 6); inked(g, '#1c1c1c');
    g.fillStyle = '#c9c9c9'; g.fillRect(FUSE.x - 40, FUSE.y - 12, 12, 24); g.fillRect(FUSE.x + 28, FUSE.y - 12, 12, 24);
    if (c.has('fuse')) {
      g.beginPath(); g.roundRect(FUSE.x - 30, FUSE.y - 10, 60, 20, 9); inked(g, '#e8e0cc');
      g.strokeStyle = '#a33'; g.lineWidth = 2; g.beginPath(); g.moveTo(FUSE.x - 20, FUSE.y); g.lineTo(FUSE.x + 20, FUSE.y); g.stroke();
    }
    // compressor and coil, below the grille (always visible)
    g.beginPath(); g.roundRect(110, 385, 200, 110, 20); inked(g, '#4d6270');
    g.strokeStyle = tempColor(st[H.coolantTemp]).getStyle(); g.lineWidth = 8;
    g.beginPath();
    for (let k = 0; k < 8; k++) { g.moveTo(340 + k * 34, 390); g.lineTo(340 + k * 34, 490); }
    g.stroke();
    if (running) {
      g.fillStyle = '#e9f4fbcc';
      for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(345 + k * 20, 392 + (k % 3) * 4, 4, 0, Math.PI * 2); g.fill(); }
    }
  },
  drawPlate(g) {
    g.beginPath(); g.roundRect(80, 60, 640, 300, 8); inked(g, '#8ea5b3', 4);
    g.strokeStyle = '#5f7480'; g.lineWidth = 4;
    for (let y = 90; y < 340; y += 18) { g.beginPath(); g.moveTo(120, y); g.lineTo(680, y); g.stroke(); }
  },
  drawExterior(g, c) {
    lever(g, 690, 450, (c.state[H.flags] & F.chillerOn) !== 0, c.active?.id === 'power' ? c.active.dy : 0);
  },
};
