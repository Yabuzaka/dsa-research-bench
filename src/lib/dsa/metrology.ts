import { fft2d } from "./fft.ts";
import { colorizePhi, type FieldLook, type LookFamily } from "./looks.ts";
import type { SimConfig } from "./types.ts";

export type RadialBin = { k: number; s: number };

export type ExtraMetrics = {
  meanPhi: number;
  order: number;
  peakK: number;
  peakPitchNm: number;
  cdNm: number;
  lwrNm: number;
  lerNm: number;
  defectIndex: number;
  hexatic: number;
  nDomains: number;
};

export function computeMetrics(
  phi: Float32Array,
  cfg: SimConfig,
  k2: Float32Array,
  re: Float32Array,
  im: Float32Array,
): ExtraMetrics {
  const { nx, ny, dxNm, L0Nm } = cfg;
  const n = nx * ny;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += phi[i];
  mean /= n;

  re.set(phi);
  im.fill(0);
  fft2d(re, im, nx, ny, false);

  let peakI = 1;
  let peakMag = 0;
  let totalMag = 0;
  for (let i = 1; i < n; i++) {
    const mag = re[i] * re[i] + im[i] * im[i];
    totalMag += mag;
    if (mag > peakMag) {
      peakMag = mag;
      peakI = i;
    }
  }
  const order = totalMag > 0 ? peakMag / (totalMag / (n - 1) + peakMag) : 0;
  const peakK = Math.sqrt(k2[peakI]);
  const peakPitchNm = peakK > 1e-6 ? (2 * Math.PI * dxNm) / peakK : L0Nm;

  const edges = sampleInterfaces(phi, nx, ny, dxNm);
  const cdNm = edges.cd;
  const lwrNm = edges.lwr;
  const lerNm = edges.ler;

  const blobs = connectedComponents(phi, nx, ny);
  const hexatic = hexaticPsi6(blobs.centroids, cfg.f);
  const periodErr = Math.abs(peakPitchNm - L0Nm) / L0Nm;
  const defectIndex = clamp(
    (1 - order) * 1.4 + periodErr * 2 + Math.max(0, 1 - hexatic) * (cfg.f < 0.42 ? 0.6 : 0.15),
    0,
    2,
  );

  return {
    meanPhi: mean,
    order,
    peakK,
    peakPitchNm,
    cdNm,
    lwrNm,
    lerNm,
    defectIndex,
    hexatic,
    nDomains: blobs.count,
  };
}

function sampleInterfaces(
  phi: Float32Array,
  nx: number,
  ny: number,
  dxNm: number,
) {
  const widths: number[] = [];
  const traces: number[][] = [];
  for (let y = 3; y < ny - 3; y += 1) {
    const xs: number[] = [];
    for (let x = 1; x < nx; x++) {
      const a = phi[y * nx + x - 1];
      const b = phi[y * nx + x];
      if (a === 0 || a * b < 0) {
        const t = a - b === 0 ? 0 : a / (a - b);
        xs.push((x - 1 + t) * dxNm);
      }
    }
    for (let k = 1; k < xs.length; k++) widths.push(xs[k] - xs[k - 1]);
    if (xs.length >= 2) traces.push(xs);
  }
  const cd = median(widths) || 0;
  const lwr = threeSigma(widths);
  const lerSamples: number[] = [];
  const nEdge = traces[0]?.length ?? 0;
  for (let e = 0; e < nEdge; e++) {
    const col: number[] = [];
    for (const row of traces) {
      if (row[e] !== undefined) col.push(row[e]);
    }
    if (col.length < 6) continue;
    const m = meanOf(col);
    for (const v of col) lerSamples.push(v - m);
  }
  const ler = threeSigma(lerSamples) || lwr;
  return { cd, lwr, ler };
}

export function midLineCut(phi: Float32Array, nx: number, ny: number, dxNm: number) {
  const y = (ny / 2) | 0;
  const out: { x: number; phi: number }[] = [];
  const step = Math.max(1, (nx / 96) | 0);
  for (let x = 0; x < nx; x += step) {
    out.push({ x: x * dxNm, phi: phi[y * nx + x] });
  }
  return out;
}

export function zeroCrossings(phi: Float32Array, nx: number, ny: number, dxNm: number, cap = 500) {
  const pts: { x: number; y: number }[] = [];
  const ys = Math.max(1, (ny / 64) | 0);
  for (let y = 2; y < ny - 2; y += ys) {
    for (let x = 1; x < nx; x++) {
      const a = phi[y * nx + x - 1];
      const b = phi[y * nx + x];
      if (a === 0 || a * b < 0) {
        const t = a - b === 0 ? 0 : a / (a - b);
        pts.push({ x: (x - 1 + t) * dxNm, y: y * dxNm });
        if (pts.length >= cap) return pts;
      }
    }
  }
  return pts;
}

function connectedComponents(phi: Float32Array, nx: number, ny: number) {
  const seen = new Uint8Array(nx * ny);
  const centroids: { x: number; y: number }[] = [];
  let count = 0;
  const stack: number[] = [];
  for (let i = 0; i < phi.length; i++) {
    if (seen[i] || phi[i] < 0) continue;
    count += 1;
    stack.length = 0;
    stack.push(i);
    seen[i] = 1;
    let sx = 0;
    let sy = 0;
    let np = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % nx;
      const y = (p / nx) | 0;
      sx += x;
      sy += y;
      np += 1;
      if (x > 0 && !seen[p - 1] && phi[p - 1] >= 0) {
        seen[p - 1] = 1;
        stack.push(p - 1);
      }
      if (x + 1 < nx && !seen[p + 1] && phi[p + 1] >= 0) {
        seen[p + 1] = 1;
        stack.push(p + 1);
      }
      if (y > 0 && !seen[p - nx] && phi[p - nx] >= 0) {
        seen[p - nx] = 1;
        stack.push(p - nx);
      }
      if (y + 1 < ny && !seen[p + nx] && phi[p + nx] >= 0) {
        seen[p + nx] = 1;
        stack.push(p + nx);
      }
    }
    if (np > 8) centroids.push({ x: sx / np, y: sy / np });
  }
  return { count, centroids };
}

function hexaticPsi6(centroids: { x: number; y: number }[], f: number) {
  if (f > 0.42 || centroids.length < 8) return 0;
  let acc = 0;
  let n = 0;
  for (let i = 0; i < centroids.length; i++) {
    const a = centroids[i];
    const neigh: { d: number; th: number }[] = [];
    for (let j = 0; j < centroids.length; j++) {
      if (i === j) continue;
      const b = centroids[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      neigh.push({ d: dx * dx + dy * dy, th: Math.atan2(dy, dx) });
    }
    neigh.sort((u, v) => u.d - v.d);
    const take = neigh.slice(0, 6);
    if (take.length < 5) continue;
    let re = 0;
    let im = 0;
    for (const t of take) {
      re += Math.cos(6 * t.th);
      im += Math.sin(6 * t.th);
    }
    acc += Math.hypot(re, im) / take.length;
    n += 1;
  }
  return n ? acc / n : 0;
}

export function renderRgba(
  phi: Float32Array,
  cfg: SimConfig,
  mobile: Uint8Array,
  look: FieldLook = "paper",
  family: LookFamily = "pspmma",
) {
  void cfg;
  return colorizePhi(phi, mobile, look, family);
}

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length / 2) | 0];
}

function meanOf(xs: number[]) {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length ? s / xs.length : 0;
}

function threeSigma(xs: number[]) {
  if (xs.length < 4) return 0;
  const m = meanOf(xs);
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  return 3 * Math.sqrt(v / xs.length);
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
