// How each assembly looks and what you can do to it. The art draws whatever
// parts are actually present (it never assumes), so the same drawing serves as
// the inspect panel and as the machine's front in the world.
import { CHILLER, ENGINE as EN, PUMP, RACK, SEPARATOR_DRIVE, SEPARATOR_PROCESS, works } from './assemblies';
import { leverPos, PW, PH, type Ctx, type PanelDef } from './inspect';
import { drawItem, type Item } from './items';
import { letter } from './letters';
import { Cmd, H, P, R, ROOMS, Z, plant, room } from './simLayout';
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
      if (butter) {
        butter.fill = room(c.state, c.room, R.pbFill);
        butter.salt = room(c.state, c.room, R.jarSalt);
        butter.sugar = room(c.state, c.room, R.jarSugar);
      }
    }
    if (slot === 'valve') item.open = room(c.state, c.room, R.valve);
    if (slot === 'vivarium') item.colony = room(c.state, c.room, R.beetles);
  },
  onInstall(c, slot, item) {
    if (!onSite(c)) return;
    if (slot === 'jar') {
      const butter = item.parts?.butter?.item;
      c.send(Cmd.JarFill, c.room, butter?.fill ?? 0);
      c.send(Cmd.JarSalt, c.room, butter?.salt ?? 0);
      c.send(Cmd.JarSugar, c.room, butter?.sugar ?? 0);
    }
    if (slot === 'valve') c.send(Cmd.ValveSet, c.room, item.open ?? 0.3);
    if (slot === 'vivarium') c.send(Cmd.Colony, c.room, item.colony ?? 0);
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
    const viv = c.item('vivarium');
    if (viv) vivarium(g, c, onSite(c) ? sim(c, R.beetles) : viv.colony ?? 0, sim(c, R.temp, 22));
    else socket(g, EN.VIV.x, EN.VIV.y, 46);
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

/** The beetle vivarium: the colony crowds toward the warm side as the room heats. */
function vivarium(g: CanvasRenderingContext2D, c: Ctx, colony: number, roomT: number): void {
  const { x, y } = EN.VIV;
  c.vis.bt = (c.vis.bt ?? 0) + c.dt;
  g.beginPath(); g.roundRect(x - 55, y - 40, 110, 80, 8); g.fillStyle = '#cfe3e033'; g.fill();
  // lever arm under it, tipped by the colony's weight
  const tip = Math.max(-0.25, Math.min(0.25, (roomT - 22) * 0.1 * colony));
  g.save(); g.translate(x, y + 48); g.rotate(tip);
  g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(-60, 0); g.lineTo(60, 0); g.stroke();
  g.strokeStyle = '#b8893a'; g.lineWidth = 3; g.stroke();
  g.restore();
  const n = Math.round(colony * 24);
  const lean = Math.max(-1, Math.min(1, (roomT - 22) / 3));
  g.fillStyle = '#1a1208';
  for (let k = 0; k < n; k++) {
    const h = (k * 97) % 100 / 100;
    const bx = x + (h - 0.5) * 80 * (1 - Math.abs(lean) * 0.6) + lean * 30 + Math.sin(c.vis.bt * 3 + k) * 3;
    const by = y - 25 + ((k * 61) % 100) / 100 * 50 + Math.cos(c.vis.bt * 2.3 + k) * 2;
    g.beginPath(); g.ellipse(bx, by, 4, 2.8, k + c.vis.bt, 0, Math.PI * 2); g.fill();
  }
  g.beginPath(); g.roundRect(x - 55, y - 40, 110, 80, 8); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
}

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

export const pumpDef: PanelDef = makePump('coolant');
export const pbPumpDef: PanelDef = makePump('pb');

function makePump(fluid: 'coolant' | 'pb'): PanelDef {
  return {
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
    const flow = c.room < 0 ? 0 : fluid === 'coolant' ? totalFlow(st) : plant(st, P.pbFlowing) * 0.0003;
    c.vis.spin = (c.vis.spin ?? 0) + (spinning ? 1 : 0) * c.dt * 9;
    c.vis.flow = (c.vis.flow ?? 0) + flow * 1000 * 120 * c.dt;
    background(g, c, '#2e2a24', '#16130e');
    const water = fluid === 'coolant' ? tempColor(st[H.coolantTemp]).getStyle() : '#a8732f';
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
}

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
      if (c.inst.item.type === 'letter') return drawLetter(g, c.inst.item.seed ?? 1);
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

function drawLetter(g: CanvasRenderingContext2D, seed: number): void {
  const L = letter(seed);
  g.save();
  g.translate(PW / 2, PH / 2);
  g.rotate(-0.02);
  g.fillStyle = '#00000044'; g.fillRect(-196, -236, 400, 480);
  g.fillStyle = L.future ? '#f4efe0' : '#e9dfc4'; g.fillRect(-200, -240, 400, 480);
  g.strokeStyle = '#c9bd9f'; g.lineWidth = 1;
  for (let y = -170; y < 220; y += 30) { g.beginPath(); g.moveTo(-170, y); g.lineTo(170, y); g.stroke(); }
  g.fillStyle = '#2a3550';
  g.font = 'italic 17px Georgia, serif';
  g.textAlign = 'right';
  g.fillText(L.date, 170, -200);
  g.textAlign = 'left';
  g.font = 'italic 19px Georgia, serif';
  L.lines.forEach((line, k) => g.fillText(line, -170, -136 + k * 30, 340));
  // the company mark, stamped
  g.strokeStyle = '#a33b2c99'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(110, 170); g.lineTo(170, 170); g.moveTo(140, 170); g.lineTo(140, 210); g.stroke();
  g.restore();
}

// ======================================================================
// Schematic machines: the newer plant. A chassis, the actual parts where they
// sit, and the connections between them (drawn only when both ends exist).
// ======================================================================
interface Link { a: string; b: string; style: 'pipe' | 'belt' | 'shaft' | 'duct'; color?: string }
interface Schematic {
  front: PanelDef['front'];
  body: [number, number, number, number];
  color: string;
  links?: Link[];
  spin?: string[];
  lever?: { x: number; top: number; bottom: number };
  running(c: Ctx): boolean;
  extra?(g: CanvasRenderingContext2D, c: Ctx, running: boolean): void;
  under?(g: CanvasRenderingContext2D, c: Ctx): void;
}

function schematic(spec: Schematic): PanelDef {
  const controls: PanelDef['controls'] = spec.lever
    ? [{
        id: 'power', kind: 'lever', r: 50,
        pos: () => [spec.lever!.x, (spec.lever!.top + spec.lever!.bottom) / 2],
        track: { top: spec.lever.top, bottom: spec.lever.bottom },
      }]
    : [];
  return {
    front: spec.front,
    sync: noSync,
    controls,
    drawInterior(g, c) {
      const running = spec.running(c);
      c.vis.spin = (c.vis.spin ?? 0) + (running ? 1 : 0) * c.dt * 6;
      background(g, c, '#2c2a26', '#16140f');
      const [bx, by, bw, bh] = spec.body;
      g.beginPath(); g.roundRect(bx, by, bw, bh, 14); inked(g, spec.color, 5);
      g.beginPath(); g.roundRect(bx + 12, by + 12, bw - 24, bh - 24, 8); g.fillStyle = '#00000040'; g.fill();
      spec.under?.(g, c);
      const slots = c.inst.asm.slots;
      const at = (id: string) => slots.find((s) => s.id === id)!;
      for (const l of spec.links ?? []) {
        const A = at(l.a), B = at(l.b);
        const both = c.has(l.a) && c.has(l.b);
        const pts: [number, number][] = [[A.x, A.y], [B.x, B.y]];
        if (l.style === 'pipe' || l.style === 'duct') {
          if (both) pipe(g, pts, l.color ?? '#7a8c96', l.style === 'duct' ? 22 : 12);
          else { g.save(); g.setLineDash([6, 8]); g.strokeStyle = '#ffffff22'; g.lineWidth = 3; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); g.restore(); }
        } else if (both) {
          g.strokeStyle = INK; g.lineWidth = l.style === 'belt' ? 9 : 7; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
          g.strokeStyle = l.style === 'belt' ? '#3a3a3a' : '#8c8c8c'; g.lineWidth = l.style === 'belt' ? 5 : 3; g.stroke();
          if (l.style === 'belt' && running) {
            g.save(); g.setLineDash([4, 10]); g.lineDashOffset = -c.vis.spin * 20; g.strokeStyle = '#9a9a9a'; g.lineWidth = 2;
            g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); g.restore();
          }
        }
      }
      for (const s of slots) {
        if (s.kind === 'plate' || s.locks) continue;
        const content = c.slots[s.id];
        if (!content?.item) { socket(g, s.x, s.y, s.r * 0.9); continue; }
        g.save();
        g.translate(s.x, s.y);
        if (s.fix && !content.fixed) g.rotate(0.35); // loose: sitting there, not connected
        else if (running && spec.spin?.includes(s.id)) g.rotate(c.vis.spin * (s.r > 50 ? 0.5 : 1.5));
        drawItem(g, content.item, 0, 0, s.r * 1.8);
        g.restore();
        if (s.fix && content.fixed && s.r >= 30) {
          g.fillStyle = '#c9c9c9';
          for (const a of [0.8, 2.4, 3.9, 5.5]) { g.beginPath(); g.arc(s.x + Math.cos(a) * s.r * 0.95, s.y + Math.sin(a) * s.r * 0.95, 3, 0, Math.PI * 2); g.fill(); }
        }
      }
      spec.extra?.(g, c, running);
    },
    drawPlate(g, c, plateId) {
      const s = c.inst.asm.slots.find((x) => x.id === plateId)!;
      const [x, y, w, h] = s.rect!;
      g.beginPath(); g.roundRect(x, y, w, h, 10); inked(g, '#8e9aa3', 4);
      g.strokeStyle = '#6d7880'; g.lineWidth = 3;
      for (let yy = y + 24; yy < y + h - 16; yy += 16) { g.beginPath(); g.moveTo(x + 30, yy); g.lineTo(x + w - 30, yy); g.stroke(); }
    },
    drawExterior: spec.lever ? (g, c) => lever(g, c, 'power', spec.lever!.x, spec.lever!.top, spec.lever!.bottom) : undefined,
  };
}

