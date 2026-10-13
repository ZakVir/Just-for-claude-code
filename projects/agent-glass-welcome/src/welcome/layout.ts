// All geometry in points, derived from the window and safe-area insets.

export type Layout = {
  W: number;
  H: number;
  top: number;
  bottom: number;
  // splash / icon centre — must match the native splash image position
  iconX: number;
  iconY: number;
  iconR: number;
  // the dome (stage 0): a large lens half-submerged at the bottom edge
  domeX: number;
  domeY: number;
  domeR: number;
  // the bead (stage 1): the lens at rest
  homeX: number;
  homeY: number;
  homeR: number;
  // copy
  entryY: number; // centre of the two entry lines
  hintY: number;
  titleY: number; // baseline
  lineY: number; // baseline of the strike/typed line
  // the headline block that the lens "portals" into before it is revealed
  reveal: [number, number, number, number];
  // bubbles pile up between these
  pileTop: number;
  pileBottom: number;
  // the bead may be dragged anywhere above this line (rubber-banded past it)
  dragMaxY: number;
  ctaTop: number;
};

export function computeLayout(W: number, H: number, top: number, bottom: number): Layout {
  'worklet';
  const domeR = Math.min(W * 0.46, 196);
  const homeR = 42;
  const homeY = Math.round(H * 0.43);
  const titleY = homeY + homeR + 78;
  const lineY = titleY + 40;
  const ctaTop = H - bottom - 12 - 44 - 4 - 54;
  return {
    W,
    H,
    top,
    bottom,
    iconX: W / 2,
    iconY: H / 2,
    iconR: 44,
    domeX: W / 2,
    domeY: H + domeR * 0.36,
    domeR,
    homeX: W / 2,
    homeY,
    homeR,
    entryY: Math.round(H * 0.38),
    hintY: H - bottom - 14, // inside the dome's clear centre, not its bevel
    titleY,
    lineY,
    reveal: [16, titleY - 46, W - 16, lineY + 16],
    pileTop: Math.max(6, top - 44),
    pileBottom: homeY - homeR - 24,
    dragMaxY: ctaTop - homeR - 8,
    ctaTop,
  };
}
