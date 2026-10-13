import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text as RNText,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Canvas,
  Fill,
  Group,
  Image,
  Path,
  Rect,
  Skia,
  Text,
  useFont,
  useImage,
  type SkImage,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { computeLayout, type Layout } from '@/welcome/layout';
import { copy, dark, light, type Palette } from '@/welcome/theme';
import { sparkPolygons } from '@/welcome/spark';
import {
  EV_COMMIT,
  EV_SNAP_HOME,
  canGrab,
  commit,
  createLens,
  step,
  touchDown,
  touchMove,
  touchUp,
  type Lens,
} from '@/welcome/controller';
import { BUBBLES, STRIDE, TOKENS } from '@/welcome/physics';
import { currentWelcome, lineLayout, scribblePoints, shaderUniforms, type LineMetrics } from '@/welcome/frame';
import { GlassLayer } from './GlassLayer';

const SERIF_400 = require('../../../assets/fonts/SourceSerif4_400Regular.ttf');
const SERIF_500 = require('../../../assets/fonts/SourceSerif4_500Medium.ttf');
const TOKEN_FILES = [
  require('../../../assets/tokens/check.png'),
  require('../../../assets/tokens/branch.png'),
  require('../../../assets/tokens/report.png'),
  require('../../../assets/tokens/phone.png'),
  require('../../../assets/tokens/globe.png'),
  require('../../../assets/tokens/rocket.png'),
  require('../../../assets/tokens/doc.png'),
  require('../../../assets/tokens/tablet.png'),
];

