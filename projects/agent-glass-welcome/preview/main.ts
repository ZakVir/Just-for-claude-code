// Dependency-free WebGL2 preview of the welcome screen. It shares the
// choreography, physics, controller and shader core with the native screen
// (src/welcome/*); only the drawing differs (Canvas2D scene → WebGL texture).
import { computeLayout, type Layout } from '../src/welcome/layout';
import { light, dark, copy, type Palette } from '../src/welcome/theme';
import { sparkPolygons } from '../src/welcome/spark';
import {
  createLens,
  canGrab,
  touchDown,
  touchMove,
  touchUp,
  commit,
  step,
  EV_COMMIT,
  EV_SNAP_HOME,
  type Lens,
} from '../src/welcome/controller';
import { BUBBLES, STRIDE } from '../src/welcome/physics';
import { currentWelcome, lineLayout, scribblePoints, shaderUniforms, type LineMetrics } from '../src/welcome/frame';
import { GLSL_FRAG, GLSL_VERT } from '../src/welcome/shader';

declare const TOKEN_URLS: string[];

const SERIF = "'Source Serif 4', ui-serif, Georgia, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif";

const device = document.getElementById('device') as HTMLDivElement;
const glCanvas = document.getElementById('gl') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
const ctaWrap = document.getElementById('cta') as HTMLDivElement;
const sceneCanvas = document.createElement('canvas');
const sctx = sceneCanvas.getContext('2d')!;
const octx = overlay.getContext('2d')!;
const gl = glCanvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true })!;

const params = new URLSearchParams(location.search);
let themeOverride: 'light' | 'dark' | null = (params.get('theme') as 'light' | 'dark') || null;
let reduceOverride: boolean | null = params.has('reduce') ? params.get('reduce') === '1' : null;
const mq = matchMedia('(prefers-color-scheme: dark)');
const rmq = matchMedia('(prefers-reduced-motion: reduce)');
const palette = (): Palette => ((themeOverride ?? (mq.matches ? 'dark' : 'light')) === 'dark' ? dark : light);
const reduced = () => reduceOverride ?? rmq.matches;

// ---------- GL setup
function compile(type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
  return sh;
}
const prog = gl.createProgram()!;
gl.attachShader(prog, compile(gl.VERTEX_SHADER, GLSL_VERT));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, GLSL_FRAG));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
gl.useProgram(prog);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, 'aPos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const loc: Record<string, WebGLUniformLocation | null> = {};
const uloc = (n: string) => (n in loc ? loc[n] : (loc[n] = gl.getUniformLocation(prog, n)));
const UNIFORM_SIZE: Record<string, number> = {
  uPd: 1,
  uBg: 4,
  uDark: 1,
  uLens: 3,
  uStretch: 2,
  uAnchor: 3,
  uZoom: 1,
  uBendK: 1,
  uGlow: 1,
  uClear: 1,
  uGlowDir: 2,
  uReveal: 4,
  uRevealAmt: 1,
  uDrops: 3,
  uBubbles: 4,
};
function setUniform(name: string, v: number | number[]) {
  const l = uloc(name.startsWith('uDrops') || name.startsWith('uBubbles') ? name + '[0]' : name);
  if (!l) return;
  const a = typeof v === 'number' ? [v] : v;
  const n = UNIFORM_SIZE[name];
  if (n === 1) gl.uniform1fv(l, a);
  else if (n === 2) gl.uniform2fv(l, a);
  else if (n === 3) gl.uniform3fv(l, a);
  else gl.uniform4fv(l, a);
}

// ---------- assets
const tokens: HTMLImageElement[] = TOKEN_URLS.map((u) => {
  const im = new Image();
  im.src = u;
  return im;
});

// ---------- state
let W = 393;
let H = 852;
let L: Layout;
let pd = 2;
let lens: Lens;
let metrics: LineMetrics;
let lastT = 0;
let entered = false;

function measure() {
  sctx.font = `400 25px ${SERIF}`;
  metrics = {
    prefix: sctx.measureText(copy.linePrefix).width,
    struck: sctx.measureText(copy.struck).width,
    space: sctx.measureText(' ').width,
    typed: sctx.measureText(copy.typed).width,
  };
}

function reset() {
  const r = device.getBoundingClientRect();
  W = Math.round(r.width);
  H = Math.round(r.height);
  const frame = device.classList.contains('framed');
  L = computeLayout(W, H, frame ? 59 : 20, frame ? 34 : 16);
  pd = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [glCanvas, overlay, sceneCanvas]) {
    c.width = Math.round(W * pd);
    c.height = Math.round(H * pd);
  }
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  lens = createLens(L, reduced());
  entered = false;
  ctaWrap.classList.remove('on');
  ctaWrap.style.opacity = '0';
  measure();
  lastT = performance.now();
  applyTheme();
  runFrame(0);
}

