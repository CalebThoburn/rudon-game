// How each assembly looks and what you can do to it. The art draws whatever
// parts are actually present (it never assumes), so the same drawing serves as
// the inspect panel and as the machine's front in the world.
import { CHILLER, ENGINE as EN, PUMP, RACK, works } from './assemblies';
import { leverPos, PW, PH, type Ctx, type PanelDef } from './inspect';
import { drawItem, type Item } from './items';
import { Cmd, H, R, ROOMS, room } from './simLayout';
import { tempColor } from './sprites';

const INK = '#2a2118';

// ---------------------------------------------------------------- helpers
function inked(g: CanvasRenderingContext2D, fill: string, w = 3): void {
  g.fillStyle = fill; g.fill(); g.strokeStyle = INK; g.lineWidth = w; g.stroke();
}

function background(g: CanvasRenderingContext2D, c: Ctx, top = '#3b2c1a', bottom = '#1f170e'): void {
  if (c.world) return;
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

/** An empty mounting point. */
function socket(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#00000055'; g.fill();
  g.setLineDash([6, 6]); g.strokeStyle = '#ffffff22'; g.lineWidth = 2; g.stroke();
  g.restore();
}

/** A knife switch seen from the front: knob slides up (on) and down (off). */
function lever(g: CanvasRenderingContext2D, c: Ctx, id: string, x: number, top: number, bottom: number): void {
  const p = leverPos(c, id, top, bottom);
  const y = top + p * (bottom - top);
  g.beginPath(); g.roundRect(x - 24, top - 34, 48, bottom - top + 68, 10); inked(g, '#4a4a4a');
  g.fillStyle = '#1a1a1a'; g.fillRect(x - 5, top, 10, bottom - top);
  g.fillStyle = c.switches[id] ? '#7dff8a' : '#ff5a3c';
  g.beginPath(); g.arc(x, top - 22, 6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.roundRect(x - 20, y - 12, 40, 24, 8); inked(g, '#c0392b');
  g.strokeStyle = '#ffffff44'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 12, y - 5); g.lineTo(x + 12, y - 5); g.stroke();
}

function pipe(g: CanvasRenderingContext2D, pts: [number, number][], color: string, w = 18): void {
  g.lineJoin = 'round';
  for (const [stroke, width] of [[INK, w + 8], [color, w]] as const) {
    g.strokeStyle = stroke; g.lineWidth = width;
    g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  }
}

function flowDots(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, offset: number, n = 8): void {
  g.fillStyle = '#ffffffaa';
  const len = Math.hypot(x1 - x0, y1 - y0);
  for (let k = 0; k < n; k++) {
    const s = ((offset + (k * len) / n) % len) / len;
    g.beginPath(); g.arc(x0 + (x1 - x0) * s, y0 + (y1 - y0) * s, 3, 0, Math.PI * 2); g.fill();
  }
}

function shaft(g: CanvasRenderingContext2D, pts: [number, number][]): void {
  g.lineWidth = 7; g.strokeStyle = INK; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#8c8c8c'; g.stroke();
}

const onSite = (c: Ctx) => c.room >= 0;
const sim = (c: Ctx, field: number, fallback = 0) => (onSite(c) ? room(c.state, c.room, field) : fallback);
const totalFlow = (st: Float64Array) => {
  let f = 0;
  for (let i = 0; i < ROOMS; i++) f += room(st, i, R.flow);
  return f;
};
const noSync = () => {};

// ======================================================================
// Reconciliation Engine
// ======================================================================
const DANGLE = { x: EN.COUPLING.x - 30, y: EN.COUPLING.y + 60 };

export const engineDef: PanelDef = {
  front: { rect: [30, 20, 740, 520], size: [1.7, 1.2] },
  sync: noSync, // the world derives engine flags from the parts (see world.ts)
  onRemove(c, slot, item) {
    if (!onSite(c)) return;
    if (slot === 'jar') {
      const butter = item.parts?.butter?.item;
      if (butter) butter.fill = room(c.state, c.room, R.pbFill);
    }
    if (slot === 'valve') item.open = room(c.state, c.room, R.valve);
  },
  onInstall(c, slot, item) {
    if (!onSite(c)) return;
    if (slot === 'jar') c.send(Cmd.JarFill, c.room, item.parts?.butter?.item?.fill ?? 0);
    if (slot === 'valve') c.send(Cmd.ValveSet, c.room, item.open ?? 0.3);
  },
  controls: [
    {
      id: 'drum', kind: 'hold', r: EN.LEDGER.r, behind: 'housing', pos: () => [EN.LEDGER.x, EN.LEDGER.y],
      enabled: (c) => onSite(c) && c.has('ledger'),
      onHold: (c, on) => c.send(Cmd.Hold, c.room, on ? 1 : 0),
    },
    {
      id: 'tap', kind: 'drag', r: 24, behind: 'housing', pos: () => [EN.TAP.x, EN.TAP.y - 14],
      enabled: (c) => onSite(c) && c.has('jar'),
      onDrag: (c, _dx, dy) => {
        if (Math.abs(dy) < 24) return false;
        c.send(Cmd.Drain, c.room, dy > 0 ? 1 : 0);
        return true;
      },
    },
    {
      id: 'coupling', kind: 'drag', r: 26, behind: 'housing',
      enabled: onSite,
      pos: (c) => (sim(c, R.supply, 1) > 0.5 ? [EN.COUPLING.x, EN.COUPLING.y] : [DANGLE.x, DANGLE.y]),
      onDrag: (c, dx, dy) => {
        const connected = room(c.state, c.room, R.supply) > 0.5;
        if (connected && Math.hypot(dx, dy) > 45) { c.send(Cmd.Supply, c.room, 0); return true; }
        if (!connected && Math.hypot(DANGLE.x + dx - EN.COUPLING.x, DANGLE.y + dy - EN.COUPLING.y) < 22) { c.send(Cmd.Supply, c.room, 1); return true; }
        return false;
      },
    },
  ],

  drawInterior(g, c) {
    const v = c.vis;
    const visScale = Math.min(c.timeScale, 6);
    const has = c.has;
    const omega = sim(c, R.ledgerOmega);
    const refOmega = has('ref') && has('escapement') && onSite(c) ? 1 : 0;
    const valve = sim(c, R.valve, c.item('valve')?.open ?? 0.3);
    const linked = has('pin') && has('screw') && has('diff');
    v.ledger = (v.ledger ?? 0) + omega * visScale * c.dt;
    v.ref = (v.ref ?? 0) + refOmega * visScale * c.dt;
    const atStop = (valve <= 0.0005 && omega < refOmega) || (valve >= 0.9995 && omega > refOmega);
    if (linked && !atStop) v.screw = (v.screw ?? 0) + (omega - refOmega) * 0.5 * visScale * c.dt * 6;
    v.coolant = (v.coolant ?? 0) + sim(c, R.flow) * 1000 * 160 * c.dt;
    v.supply = (v.supply ?? 0) + c.dt * 0.6;
    v.bell = Math.max(0, (v.bell ?? 0) - c.dt * 0.9);
    const chimes = sim(c, R.chimes);
    if (v.lastChimes !== undefined && chimes > v.lastChimes) v.bell = 1;
    v.lastChimes = chimes;

    background(g, c);
    // chassis
    g.beginPath(); g.roundRect(50, 50, 700, 460, 16); inked(g, '#5a4326', 4);
    g.beginPath(); g.roundRect(64, 64, 672, 432, 10); g.fillStyle = '#2b2116'; g.fill();

    // the site's coolant pipe runs through, if the engine stands on one
    if (onSite(c)) {
      pipe(g, [[520, EN.VALVE.y + 18], [PW - 10, EN.VALVE.y + 18]], tempColor(c.state[H.coolantTemp]).getStyle());
      if (has('valve')) flowDots(g, 520, EN.VALVE.y + 18, PW - 10, EN.VALVE.y + 18, v.coolant, 9);
    }

    // shafts, only between parts that are there
    if (has('ledger') && has('jar')) shaft(g, [[EN.LEDGER.x, EN.LEDGER.y], [EN.LEDGER.x, EN.JAR.y + 20]]);
    if (has('diff')) {
      if (has('ref')) shaft(g, [[EN.REF.x, EN.REF.y], [EN.DIFF.x, EN.DIFF.y]]);
      if (has('ledger')) shaft(g, [[EN.DIFF.x, EN.DIFF.y], [EN.LEDGER.x, EN.LEDGER.y]]);
      if (has('pin')) shaft(g, [[EN.DIFF.x, EN.DIFF.y], [EN.DIFF.x, 90], [EN.PIN.x, 90], [EN.PIN.x, EN.PIN.y]]);
    }
    if (has('motor') && has('ledger')) shaft(g, [[EN.MOTOR.x, EN.MOTOR.y], [EN.LEDGER.x, EN.LEDGER.y]]);

    if (has('ref')) gear(g, EN.REF.x, EN.REF.y, EN.REF.r, 24, v.ref, '#c99a45'); else socket(g, EN.REF.x, EN.REF.y, 62);
    if (has('escapement')) {
      g.save(); g.translate(EN.REF.x, EN.REF.y - EN.REF.r - 26); g.rotate(Math.sin(v.ref * 8) * 0.28);
      g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(-26, 18); g.lineTo(0, 0); g.lineTo(26, 18); g.stroke();
      g.strokeStyle = '#d0a85a'; g.lineWidth = 3; g.stroke();
      g.restore();
    } else socket(g, EN.REF.x, EN.REF.y - EN.REF.r - 18, 18);
    if (has('ledger')) ledgerDrum(g, v.ledger, c.active?.id === 'drum'); else socket(g, EN.LEDGER.x, EN.LEDGER.y, 86);
    if (has('diff')) {
      gear(g, EN.DIFF.x, EN.DIFF.y, 22, 10, (v.ledger - v.ref) / 2, '#b0b0b0');
      gear(g, EN.DIFF.x - 18, EN.DIFF.y + 18, 12, 8, -v.ref * 1.8, '#9c9c9c');
      gear(g, EN.DIFF.x + 18, EN.DIFF.y + 18, 12, 8, -v.ledger * 1.8, '#9c9c9c');
    } else socket(g, EN.DIFF.x, EN.DIFF.y + 6, 26);
    if (has('motor')) {
      g.beginPath(); g.roundRect(EN.MOTOR.x - 28, EN.MOTOR.y - 20, 56, 40, 6); inked(g, '#5a6a3a');
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); for (let k = 0; k < 5; k++) g.arc(EN.MOTOR.x - 16 + k * 8, EN.MOTOR.y, 5, 0, Math.PI); g.stroke();
    } else socket(g, EN.MOTOR.x, EN.MOTOR.y, 26);

    const jarItem = c.item('jar');
    if (jarItem) jar(g, jarItem, sim(c, R.pbFill, jarItem.parts?.butter?.item?.fill ?? 0), sim(c, R.pbTemp, 22), v.ledger);
    else {
      socket(g, EN.JAR.x + EN.JAR.w / 2, EN.JAR.y + EN.JAR.h / 2, 58);
      if (has('ledger')) {
        const span = Math.abs(Math.cos(v.ledger)) * 46 + 4;
        g.fillStyle = '#8f8f8f'; g.fillRect(EN.LEDGER.x - span, EN.JAR.y + 76, span * 2, 22);
        g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(EN.LEDGER.x - span, EN.JAR.y + 76, span * 2, 22);
      }
    }
    if (onSite(c)) supplyTube(g, c, sim(c, R.supply, 1) > 0.5, jarItem ? sim(c, R.pbFill) : 1, !!jarItem);
    if (jarItem && onSite(c)) tap(g, c, sim(c, R.drain) > 0.5, sim(c, R.pbFill));
    if (has('screw')) leadScrew(g, v.screw ?? 0, valve, has('pin')); else socket(g, EN.SCREW.x, 260, 30);
    if (!has('pin')) { g.fillStyle = INK; g.beginPath(); g.arc(EN.PIN.x, EN.PIN.y, 5, 0, Math.PI * 2); g.fill(); }
    if (has('valve')) valveBody(g, valve); else socket(g, EN.VALVE.x, EN.VALVE.y + 14, 32);
    // bell
    const swing = Math.sin(v.bell * 24) * v.bell * 0.5;
    g.save(); g.translate(EN.BELL.x, EN.BELL.y - 30); g.rotate(swing);
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
    // porthole onto the ledger drum (or onto nothing)
    g.save();
    g.beginPath(); g.arc(EN.LEDGER.x, EN.LEDGER.y, 70, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2b2116'; g.fillRect(EN.LEDGER.x - 70, EN.LEDGER.y - 70, 140, 140);
    if (c.has('ledger')) ledgerDrum(g, c.vis.ledger ?? 0, false);
    g.restore();
    g.beginPath(); g.arc(EN.LEDGER.x, EN.LEDGER.y, 70, 0, Math.PI * 2); g.strokeStyle = INK; g.lineWidth = 10; g.stroke();
    g.strokeStyle = '#e9d9a8'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = '#8f6526'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(370, 400); g.lineTo(430, 400); g.moveTo(400, 400); g.lineTo(400, 440); g.stroke();
  },
};

function ledgerDrum(g: CanvasRenderingContext2D, a: number, holding: boolean): void {
  gear(g, EN.LEDGER.x, EN.LEDGER.y, EN.LEDGER.r, 36, a, '#d9ad55');
  g.save(); g.translate(EN.LEDGER.x, EN.LEDGER.y); g.rotate(a);
  g.beginPath(); g.arc(0, 0, EN.LEDGER.r * 0.62, 0, Math.PI * 2); inked(g, '#efe3c4');
  g.fillStyle = INK; g.font = 'bold 15px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = 0; k < 20; k++) {
    g.save(); g.rotate((k / 20) * Math.PI * 2); g.translate(0, -EN.LEDGER.r * 0.48); g.fillText(String((k * 7) % 10), 0, 0); g.restore();
  }
  g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); inked(g, '#3a2f22');
  g.restore();
  if (holding) {
    g.strokeStyle = '#e76f5199'; g.lineWidth = 6;
    g.beginPath(); g.arc(EN.LEDGER.x, EN.LEDGER.y, EN.LEDGER.r + 10, 0, Math.PI * 2); g.stroke();
  }
}

