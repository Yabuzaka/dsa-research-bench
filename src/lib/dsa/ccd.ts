/**
 * Contact-hole CCD / LCDU / PPE metrology.
 *
 * Shang, Luo, Zeng, Zhang, Xiong — IWAPS 2025 (Proc. SPIE 13991):
 * Ohta–Kawasaki hole-multiplication calibrated to 1.5 nm of experiment
 * using a simulation-aligned centre-to-centre (CCD) extractor. Jump
 * outliers on CCD flag an erroneous morphology hop.
 *
 * Zhou et al. arXiv:2510.02715 (Oct 2025) inverse loss:
 *   L_total = α L_pos + β L_cir + γ L_rd
 * with 1 nm placement on a 20 nm hole → L_pos = 1.2e-3, 5% ellipticity
 * → L_cir = 2.5e-3.
 */

import type { HoleMarker, SimConfig } from "./types.ts";

export type Hole = HoleMarker & {
  area: number;
  a: number;
  b: number;
  circularity: number;
};

export type CcdReport = {
  holes: Hole[];
  nHoles: number;
  ccdNm: number;
  ccdSigmaNm: number;
  lcduNm: number;
  ppeNm: number;
  nJumpOutliers: number;
  circularity: number;
  lossPos: number;
  lossCir: number;
  lossRd: number;
};

const JUMP_NM = 1.5;

export function extractHoles(phi: Float32Array, cfg: SimConfig): Hole[] {
  const { nx, ny, dxNm } = cfg;
  const minority = cfg.f < 0.42 ? 1 : -1;
  const seen = new Uint8Array(nx * ny);
  const holes: Hole[] = [];
  const stack: number[] = [];
  const pts: number[] = [];
  const nPix = nx * ny;
  const minPix = 6;
  const maxPix = Math.max(80, (nPix / 8) | 0);

  for (let i = 0; i < nPix; i++) {
    if (seen[i] || phi[i] * minority < 0) continue;
    stack.length = 0;
    pts.length = 0;
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
      pts.push(p);
      tryPush(seen, phi, stack, nx, ny, x, y, p, minority);
    }
    if (np < minPix || np > maxPix) continue;
    const cx = sx / np;
    const cy = sy / np;
    let ixx = 0;
    let iyy = 0;
    let ixy = 0;
    for (const p of pts) {
      const x = (p % nx) - cx;
      const y = ((p / nx) | 0) - cy;
      ixx += x * x;
      iyy += y * y;
      ixy += x * y;
    }
    ixx /= np;
    iyy /= np;
    ixy /= np;
    const tr = ixx + iyy;
    const det = ixx * iyy - ixy * ixy;
    const disc = Math.max(tr * tr - 4 * det, 0);
    const l1 = 0.5 * (tr + Math.sqrt(disc));
    const l2 = 0.5 * (tr - Math.sqrt(disc));
    const a = 2 * Math.sqrt(Math.max(l1, 1e-6)) * dxNm;
    const b = 2 * Math.sqrt(Math.max(l2, 1e-6)) * dxNm;
    const area = np * dxNm * dxNm;
    const cd = 2 * Math.sqrt(area / Math.PI);
    const circularity = a > 1e-6 ? 1 - ((a - b) ** 2 + (a - b) ** 2) / (2 * a * a) : 1;
    holes.push({
      x: cx * dxNm,
      y: cy * dxNm,
      cd,
      area,
      a,
      b,
      circularity: clamp(circularity, 0, 1),
    });
  }
  return holes;
}