const powered = (c: Ctx) => onSite(c) && !!c.switches.power && works(c.inst.item);

/** A vertical tank showing how full it is. */
function tankLevel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string): void {
  g.beginPath(); g.roundRect(x, y, w, h, 30); inked(g, '#c9cfd4', 4);
  const f = Math.max(0, Math.min(1, frac));
  g.save(); g.beginPath(); g.roundRect(x + 8, y + 8, w - 16, h - 16, 24); g.clip();
  g.fillStyle = color; g.fillRect(x, y + h - 8 - (h - 16) * f, w, (h - 16) * f + 8);
  g.restore();
}

function gauge(g: CanvasRenderingContext2D, x: number, y: number, frac: number): void {
  g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); inked(g, '#f1ead6');
  const a = Math.PI * (0.75 + 1.5 * Math.max(0, Math.min(1, frac)));
  g.strokeStyle = '#a33'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20); g.stroke();
}

export const synthDef = schematic({
  front: { rect: [60, 40, 700, 480], size: [1.9, 1.3] },
  body: [60, 40, 680, 480], color: '#7a8c96',
  links: [
    { a: 'intake', b: 'burner', style: 'duct', color: '#9aa3a8' },
    { a: 'h2valve', b: 'burner', style: 'pipe', color: '#e8e8e8' },
    { a: 'burner', b: 'condenser', style: 'pipe', color: '#c0602a' },
    { a: 'condenser', b: 'trap', style: 'pipe', color: '#7fb3d9' },
  ],
  spin: ['intake'],
  lever: { x: 380, top: 420, bottom: 500 },
  running: (c) => onSite(c) && plant(c.state, P.synth) > 0,
  extra(g, c, running) {
    // intake gauge: how much oxygen is in the room's air
    gauge(g, 140, 90, onSite(c) ? (plant(c.state, P.o2 + Z.water) - 0.1) / 0.11 : 0);
    if (running) {
      c.vis.drip = ((c.vis.drip ?? 0) + c.dt * 1.5) % 1;
      g.fillStyle = '#9fd3ff'; g.beginPath(); g.ellipse(670, 495 + c.vis.drip * 20, 4, 6, 0, 0, Math.PI * 2); g.fill();
      if (c.has('burner')) { g.fillStyle = '#ffb35a88'; g.beginPath(); g.arc(450, 260, 30 + Math.sin(c.vis.spin * 4) * 4, 0, Math.PI * 2); g.fill(); }
    }
  },
});

