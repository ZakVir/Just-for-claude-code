// The lens state machine. Platform code feeds it touches and a clock; it owns
// the springs (seeded with the finger's velocity), rubber-banding, the liquid
// stretch, the goo anchor, the rim glow and the bubble simulation. Plain object
// + plain functions so it runs as a Reanimated worklet and in the preview.
import type { Layout } from './layout';
import { burst, createBubbles, settleInstantly, stepBubbles } from './physics';
import { T, introFrame, smooth, type IntroFrame } from './timeline';

export const EV_COMMIT = 1;
export const EV_SNAP_HOME = 2;
export const EV_BURST = 4;

// One spring vocabulary (response seconds, damping ratio) → k, c for unit mass.
const SETTLE = { k: ((2 * Math.PI) / 0.4) ** 2, c: (4 * Math.PI * 1) / 0.4 }; // { 400 ms, 1 }
const TRAVEL = { k: ((2 * Math.PI) / 0.55) ** 2, c: (4 * Math.PI * 0.82) / 0.55 }; // the commit flight

export type Lens = {
  stage: 0 | 1;
  t: number;
  tc: number; // commit time
  reduceMotion: boolean;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  vr: number;
  px: number; // position at the end of the previous step
  py: number;
  svx: number; // smoothed velocity → stretch + glow
  svy: number;
  dragging: boolean;
  wasDragged: boolean;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
  glow: number;
  glowX: number;
  glowY: number;
  anchorR: number;
  bridgeBroken: boolean;
  burstDone: boolean;
  events: number;
  intro: IntroFrame;
  bubbles: number[];
};

export function createLens(L: Layout, reduceMotion: boolean): Lens {
  'worklet';
  const intro = introFrame(0, L, reduceMotion);
  return {
    stage: 0,
    t: 0,
    tc: -1,
    reduceMotion,
    x: L.domeX,
    y: intro.domeY,
    r: L.domeR,
    vx: 0,
    vy: 0,
    vr: 0,
    px: L.domeX,
    py: intro.domeY,
    svx: 0,
    svy: 0,
    dragging: false,
    wasDragged: false,
    startX: 0,
    startY: 0,
    grabX: 0,
    grabY: 0,
    glow: 0,
    glowX: 0,
    glowY: 1,
    anchorR: 0,
    bridgeBroken: false,
    burstDone: false,
    events: 0,
    intro,
    bubbles: createBubbles(),
  };
}

function rubber(x: number, dim: number): number {
  'worklet';
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  return s * (1 - 1 / ((a * 0.55) / dim + 1)) * dim;
}

/** Is a touch at (x, y) allowed to start a drag? */
export function canGrab(s: Lens, L: Layout, x: number, y: number): boolean {
  'worklet';
  if (s.stage === 0) return s.t > T.domeRise[1] - 0.2;
  if (s.t - s.tc < T.interactive) return false;
  const dx = x - s.x;
  const dy = y - s.y;
  return dx * dx + dy * dy < s.r * 1.45 * (s.r * 1.45) && y < L.ctaTop;
}

export function touchDown(s: Lens, x: number, y: number): void {
  'worklet';
  s.dragging = true;
  s.wasDragged = true;
  s.startX = x;
  s.startY = y;
  s.grabX = s.x - x;
  s.grabY = s.y - y;
  s.vx = 0;
  s.vy = 0;
}

export function touchMove(s: Lens, L: Layout, x: number, y: number, vx: number, vy: number): void {
  'worklet';
  if (!s.dragging) return;
  if (s.stage === 0) {
    const dy = y - s.startY;
    const travel = L.domeY - L.homeY;
    const p = Math.max(0, Math.min(1, -dy / travel));
    s.y = L.domeY + (dy > 0 ? rubber(dy, 120) : dy);
    s.x = L.domeX + (x - s.startX) * 0.35;
    s.r = L.domeR + (L.homeR * 1.5 - L.domeR) * smooth(p);
  } else {
    let nx = x + s.grabX;
    let ny = y + s.grabY;
    const minX = s.r + 4;
    const maxX = L.W - s.r - 4;
    if (nx < minX) nx = minX + rubber(nx - minX, 80);
    if (nx > maxX) nx = maxX + rubber(nx - maxX, 80);
    if (ny > L.dragMaxY) ny = L.dragMaxY + rubber(ny - L.dragMaxY, 80);
    const minY = L.pileTop + s.r;
    if (ny < minY) ny = minY + rubber(ny - minY, 80);
    s.x = nx;
    s.y = ny;
  }
  s.vx = vx;
  s.vy = vy;
}

export function commit(s: Lens): void {
  'worklet';
  if (s.stage === 1) return;
  s.stage = 1;
  s.tc = s.t;
  s.dragging = false;
  s.wasDragged = false;
  s.events |= EV_COMMIT;
}

export function touchUp(s: Lens, L: Layout, vx: number, vy: number): void {
  'worklet';
  if (!s.dragging) return;
  s.dragging = false;
  s.vx = vx;
  s.vy = vy;
  if (s.stage === 0) {
    const p = (L.domeY - s.y) / (L.domeY - L.homeY);
    if (p > 0.28 || vy < -650) commit(s);
  }
}

function spring(x: number, v: number, target: number, k: number, c: number, h: number): number[] {
  'worklet';
  const a = -k * (x - target) - c * v;
  const nv = v + a * h;
  return [x + nv * h, nv];
}

