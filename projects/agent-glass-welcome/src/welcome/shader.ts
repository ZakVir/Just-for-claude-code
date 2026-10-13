// Liquid-glass displacement. One shader core, two thin wrappers:
//   - SkSL for @shopify/react-native-skia (native iOS + CanvasKit on web)
//   - GLSL ES 3.0 for the dependency-free WebGL preview
// The core only uses the GLSL subset SkSL also accepts (vec*, mix, smoothstep…).
//
// What it renders, per pixel p (in points):
//   world(p)  = the flat scene + every bubble rendered as a small glass sphere
//   lens      = a signed-distance blob (bead/dome ∪ anchor droplet ∪ melt drops,
//               merged with smooth-min so they fuse like liquid)
//   inside the lens: a ball-lens remap — magnified centre, a bevel band whose
//   bend is strong enough to *invert* content at the rim — sampled per RGB
//   channel with slightly different strengths (dispersion), then frosted,
//   specular-lit from the top-left, and optionally lit by a travelling
//   dispersive rim glow on the trailing edge.
import { BUBBLES } from './physics';
import { DROPS } from './timeline';

const CORE = /* glsl */ `
uniform vec4 uBg;
uniform float uDark;
uniform vec3 uLens;
uniform vec2 uStretch;
uniform vec3 uAnchor;
uniform float uZoom;
uniform float uBendK;
uniform float uGlow;
uniform float uClear;
uniform vec2 uGlowDir;
uniform vec4 uReveal;
uniform float uRevealAmt;
uniform vec3 uDrops[${DROPS}];
uniform vec4 uBubbles[${BUBBLES}];

const vec3 CLAY = vec3(0.851, 0.467, 0.341);
const vec3 FIG = vec3(0.769, 0.400, 0.525);
const vec3 SKY = vec3(0.416, 0.608, 0.800);

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float mainSDF(vec2 p) {
  vec2 q = p - uLens.xy;
  float amt = length(uStretch);
  float d = length(q) - uLens.z;
  if (amt > 0.001) {
    vec2 dir = uStretch / amt;
    float s = 1.0 + amt;
    vec2 e = vec2(dot(q, dir) / s, dot(q, vec2(-dir.y, dir.x)) * s);
    d = (length(e) - uLens.z) / s;
  }
  if (uAnchor.z > 0.5) {
    d = smin(d, length(p - uAnchor.xy) - uAnchor.z, uAnchor.z * 2.0);
  }
  return d;
}

float dropsSDF(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < ${DROPS}; i++) {
    vec3 dr = uDrops[i];
    if (dr.z > 0.2) {
      d = smin(d, length(p - dr.xy) - dr.z, 9.0);
    }
  }
  return d;
}

float lensSDF(vec2 p) {
  return smin(mainSDF(p), dropsSDF(p), 9.0);
}

float revealMask(vec2 p) {
  vec2 lo = smoothstep(uReveal.xy - 10.0, uReveal.xy + 10.0, p);
  vec2 hi = vec2(1.0) - smoothstep(uReveal.zw - 10.0, uReveal.zw + 10.0, p);
  return lo.x * lo.y * hi.x * hi.y;
}

vec3 world(vec2 p, float hide) {
  vec3 col = scene(p).rgb;
  col = mix(col, uBg.rgb, revealMask(p) * hide * (1.0 - uRevealAmt));
  vec2 L = normalize(vec2(-0.55, -0.83));
  for (int i = 0; i < ${BUBBLES}; i++) {
    vec4 b = uBubbles[i];
    if (b.w > 0.001 && b.z > 0.5) {
      vec2 q = p - b.xy;
      float d = length(q) - b.z;
      if (d < b.z) {
        // soft contact shadow, slightly below
        float ds = length(q - vec2(0.0, b.z * 0.18)) - b.z;
        col *= 1.0 - (uDark > 0.5 ? 0.30 : 0.13) * b.w * exp(-max(ds, 0.0) / (b.z * 0.2)) * step(0.0, d);
        if (d < 0.6) {
          vec2 u = q / b.z;
          float rho = length(u);
          float f = 0.56 + 0.36 * rho * rho;
          vec3 g = vec3(
            scene(b.xy + u * b.z * f * 1.045).r,
            scene(b.xy + u * b.z * f).g,
            scene(b.xy + u * b.z * f * 0.955).b);
          float facing = rho > 0.001 ? dot(u / rho, L) : 0.0;
          float rim = smoothstep(0.6, 1.0, rho);
          g = mix(g, vec3(1.0), rim * (0.14 + 0.36 * max(facing, 0.0)));
          g += vec3(0.55) * smoothstep(0.30, 0.0, length(u - vec2(-0.34, -0.42)));
          g *= 1.0 - smoothstep(0.8, 1.0, rho) * max(-facing, 0.0) * 0.22;
          col = mix(col, g, smoothstep(0.6, -0.6, d) * b.w);
        }
      }
    }
  }
  return col;
}

vec4 render(vec2 p) {
  vec3 base = world(p, 1.0);
  float R = max(uLens.z, 1.0);
  float d = lensSDF(p);
  if (d > 0.0) {
    float sm = mainSDF(p - vec2(0.0, R * 0.11));
    float sd = dropsSDF(p - vec2(0.0, 2.0));
    float k = uDark > 0.5 ? 0.38 : 0.14;
    base *= 1.0 - k * exp(-max(sm, 0.0) / (R * 0.26));
    base *= 1.0 - k * exp(-max(sd, 0.0) / 4.0);
  }
  if (d < 1.0) {
    vec2 e = vec2(0.75, 0.0);
    vec2 g = vec2(lensSDF(p + e.xy) - lensSDF(p - e.xy), lensSDF(p + e.yx) - lensSDF(p - e.yx));
    vec2 n = g / max(length(g), 1e-5);
    // zoom only applies inside the main bead; melt drops just bend
    float wz = 1.0 - smoothstep(R * 0.95, R * 1.3, length(p - uLens.xy));
    float Rl = mix(14.0, R, wz);
    float band = Rl * mix(0.55, 0.24, uClear * wz);
    float t = clamp(-d / band, 0.0, 1.0);
    float h = sqrt(1.0 - (1.0 - t) * (1.0 - t));
    float bend = 1.0 - h;
    float z = uZoom;
    vec3 refr = vec3(0.0);
    for (int c = 0; c < 3; c++) {
      float k = uBendK * (1.0 + (float(c) - 1.0) * 0.085);
      vec2 sp = p - n * bend * k * Rl;
      sp = uLens.xy + (sp - uLens.xy) * mix(1.0, z * (1.0 + (float(c) - 1.0) * 0.012), wz);
      vec3 w = world(sp, 1.0 - wz);
      if (c == 0) refr.r = w.r;
      if (c == 1) refr.g = w.g;
      if (c == 2) refr.b = w.b;
    }
    float frost = ((uDark > 0.5 ? 0.035 : 0.09) + bend * (uDark > 0.5 ? 0.10 : 0.24)) * mix(1.0, 0.3, uClear * wz);
    vec3 glass = mix(refr, vec3(1.0), frost);
    vec2 L = normalize(vec2(-0.55, -0.83));
    float rimM = pow(1.0 - t, 3.0);
    glass += vec3(1.0) * rimM * (0.7 * smoothstep(0.1, 1.0, dot(n, L)) + 0.28 * smoothstep(0.3, 1.0, -dot(n, L)));
    float gl = uGlow * pow(1.0 - t, 1.6) * (0.2 + 0.8 * smoothstep(-0.3, 1.0, dot(n, uGlowDir)));
    float u = clamp(t * 2.4, 0.0, 1.0);
    vec3 ramp = mix(mix(CLAY, FIG, smoothstep(0.0, 0.5, u)), SKY, smoothstep(0.5, 1.0, u));
    glass = mix(glass, ramp, clamp(gl, 0.0, 1.0) * 0.92);
    glass += vec3(0.3) * smoothstep(1.1, 0.0, abs(d + 0.7));
    base = mix(base, clamp(glass, 0.0, 1.0), smoothstep(0.7, -0.7, d));
  }
  return vec4(base, 1.0);
}
`;

/** SkSL — used as an image filter: `image` is the scene layer, in pixels. */
export const SKSL = `
uniform shader image;
uniform float uPd;
vec4 scene(vec2 p) { return image.eval(p * uPd); }
${CORE}
half4 main(float2 coord) { return half4(render(coord / uPd)); }
`;

/** GLSL ES 3.0 — the scene arrives as a texture uploaded top-left origin. */
export const GLSL_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uTexSize;
uniform float uPd;
out vec4 fragColor;
vec4 scene(vec2 p) { return texture(uScene, clamp((p * uPd) / uTexSize, vec2(0.0), vec2(1.0))); }
${CORE}
void main() {
  vec2 coord = vec2(gl_FragCoord.x, uTexSize.y - gl_FragCoord.y);
  fragColor = render(coord / uPd);
}
`;

export const GLSL_VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;