export const h2TankDef = schematic({
  front: { rect: [240, 30, 320, 510], size: [0.9, 1.45] },
  body: [250, 40, 300, 490], color: '#8d959b',
  running: () => false,
  under(g, c) {
    tankLevel(g, 290, 170, 220, 320, onSite(c) ? plant(c.state, P.h2) / 200000 : 0.5, '#d8e4ec');
    gauge(g, 400, 240, onSite(c) ? plant(c.state, P.h2) / 200000 : 0.5);
  },
});

export const waterTankDef = schematic({
  front: { rect: [240, 30, 320, 510], size: [1.0, 1.6] },
  body: [250, 40, 300, 490], color: '#5d8fb8',
  running: () => false,
  under(g, c) { tankLevel(g, 290, 70, 220, 360, onSite(c) ? plant(c.state, P.water) / 2000 : 0, '#5fa8e0'); },
});

export const irrigatorDef = schematic({
  front: { rect: [110, 110, 580, 300], size: [1.2, 0.62] },
  body: [120, 150, 560, 230], color: '#4d7a4a',
  links: [{ a: 'valve', b: 'spr0', style: 'pipe', color: '#7fb3d9' }, { a: 'spr0', b: 'spr1', style: 'pipe', color: '#7fb3d9' }],
  lever: { x: 330, top: 290, bottom: 360 },
  running: powered,
  extra(g, c, running) {
    if (!running) return;
    c.vis.drip = ((c.vis.drip ?? 0) + c.dt * 2) % 1;
    g.fillStyle = '#9fd3ff';
    for (const x of [450, 610]) for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x - 30 + k * 15, 245 + ((c.vis.drip + k * 0.2) % 1) * 60, 3, 0, Math.PI * 2); g.fill(); }
  },
});