function applyTheme() {
  const p = palette();
  document.documentElement.dataset.theme = p.dark ? 'dark' : 'light';
}

// ---------- drawing
function drawScene(s: Lens, p: Palette) {
  const c = sctx;
  const wf = currentWelcome(s);
  c.setTransform(pd, 0, 0, pd, 0, 0);
  c.fillStyle = p.bg;
  c.fillRect(0, 0, W, H);
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';

  // stage 0 copy
  const entryA = s.intro.textAlpha * (s.stage === 0 ? 1 : wf.entryFade);
  if (entryA > 0.001) {
    c.globalAlpha = entryA;
    c.fillStyle = p.secondary;
    c.font = `400 21px ${SERIF}`;
    c.fillText(copy.entry[0], W / 2, L.entryY - 4);
    c.fillText(copy.entry[1], W / 2, L.entryY + 24);
  }
  const hintA = s.intro.hintAlpha * (s.stage === 0 ? 1 : wf.entryFade);
  if (hintA > 0.001) {
    c.globalAlpha = hintA;
    c.fillStyle = p.muted;
    c.font = `500 13px ${SANS}`;
    c.fillText(copy.hint, W / 2, L.hintY);
  }
  c.globalAlpha = 1;

  // stage 1 headline — always present; the shader keeps it hidden outside the
  // lens until revealed, so the rising dome works as a portal into it
  c.fillStyle = p.ink;
  c.font = `500 34px ${SERIF}`;
  c.fillText(copy.title, W / 2, L.titleY);
  const ll = lineLayout(metrics, W, wf.typed);
  c.textAlign = 'left';
  c.font = `400 25px ${SERIF}`;
  c.fillStyle = p.secondary;
  c.fillText(copy.linePrefix, ll.x, L.lineY);
  c.fillStyle = wf.strike > 0 ? p.muted : p.secondary;
  c.fillText(copy.struck, ll.struckX, L.lineY);
  if (wf.typed > 0) {
    c.save();
    c.beginPath();
    c.rect(ll.typedX - 1, L.lineY - 30, ll.typedVisibleW + 1, 40);
    c.clip();
    c.fillStyle = p.ink;
    c.fillText(copy.typed, ll.typedX, L.lineY);
    c.restore();
  }
  if (wf.strike > 0) {
    const pts = scribblePoints(ll.struckX, ll.struckW, L.lineY - 8, wf.strike);
    c.strokeStyle = p.accent;
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, pts[i], pts[i + 1]);
    c.stroke();
  }
  if (wf.caret > 0) {
    c.globalAlpha = wf.caret;
    c.fillStyle = p.accent;
    c.fillRect(ll.caretX, L.lineY - 21, 2.5, 26);
    c.globalAlpha = 1;
  }

  // flat tokens under the glass bubbles (the shader turns them into spheres)
  const b = s.bubbles;
  c.globalAlpha = wf.glyph;
  for (let i = 0; i < BUBBLES; i++) {
    const o = i * STRIDE;
    const r = b[o + 4];
    if (r <= 0.5) continue;
    const im = tokens[b[o + 7]];
    if (!im.complete) continue;
    const rr = r * 0.96;
    c.drawImage(im, b[o] - rr, b[o + 1] - rr, rr * 2, rr * 2);
  }
  c.globalAlpha = 1;
}

function fillPolys(c: CanvasRenderingContext2D, polys: number[][]) {
  c.beginPath();
  for (const pts of polys) {
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
  }
  c.fill();
}

function drawOverlay(s: Lens, p: Palette) {
  const c = octx;
  c.setTransform(pd, 0, 0, pd, 0, 0);
  c.clearRect(0, 0, W, H);
  c.fillStyle = p.accent;
  if (s.stage === 0 && s.intro.rayAlpha > 0.001) {
    c.globalAlpha = s.intro.rayAlpha;
    fillPolys(c, sparkPolygons(L.iconX, L.iconY, L.iconR, 0, 0, 0, s.intro.rayRetract));
  }
  const wf = currentWelcome(s);
  if (s.stage === 1 && wf.glyph > 0.001) {
    c.globalAlpha = wf.glyph;
    const R = s.r * 0.46 * (0.7 + 0.3 * wf.glyph);
    const pulse = s.reduceMotion ? 0 : 1;
    fillPolys(c, sparkPolygons(s.x, s.y, R, s.reduceMotion ? 0 : s.t * 0.12, pulse, s.t, 0));
  }
  c.globalAlpha = 1;
}

// manual clock (?manual) lets the verification script step exact frames
const manual = params.has('manual');
let virtualNow = 0;
const clock = () => (manual ? virtualNow : performance.now());