function jar(g: CanvasRenderingContext2D, item: Item, fill: number, pbTemp: number, paddle: number): void {
  const { x, y, w, h } = EN.JAR;
  const butter = item.parts?.butter?.item;
  const f = butter ? fill : 0;
  g.fillStyle = '#a77d36'; g.strokeStyle = INK; g.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    g.fillRect(x - 18, y + 14 + k * 17, 18, 8); g.strokeRect(x - 18, y + 14 + k * 17, 18, 8);
    g.fillRect(x + w, y + 14 + k * 17, 18, 8); g.strokeRect(x + w, y + 14 + k * 17, 18, 8);
  }
  g.beginPath(); g.roundRect(x, y, w, h, 10); g.fillStyle = '#cfe3e04d'; g.fill();
  const warm = Math.max(0, Math.min(1, (pbTemp - 14) / 20)); // thinner and paler when warm
  const lvl = (h - 12) * f;
  g.fillStyle = `rgb(${Math.round(150 + 40 * warm)},${Math.round(98 + 34 * warm)},${Math.round(40 + 22 * warm)})`;
  g.beginPath(); g.roundRect(x + 6, y + h - 6 - lvl, w - 12, lvl, 6); g.fill();
  const span = Math.abs(Math.cos(paddle)) * (w / 2 - 14) + 4;
  g.fillStyle = '#8f8f8f'; g.lineWidth = 2;
  g.fillRect(x + w / 2 - span, y + h - 44, span * 2, 22); g.strokeRect(x + w / 2 - span, y + h - 44, span * 2, 22);
  g.beginPath(); g.roundRect(x, y, w, h, 10); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
  if (item.parts?.lid?.item) { g.fillStyle = '#b8893a'; g.fillRect(x - 6, y - 10, w + 12, 16); g.strokeRect(x - 6, y - 10, w + 12, 16); }
  g.fillStyle = '#ffffff55'; g.fillRect(x + 10, y + 10, 8, h - 30);
}

