// Per-frame derived data shared by both renderers: shader uniforms, headline
// line-2 geometry (strike + typed reveal) and the scribble stroke.
import type { Layout } from './layout';
import { hexToRgb, type Palette } from './theme';
import { stretch, type Lens } from './controller';
import { BUBBLES, bubbleUniform } from './physics';
import { welcomeFrame, type WelcomeFrame } from './timeline';

export type Uniforms = Record<string, number | number[]>;

export function shaderUniforms(s: Lens, L: Layout, pal: Palette, pd: number, wf: WelcomeFrame): Uniforms {
  'worklet';
  const bg = hexToRgb(pal.bg);
  const st = stretch(s);
  const bubbles: number[] = new Array(BUBBLES * 4).fill(0);
  bubbleUniform(s.bubbles, bubbles);
  // Reduce Motion: the settled heap cross-fades in with the rest of the screen
  for (let i = 0; i < BUBBLES; i++) bubbles[i * 4 + 3] *= wf.glyph;
  const domeish = s.stage === 0 ? 1 : Math.max(0, Math.min(1, (s.r - L.homeR) / (L.domeR - L.homeR)));
  return {
    uPd: pd,
    uBg: [bg[0], bg[1], bg[2], 1],
    uDark: pal.dark ? 1 : 0,
    uLens: [s.x, s.y, s.r],
    uStretch: st,
    uAnchor: [L.homeX, L.homeY, s.anchorR],
    // the big dome magnifies gently; the bead is a strong ball lens
    uZoom: 0.95 + (0.74 - 0.95) * (1 - domeish),
    uBendK: 0.32 + (1.32 - 0.32) * (1 - domeish),
    uGlow: s.glow,
    uClear: domeish,
    uGlowDir: [s.glowX, s.glowY],
    uReveal: L.reveal,
    uRevealAmt: s.stage === 0 ? 0 : wf.reveal,
    uDrops: s.intro.drops,
    uBubbles: bubbles,
  };
}

export function currentWelcome(s: Lens): WelcomeFrame {
  'worklet';
  return welcomeFrame(s.stage === 0 ? 0 : s.t - s.tc, s.reduceMotion);
}

export type LineMetrics = { prefix: number; struck: number; space: number; typed: number };

export type LineLayout = {
  x: number; // left of "Your "
  struckX: number;
  struckW: number;
  typedX: number;
  typedVisibleW: number;
  caretX: number;
};

export function lineLayout(m: LineMetrics, W: number, typed: number): LineLayout {
  'worklet';
  const visible = m.prefix + m.struck + (typed > 0 ? m.space + m.typed * typed : 0);
  const x = (W - visible) / 2;
  const struckX = x + m.prefix;
  const typedX = struckX + m.struck + m.space;
  return {
    x,
    struckX,
    struckW: m.struck,
    typedX,
    typedVisibleW: m.typed * typed,
    caretX: typed > 0 ? typedX + m.typed * typed + 1.5 : struckX + m.struck + 2,
  };
}

/** A quick hand-drawn strike: a wavy stroke with a little overshoot. */
export function scribblePoints(x0: number, w: number, midY: number, progress: number): number[] {
  'worklet';
  const pts: number[] = [];
  const N = 28;
  const end = Math.max(0, Math.min(1, progress));
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * end;
    const x = x0 - 4 + (w + 8) * u;
    const y = midY + Math.sin(u * Math.PI * 6.2) * 2.4 + (u - 0.5) * 3.2;
    pts.push(x, y);
  }
  return pts;
}