export const grinderDef = schematic({
  front: { rect: [40, 20, 720, 520], size: [1.6, 1.15] },
  body: [50, 30, 700, 500], color: '#6b5a3a',
  links: [
    { a: 'motor', b: 'gearbox', style: 'shaft' },
    { a: 'hopper', b: 'auger', style: 'duct', color: '#5a4a2a' },
  ],
  spin: ['blade0', 'blade1', 'blade2', 'blade3', 'auger'],
  lever: { x: 650, top: 420, bottom: 500 },
  running: powered,
  extra(g, c) {
    // how ripe the room is (the hopper's window)
    const farm = c.room === 5 ? 0 : 1; // grinder A is plant machine 5
    const growth = onSite(c) ? plant(c.state, P.farm + farm * 4) : 0;
    g.fillStyle = '#5d8a3a'; g.fillRect(352, 110, 96 * growth, 10);
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(352, 110, 96, 10);
  },
});

export const separatorDef = schematic({
  front: { rect: [30, 40, 740, 500], size: [2.6, 1.75] },
  body: [40, 50, 720, 480], color: '#5f6b70',
  links: [
    ...SEPARATOR_PROCESS.slice(1).map((b, k): Link => ({ a: SEPARATOR_PROCESS[k], b, style: 'pipe', color: '#8a6a3a' })),
    ...SEPARATOR_DRIVE.slice(1).map((b, k): Link => ({ a: SEPARATOR_DRIVE[k], b, style: 'belt' })),
    { a: 'pulley3', b: 'belt', style: 'belt' },
  ],
  spin: ['crush0', 'crush1', 'magnet', 'blower', 'cyclone', 'pulley0', 'pulley1', 'pulley2', 'pulley3', 'gearbox'],
  lever: { x: 720, top: 400, bottom: 480 },
  running: (c) => onSite(c) && plant(c.state, P.sep) > 0,
  extra(g, c) {
    // mush waiting at the inlet, paste leaving at the press
    const mush = onSite(c) ? plant(c.state, P.mush) : 0;
    g.fillStyle = '#5a4a2a'; g.beginPath(); g.ellipse(60, 60, 20 + Math.min(40, mush / 10), 12, 0, 0, Math.PI * 2); g.fill();
    const paste = onSite(c) ? plant(c.state, P.paste) : 0;
    g.fillStyle = '#a8732f'; g.beginPath(); g.ellipse(160, 370, 10 + Math.min(30, paste / 5), 8, 0, 0, Math.PI * 2); g.fill();
  },
});