function supplyTube(g: CanvasRenderingContext2D, c: Ctx, connected: boolean, fill: number, hasJar: boolean): void {
  const v = c.vis;
  const a = c.active?.id === 'coupling' ? c.active : null;
  const lid = { x: EN.JAR.x + 20, y: EN.JAR.y - 10 };
  const end = connected ? lid : { x: DANGLE.x + (a?.dx ?? 0), y: DANGLE.y + (a?.dy ?? 0) };
  const collar = connected && a ? { x: EN.COUPLING.x + a.dx * 0.3, y: EN.COUPLING.y + a.dy * 0.3 } : EN.COUPLING;
  for (const [stroke, w] of [[INK, 16], ['#c2a06a', 10]] as const) {
    g.strokeStyle = stroke; g.lineWidth = w;
    g.beginPath(); g.moveTo(64, 330); g.bezierCurveTo(160, 330, 200, 270, collar.x, collar.y);
    if (connected) g.quadraticCurveTo(lid.x, collar.y, lid.x, lid.y);
    else g.quadraticCurveTo(collar.x + 6, collar.y + 40, end.x, end.y);
    g.stroke();
  }
  if (!connected || !hasJar) {
    const dx = connected ? lid.x : end.x, dy = connected ? lid.y : end.y;
    g.fillStyle = '#a8732f'; g.beginPath(); g.arc(dx, dy + 8, 5 + Math.sin((v.supply ?? 0) * 3), 0, Math.PI * 2); g.fill();
  } else if (fill < 0.999) {
    const t = (v.supply ?? 0) % 1;
    const px = t < 0.7 ? 64 + (t / 0.7) * (EN.COUPLING.x - 64) : EN.COUPLING.x + ((t - 0.7) / 0.3) * (lid.x - EN.COUPLING.x);
    const py = t < 0.7 ? 330 - (t / 0.7) * 30 : EN.COUPLING.y + ((t - 0.7) / 0.3) * (lid.y - EN.COUPLING.y);
    g.fillStyle = '#a8732f'; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
  }
  g.beginPath(); g.roundRect(collar.x - 14, collar.y - 10, 28, 20, 4); inked(g, '#b8893a');
}

