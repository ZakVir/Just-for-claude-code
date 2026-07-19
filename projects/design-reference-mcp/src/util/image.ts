/**
 * image.ts — base64 encoding + dominant-color extraction.
 *
 * Dominant colors are extracted by coarse-quantizing pixels into a color cube
 * and ranking buckets by population. A tiny dependency-free PNG decoder handles
 * 8-bit truecolor / truecolor+alpha PNGs (what Playwright screenshots produce);
 * for other formats we skip palette extraction rather than pull in a native dep.
 */
import { inflateSync } from "node:zlib";

export function mimeFromUrl(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".avif")) return "image/avif";
  return "image/png";
}

/** Inverse of mimeFromUrl — the on-disk extension that actually matches the bytes. */
export function extFromMime(mime?: string): string {
  switch ((mime ?? "image/png").split(";")[0].trim().toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "image/avif":
      return "avif";
    case "image/png":
    default:
      return "png";
  }
}

export function toBase64(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("base64");
}

export interface RGBA {
  width: number;
  height: number;
  /** Uint8 RGBA, length = width*height*4 */
  data: Uint8Array;
}

/** Paeth predictor for PNG filter type 4. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Minimal PNG decoder: 8-bit, color type 2 (RGB) or 6 (RGBA), no interlace.
 * Returns null for anything it does not support.
 */
export function decodePng(buf: Buffer): RGBA | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const dataStart = pos + 8;
    if (type === "IHDR") {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8];
      colorType = buf[dataStart + 9];
      interlace = buf[dataStart + 12];
    } else if (type === "IDAT") {
      idat.push(buf.subarray(dataStart, dataStart + len));
    } else if (type === "IEND") {
      break;
    }
    pos = dataStart + len + 4; // skip data + CRC
  }

  if (bitDepth !== 8 || interlace !== 0) return null;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels || !width || !height) return null;

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }

  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let rpos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[rpos++];
    for (let x = 0; x < stride; x++) cur[x] = raw[rpos++];

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let val = cur[x];
      switch (filter) {
        case 1: val += a; break;
        case 2: val += b; break;
        case 3: val += (a + b) >> 1; break;
        case 4: val += paeth(a, b, c); break;
      }
      cur[x] = val & 0xff;
    }

    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      out[di] = cur[si];
      out[di + 1] = cur[si + 1];
      out[di + 2] = cur[si + 2];
      out[di + 3] = channels === 4 ? cur[si + 3] : 255;
    }
    prev.set(cur);
  }

  return { width, height, data: out };
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/**
 * Dominant colors from RGBA pixels via coarse cube quantization.
 * Skips near-transparent and averages each winning bucket for a truer hex.
 */
export function dominantColorsFromRGBA(img: RGBA, count = 5): string[] {
  const bits = 4; // 16 levels per channel
  const shift = 8 - bits;
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  const { data } = img;
  const step = Math.max(1, Math.floor(data.length / 4 / 20000)) * 4; // sample up to ~20k px

  for (let i = 0; i < data.length; i += step) {
    const alpha = data[i + 3];
    if (alpha < 125) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> shift) << (bits * 2)) | ((g >> shift) << bits) | (b >> shift);
    const acc = buckets.get(key);
    if (acc) {
      acc.r += r; acc.g += g; acc.b += b; acc.n++;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((a) => toHex(Math.round(a.r / a.n), Math.round(a.g / a.n), Math.round(a.b / a.n)));
}

/** Convenience: dominant colors straight from a PNG buffer (best-effort). */
export function dominantColorsFromPng(buf: Buffer, count = 5): string[] {
  const img = decodePng(buf);
  if (!img) return [];
  return dominantColorsFromRGBA(img, count);
}
