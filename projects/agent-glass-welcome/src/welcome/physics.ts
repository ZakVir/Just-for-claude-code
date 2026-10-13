// Glass-bubble burst: circles under an upward "buoyancy", gently pulled to the
// centre line so they heap under the Dynamic Island, colliding with each other,
// the walls and the (moving) lens. Plain number arrays so the same code runs as
// a Reanimated worklet on the UI thread and in the web preview.
import type { Layout } from './layout';

export const BUBBLES = 24;
export const STRIDE = 8; // x, y, vx, vy, r, targetR, born, token
export const TOKENS = 8;

function hash(i: number, k: number): number {
  'worklet';
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createBubbles(): number[] {
  'worklet';
  const a: number[] = new Array(BUBBLES * STRIDE).fill(0);
  for (let i = 0; i < BUBBLES; i++) {
    const o = i * STRIDE;
    a[o + 5] = 12 + hash(i, 1) * 20; // target radius 12..32
    a[o + 6] = 1e9; // not born yet
    a[o + 7] = i % TOKENS;
  }
  return a;
}

/** Launch every bubble from the lens top, staggered over ~0.6 s. */
export function burst(a: number[], x: number, y: number, lensR: number, now: number): void {
  'worklet';
  for (let i = 0; i < BUBBLES; i++) {
    const o = i * STRIDE;
    const ang = -Math.PI / 2 + (hash(i, 2) - 0.5) * 1.5;
    const speed = 620 + hash(i, 3) * 560;
    a[o] = x + (hash(i, 4) - 0.5) * lensR * 0.8;
    a[o + 1] = y - lensR * 0.6;
    a[o + 2] = Math.cos(ang) * speed;
    a[o + 3] = Math.sin(ang) * speed;
    a[o + 4] = 0;
    a[o + 6] = now + i * 0.024;
  }
}

function popScale(age: number): number {
  'worklet';
  if (age <= 0) return 0;
  const x = Math.min(1, age / 0.24);
  const c = x - 1;
  return 1 + c * c * (2.4 * c + 1.4);
}

export function stepBubbles(
  a: number[],
  dt: number,
  now: number,
  L: Layout,
  lensX: number,
  lensY: number,
  lensR: number,
  lensVx: number,
  lensVy: number,
): void {
  'worklet';
  const steps = 3;
  const h = Math.min(dt, 1 / 30) / steps;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < BUBBLES; i++) {
      const o = i * STRIDE;
      const born = a[o + 6];
      if (now < born) continue;
      a[o + 4] = a[o + 5] * popScale(now - born);
      // buoyancy up, soft pull to centre line, drag
      a[o + 3] += -1500 * h;
      a[o + 2] += -(a[o] - L.W / 2) * 9 * h;
      const damp = Math.exp(-2.6 * h);
      a[o + 2] *= damp;
      a[o + 3] *= damp;
      a[o] += a[o + 2] * h;
      a[o + 1] += a[o + 3] * h;
    }
    // pairwise collisions
    for (let i = 0; i < BUBBLES; i++) {
      const oi = i * STRIDE;
      if (a[oi + 4] <= 0) continue;
      for (let j = i + 1; j < BUBBLES; j++) {
        const oj = j * STRIDE;
        if (a[oj + 4] <= 0) continue;
        const dx = a[oj] - a[oi];
        const dy = a[oj + 1] - a[oi + 1];
        const min = a[oi + 4] + a[oj + 4] + 1.5;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const mi = a[oi + 4] * a[oi + 4];
        const mj = a[oj + 4] * a[oj + 4];
        const wi = mj / (mi + mj);
        const wj = mi / (mi + mj);
        const overlap = min - d;
        a[oi] -= nx * overlap * wi;
        a[oi + 1] -= ny * overlap * wi;
        a[oj] += nx * overlap * wj;
        a[oj + 1] += ny * overlap * wj;
        const rv = (a[oj + 2] - a[oi + 2]) * nx + (a[oj + 3] - a[oi + 3]) * ny;
        if (rv < 0) {
          const imp = -(1 + 0.15) * rv;
          a[oi + 2] -= nx * imp * wi;
          a[oi + 3] -= ny * imp * wi;
          a[oj + 2] += nx * imp * wj;
          a[oj + 3] += ny * imp * wj;
        }
      }
    }
    // walls + the lens (kinematic: it pushes, it is never pushed)
    for (let i = 0; i < BUBBLES; i++) {
      const o = i * STRIDE;
      const r = a[o + 4];
      if (r <= 0) continue;
      if (a[o] < r + 4) {
        a[o] = r + 4;
        a[o + 2] = Math.abs(a[o + 2]) * 0.3;
      } else if (a[o] > L.W - r - 4) {
        a[o] = L.W - r - 4;
        a[o + 2] = -Math.abs(a[o + 2]) * 0.3;
      }
      if (a[o + 1] < L.pileTop + r) {
        a[o + 1] = L.pileTop + r;
        a[o + 3] = Math.abs(a[o + 3]) * 0.2;
      }
      const dx = a[o] - lensX;
      const dy = a[o + 1] - lensY;
      const min = r + lensR + 2;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        a[o] = lensX + nx * min;
        a[o + 1] = lensY + ny * min;
        const rv = (a[o + 2] - lensVx) * nx + (a[o + 3] - lensVy) * ny;
        if (rv < 0) {
          a[o + 2] -= nx * rv * 1.3;
          a[o + 3] -= ny * rv * 1.3;
        }
      }
    }
  }
}

/** Reduce Motion: compute the settled heap without animating it. */
export function settleInstantly(a: number[], L: Layout, lensX: number, lensY: number, lensR: number): void {
  'worklet';
  burst(a, lensX, lensY, lensR, 0);
  for (let i = 0; i < BUBBLES; i++) a[i * STRIDE + 6] = -10;
  let t = 0;
  for (let k = 0; k < 360; k++) {
    t += 1 / 60;
    stepBubbles(a, 1 / 60, t, L, lensX, lensY, lensR, 0, 0);
  }
}

/** Shader uniform: BUBBLES × (x, y, r, alpha). */
export function bubbleUniform(a: number[], out: number[]): number[] {
  'worklet';
  for (let i = 0; i < BUBBLES; i++) {
    const o = i * STRIDE;
    out[i * 4] = a[o];
    out[i * 4 + 1] = a[o + 1];
    out[i * 4 + 2] = a[o + 4];
    out[i * 4 + 3] = a[o + 4] > 0 ? 1 : 0;
  }
  return out;
}