function tap(g: CanvasRenderingContext2D, c: Ctx, open: boolean, fill: number): void {
  const v = c.vis;
  const a = c.active?.id === 'tap' ? c.active : null;
  g.beginPath(); g.roundRect(EN.JAR.x + EN.JAR.w - 4, EN.TAP.y - 6, 30, 12, 3); inked(g, '#b8893a');
  const turn = (open ? Math.PI / 2 : 0) + (a ? Math.max(-0.6, Math.min(0.6, a.dy / 50)) : 0);
  g.save(); g.translate(EN.TAP.x, EN.TAP.y - 14); g.rotate(turn);
  g.beginPath(); g.roundRect(-16, -4, 32, 8, 4); inked(g, '#a33b2c');
  g.restore();
  if (open && fill > 0.001) {
    v.drip = ((v.drip ?? 0) + c.dt * 3) % 1;
    g.fillStyle = '#a8732f';
    g.beginPath(); g.ellipse(EN.TAP.x + 10, EN.TAP.y + 8 + v.drip * 40, 3.5, 5, 0, 0, Math.PI * 2); g.fill();
  }
}

function leadScrew(g: CanvasRenderingContext2D, screwAngle: number, valve: number, linked: boolean): void {
  const { x, top, bottom } = EN.SCREW;
  g.fillStyle = '#9a9a9a'; g.strokeStyle = INK; g.lineWidth = 3;
  g.fillRect(x - 9, top, 18, bottom - top + 60); g.strokeRect(x - 9, top, 18, bottom - top + 60);
  g.strokeStyle = '#5a5a5a'; g.lineWidth = 2;
  const phase = ((screwAngle % 1) + 1) % 1;
  for (let y = top + phase * 14; y < bottom + 60; y += 14) { g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y + 6); g.stroke(); }
  const ny = top + 20 + (1 - valve) * (bottom - top - 40);
  g.beginPath(); g.roundRect(x - 26, ny - 14, 52, 28, 4); inked(g, '#c99a45');
  g.fillStyle = '#5a4326'; g.fillRect(x + 34, top, 8, bottom - top + 40); g.strokeRect(x + 34, top, 8, bottom - top + 40);
  g.beginPath(); g.roundRect(x - 18, EN.PIN.y - 10, 36, 20, 4); inked(g, '#7d7d7d');
  if (linked) { g.beginPath(); g.arc(x, EN.PIN.y, 7, 0, Math.PI * 2); inked(g, '#e9c46a'); }
}