export function step(s: Lens, L: Layout, dt: number): void {
  'worklet';
  dt = Math.min(dt, 1 / 20);
  s.t += dt;
  const rm = s.reduceMotion;

  if (s.stage === 0) {
    s.intro = introFrame(s.t, L, rm);
    if (!s.dragging) {
      const breathe = rm || s.t < T.domeRise[1] ? 0 : Math.sin(s.t * 1.7) * 2.2;
      const ty = (s.t < T.domeRise[1] + 0.1 ? s.intro.domeY : L.domeY) + breathe;
      if (!s.wasDragged) {
        s.x = L.domeX;
        s.y = ty;
        s.r = L.domeR;
      } else {
        const sub = 4;
        const h = dt / sub;
        for (let i = 0; i < sub; i++) {
          let o = spring(s.x, s.vx, L.domeX, SETTLE.k, SETTLE.c, h);
          s.x = o[0];
          s.vx = o[1];
          o = spring(s.y, s.vy, ty, SETTLE.k, SETTLE.c, h);
          s.y = o[0];
          s.vy = o[1];
          o = spring(s.r, s.vr, L.domeR, SETTLE.k, SETTLE.c, h);
          s.r = o[0];
          s.vr = o[1];
        }
      }
    }
  } else {
    const since = s.t - s.tc;
    s.intro = introFrame(99, L, rm);
    if (rm && !s.wasDragged) {
      s.x = L.homeX;
      s.y = L.homeY;
      s.r = L.homeR;
      s.vx = 0;
      s.vy = 0;
    } else if (!s.dragging) {
      const P = s.wasDragged ? SETTLE : TRAVEL;
      const sub = 4;
      const h = dt / sub;
      for (let i = 0; i < sub; i++) {
        let o = spring(s.x, s.vx, L.homeX, P.k, P.c, h);
        s.x = o[0];
        s.vx = o[1];
        o = spring(s.y, s.vy, L.homeY, P.k, P.c, h);
        s.y = o[0];
        s.vy = o[1];
        o = spring(s.r, s.vr, L.homeR, TRAVEL.k, TRAVEL.c, h);
        s.r = o[0];
        s.vr = o[1];
      }
      const dx = s.x - L.homeX;
      const dy = s.y - L.homeY;
      if (s.wasDragged && dx * dx + dy * dy < 1.5 && s.vx * s.vx + s.vy * s.vy < 900) {
        s.wasDragged = false;
        s.bridgeBroken = false;
        s.events |= EV_SNAP_HOME;
      }
    }
    // goo anchor: a droplet stays home while the bead is pulled away
    const dist = Math.hypot(s.x - L.homeX, s.y - L.homeY);
    if (dist > L.homeR * 2.8) s.bridgeBroken = true;
    const keep = 1 - smooth((dist - L.homeR * 1.5) / (L.homeR * 1.8));
    let target = s.bridgeBroken || since < T.interactive ? 0 : L.homeR * 0.55 * keep;
    if (target < 6) target = 0; // a thinning neck snaps, it never lingers as a speck
    s.anchorR += (target - s.anchorR) * Math.min(1, dt * 18);
    if (dist < L.homeR * 0.5 || s.anchorR < 2) s.anchorR = 0;

    if (!s.burstDone && since >= (rm ? 0 : T.burst)) {
      s.burstDone = true;
      if (rm) settleInstantly(s.bubbles, L, L.homeX, L.homeY, L.homeR);
      else burst(s.bubbles, s.x, s.y, s.r, s.t);
      s.events |= EV_BURST;
    }
  }

  // measured lens velocity (covers springs and drags alike)
  const mvx = (s.x - s.px) / Math.max(dt, 1e-4);
  const mvy = (s.y - s.py) / Math.max(dt, 1e-4);
  s.px = s.x;
  s.py = s.y;
  const a = Math.min(1, dt * 14);
  s.svx += (mvx - s.svx) * a;
  s.svy += (mvy - s.svy) * a;
  const speed = Math.hypot(s.svx, s.svy);
  const moving = Math.min(1, speed / (s.stage === 0 ? 1400 : 2200));
  const targetGlow = Math.max(moving * (s.stage === 0 ? 1 : 0.75), s.intro.glow);
  s.glow += (targetGlow - s.glow) * Math.min(1, dt * (targetGlow > s.glow ? 16 : 5));
  if (speed > 30) {
    // the trailing edge lights up
    s.glowX += (-s.svx / speed - s.glowX) * a;
    s.glowY += (-s.svy / speed - s.glowY) * a;
  } else if (s.intro.glow > 0.01) {
    s.glowX += (0 - s.glowX) * a;
    s.glowY += (-1 - s.glowY) * a;
  }

  if (s.burstDone && !rm) {
    stepBubbles(s.bubbles, dt, s.t, L, s.x, s.y, s.r, s.svx, s.svy);
  }
}

/** Stretch vector along the motion (liquid squash & stretch), in [0, 0.24]. */
export function stretch(s: Lens): number[] {
  'worklet';
  if (s.reduceMotion || s.r > 80) return [0, 0];
  const speed = Math.hypot(s.svx, s.svy);
  if (speed < 1) return [0, 0];
  const amt = Math.min(0.24, speed / 2800);
  return [(s.svx / speed) * amt, (s.svy / speed) * amt];
}
