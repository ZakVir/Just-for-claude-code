import type { ReactNode } from 'react';
import { Group, Paint, RuntimeShader } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import type { Uniforms } from '@/welcome/frame';
import { glassEffect } from './effect';

/**
 * Applies the liquid-glass shader to everything drawn inside it, as a runtime
 * image filter. The filter works in device pixels (scale 1/pd outside, pd
 * inside) so the shader samples the scene 1:1; it divides by uPd itself.
 */
export function GlassLayer({
  pd,
  uniforms,
  children,
}: {
  pd: number;
  uniforms: SharedValue<Uniforms>;
  children: ReactNode;
}) {
  return (
    <Group transform={[{ scale: 1 / pd }]}>
      <Group
        layer={
          <Paint>
            <RuntimeShader source={glassEffect} uniforms={uniforms} />
          </Paint>
        }
      >
        <Group transform={[{ scale: pd }]}>{children}</Group>
      </Group>
    </Group>
  );
}