function valveBody(g: CanvasRenderingContext2D, valve: number): void {
  const { x, y } = EN.VALVE;
  g.fillStyle = '#b5b5b5'; g.strokeStyle = INK; g.lineWidth = 3;
  g.fillRect(x - 5, y - 40, 10, 30); g.strokeRect(x - 5, y - 40, 10, 30);
  g.beginPath(); g.roundRect(x - 34, y - 12, 68, 60, 10); inked(g, '#7a8c96');
  const gateH = 30 * (1 - valve);
  g.fillStyle = '#3a4750'; g.fillRect(x - 16, y + 3, 32, gateH); g.strokeRect(x - 16, y + 3, 32, gateH);
}

// ======================================================================
// Server rack
// ======================================================================
const RACK_LEVER = { x: 640, top: 230, bottom: 330 };

export const rackDef: PanelDef = {
  front: { rect: [236, 8, 448, 532], size: [1.15, 1.37] },
  sync: noSync,
  controls: [
    {
      id: 'power', kind: 'lever', r: 50, pos: () => [RACK_LEVER.x, 280],
      track: { top: RACK_LEVER.top, bottom: RACK_LEVER.bottom },
    },
  ],
  drawInterior(g, c) {
    const temp = c.room >= 0 ? room(c.state, c.room, R.temp) : 22;
    const on = !!c.switches.power;
    c.vis.t = (c.vis.t ?? 0) + c.dt;
    background(g, c, '#2c2a26', '#16140f');
    if (!c.world) {
      g.strokeStyle = tempColor(temp).getStyle(); g.lineWidth = 3; g.globalAlpha = 0.5;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        for (let yy = 0; yy < 26; yy += 2) g.lineTo(300 + k * 50 + Math.sin(yy * 0.4 + c.vis.t * 4 + k) * 4, 26 - yy);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.beginPath(); g.roundRect(RACK.x, RACK.y, RACK.w, RACK.h, 8); inked(g, '#232529', 5);
    RACK.bays.forEach((b, k) => {
      g.fillStyle = '#121316'; g.fillRect(RACK.x + 24, b.y - 22, RACK.w - 48, 44);
      g.strokeStyle = '#3c3f45'; g.lineWidth = 2; g.strokeRect(RACK.x + 24, b.y - 22, RACK.w - 48, 44);
      const blade = c.item(`bay${k}`);
      if (!blade) { socket(g, b.x, b.y, 20); return; }
      const alive = works(blade);
      g.beginPath(); g.roundRect(RACK.x + 30, b.y - 18, RACK.w - 60, 36, 3); inked(g, blade.parts?.lid?.item ? '#4a4e56' : '#2a2c31', 2);
      if (blade.parts?.board?.item) { g.fillStyle = '#2e7d4f'; g.fillRect(RACK.x + 44, b.y - 10, 130, 20); }
      for (let j = 0; j < 5; j++) {
        const blink = on && alive && Math.sin(c.vis.t * (3 + j * 1.7) + k * 2.3) > -0.2;
        g.fillStyle = blink ? (temp > 30 ? '#ff5a3c' : '#7dff8a') : '#1d3a22';
        g.fillRect(RACK.x + 190 + j * 12, b.y - 4, 7, 7);
      }
    });
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
    lever(g, c, 'power', RACK_LEVER.x, RACK_LEVER.top, RACK_LEVER.bottom);
  },
};

// ======================================================================
// Pump
// ======================================================================
const V = PUMP.VOL;
const PUMP_LEVER = { x: 150, top: 420, bottom: 500 };

export const pumpDef: PanelDef = {
  front: { rect: [70, 130, 620, 400], size: [1.6, 1.03] },
  sync: noSync,
  controls: [
    {
      id: 'power', kind: 'lever', r: 50, pos: () => [PUMP_LEVER.x, (PUMP_LEVER.top + PUMP_LEVER.bottom) / 2],
      track: { top: PUMP_LEVER.top, bottom: PUMP_LEVER.bottom },
    },
  ],
  drawInterior(g, c) {
    const st = c.state;
    const motor = c.item('motor');
    const spinning = !!c.switches.power && works(motor);
    const flow = c.room >= 0 ? totalFlow(st) : 0;
    c.vis.spin = (c.vis.spin ?? 0) + (spinning ? 1 : 0) * c.dt * 9;
    c.vis.flow = (c.vis.flow ?? 0) + flow * 1000 * 120 * c.dt;
    background(g, c, '#2e2a24', '#16130e');
    const water = tempColor(st[H.coolantTemp]).getStyle();
    if (c.room >= 0) {
      pipe(g, [[V.x, PH - 30], [V.x, V.y]], water, 40);
      pipe(g, [[V.x + 90, V.y - 90], [V.x + 90, 140]], water, 40);
      flowDots(g, V.x, PH - 30, V.x, V.y + 60, c.vis.flow, 6);
    }
    // base plate
    g.beginPath(); g.roundRect(80, 400, 600, 40, 6); inked(g, '#4a4a4a', 4);
    if (motor) {
      g.beginPath(); g.roundRect(90, 190, 260, 180, 16); inked(g, '#9c3b2e', 4);
      g.strokeStyle = INK; g.lineWidth = 3;
      for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(112 + k * 26, 205); g.lineTo(112 + k * 26, 355); g.stroke(); }
      if (!motor.parts?.cap?.item) { g.beginPath(); g.arc(PUMP.MOTOR.x, PUMP.MOTOR.y, 60, 0, Math.PI * 2); inked(g, '#2a1a14'); }
      g.beginPath(); g.rect(350, V.y - 14, 70, 28); inked(g, '#8c8c8c');
    } else socket(g, PUMP.MOTOR.x, PUMP.MOTOR.y, 90);
    // volute casing
    g.beginPath(); g.arc(V.x, V.y, V.r, 0, Math.PI * 2); inked(g, '#56656e', 5);
    g.beginPath(); g.arc(V.x, V.y, 100, 0, Math.PI * 2); g.fillStyle = water; g.globalAlpha = c.room >= 0 ? 0.35 : 0.08; g.fill(); g.globalAlpha = 1;
    if (c.has('impeller')) {
      g.save(); g.translate(V.x, V.y); g.rotate(c.vis.spin);
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
      socket(g, V.x, V.y, 78);
      if (motor) { g.save(); g.translate(V.x, V.y); g.rotate(c.vis.spin); g.beginPath(); g.rect(-6, -16, 12, 32); inked(g, '#8c8c8c'); g.restore(); }
    }
  },
  drawPlate(g) {
    g.beginPath(); g.arc(V.x, V.y, 122, 0, Math.PI * 2); inked(g, '#7d8f99', 5);
    g.beginPath(); g.arc(V.x, V.y, 40, 0, Math.PI * 2); inked(g, '#56656e', 3);
    g.strokeStyle = '#5f707a'; g.lineWidth = 4;
    g.beginPath(); g.arc(V.x, V.y, 80, 0, Math.PI * 2); g.stroke();
  },
  drawExterior(g, c) {
    lever(g, c, 'power', PUMP_LEVER.x, PUMP_LEVER.top, PUMP_LEVER.bottom);
  },
};

