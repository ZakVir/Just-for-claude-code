// The spark mark, drawn procedurally: twelve tapered, hand-irregular rays.
// Returned as polygons so Skia (native) and Canvas2D (preview) fill the exact
// same geometry.

export const RAYS = 12;
const LEN = [1.0, 0.84, 0.95, 0.8, 0.98, 0.87, 1.0, 0.82, 0.94, 0.89, 0.97, 0.85];
const JITTER = [0, 3, -2, 4, -3, 2, 0, -4, 3, -2, 2, -3];
const INNER = 0.17;
const W_OUT = 0.15;
const W_IN = 0.07;

export function rayAngle(i: number): number {
  'worklet';
  return ((i * 30 + JITTER[i] - 90) * Math.PI) / 180;
}

export function rayLength(i: number): number {
  'worklet';
  return LEN[i];
}

/**
 * Polygons (flat x,y lists) for each ray.
 * @param pulse   0..1 — "thinking" breath amplitude (ray lengths ripple)
 * @param time    seconds, drives the ripple phase
 * @param retract 0..1 — rays retract toward their tips (the melt intro)
 */
export function sparkPolygons(
  cx: number,
  cy: number,
  R: number,
  rotation: number,
  pulse: number,
  time: number,
  retract: number,
): number[][] {
  'worklet';
  const out: number[][] = [];
  const SEG = 6;
  for (let i = 0; i < RAYS; i++) {
    const a = rayAngle(i) + rotation;
    const ripple = 1 + pulse * 0.09 * Math.sin(time * 2.6 - i * 0.52);
    const outer = LEN[i] * R * ripple;
    const inner = INNER * R + (outer - INNER * R) * retract;
    const shrink = 1 - retract * 0.6;
    const r1 = (W_OUT * R * shrink) / 2;
    const r0 = (W_IN * R * shrink) / 2;
    if (outer - inner < 0.5) continue;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const x0 = cx + dx * (inner + r0);
    const y0 = cy + dy * (inner + r0);
    const x1 = cx + dx * (outer - r1);
    const y1 = cy + dy * (outer - r1);
    const pts: number[] = [];
    // outer cap (semicircle around tip), then inner cap
    for (let s = 0; s <= SEG; s++) {
      const t = a - Math.PI / 2 + (Math.PI * s) / SEG;
      pts.push(x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1);
    }
    for (let s = 0; s <= SEG; s++) {
      const t = a + Math.PI / 2 + (Math.PI * s) / SEG;
      pts.push(x0 + Math.cos(t) * r0, y0 + Math.sin(t) * r0);
    }
    out.push(pts);
  }
  return out;
}
