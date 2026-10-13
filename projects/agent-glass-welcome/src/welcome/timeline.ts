// Choreography. Pure functions of time so the native screen (Reanimated, UI
// thread) and the web preview drive the same sequence frame for frame.
import type { Layout } from './layout';
import { RAYS, rayAngle, rayLength } from './spark';

export const DROPS = 16;

export const T = {
  // stage 0 — icon melts into the dome
  hold: 0.35,
  retract: [0.35, 0.66] as const,
  gather: [0.55, 0.86] as const,
  fall: [0.86, 1.34] as const,
  domeRise: [0.98, 1.5] as const,
  entryText: [1.34, 1.74] as const,
  hint: [1.6, 2.0] as const,
  // stage 1 — measured from the moment the swipe commits
  reveal: [0.15, 0.75] as const,
  glyph: [0.35, 0.75] as const,
  cta: [0.9, 1.3] as const,
  strike: [1.05, 1.45] as const,
  type: [1.55, 2.35] as const,
  caret: [1.45, 3.4] as const,
  burst: 2.45,
  interactive: 0.55,
};

export function clamp01(x: number): number {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function progress(t: number, range: readonly [number, number]): number {
  'worklet';
  return clamp01((t - range[0]) / (range[1] - range[0]));
}

export function smooth(x: number): number {
  'worklet';
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

// strong ease-out — bezier(0.23, 1, 0.32, 1) is approximated by quint out
export function easeOut(x: number): number {
  'worklet';
  const c = 1 - clamp01(x);
  return 1 - c * c * c * c * c;
}

export function easeOutBack(x: number, s = 1.2): number {
  'worklet';
  const c = clamp01(x) - 1;
  return 1 + c * c * ((s + 1) * c + s);
}

export type IntroFrame = {
  drops: number[]; // DROPS × (x, y, r)
  rayRetract: number;
  rayAlpha: number;
  domeY: number;
  textAlpha: number;
  hintAlpha: number;
  glow: number;
};

/** Stage 0 at time t (seconds since the screen mounted). */
export function introFrame(t: number, L: Layout, reduceMotion: boolean): IntroFrame {
  'worklet';
  const drops: number[] = new Array(DROPS * 3).fill(0);
  if (reduceMotion) {
    const a = smooth(t / 0.35);
    return { drops, rayRetract: 1, rayAlpha: 0, domeY: L.domeY, textAlpha: a, hintAlpha: a, glow: 0 };
  }
  const e1 = easeOut(progress(t, T.retract));
  const e2 = smooth(progress(t, T.gather));
  const f = progress(t, T.fall);
  const R = L.iconR;
  // central drop gathers the tips, then falls (gravity: quadratic ease-in)
  const domeTop = L.domeY - L.domeR;
  const centralR = 18 * e2 * (f >= 1 ? 0 : 1);
  const cy = L.iconY + (domeTop + 6 - L.iconY) * f * f;
  drops[0] = L.iconX;
  drops[1] = cy;
  drops[2] = centralR;
  for (let i = 0; i < RAYS; i++) {
    const a = rayAngle(i);
    const dist = rayLength(i) * R * (1 - e2);
    const r = e2 >= 1 ? 0 : 5.5 * e1 * (1 - 0.35 * e2);
    drops[(i + 1) * 3] = L.iconX + Math.cos(a) * dist;
    drops[(i + 1) * 3 + 1] = L.iconY + Math.sin(a) * dist;
    drops[(i + 1) * 3 + 2] = r;
  }
  const rise = easeOutBack(progress(t, T.domeRise), 0.9);
  const hidden = L.H + L.domeR + 16;
  const domeY = hidden + (L.domeY - hidden) * rise;
  const landed = t - T.fall[1];
  const glow = landed > 0 ? 0.9 * Math.exp(-landed * 3.2) : 0;
  return {
    drops,
    rayRetract: e1,
    rayAlpha: 1 - smooth(progress(t, [0.48, 0.7])),
    domeY,
    textAlpha: easeOut(progress(t, T.entryText)),
    hintAlpha: easeOut(progress(t, T.hint)),
    glow,
  };
}

export type WelcomeFrame = {
  reveal: number;
  glyph: number;
  cta: number;
  strike: number;
  typed: number;
  caret: number;
  entryFade: number;
};

/** Stage 1 at s seconds after the swipe committed. */
export function welcomeFrame(s: number, reduceMotion: boolean): WelcomeFrame {
  'worklet';
  if (reduceMotion) {
    const a = smooth(s / 0.3);
    return {
      reveal: a,
      glyph: a,
      cta: smooth((s - 0.2) / 0.3), // after the entry copy has left
      strike: 1,
      typed: 1,
      caret: 0,
      entryFade: 1 - smooth(s / 0.2),
    };
  }
  const typing = progress(s, T.type);
  let caret = 0;
  if (s >= T.caret[0] && s <= T.caret[1]) {
    const blinking = s > T.type[1];
    const on = !blinking || Math.floor((s - T.type[1]) / 0.42) % 2 === 0;
    caret = on ? 1 - smooth(progress(s, [T.caret[1] - 0.25, T.caret[1]])) : 0;
  }
  return {
    reveal: smooth(progress(s, T.reveal)),
    glyph: easeOut(progress(s, T.glyph)),
    cta: easeOut(progress(s, T.cta)),
    strike: easeOut(progress(s, T.strike)),
    typed: typing < 1 ? 1 - (1 - typing) * (1 - typing) : 1,
    caret,
    entryFade: 1 - smooth(s / 0.25),
  };
}