// ======================================================================
// Chiller
// ======================================================================
const CH_LEVER = { x: 690, top: 410, bottom: 490 };

export const chillerDef: PanelDef = {
  front: { rect: [50, 30, 700, 500], size: [2.2, 1.57] },
  sync: noSync,
  controls: [
    {
      id: 'power', kind: 'lever', r: 50, pos: () => [CH_LEVER.x, (CH_LEVER.top + CH_LEVER.bottom) / 2],
      track: { top: CH_LEVER.top, bottom: CH_LEVER.bottom },
    },
  ],
  drawInterior(g, c) {
    const running = !!c.switches.power && c.has('fuse') && c.has('compressor');
    c.vis.spin = (c.vis.spin ?? 0) + (running ? 1 : 0) * c.dt * 14;
    background(g, c, '#2a3036', '#14181b');
    g.beginPath(); g.roundRect(60, 40, 680, 480, 14); inked(g, '#7f97a6', 5);
    g.beginPath(); g.roundRect(80, 60, 640, 300, 8); g.fillStyle = '#26323a'; g.fill();
    CHILLER.FANS.forEach((f, k) => {
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
    const F = CHILLER.FUSE;
    g.beginPath(); g.roundRect(F.x - 46, F.y - 18, 92, 36, 6); inked(g, '#1c1c1c');
    g.fillStyle = '#c9c9c9'; g.fillRect(F.x - 40, F.y - 12, 12, 24); g.fillRect(F.x + 28, F.y - 12, 12, 24);
    if (c.has('fuse')) {
      g.beginPath(); g.roundRect(F.x - 30, F.y - 10, 60, 20, 9); inked(g, '#e8e0cc');
      g.strokeStyle = '#a33'; g.lineWidth = 2; g.beginPath(); g.moveTo(F.x - 20, F.y); g.lineTo(F.x + 20, F.y); g.stroke();
    }
    const C = CHILLER.COMP;
    if (c.has('compressor')) { g.beginPath(); g.roundRect(C.x - 100, C.y - 55, 200, 110, 20); inked(g, '#4d6270'); }
    else socket(g, C.x, C.y, 56);
    g.strokeStyle = tempColor(c.state[H.coolantTemp]).getStyle(); g.lineWidth = 8;
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
    lever(g, c, 'power', CH_LEVER.x, CH_LEVER.top, CH_LEVER.bottom);
  },
};

// ======================================================================
// Toolbox (at the crash site)
// ======================================================================
export const toolboxDef: PanelDef = {
  front: { rect: [130, 110, 540, 340], size: [0.75, 0.47] },
  sync: noSync,
  controls: [],
  drawInterior(g, c) {
    background(g, c, '#2b2622', '#141210');
    g.beginPath(); g.roundRect(150, 160, 500, 260, 12); inked(g, '#c0392b', 5);
    g.beginPath(); g.roundRect(170, 180, 460, 220, 6); g.fillStyle = '#3a1410'; g.fill();
    for (const [id, x] of [['tool0', 300], ['tool1', 500]] as const) {
      const it = c.item(id);
      if (it) drawItem(g, it, x, 290, 150); else socket(g, x, 290, 50);
    }
  },
  drawPlate(g) {
    g.beginPath(); g.roundRect(150, 140, 500, 280, 12); inked(g, '#d0473a', 5);
    g.beginPath(); g.roundRect(330, 120, 140, 30, 8); g.strokeStyle = INK; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#9aa3a8'; g.fillRect(200, 260, 24, 40); g.fillRect(576, 260, 24, 40);
  },
};

// ======================================================================
// Bench: any item, opened from the inventory. Generic exploded view.
// ======================================================================
export function benchDef(): PanelDef {
  return {
    front: { rect: [0, 0, PW, PH], size: [1, 1] },
    sync: noSync,
    controls: [],
    drawInterior(g, c) {
      // a workbench mat
      g.fillStyle = '#4a3622'; g.fillRect(0, 0, PW, PH);
      g.fillStyle = '#2f4a3a'; g.beginPath(); g.roundRect(30, 30, PW - 60, PH - 60, 14); g.fill();
      g.strokeStyle = '#ffffff10'; g.lineWidth = 1;
      for (let x = 50; x < PW - 30; x += 40) { g.beginPath(); g.moveTo(x, 30); g.lineTo(x, PH - 30); g.stroke(); }
      for (let y = 50; y < PH - 30; y += 40) { g.beginPath(); g.moveTo(30, y); g.lineTo(PW - 30, y); g.stroke(); }
      const asm = c.inst.asm;
      if (!asm.slots.length) {
        drawItem(g, c.inst.item, PW / 2, PH / 2, 300);
        return;
      }
      // the item itself, faintly, as the frame everything sits in
      g.save(); g.globalAlpha = 0.2; drawItem(g, { ...c.inst.item, parts: {} }, PW / 2, PH / 2, 420); g.restore();
      for (const s of asm.slots) {
        if (s.kind === 'plate' || s.locks) continue;
        const content = c.slots[s.id];
        if (!content?.item) { socket(g, s.x, s.y, s.r * 0.9); continue; }
        g.save();
        g.translate(s.x, s.y);
        if (s.fix && !content.fixed) g.rotate(0.35); // loose
        drawItem(g, content.item, 0, 0, s.r * 1.8);
        g.restore();
        if (s.fix?.tool === 'solder_iron' && content.fixed) {
          g.fillStyle = '#c9c9c9';
          for (const [dx, dy] of [[-s.r * 0.7, -s.r * 0.5], [s.r * 0.7, -s.r * 0.5], [-s.r * 0.7, s.r * 0.5], [s.r * 0.7, s.r * 0.5]]) {
            g.beginPath(); g.arc(s.x + dx, s.y + dy, 4, 0, Math.PI * 2); g.fill();
          }
        }
      }
    },
    drawPlate(g, c, plateId) {
      const s = c.inst.asm.slots.find((x) => x.id === plateId)!;
      const [x, y, w, h] = s.rect!;
      g.beginPath(); g.roundRect(x, y, w, h, 12); inked(g, '#6d7378', 4);
      drawItem(g, c.item(plateId)!, x + w / 2, y + h / 2, Math.min(w, h) * 0.7);
    },
  };
}
