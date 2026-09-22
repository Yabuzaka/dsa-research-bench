/**
 * Morphology classification, Leibler RPA S(k), and director field.
 * Hexatic / nematic colouring is the fingerprint figure DSA papers use
 * for dislocation and disclination readout.
 */

import { lamellarDOverRg, rgNmFromL0 } from "./scft.ts";

export type MorphClass = "LAM" | "HEX" | "DIS" | "MIX";

export type RadialPt = { k: number; s: number; sTh?: number };

/** Debye function g(f, x) with x = (k Rg)². */
export function debye(f: number, x: number) {
  if (x < 1e-8) return f * f;
  return (2 * (f * x + Math.exp(-f * x) - 1)) / (x * x);
}

/**
 * Leibler inverse structure factor F(x,f) so that S(k)/N = 1 / (F − 2χN).
 * Peak at f = 1/2 sits at k* Rg ≈ 1.95 (x* ≈ 3.785).
 */
export function leiblerF(x: number, f: number) {
  const g1 = debye(1, x);
  const gA = debye(f, x);
  const gB = debye(1 - f, x);
  const cross = 0.5 * (g1 - gA - gB);
  const den = gA * gB - cross * cross;
  return den > 1e-12 ? g1 / den : 1e6;
}

export function leiblerS(kRg: number, chiN: number, f: number) {
  const x = kRg * kRg;
  const inv = leiblerF(x, f) - 2 * chiN;
  if (inv <= 1e-6) return 1e6;
  return 1 / inv;
}

/** k* Rg for a symmetric diblock (Leibler). */
export function leiblerKstarRg(f = 0.5) {
  let bestX = 3.785;
  let best = leiblerF(bestX, f);
  for (let x = 1.5; x < 8; x += 0.02) {
    const v = leiblerF(x, f);
    if (v < best) {
      best = v;
      bestX = x;
    }
  }
  return Math.sqrt(bestX);
}

export function overlayLeibler(
  radial: { k: number; s: number }[],
  chiN: number,
  f: number,
  L0Nm: number,
): RadialPt[] {
  const Rg = rgNmFromL0(L0Nm, chiN);
  let peakS = 0;
  let peakTh = 0;
  const raw = radial.map((p) => {
    const kRg = p.k * Rg;
    const sTh = leiblerS(Math.max(kRg, 0.05), chiN, f);
    if (p.s > peakS) peakS = p.s;
    if (sTh > peakTh) peakTh = sTh;
    return { k: p.k, s: p.s, sTh };
  });
  const scale = peakTh > 0 ? peakS / peakTh : 1;
  return raw.map((p) => ({ ...p, sTh: p.sTh * scale }));
}

export function classifyMorphology(args: {
  order: number;
  hexatic: number;
  f: number;
  radial: { k: number; s: number }[];
}): MorphClass {
  if (args.order < 0.12) return "DIS";
  const peak = args.radial.reduce((m, p) => (p.s > m.s ? p : m), { k: 0, s: 0 });
  if (peak.k > 0) {
    const kHex = peak.k * Math.sqrt(3);
    let second = 0;
    for (const p of args.radial) {
      if (Math.abs(p.k - kHex) / kHex < 0.18) second = Math.max(second, p.s);
    }
    const ratio = second / Math.max(peak.s, 1e-12);
    if (args.f < 0.42 && (args.hexatic > 0.28 || ratio > 0.12)) return "HEX";
    if (ratio > 0.22 && args.f < 0.45) return "HEX";
  }
  if (args.hexatic > 0.45 && args.f < 0.42) return "HEX";
  if (args.order > 0.22 && args.order < 0.4 && args.hexatic > 0.15) return "MIX";
  return "LAM";
}

/**
 * Nematic director colour: hue from 2θ of ∇φ so +n and −n match.
 * Defects (dislocations, disclinations) show as colour singularities.
 */
export function renderDirector(
  phi: Float32Array,
  nx: number,
  ny: number,
  mobile: Uint8Array,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(nx * ny * 4);
  const wall = [18, 32, 51];
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      const o = i * 4;
      if (!mobile[i]) {
        rgba[o] = wall[0];
        rgba[o + 1] = wall[1];
        rgba[o + 2] = wall[2];
        rgba[o + 3] = 255;
        continue;
      }
      const xm = (x + nx - 1) % nx;
      const xp = (x + 1) % nx;
      const ym = (y + ny - 1) % ny;
      const yp = (y + 1) % ny;
      const gx = phi[y * nx + xp] - phi[y * nx + xm];
      const gy = phi[yp * nx + x] - phi[ym * nx + x];
      const mag = Math.hypot(gx, gy);
      const th = 0.5 * Math.atan2(gy, gx);
      const hue = (th / Math.PI + 1) % 1;
      const sat = Math.min(1, mag * 2.2);
      const val = 0.22 + 0.78 * sat;
      const [r, g, b] = hsvRgb(hue, sat, val);
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

function hsvRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default:
      r = v;
      g = p;
      b = q;
  }
  return [(r * 255) | 0, (g * 255) | 0, (b * 255) | 0];
}

export function tanhReference(
  lineCut: { x: number; phi: number }[],
  chiN: number,
  L0Nm: number,
): { x: number; phi: number; tanh: number }[] {
  if (!lineCut.length) return [];
  let x0 = lineCut[0].x;
  for (let i = 1; i < lineCut.length; i++) {
    if (lineCut[i - 1].phi * lineCut[i].phi <= 0) {
      const t =
        lineCut[i - 1].phi / (lineCut[i - 1].phi - lineCut[i].phi + 1e-12);
      x0 = lineCut[i - 1].x + t * (lineCut[i].x - lineCut[i - 1].x);
      break;
    }
  }
  const Delta = (L0Nm * 0.55) / Math.sqrt(Math.max(chiN, 6)) / 2;
  return lineCut.map((p) => ({
    x: p.x,
    phi: p.phi,
    tanh: Math.tanh((p.x - x0) / Math.max(Delta, 0.15)),
  }));
}

export { lamellarDOverRg };
