import type { ReactNode } from 'react';
import { Group } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import type { Uniforms } from '@/welcome/frame';
import { glassEffect } from './effect';

/**
 * Web: CanvasKit has no runtime-shader image filter, so the Expo web build
 * draws the scene without glass. It exists to exercise the layout, timeline,
 * gestures and physics in a browser. The glass itself is verified by the WebGL
 * preview (same shader core) and by scripts/verify-sksl.mjs (this SkSL,
 * rendered by CanvasKit).
 */
export function GlassLayer({ children }: { pd: number; uniforms: SharedValue<Uniforms>; children: ReactNode }) {
  void glassEffect; // still compiled at import, so a bad SkSL fails loudly on web too
  return <Group>{children}</Group>;
}
