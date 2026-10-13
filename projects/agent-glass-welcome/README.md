# agent-glass-welcome

An iPhone welcome screen with **liquid-glass displacement**, modelled on
Wabi's intro but rebuilt in Claude's palette, mark and voice.

Expo + React Native Skia (SkSL shader) + Reanimated. A dependency-free WebGL
preview shares the same shader core, choreography and physics.

## What it does

1. **Spark → glass.** The launch splash is the clay spark. On the first frame the
   welcome screen draws the same spark in the same place. Its twelve rays then
   retract into glass droplets, fuse (smooth-min metaballs) and fall into a
   frosted dome rising from the bottom edge. The dome's rim flashes on impact.
2. **Swipe up to begin.** The dome is a lens; "Swipe up to begin" sits under it
   and bends. Dragging it up follows the finger 1:1 and rubber-bands downward.
   The trailing rim lights with a dispersive clay → fig → sky band, and the
   lens shrinks as it rises. Release past 28 % of the travel, or flick, to
   commit; otherwise it springs back with your velocity. A tap on the dome
   also commits, and VoiceOver gets a "Begin" button.
3. **The lens is a portal.** The headline is already in the scene, but the
   shader hides it outside the glass until the reveal. The rising dome
   therefore shows "Meet Claude." before the screen does. Ball-lens optics
   magnify the centre and invert the rim, with per-channel RGB dispersion.
4. **Strike and retype.** "Your ~~chatbot~~ collaborator." A clay scribble
   strikes the old word and the new one types in behind an agent caret, while
   the line re-centres smoothly.
5. **Bubble burst.** 24 glass bubbles, carrying generated clay tokens (terminal,
   branch, check, docs, globe…), fountain out of the bead. They heap under the
   Dynamic Island with real collisions. Each bubble is its own little sphere
   lens.
6. **Play with the bead.** Grab the glass bead to drag it over the headline (it
   bends the live text) or shove it into the heap (it pushes the bubbles). It
   stretches along its velocity, and a goo bridge to its home spot snaps if
   you pull too far. On release it springs home with your velocity, with a
   light haptic as it lands.
7. **Get started / I already have an account.** The first is a push; sign-in
   is a form sheet.

**Light and dark themes** are both designed. **Reduce Motion** collapses the
sequence into cross-fades, and the heap appears pre-settled. One accent
(clay) throughout.

## Files

```
src/app/                    Expo Router: index (welcome), onboarding (push), sign-in (form sheet)
src/components/welcome/     WelcomeScreen (Skia canvas + gestures + CTAs), GlassLayer (native/web)
src/welcome/                shared, platform-free:
  shader.ts                 the liquid-glass core → SkSL (native) + GLSL ES 3.0 (preview)
  controller.ts             lens state machine: springs w/ finger velocity, rubber-band, stretch, goo, glow
  physics.ts                bubble burst + heap (collisions with each other, walls, the moving bead)
  timeline.ts               choreography as pure functions of time
  layout.ts theme.ts spark.ts frame.ts
preview/                    WebGL preview → preview/dist/glass-welcome.html (self-contained, 1.2 MB)
scripts/                    preview build, capture/verification scripts, icon renderer
assets/                     Source Serif 4 (OFL), clay tokens, icon + splash (rendered from spark.ts geometry)
research/notes.md           Wabi + AI-app welcome study, what we took, where we aim to beat it
proof/                      frames from the verification runs
```

## How to run

```bash
cd projects/agent-glass-welcome
npm install                 # also copies canvaskit.wasm into public/ for web
npx expo start              # press i for the iOS Simulator, or scan with Expo Go
# native build: npx expo run:ios   (or: npx eas-cli@latest build -p ios --profile development)
```

Live preview: https://silver-globe-bcn8.here.now/ (anonymous here.now publish,
expires 2026-10-14; the file is `preview/dist/glass-welcome.html` and works
from disk too, no install). Open it on an iPhone in Safari for the full-screen
version. On a phone it goes full screen. It has Replay, Light/Dark and Reduce
Motion toggles. To rebuild it: `npm run preview:build`.

## Verification

This container is Linux, with no Xcode and no iOS Simulator. The
appllama-app-design-skill simulator loop could not be run as written, so it
was replaced with:

- **Preview, frame by frame.** `scripts/capture-preview.mjs` drives a manual
  clock and real pointer events through intro → swipe → commit → strike/type
  → burst → bead drag → release. It runs in light, dark and Reduce Motion,
  and there are no console errors.
- **The real React Native code in a browser.** `npx expo export -p web` and
  then `scripts/capture-web.mjs` run the actual WelcomeScreen (Skia on
  CanvasKit, Reanimated, Gesture Handler) through the same flow, with no
  errors. CanvasKit has no runtime-shader *image filter*, so the web build
  draws the scene without glass (see `GlassLayer.web.tsx`).
- **SkSL ≡ GLSL.** `scripts/verify-sksl.mjs` compiles the SkSL with Skia's own
  compiler (CanvasKit in Node). It renders five states with the exact scene
  texture and uniforms from the preview and diffs them against the WebGL
  output.

Not yet verified: frame rate and haptics on a physical iPhone, and the native
image-filter path in the iOS Simulator. Run `npx expo run:ios` and record the
flow (`xcrun simctl io booted recordVideo flow.mov`) to close that gap.

## Research and tooling notes

- Built with the **Appllama skills** (`appllama-usage`,
  `appllama-app-design-skill`).
- The **Appllama MCP** (`https://mcp.appllama.io/mcp`) was not connected in the
  building session; it needs an Appllama Pro sign-in as a claude.ai custom
  connector. Research came from Appllama's public "first open" captures: Wabi
  plus nine AI apps. It also used the designer's public intro reel. See
  `research/notes.md`.
- Clay tokens were generated with Higgsfield (`z_image`) as one 12-token sheet
  in a single style, then sliced into 8 by edge-fitted circles. The free plan
  blocked the higher-quality models.
- The spark is drawn procedurally (`spark.ts`); no logo file is used. Using the
  Claude name and look makes this a concept, not an official Anthropic
  product.