export function ccdReport(phi: Float32Array, cfg: SimConfig): CcdReport {
  const holes = extractHoles(phi, cfg);
  if (holes.length < 2) {
    return {
      holes,
      nHoles: holes.length,
      ccdNm: 0,
      ccdSigmaNm: 0,
      lcduNm: 0,
      ppeNm: 0,
      nJumpOutliers: 0,
      circularity: holes[0]?.circularity ?? 0,
      lossPos: holes.length === 0 ? 1 : 0.2,
      lossCir: holes[0] ? 1 - holes[0].circularity : 1,
      lossRd: holes.length === 0 ? 1 : 0,
    };
  }

  const nn: number[] = [];
  for (let i = 0; i < holes.length; i++) {
    let best = Infinity;
    for (let j = 0; j < holes.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(holes[i].x - holes[j].x, holes[i].y - holes[j].y);
      if (d < best) best = d;
    }
    if (best < Infinity) nn.push(best);
  }
  const ccdNm = median(nn);
  const ccdSigmaNm = threeSigma(nn);
  const nJumpOutliers = nn.filter((d) => Math.abs(d - ccdNm) > JUMP_NM).length;

  const cds = holes.map((h) => h.cd);
  const lcduNm = threeSigma(cds);
  const circ = mean(holes.map((h) => h.circularity));

  const lattice = expectedLattice(cfg);
  const ppeSamples: number[] = [];
  for (const h of holes) {
    let best = Infinity;
    for (const s of lattice) {
      const d = Math.hypot(h.x - s.x, h.y - s.y);
      if (d < best) best = d;
    }
    if (best < Infinity) ppeSamples.push(best);
  }
  const ppeNm = threeSigma(ppeSamples) || mean(ppeSamples);

  const expected = Math.max(lattice.length, 1);
  const extra = Math.max(0, holes.length - expected);
  const missing = Math.max(0, expected - holes.length);
  const lossRd = (extra + missing) / expected + 0.15 * nJumpOutliers;
  const span = Math.max(cfg.guide.LsNm || cfg.L0Nm, 8);
  const lossPos =
    mean(ppeSamples.map((d) => (d / span) ** 2)) || 0;
  const lossCir = mean(
    holes.map((h) => {
      const r = Math.max(h.cd * 0.5, 0.4);
      return ((h.a - r) ** 2 + (h.b - r) ** 2) / (2 * r * r);
    }),
  );

  return {
    holes,
    nHoles: holes.length,
    ccdNm,
    ccdSigmaNm,
    lcduNm,
    ppeNm,
    nJumpOutliers,
    circularity: circ,
    lossPos,
    lossCir,
    lossRd,
  };
}

export function expectedLattice(cfg: SimConfig): { x: number; y: number }[] {
  const { nx, ny, dxNm, guide } = cfg;
  const W = nx * dxNm;
  const H = ny * dxNm;
  const pitch = Math.max(guide.LsNm, cfg.L0Nm);
  const hex = cfg.f < 0.42 && guide.kind !== "via-pair";
  const rowH = hex ? pitch * Math.sin(Math.PI / 3) : pitch;
  const sites: { x: number; y: number }[] = [];
  const nRow = Math.max(1, Math.round(H / rowH));
  const nCol = Math.max(1, Math.round(W / pitch));
  for (let r = 0; r < nRow; r++) {
    const y = (r + 0.5) * rowH;
    if (y >= H) continue;
    const xoff = hex && r % 2 !== 0 ? pitch * 0.5 : 0;
    if (guide.kind === "via-pair") {
      const pair = Math.max(guide.pairNm || pitch * 0.9, 4);
      for (let c = 0; c < nCol; c++) {
        const cx = (c + 0.5) * pitch + xoff;
        if (cx >= W) continue;
        sites.push({ x: cx - pair * 0.5, y });
        sites.push({ x: cx + pair * 0.5, y });
      }
    } else {
      for (let c = 0; c < nCol; c++) {
        const x = (c + 0.5) * pitch + xoff;
        if (x >= W) continue;
        sites.push({ x, y });
      }
    }
  }
  return sites;
}

function tryPush(
  seen: Uint8Array,
  phi: Float32Array,
  stack: number[],
  nx: number,
  ny: number,
  x: number,
  y: number,
  p: number,
  minority: number,
) {
  const ok = (q: number) => !seen[q] && phi[q] * minority >= 0;
  if (x > 0 && ok(p - 1)) {
    seen[p - 1] = 1;
    stack.push(p - 1);
  }
  if (x + 1 < nx && ok(p + 1)) {
    seen[p + 1] = 1;
    stack.push(p + 1);
  }
  if (y > 0 && ok(p - nx)) {
    seen[p - nx] = 1;
    stack.push(p - nx);
  }
  if (y + 1 < ny && ok(p + nx)) {
    seen[p + nx] = 1;
    stack.push(p + nx);
  }
}

function mean(xs: number[]) {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length / 2) | 0];
}

function threeSigma(xs: number[]) {
  if (xs.length < 3) return 0;
  const m = mean(xs);
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  return 3 * Math.sqrt(v / xs.length);
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
