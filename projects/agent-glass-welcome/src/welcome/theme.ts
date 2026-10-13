// Palette: warm ivory / ink / one clay accent. Warm greys only.
// The glass dispersion ramp (clay → fig → sky) is an optical effect inside the
// lens, never used as chrome colour.

export type Palette = {
  bg: string;
  ink: string;
  secondary: string;
  muted: string;
  accent: string;
  ctaBg: string;
  ctaInk: string;
  dark: boolean;
};

export const light: Palette = {
  bg: '#F5F4EF',
  ink: '#141413',
  secondary: '#5E5D59',
  muted: '#8F8D85',
  accent: '#D97757',
  ctaBg: '#141413',
  ctaInk: '#FAF9F5',
  dark: false,
};

export const dark: Palette = {
  bg: '#262624',
  ink: '#FAF9F5',
  secondary: '#C2C0B6',
  muted: '#8F8D85',
  accent: '#D97757',
  ctaBg: '#FAF9F5',
  ctaInk: '#141413',
  dark: true,
};

export function hexToRgb(hex: string): [number, number, number] {
  'worklet';
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const copy = {
  entry: ['Hello. Let’s make', 'something together.'],
  hint: 'Swipe up to begin',
  title: 'Meet Claude.',
  linePrefix: 'Your ',
  struck: 'chatbot',
  typed: 'collaborator.',
  cta: 'Get started',
  secondary: 'I already have an account',
};