function runFrame(dt: number, draw = true) {
  step(lens, L, dt);
  handleEvents();
  if (!draw) return;
  const p = palette();
  drawScene(lens, p);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
  const wf = currentWelcome(lens);
  const u = shaderUniforms(lens, L, p, pd, wf);
  for (const k in u) setUniform(k, u[k]);
  gl.uniform1i(uloc('uScene'), 0);
  gl.uniform2f(uloc('uTexSize'), sceneCanvas.width, sceneCanvas.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  drawOverlay(lens, p);
  if (entered) {
    ctaWrap.style.opacity = String(wf.cta);
    ctaWrap.style.transform = `translateY(${(1 - wf.cta) * 10}px)`;
  }
}

function render(now: number) {
  const dt = (now - lastT) / 1000;
  lastT = now;
  runFrame(dt);
  requestAnimationFrame(render);
}

function handleEvents() {
  const e = lens.events;
  if (!e) return;
  lens.events = 0;
  if (e & EV_COMMIT) {
    entered = true;
    ctaWrap.classList.add('on');
    navigator.vibrate?.(12);
  }
  if (e & EV_SNAP_HOME) navigator.vibrate?.(6);
}

// ---------- input (velocity from a short smoothed history, like a gesture recogniser)
let pointerId = -1;
let hist: { x: number; y: number; t: number }[] = [];
let downAt = { x: 0, y: 0, t: 0 };
function local(e: PointerEvent) {
  const r = device.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
function velocity() {
  if (hist.length < 2) return { vx: 0, vy: 0 };
  const a = hist[0];
  const b = hist[hist.length - 1];
  const dt = Math.max((b.t - a.t) / 1000, 1 / 120);
  return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
}
device.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('#cta')) return;
  const q = local(e);
  if (!canGrab(lens, L, q.x, q.y)) return;
  pointerId = e.pointerId;
  device.setPointerCapture(e.pointerId);
  hist = [{ ...q, t: clock() }];
  downAt = { ...q, t: clock() };
  touchDown(lens, q.x, q.y);
});
device.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId) return;
  const q = local(e);
  const t = clock();
  hist.push({ ...q, t });
  while (hist.length > 2 && t - hist[0].t > 80) hist.shift();
  const v = velocity();
  touchMove(lens, L, q.x, q.y, v.vx, v.vy);
});
const end = (e: PointerEvent) => {
  if (e.pointerId !== pointerId) return;
  pointerId = -1;
  const q = local(e);
  const t = clock();
  if (t - (hist[hist.length - 1]?.t ?? 0) > 80) hist = [];
  const v = velocity();
  const tap = Math.hypot(q.x - downAt.x, q.y - downAt.y) < 6 && t - downAt.t < 300;
  touchUp(lens, L, v.vx, v.vy);
  if (tap && lens.stage === 0 && q.y > L.domeY - L.domeR) commit(lens);
};
device.addEventListener('pointerup', end);
device.addEventListener('pointercancel', end);

// ---------- chrome controls (outside the phone)
document.getElementById('replay')!.addEventListener('click', reset);
document.getElementById('theme')!.addEventListener('click', () => {
  themeOverride = palette().dark ? 'light' : 'dark';
  applyTheme();
});
document.getElementById('motion')!.addEventListener('click', (ev) => {
  reduceOverride = !reduced();
  (ev.currentTarget as HTMLElement).setAttribute('aria-pressed', String(reduceOverride));
  reset();
});
mq.addEventListener('change', applyTheme);
window.addEventListener('resize', () => reset());

// test hooks for the verification loop
(window as unknown as { __welcome: object }).__welcome = {
  get lens() {
    return lens;
  },
  get layout() {
    return L;
  },
  advance(seconds: number, fps = 60) {
    const n = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < n; i++) {
      virtualNow += 1000 / fps;
      runFrame(1 / fps, i === n - 1);
    }
    gl.finish();
  },
  // scene texture + uniforms + WebGL output of the current frame, for the
  // SkSL cross-check (scripts/verify-sksl.mjs)
  snapshot() {
    const wf = currentWelcome(lens);
    return {
      scene: sceneCanvas.toDataURL('image/png'),
      gl: glCanvas.toDataURL('image/png'),
      uniforms: shaderUniforms(lens, L, palette(), pd, wf),
      width: sceneCanvas.width,
      height: sceneCanvas.height,
    };
  },
  ready: false,
};

Promise.all([
  document.fonts.load(`400 25px ${SERIF}`),
  document.fonts.load(`500 34px ${SERIF}`),
  ...tokens.map((im) => im.decode().catch(() => undefined)),
]).then(() => {
  reset();
  (window as unknown as { __welcome: { ready: boolean } }).__welcome.ready = true;
  if (manual) return;
  requestAnimationFrame((t) => {
    lastT = t;
    requestAnimationFrame(render);
  });
});