export const mixerDef = schematic({
  front: { rect: [50, 30, 700, 500], size: [1.7, 1.2] },
  body: [60, 40, 680, 480], color: '#8a6a3a',
  links: [
    { a: 'motor', b: 'paddle', style: 'shaft' },
    { a: 'paddle', b: 'vat', style: 'shaft' },
    { a: 'salt', b: 'vat', style: 'pipe', color: '#f1f1f1' },
    { a: 'sugar', b: 'vat', style: 'pipe', color: '#d9c39a' },
    { a: 'valve', b: 'vat', style: 'pipe', color: '#a8732f' },
  ],
  spin: ['paddle'],
  lever: { x: 680, top: 430, bottom: 500 },
  running: (c) => onSite(c) && plant(c.state, P.mix) > 0,
  extra(g, c, running) {
    if (!c.has('vat')) return;
    const pb = onSite(c) ? plant(c.state, P.pb) / 400 : 0;
    g.fillStyle = '#a8732f'; g.beginPath(); g.ellipse(400, 400, 80, 18 + 30 * pb, 0, 0, Math.PI * 2); g.fill();
    if (running) { g.strokeStyle = '#c08a45'; g.lineWidth = 3; g.beginPath(); g.ellipse(400, 395, 50, 10, c.vis.spin, 0, Math.PI * 1.5); g.stroke(); }
  },
});

function siloDef(stock: number, max: number, color: string): PanelDef {
  return schematic({
    front: { rect: [240, 20, 320, 520], size: [1.0, 1.6] },
    body: [250, 30, 300, 500], color: '#9aa3a8',
    running: () => false,
    under(g, c) {
      const frac = onSite(c) ? plant(c.state, stock) / max : 0.5;
      tankLevel(g, 280, 130, 240, 300, frac, color);
      g.fillStyle = '#ffffff66';
      for (let k = 0; k < 30 * frac; k++) g.fillRect(300 + ((k * 37) % 200), 420 - ((k * 53) % Math.max(1, 280 * frac)), 3, 3);
    },
  });
}
export const saltSiloDef = siloDef(P.salt, 40, '#f1f1f1');
export const sugarSiloDef = siloDef(P.sugar, 150, '#d9c39a');

export const cafeDef = schematic({
  front: { rect: [170, 90, 460, 280], size: [1.8, 1.1] },
  body: [180, 120, 440, 230], color: '#b0a48a',
  links: [],
  running: powered,
  under(g) {
    g.fillStyle = '#d8d0b8'; g.fillRect(200, 290, 400, 40);
    for (let k = 0; k < 4; k++) { g.beginPath(); g.roundRect(215 + k * 95, 296, 80, 26, 4); inked(g, '#e8e0cc', 2); }
  },
});

export const cabinetDef: PanelDef = {
  front: { rect: [240, 30, 320, 500], size: [0.8, 1.25] },
  sync: noSync,
  controls: [],
  drawInterior(g, c) {
    background(g, c, '#2c2a26', '#16140f');
    g.beginPath(); g.roundRect(250, 40, 300, 480, 8); inked(g, '#7d8a7a', 5);
    for (let k = 0; k < 4; k++) {
      const y = 110 + k * 112;
      const d = c.item(`drawer${k}`);
      if (!d) { g.fillStyle = '#141414'; g.fillRect(266, y - 48, 268, 96); continue; }
      g.beginPath(); g.roundRect(266, y - 48, 268, 96, 4); inked(g, '#8d9a8a', 3);
      g.beginPath(); g.roundRect(370, y - 8, 60, 16, 6); inked(g, '#c9c9c9', 2);
      g.beginPath(); g.rect(380, y - 34, 40, 16); inked(g, '#f1ead6', 2); // the label holder (blank)
      const n = Object.values(d.parts ?? {}).filter((x) => x.item).length;
      g.fillStyle = '#f1ead6';
      for (let j = 0; j < n; j++) g.fillRect(280 + j * 10, y - 46, 7, 5);
    }
  },
  drawPlate() {},
};