function polysToPath(polys: number[][]) {
  'worklet';
  const b = Skia.PathBuilder.Make();
  for (const pts of polys) {
    b.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) b.lineTo(pts[i], pts[i + 1]);
    b.close();
  }
  return b.build();
}

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const pal = scheme === 'dark' ? dark : light;
  const reduceMotion = useReducedMotion();
  const pd = PixelRatio.get();
  const L = useMemo(
    () => computeLayout(width, height, insets.top, insets.bottom),
    [width, height, insets.top, insets.bottom],
  );

  const entryFont = useFont(SERIF_400, 21);
  const hintFont = useFont(SERIF_400, 14);
  const lineFont = useFont(SERIF_400, 25);
  const titleFont = useFont(SERIF_500, 34);
  const images = TOKEN_FILES.map((f) => useImage(f)); // fixed-length list, hook order is stable
  const ready = !!(entryFont && hintFont && lineFont && titleFont && images.every(Boolean));

  const lens = useSharedValue<Lens>(createLens(L, reduceMotion));
  const [entered, setEntered] = useState(false);

  const onEvents = useCallback((ev: number) => {
    if (ev & EV_COMMIT) {
      setEntered(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      AccessibilityInfo.announceForAccessibility(`${copy.title} Your ${copy.typed}`);
    }
    if (ev & EV_SNAP_HOME) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const clock = useFrameCallback((info) => {
    const dt = info.timeSincePreviousFrame == null ? 0 : info.timeSincePreviousFrame / 1000;
    let ev = 0;
    lens.modify((s) => {
      'worklet';
      step(s, L, dt);
      ev = s.events;
      s.events = 0;
      return s;
    });
    if (ev) scheduleOnRN(onEvents, ev);
  }, false);

  // The native splash shows the same spark at the same spot; hand over once
  // the fonts and token images are in memory so the first frame is complete.
  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync();
    clock.setActive(true);
  }, [ready, clock]);

  const metrics: LineMetrics | null = useMemo(
    () =>
      lineFont
        ? {
            prefix: lineFont.getTextWidth(copy.linePrefix),
            struck: lineFont.getTextWidth(copy.struck),
            space: lineFont.getTextWidth(' '),
            typed: lineFont.getTextWidth(copy.typed),
          }
        : null,
    [lineFont],
  );

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e, manager) => {
      const t = e.allTouches[0];
      if (!canGrab(lens.value, L, t.x, t.y)) {
        manager.fail();
        return;
      }
      lens.modify((s) => {
        'worklet';
        touchDown(s, t.x, t.y);
        return s;
      });
      manager.activate();
    })
    .onUpdate((e) => {
      lens.modify((s) => {
        'worklet';
        touchMove(s, L, e.x, e.y, e.velocityX, e.velocityY);
        return s;
      });
    })
    .onEnd((e) => {
      const tap = Math.abs(e.translationX) < 6 && Math.abs(e.translationY) < 6;
      lens.modify((s) => {
        'worklet';
        touchUp(s, L, e.velocityX, e.velocityY);
        if (tap && s.stage === 0 && e.y > L.domeY - L.domeR) commit(s);
        return s;
      });
    })
    .onFinalize((_e, success) => {
      if (success) return;
      lens.modify((s) => {
        'worklet';
        touchUp(s, L, 0, 0);
        return s;
      });
    });

  const beginFromAccessibility = useCallback(() => {
    lens.modify((s) => {
      'worklet';
      commit(s);
      return s;
    });
  }, [lens]);

  return (
    <View style={[styles.root, { backgroundColor: pal.bg }]}>
      <StatusBar style={pal.dark ? 'light' : 'dark'} />
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill} accessible={false}>
          {ready && metrics && (
            <Scene
              lens={lens}
              L={L}
              pal={pal}
              pd={pd}
              metrics={metrics}
              fonts={{
                entry: entryFont!,
                hint: hintFont!,
                line: lineFont!,
                title: titleFont!,
              }}
              images={images as SkImage[]}
            />
          )}
        </View>
      </GestureDetector>

      {/* VoiceOver: the canvas is decorative; these carry the meaning. */}
      {!entered ? (
        <>
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={copy.entry.join(' ')}
            pointerEvents="none"
            style={[styles.a11y, { top: L.entryY - 30, height: 60 }]}
          />
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel="Begin"
            accessibilityHint="Swipe up, or double-tap, to begin"
            onAccessibilityTap={beginFromAccessibility}
            pointerEvents="none"
            style={[styles.a11y, { top: L.domeY - L.domeR, bottom: 0 }]}
          />
        </>
      ) : (
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${copy.title} Your ${copy.typed}`}
          pointerEvents="none"
          style={[styles.a11y, { top: L.titleY - 40, height: 100 }]}
        />
      )}

      <Actions lens={lens} pal={pal} L={L} entered={entered} />
    </View>
  );
}

type Fonts = {
  entry: NonNullable<ReturnType<typeof useFont>>;
  hint: NonNullable<ReturnType<typeof useFont>>;
  line: NonNullable<ReturnType<typeof useFont>>;
  title: NonNullable<ReturnType<typeof useFont>>;
};

function Scene({
  lens,
  L,
  pal,
  pd,
  metrics,
  fonts,
  images,
}: {
  lens: SharedValue<Lens>;
  L: Layout;
  pal: Palette;
  pd: number;
  metrics: LineMetrics;
  fonts: Fonts;
  images: SkImage[];
}) {
  const uniforms = useDerivedValue(() => {
    const s = lens.value;
    return shaderUniforms(s, L, pal, pd, currentWelcome(s));
  });
  const wf = useDerivedValue(() => currentWelcome(lens.value));
  const ll = useDerivedValue(() => lineLayout(metrics, L.W, wf.value.typed));

  const entryOpacity = useDerivedValue(() => {
    const s = lens.value;
    return s.intro.textAlpha * (s.stage === 0 ? 1 : wf.value.entryFade);
  });
  const hintOpacity = useDerivedValue(() => {
    const s = lens.value;
    return s.intro.hintAlpha * (s.stage === 0 ? 1 : wf.value.entryFade);
  });
  const e0 = fonts.entry.getTextWidth(copy.entry[0]);
  const e1 = fonts.entry.getTextWidth(copy.entry[1]);
  const hw = fonts.hint.getTextWidth(copy.hint);
  const tw = fonts.title.getTextWidth(copy.title);

  const prefixX = useDerivedValue(() => ll.value.x);
  const struckX = useDerivedValue(() => ll.value.struckX);
  const typedX = useDerivedValue(() => ll.value.typedX);
  const struckColor = useDerivedValue(() => (wf.value.strike > 0 ? pal.muted : pal.secondary));
  const typedClip = useDerivedValue(() =>
    Skia.XYWHRect(ll.value.typedX - 1, L.lineY - 30, ll.value.typedVisibleW + 1, 40),
  );
  const scribble = useDerivedValue(() => {
    const pts = scribblePoints(ll.value.struckX, ll.value.struckW, L.lineY - 8, wf.value.strike);
    const b = Skia.PathBuilder.Make();
    if (wf.value.strike > 0) {
      b.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) b.lineTo(pts[i], pts[i + 1]);
    }
    return b.build();
  });
  const caretX = useDerivedValue(() => ll.value.caretX);
  const caretOpacity = useDerivedValue(() => wf.value.caret);

  const rays = useDerivedValue(() => {
    const s = lens.value;
    return polysToPath(sparkPolygons(L.iconX, L.iconY, L.iconR, 0, 0, 0, s.intro.rayRetract));
  });
  const rayOpacity = useDerivedValue(() => (lens.value.stage === 0 ? lens.value.intro.rayAlpha : 0));
  const glyph = useDerivedValue(() => {
    const s = lens.value;
    const g = currentWelcome(s).glyph;
    const R = s.r * 0.46 * (0.7 + 0.3 * g);
    return polysToPath(sparkPolygons(s.x, s.y, R, s.reduceMotion ? 0 : s.t * 0.12, s.reduceMotion ? 0 : 1, s.t, 0));
  });
  const glyphOpacity = useDerivedValue(() => (lens.value.stage === 1 ? wf.value.glyph : 0));
  const tokenOpacity = useDerivedValue(() => wf.value.glyph);

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <GlassLayer pd={pd} uniforms={uniforms}>
        <Fill color={pal.bg} />
        <Group opacity={entryOpacity}>
          <Text x={(L.W - e0) / 2} y={L.entryY - 4} text={copy.entry[0]} font={fonts.entry} color={pal.secondary} />
          <Text x={(L.W - e1) / 2} y={L.entryY + 24} text={copy.entry[1]} font={fonts.entry} color={pal.secondary} />
        </Group>
        <Text
          x={(L.W - hw) / 2}
          y={L.hintY}
          text={copy.hint}
          font={fonts.hint}
          color={pal.muted}
          opacity={hintOpacity}
        />

        {/* Present from the start: the shader hides it outside the lens until
                revealed, so the rising dome is a portal into it. */}
        <Text x={(L.W - tw) / 2} y={L.titleY} text={copy.title} font={fonts.title} color={pal.ink} />
        <Text x={prefixX} y={L.lineY} text={copy.linePrefix} font={fonts.line} color={pal.secondary} />
        <Text x={struckX} y={L.lineY} text={copy.struck} font={fonts.line} color={struckColor} />
        <Group clip={typedClip}>
          <Text x={typedX} y={L.lineY} text={copy.typed} font={fonts.line} color={pal.ink} />
        </Group>
        <Path
          path={scribble}
          style="stroke"
          strokeWidth={2.4}
          strokeCap="round"
          strokeJoin="round"
          color={pal.accent}
        />
        <Rect x={caretX} y={L.lineY - 21} width={2.5} height={26} color={pal.accent} opacity={caretOpacity} />

        {/* flat tokens; the shader turns each into a glass sphere */}
        <Group opacity={tokenOpacity}>
          {Array.from({ length: BUBBLES }, (_, i) => (
            <Token key={i} index={i} lens={lens} image={images[i % TOKENS]} />
          ))}
        </Group>
      </GlassLayer>

      {/* crisp marks above the glass */}
      <Path path={rays} color={pal.accent} opacity={rayOpacity} />
      <Path path={glyph} color={pal.accent} opacity={glyphOpacity} />
    </Canvas>
  );
}

function Token({ index, lens, image }: { index: number; lens: SharedValue<Lens>; image: SkImage }) {
  const rect = useDerivedValue(() => {
    const b = lens.value.bubbles;
    const o = index * STRIDE;
    const r = b[o + 4] * 0.96;
    return Skia.XYWHRect(b[o] - r, b[o + 1] - r, r * 2, r * 2);
  });
  return <Image image={image} rect={rect} fit="cover" />;
}

function Actions({ lens, pal, L, entered }: { lens: SharedValue<Lens>; pal: Palette; L: Layout; entered: boolean }) {
  const pressed = useSharedValue(1);
  const style = useAnimatedStyle(() => {
    const cta = currentWelcome(lens.value).cta;
    return {
      opacity: lens.value.stage === 1 ? cta : 0,
      transform: [{ translateY: (1 - cta) * 10 }],
    };
  });
  const press = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value }],
  }));
  return (
    <Animated.View pointerEvents={entered ? 'box-none' : 'none'} style={[styles.actions, { top: L.ctaTop }, style]}>
      <Pressable
        accessibilityRole="button"
        onPressIn={() => (pressed.value = withTiming(0.97, { duration: 100 }))}
        onPressOut={() => (pressed.value = withTiming(1, { duration: 150 }))}
        onPress={() => router.push('/onboarding')}
      >
        <Animated.View style={[styles.primary, { backgroundColor: pal.ctaBg }, press]}>
          <RNText style={[styles.primaryLabel, { color: pal.ctaInk }]}>{copy.cta}</RNText>
        </Animated.View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/sign-in')}
        style={({ pressed: p }) => [styles.secondary, { opacity: p ? 0.4 : 1 }]}
      >
        <RNText style={[styles.secondaryLabel, { color: pal.secondary }]}>{copy.secondary}</RNText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  a11y: { position: 'absolute', left: 16, right: 16 },
  actions: { position: 'absolute', left: 24, right: 24, gap: 4 },
  primary: {
    height: 54,
    borderRadius: 27,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { fontSize: 15, fontWeight: '500' },
});
