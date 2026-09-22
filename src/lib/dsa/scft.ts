/**
 * Incompressible diblock SCFT (Matsen / Fredrickson saddle-point).
 *
 * Length unit Rg with Rg² = N a² / 6, so the MDE is
 *   ∂s q = ∇² q − w q,  s ∈ [0, 1].
 * Spatial step is a Strang split-step Fourier (unconditionally stable).
 * Fields mix with Picard on the exchange / pressure split
 *   w− = (wA−wB)/2,  w+ = (wA+wB)/2.
 * Anderson mixing is applied to w− only (Eyert damping); pressure stays Picard.
 * A chemo/grapho guide enters the exchange saddle
 *   w− = (χN/2)(φB−φA) − h(r)
 * not the pressure. Guide strength ramps on, and the 1D extrusion is
 * circular-shifted onto the stripe before mixing. Bulk period D* is the
 * minimizer of F(D). Cylinder melts use a √3-commensurate rectangular cell.
 *
 * Live chamber remains Ohta–Kawasaki kinetics; this is the equilibrium
 * density papers report.
 */

import { fft1d, fft2d, isPow2 } from "./fft.ts";
import { buildGuideField } from "./guides.ts";
import type { SimConfig } from "./types.ts";

export type ScftProfile = { x: number; phi: number; tanh: number };
export type FdPoint = { D: number; F: number; residual: number };
export type MixPoint = { iter: number; residual: number; incomp: number };

export type Scft1dReport = {
  F: number;
  Fhom: number;
  Q: number;
  residual: number;
  fieldResidual: number;
  incomp: number;
  iters: number;
  meanA: number;
  periodRg: number;
  wRg: number;
  converged: boolean;
  profile: ScftProfile[];
  fdCurve: FdPoint[];
  matsenD: number;
  wA?: Float64Array;
  wB?: Float64Array;
};

export type ScftReport = {
  F: number;
  Fhom: number;
  Q: number;
  residual: number;
  fieldResidual: number;
  densResidual: number;
  incomp: number;
  iters: number;
  meanA: number;
  periodRg: number;
  periodNm: number;
  Dtarget: number;
  wRg: number;
  wNm: number;
  widthSslRg: number;
  converged: boolean;
  phi: Float32Array;
  nx: number;
  ny: number;
  ns: number;
  profile: ScftProfile[];
  bulk: Scft1dReport;
  method: "split-step-picard" | "split-step-anderson";
  cellNm: number;
  cellLyNm: number;
  nPeriods: number;
  registration: number;
  history: MixPoint[];
  morphology: "LAM" | "HEX";
  lerCapillaryNm: number;
};

export type FilmScftReport = {
  Fperp: number;
  Fpara: number;
  dF: number;
  preferred: "perp" | "para";
  resPerp: number;
  resPara: number;
  incompPerp: number;
  tFilmNm: number;
  tOverL0: number;
  nx: number;
  nz: number;
  perpPhi: Float32Array;
  paraPhi: Float32Array;
};

/**
 * Matsen lamellar D / a N^{1/2} (f = 1/2), digitized from Macromolecules
 * 1996, 29, 1091 Fig. 3 plus the Leibler ODT D/aN^{1/2} = 1.318.
 * Convert to Rg with D/Rg = √6 · D/aN^{1/2} (Rg² = N a² / 6).
 */
const MATSEN_DA: [number, number][] = [
  [10.495, 1.318],
  [11, 1.334],
  [12, 1.368],
  [15, 1.49],
  [20, 1.651],
  [25, 1.778],
  [30, 1.885],
  [40, 2.062],
  [50, 2.205],
  [80, 2.52],
];

export function matsenDaN(chiN: number) {
  const x = Math.max(chiN, 10.495);
  if (x <= MATSEN_DA[0][0]) return MATSEN_DA[0][1];
  for (let i = 1; i < MATSEN_DA.length; i++) {
    if (x <= MATSEN_DA[i][0]) {
      const [x0, y0] = MATSEN_DA[i - 1];
      const [x1, y1] = MATSEN_DA[i];
      const t = Math.log(x / x0) / Math.log(x1 / x0);
      return y0 * Math.pow(y1 / y0, t);
    }
  }
  const [x0, y0] = MATSEN_DA[MATSEN_DA.length - 1];
  return y0 * Math.pow(x / x0, 1 / 6);
}

export function lamellarDOverRg(chiN: number) {
  return matsenDaN(chiN) * Math.sqrt(6);
}

export function rgNmFromL0(L0Nm: number, chiN: number) {
  return L0Nm / lamellarDOverRg(chiN);
}

/** Helfand–Tagami / SSL width in Rg: w = 2 / √(χN) so φ = tanh(2x/w). */
export function interfaceWidthRg(chiN: number) {
  return 2 / Math.sqrt(Math.max(chiN, 6));
}

export function homogeneousF(chiN: number, f: number) {
  return chiN * f * (1 - f);
}

/** Capillary-wave 3σ LER from a measured interface width (Semenov). */
export function capillaryLerNm(wNm: number, L0Nm: number) {
  const log = Math.log(Math.max(L0Nm / Math.max(wNm, 0.4), 1.2));
  return 0.32 * wNm * Math.sqrt(log);
}

/** Cylinder–cylinder distance in Rg from the lamellar D* (same k*). */
export function hexCcOverRg(chiN: number) {
  return (2 / Math.sqrt(3)) * lamellarDOverRg(chiN);
}

export function runScft1d(
  chiN: number,
  f: number,
  opts?: {
    nx?: number;
    Ns?: number;
    maxIter?: number;
    mix?: number;
    nPeriods?: number;
    L?: number;
    seedWA?: Float64Array;
    seedWB?: Float64Array;
  },
): Scft1dReport {
  const chi = Math.max(chiN, 10.6);
  const nx = toPow2(opts?.nx ?? 128);
  const Ns = opts?.Ns ?? 80;
  const maxIter = opts?.maxIter ?? (chi >= 36 ? 280 : chi >= 28 ? 240 : 200);
  const fClamped = Math.min(0.7, Math.max(0.3, f));
  const mix0 = opts?.mix ?? (chi >= 36 ? 0.04 : chi >= 32 ? 0.07 : 0.1);
  const mixP = Math.min(2, 40 / chi);
  const nPeriods = opts?.nPeriods ?? 1;
  const matsenD = lamellarDOverRg(chi);
  const L = opts?.L ?? nPeriods * matsenD;
  const dxRg = L / nx;
  const ds = 1 / Ns;
  const sA = Math.max(1, Math.min(Ns - 1, Math.round(fClamped * Ns)));

  const wA = new Float64Array(nx);
  const wB = new Float64Array(nx);
  const phiA = new Float64Array(nx);
  const phiB = new Float64Array(nx);
  const q = new Float64Array((Ns + 1) * nx);
  const qDag = new Float64Array(nx);
  const tmp = new Float64Array(nx);
  const re = new Float64Array(nx);
  const im = new Float64Array(nx);
  const k2 = k2_1d(nx, dxRg);

  const k0 = (2 * Math.PI * nPeriods) / L;
  if (opts?.seedWA && opts.seedWA.length === nx && opts.seedWB) {
    wA.set(opts.seedWA);
    wB.set(opts.seedWB);
  } else if (chi >= 26 && !opts?.seedWA) {
    const chi0 = 20;
    const warm = runScft1d(chi0, fClamped, {
      nx,
      Ns: Math.min(Ns, 80),
      maxIter: Math.min(180, maxIter),
      L,
      nPeriods,
    });
    let seedA = warm.wA;
    let seedB = warm.wB;
    if (chi >= 36 && seedA && seedB) {
      const mid = runScft1d(28, fClamped, {
        nx,
        Ns: Math.min(Ns, 80),
        maxIter: Math.min(180, maxIter),
        L,
        nPeriods,
        seedWA: seedA,
        seedWB: seedB,
      });
      if (mid.wA && mid.fieldResidual < 0.05) {
        seedA = mid.wA;
        seedB = mid.wB;
      }
    }
    if (seedA && seedB && seedA.length === nx && warm.fieldResidual < 0.05) {
      wA.set(seedA);
      wB.set(seedB);
    } else {
      cosineSeed1d(wA, wB, nx, chi, fClamped, k0, dxRg);
    }
  } else {
    cosineSeed1d(wA, wB, nx, chi, fClamped, k0, dxRg);
  }

  let residual = 1;
  let fieldResidual = 1;
  let incomp = 1;
  let densResidual = 1;
  let iter = 0;
  let Q = 1;
  let mix0Now = mix0;
  let mixPNow = mixP;
  let lastField = Infinity;
  const phiOld = new Float64Array(nx);
  const prevA = new Float64Array(nx);
  const prevB = new Float64Array(nx);
  const pack = new Float64Array(nx * 2);
  const packNew = new Float64Array(nx * 2);
  const anderson = chi >= 32 ? new Anderson(nx * 2, 5, 1) : null;

  for (iter = 1; iter <= maxIter; iter++) {
    prevA.set(wA);
    prevB.set(wB);
    gauge(wA, wB);
    Q = forward1d(q, wA, wB, sA, Ns, ds, nx, k2, re, im, tmp);
    if (!(Q > 1e-30) || !Number.isFinite(Q)) {
      wA.set(prevA);
      wB.set(prevB);
      break;
    }
    qDag.fill(1);
    phiA.fill(0);
    phiB.fill(0);
    for (let s = Ns; s >= 0; s--) {
      const qs = q.subarray(s * nx, (s + 1) * nx);
      const wgt = s === 0 || s === Ns ? 0.5 * ds : ds;
      const inv = wgt / Q;
      if (s === sA) {
        for (let i = 0; i < nx; i++) {
          const p = qs[i] * qDag[i] * inv * 0.5;
          phiA[i] += p;
          phiB[i] += p;
        }
      } else {
        const dest = s < sA ? phiA : phiB;
        for (let i = 0; i < nx; i++) dest[i] += qs[i] * qDag[i] * inv;
      }
      if (s === 0) break;
      const w = s - 1 < sA ? wA : wB;
      stepMde1d(qDag, tmp, w, ds, k2, re, im, nx);
      qDag.set(tmp);
    }

    let inc2 = 0;
    let d2 = 0;
    for (let i = 0; i < nx; i++) {
      const inc = phiA[i] + phiB[i] - 1;
      inc2 += inc * inc;
      d2 += (phiA[i] - phiOld[i]) ** 2;
      const wMinus = 0.5 * (wA[i] - wB[i]);
      const wPlus = 0.5 * (wA[i] + wB[i]);
      const wMinusStar = 0.5 * chi * (phiB[i] - phiA[i]);
      const newMinus = wMinus + mix0Now * (wMinusStar - wMinus);
      const newPlus = wPlus + mixPNow * inc;
      wA[i] = newPlus + newMinus;
      wB[i] = newPlus - newMinus;
      phiOld[i] = phiA[i];
    }
    if (anderson && iter > 12) {
      pack.set(prevA, 0);
      pack.set(prevB, nx);
      packNew.set(wA, 0);
      packNew.set(wB, nx);
      const mixed = anderson.mix(pack, packNew);
      if (mixed && finiteArr(mixed)) {
        wA.set(mixed.subarray(0, nx));
        wB.set(mixed.subarray(nx));
      } else {
        anderson.reset();
      }
    }
    densResidual = Math.sqrt(d2 / nx);
    incomp = Math.sqrt(inc2 / nx);
    residual = densResidual + incomp;
    fieldResidual = exchangeRms(wA, wB, phiA, phiB, chi, nx);
    if (iter > 4 && fieldResidual > lastField * 1.3 && mix0Now > 0.015) {
      mix0Now *= 0.55;
      mixPNow = Math.max(0.2, mixPNow * 0.7);
      wA.set(prevA);
      wB.set(prevB);
      anderson?.reset();
      continue;
    }
    lastField = fieldResidual;
    if (fieldResidual < 2e-5 && incomp < 2e-5) break;
  }

  let meanA = 0;
  let int = 0;
  for (let i = 0; i < nx; i++) {
    meanA += phiA[i];
    int += chi * phiA[i] * phiB[i] - wA[i] * phiA[i] - wB[i] * phiB[i];
  }
  meanA /= nx;
  const F = -Math.log(Math.max(Q, 1e-30)) + int / nx;
  const periodRg = structurePeriod1d(phiA, nx, dxRg) || L / nPeriods;
  const wRg = widthFromPhi(phiA, dxRg);
  const profile = profile1d(phiA, nx, dxRg, chi);

  return {
    F,
    Fhom: homogeneousF(chi, fClamped),
    Q,
    residual,
    fieldResidual,
    incomp,
    iters: iter,
    meanA,
    periodRg,
    wRg,
    converged: fieldResidual < 5e-4 && incomp < 5e-4,
    profile,
    fdCurve: [],
    matsenD,
    wA,
    wB,
  };
}

/**
 * Sweep cell size and minimize F. This is the Matsen period — not a
 * locked box. Seeds each D from the previous solve.
 */
export function findLamellarPeriod(
  chiN: number,
  f: number,
  opts?: { nx?: number; Ns?: number; maxIter?: number; quick?: boolean },
): Scft1dReport {
  const nx = toPow2(opts?.nx ?? (opts?.quick ? 64 : 128));
  const Ns = opts?.Ns ?? (opts?.quick ? 48 : 64);
  const maxIter = opts?.maxIter ?? (opts?.quick ? 80 : 140);
  const guess = lamellarDOverRg(chiN);
  const ratios = opts?.quick
    ? [0.88, 0.96, 1.0, 1.04, 1.12]
    : [0.84, 0.9, 0.96, 1.0, 1.04, 1.1, 1.18];
  const curve: FdPoint[] = [];

  const center = runScft1d(chiN, f, { nx, Ns, maxIter, L: guess, nPeriods: 1 });
  let seedWA = center.wA;
  let seedWB = center.wB;
  let best: Scft1dReport = { ...center, periodRg: guess };

  for (const r of ratios) {
    const L = guess * r;
    const report = runScft1d(chiN, f, {
      nx,
      Ns,
      maxIter: Math.max(60, (maxIter * 0.7) | 0),
      L,
      nPeriods: 1,
      seedWA,
      seedWB,
    });
    curve.push({ D: L, F: report.F, residual: report.fieldResidual });
    if (Number.isFinite(report.F) && report.wA && report.wB) {
      seedWA = report.wA;
      seedWB = report.wB;
    }
    if (Number.isFinite(report.F) && report.F < best.F) {
      best = report;
      best.periodRg = L;
    }
  }

  const finite = curve.filter((p) => Number.isFinite(p.F));
  if (finite.length >= 3) {
    const iMin = finite.reduce((ib, p, i) => (p.F < finite[ib].F ? i : ib), 0);
    const lo = finite[Math.max(0, iMin - 1)];
    const mid = finite[iMin];
    const hi = finite[Math.min(finite.length - 1, iMin + 1)];
    let Dstar = mid.D;
    if (lo !== hi && lo.D !== hi.D) {
      Dstar = quadraticMin(lo.D, lo.F, mid.D, mid.F, hi.D, hi.F);
      Dstar = Math.min(hi.D, Math.max(lo.D, Dstar));
    }
    const refined = runScft1d(chiN, f, {
      nx: opts?.quick ? nx : 128,
      Ns: opts?.quick ? Ns : 80,
      maxIter: opts?.quick ? maxIter : 180,
      L: Dstar,
      nPeriods: 1,
      seedWA,
      seedWB,
    });
    if (Number.isFinite(refined.F)) {
      refined.periodRg = Dstar;
      refined.fdCurve = [...finite, { D: Dstar, F: refined.F, residual: refined.fieldResidual }].sort(
        (a, b) => a.D - b.D,
      );
      refined.matsenD = guess;
      return refined;
    }
  }

  best.fdCurve = finite;
  best.matsenD = guess;
  best.periodRg = best.periodRg || guess;
  return best;
}

export function runScft(
  cfg: SimConfig,
  opts?: {
    nx?: number;
    Ns?: number;
    maxIter?: number;
    mix?: number;
    seedPhi?: Float32Array;
    skipSweep?: boolean;
  },
): ScftReport {
  const nx = toPow2(opts?.nx ?? 64);
  const ny = nx;
  const guided = cfg.guide.kind !== "none" && cfg.guide.strength >= 0.05;
  const hex = cfg.f < 0.42;
  const Ns = opts?.Ns ?? (guided ? 56 : 48);
  const n = nx * ny;
  const f = Math.min(0.7, Math.max(0.3, cfg.f));
  const chiN = Math.max(cfg.chiN, 10.6);
  const mix0 = opts?.mix ?? (guided ? 0.12 : 0.1);
  const mixP = Math.min(2, 40 / chiN);
  const Dtarget = lamellarDOverRg(chiN);
  const bulk = opts?.skipSweep
    ? runScft1d(chiN, f, { nx: 64, Ns: 32, maxIter: 60, L: Dtarget, nPeriods: 1 })
    : findLamellarPeriod(chiN, f, { quick: true });
  const Dstar = bulk.periodRg > 1 ? bulk.periodRg : Dtarget;
  const cell = scftCell(cfg, nx, Dstar, hex);
  const Rg = cell.cellNm / cell.LxRg;
  const dxRg = cell.LxRg / nx;
  const dyRg = cell.LyRg / ny;
  const ds = 1 / Ns;
  const sA = Math.max(1, Math.min(Ns - 1, Math.round(f * Ns)));

  const cellCfg: SimConfig = {
    ...cfg,
    nx,
    ny,
    dxNm: cell.cellNm / nx,
    guide: { ...cfg.guide },
  };
  const wA = new Float64Array(n);
  const wB = new Float64Array(n);
  const phiA = new Float64Array(n);
  const phiB = new Float64Array(n);
  const phiOld = new Float64Array(n);
  const h = guided ? resampleGuide(cellCfg, nx, ny, cell.cellLyNm / ny) : new Float64Array(n);

  if (!hex && bulk.wA && bulk.wB) {
    extrude1d(wA, wB, bulk.wA, bulk.wB, nx, ny, cell.nPeriods);
    if (guided) {
      shiftAlignX(wA, wB, h, nx, ny);
      for (let i = 0; i < n; i++) {
        wA[i] -= 0.45 * h[i];
        wB[i] += 0.45 * h[i];
      }
    }
  } else {
    seedFields(wA, wB, h, nx, ny, chiN, f, dxRg, dyRg, cell.aCcRg, opts?.seedPhi);
  }

  const q = new Float64Array((Ns + 1) * n);
  const qDag = new Float64Array(n);
  const tmp = new Float64Array(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const k2 = k2_2d(nx, ny, dxRg, dyRg);

  const maxIter = opts?.maxIter ?? (guided ? 160 : hex ? 120 : 36);
  let residual = 1;
  let fieldResidual = 1;
  let densResidual = 1;
  let incomp = 1;
  let iter = 0;
  let Q = 1;
  let lastQ = 1;
  let mix0Now = mix0;
  let mixPNow = mixP;
  let lastField = Infinity;
  const prevA = new Float64Array(n);
  const prevB = new Float64Array(n);
  const history: MixPoint[] = [];
  const pack = new Float64Array(n * 2);
  const packNew = new Float64Array(n * 2);
  const anderson = guided || hex ? new Anderson(n * 2, 5, guided ? 0.55 : 1) : null;
  let usedAnderson = false;
  let stallResets = 0;
  const recent: number[] = [];

  for (iter = 1; iter <= maxIter; iter++) {
    prevA.set(wA);
    prevB.set(wB);
    gauge(wA, wB);
    Q = forward2d(q, wA, wB, sA, Ns, ds, nx, ny, k2, re, im, tmp);
    if (!(Q > 1e-30) || !Number.isFinite(Q)) {
      wA.set(prevA);
      wB.set(prevB);
      Q = lastQ;
      break;
    }
    lastQ = Q;
    qDag.fill(1);
    phiA.fill(0);
    phiB.fill(0);
    for (let s = Ns; s >= 0; s--) {
      const qs = q.subarray(s * n, (s + 1) * n);
      const wgt = s === 0 || s === Ns ? 0.5 * ds : ds;
      const inv = wgt / Q;
      if (s === sA) {
        for (let i = 0; i < n; i++) {
          const p = qs[i] * qDag[i] * inv * 0.5;
          phiA[i] += p;
          phiB[i] += p;
        }
      } else {
        const dest = s < sA ? phiA : phiB;
        for (let i = 0; i < n; i++) dest[i] += qs[i] * qDag[i] * inv;
      }
      if (s === 0) break;
      const w = s - 1 < sA ? wA : wB;
      stepMde2d(qDag, tmp, w, ds, k2, re, im, nx, ny);
      qDag.set(tmp);
    }

    let inc2 = 0;
    let d2 = 0;
    for (let i = 0; i < n; i++) {
      const inc = phiA[i] + phiB[i] - 1;
      inc2 += inc * inc;
      d2 += (phiA[i] - phiOld[i]) ** 2;
      const wMinus = 0.5 * (wA[i] - wB[i]);
      const wPlus = 0.5 * (wA[i] + wB[i]);
      const wMinusStar = 0.5 * chiN * (phiB[i] - phiA[i]) - h[i];
      const newMinus = wMinus + mix0Now * (wMinusStar - wMinus);
      const newPlus = wPlus + mixPNow * inc;
      wA[i] = newPlus + newMinus;
      wB[i] = newPlus - newMinus;
      phiOld[i] = phiA[i];
    }
    if (anderson && iter > 10) {
      pack.set(prevA, 0);
      pack.set(prevB, n);
      packNew.set(wA, 0);
      packNew.set(wB, n);
      const mixed = anderson.mix(pack, packNew);
      if (mixed && finiteArr(mixed)) {
        wA.set(mixed.subarray(0, n));
        wB.set(mixed.subarray(n));
        usedAnderson = true;
      } else {
        anderson.reset();
      }
    }
    densResidual = Math.sqrt(d2 / n);
    incomp = Math.sqrt(inc2 / n);
    residual = densResidual + incomp;
    fieldResidual = exchangeRms(wA, wB, phiA, phiB, chiN, n, h);
    if (iter > 4 && fieldResidual > lastField * 1.3 && mix0Now > 0.02) {
      mix0Now *= 0.55;
      mixPNow = Math.max(0.2, mixPNow * 0.7);
      wA.set(prevA);
      wB.set(prevB);
      anderson?.reset();
      continue;
    }
    lastField = fieldResidual;
    recent.push(fieldResidual);
    if (recent.length > 16) recent.shift();
    if (anderson && stallResets < 2 && recent.length === 16 && fieldResidual > 0.93 * recent[0] && mix0Now > 0.04) {
      anderson.reset();
      mix0Now *= 0.8;
      stallResets++;
    }
    if (iter === 1 || iter % 2 === 0 || iter === maxIter) {
      history.push({ iter, residual: fieldResidual, incomp });
    }
    if (fieldResidual < 5e-4 && incomp < 1e-3) break;
  }

  let meanA = 0;
  let int = 0;
  for (let i = 0; i < n; i++) {
    meanA += phiA[i];
    int += chiN * phiA[i] * phiB[i] - wA[i] * phiA[i] - wB[i] * phiB[i];
  }
  meanA /= n;
  const F = -Math.log(Math.max(Q, 1e-30)) + int / n;
  const periodRg = structurePeriod2d(phiA, nx, ny, dxRg, dyRg) || Dstar;
  const phi = new Float32Array(n);
  for (let i = 0; i < n; i++) phi[i] = 2 * phiA[i] - 1;
  const mid = new Float64Array(nx);
  const y0 = (ny / 2) | 0;
  for (let x = 0; x < nx; x++) mid[x] = phiA[y0 * nx + x];
  const profile = profile1d(mid, nx, dxRg, chiN);
  const wRg = widthFromPhi(mid, dxRg);
  const registration = guided ? registrationScore(phiA, h, n) : 0;
  const lerCapillaryNm = capillaryLerNm(wRg * Rg, cfg.L0Nm);

  return {
    F,
    Fhom: homogeneousF(chiN, f),
    Q,
    residual,
    fieldResidual,
    densResidual,
    incomp,
    iters: iter,
    meanA,
    periodRg,
    periodNm: periodRg * Rg,
    Dtarget,
    wRg,
    wNm: wRg * Rg,
    widthSslRg: interfaceWidthRg(chiN),
    converged: fieldResidual < 5e-3 && incomp < 8e-3,
    phi,
    nx,
    ny,
    ns: Ns,
    profile,
    bulk,
    method: usedAnderson ? "split-step-anderson" : "split-step-picard",
    cellNm: cell.cellNm,
    cellLyNm: cell.cellLyNm,
    nPeriods: cell.nPeriods,
    registration,
    history,
    morphology: cell.morphology,
    lerCapillaryNm,
  };
}

/**
 * Thin-film SCFT in the x–z plane. Compares a perpendicular seed (DSA)
 * against a parallel seed (Δγ / thickness trap) and reports ΔF = F∥ − F⊥.
 * Substrate chemo decays as exp(−z/λ); free-surface Δγ at the top.
 */
export function runFilmScft(
  cfg: SimConfig,
  opts?: { nx?: number; nz?: number; maxIter?: number; Ns?: number },
): FilmScftReport {
  const nx = toPow2(opts?.nx ?? 64);
  const nz = toPow2(opts?.nz ?? 16);
  const Ns = opts?.Ns ?? 40;
  const maxIter = opts?.maxIter ?? 56;
  const f = Math.min(0.7, Math.max(0.3, cfg.f));
  const chiN = Math.max(cfg.chiN, 10.6);
  const bulk = runScft1d(chiN, f, {
    nx: 64,
    Ns: 40,
    maxIter: 80,
    L: lamellarDOverRg(chiN),
    nPeriods: 1,
  });
  const Dstar = bulk.periodRg > 1 ? bulk.periodRg : lamellarDOverRg(chiN);
  const nP = Math.max(2, Math.min(4, Math.round((cfg.nx * cfg.dxNm) / Math.max(cfg.L0Nm, 1))));
  const LxRg = nP * Dstar;
  const tOverL0 = Math.max(cfg.tFilmOverL0, 0.8);
  const LzRg = tOverL0 * Dstar;
  const tFilmNm = tOverL0 * cfg.L0Nm;
  const dxRg = LxRg / nx;
  const dzRg = LzRg / nz;
  const h = filmGuide(cfg, nx, nz, tFilmNm);

  const perp = filmRelax({
    chiN,
    f,
    nx,
    nz,
    Ns,
    maxIter,
    dxRg,
    dzRg,
    h,
    seed: "perp",
    bulk,
    nP,
    Dstar,
  });
  const para = filmRelax({
    chiN,
    f,
    nx,
    nz,
    Ns,
    maxIter,
    dxRg,
    dzRg,
    h,
    seed: "para",
    bulk,
    nP,
    Dstar,
  });
  const dF = para.F - perp.F;
  return {
    Fperp: perp.F,
    Fpara: para.F,
    dF,
    preferred: dF > 0 ? "perp" : "para",
    resPerp: perp.fieldResidual,
    resPara: para.fieldResidual,
    incompPerp: perp.incomp,
    tFilmNm,
    tOverL0,
    nx,
    nz,
    perpPhi: perp.phi,
    paraPhi: para.phi,
  };
}

function filmGuide(cfg: SimConfig, nx: number, nz: number, tFilmNm: number) {
  const L0 = Math.max(cfg.L0Nm, 1e-6);
  const raw = buildGuideField({
    ...cfg,
    nx,
    ny: 2,
    dxNm: (Math.max(1, Math.round((cfg.nx * cfg.dxNm) / L0)) * L0) / nx,
  });
  const h = new Float64Array(nx * nz);
  const lam = 0.45 * L0;
  const dg = cfg.deltaGamma;
  for (let z = 0; z < nz; z++) {
    const zNm = (z + 0.5) * (tFilmNm / nz);
    const decay = Math.exp(-zNm / lam);
    const top = Math.exp(-(tFilmNm - zNm) / (0.28 * L0));
    for (let x = 0; x < nx; x++) {
      const g = raw[x];
      const v = g >= 90 ? 3.2 * cfg.guide.strength * cfg.guide.wetting : g;
      h[z * nx + x] = v * decay + dg * 1.4 * top;
    }
  }
  return h;
}

function filmRelax(args: {
  chiN: number;
  f: number;
  nx: number;
  nz: number;
  Ns: number;
  maxIter: number;
  dxRg: number;
  dzRg: number;
  h: Float64Array;
  seed: "perp" | "para";
  bulk: Scft1dReport;
  nP: number;
  Dstar: number;
}) {
  const { chiN, f, nx, nz, Ns, maxIter, dxRg, dzRg, h, nP, Dstar } = args;
  const n = nx * nz;
  const mix0 = 0.1;
  const mixP = Math.min(2, 40 / chiN);
  const ds = 1 / Ns;
  const sA = Math.max(1, Math.min(Ns - 1, Math.round(f * Ns)));
  const wA = new Float64Array(n);
  const wB = new Float64Array(n);
  const phiA = new Float64Array(n);
  const phiB = new Float64Array(n);
  const phiOld = new Float64Array(n);
  if (args.seed === "perp" && args.bulk.wA && args.bulk.wB) {
    extrude1d(wA, wB, args.bulk.wA, args.bulk.wB, nx, nz, nP);
    shiftAlignX(wA, wB, h, nx, nz);
    for (let i = 0; i < n; i++) {
      wA[i] -= 0.45 * h[i];
      wB[i] += 0.45 * h[i];
    }
  } else {
    const nLay = Math.max(1, Math.round((nz * dzRg) / Dstar));
    for (let z = 0; z < nz; z++) {
      const a = f + 0.2 * Math.cos((2 * Math.PI * nLay * (z + 0.5)) / nz);
      for (let x = 0; x < nx; x++) {
        const i = z * nx + x;
        wA[i] = chiN * (1 - a) - h[i];
        wB[i] = chiN * a + h[i];
      }
    }
  }
  const q = new Float64Array((Ns + 1) * n);
  const qDag = new Float64Array(n);
  const tmp = new Float64Array(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const k2 = k2_2d(nx, nz, dxRg, dzRg);
  const prevA = new Float64Array(n);
  const prevB = new Float64Array(n);
  let fieldResidual = 1;
  let incomp = 1;
  let Q = 1;
  let lastQ = 1;
  let mix0Now = mix0;
  let mixPNow = mixP;
  let lastField = Infinity;
  let iter = 0;
  for (iter = 1; iter <= maxIter; iter++) {
    prevA.set(wA);
    prevB.set(wB);
    gauge(wA, wB);
    Q = forward2d(q, wA, wB, sA, Ns, ds, nx, nz, k2, re, im, tmp);
    if (!(Q > 1e-30) || !Number.isFinite(Q)) {
      wA.set(prevA);
      wB.set(prevB);
      Q = lastQ;
      break;
    }
    lastQ = Q;
    qDag.fill(1);
    phiA.fill(0);
    phiB.fill(0);
    for (let s = Ns; s >= 0; s--) {
      const qs = q.subarray(s * n, (s + 1) * n);
      const wgt = s === 0 || s === Ns ? 0.5 * ds : ds;
      const inv = wgt / Q;
      if (s === sA) {
        for (let i = 0; i < n; i++) {
          const p = qs[i] * qDag[i] * inv * 0.5;
          phiA[i] += p;
          phiB[i] += p;
        }
      } else {
        const dest = s < sA ? phiA : phiB;
        for (let i = 0; i < n; i++) dest[i] += qs[i] * qDag[i] * inv;
      }
      if (s === 0) break;
      const w = s - 1 < sA ? wA : wB;
      stepMde2d(qDag, tmp, w, ds, k2, re, im, nx, nz);
      qDag.set(tmp);
    }
    let inc2 = 0;
    for (let i = 0; i < n; i++) {
      const inc = phiA[i] + phiB[i] - 1;
      inc2 += inc * inc;
      const wMinus = 0.5 * (wA[i] - wB[i]);
      const wPlus = 0.5 * (wA[i] + wB[i]);
      const wMinusStar = 0.5 * chiN * (phiB[i] - phiA[i]) - h[i];
      const newMinus = wMinus + mix0Now * (wMinusStar - wMinus);
      const newPlus = wPlus + mixPNow * inc;
      wA[i] = newPlus + newMinus;
      wB[i] = newPlus - newMinus;
      phiOld[i] = phiA[i];
    }
    incomp = Math.sqrt(inc2 / n);
    fieldResidual = exchangeRms(wA, wB, phiA, phiB, chiN, n, h);
    if (iter > 4 && fieldResidual > lastField * 1.3 && mix0Now > 0.02) {
      mix0Now *= 0.55;
      mixPNow = Math.max(0.2, mixPNow * 0.7);
      wA.set(prevA);
      wB.set(prevB);
      continue;
    }
    lastField = fieldResidual;
    if (fieldResidual < 8e-4 && incomp < 2e-3) break;
  }
  let int = 0;
  for (let i = 0; i < n; i++) int += chiN * phiA[i] * phiB[i] - wA[i] * phiA[i] - wB[i] * phiB[i];
  const F = -Math.log(Math.max(Q, 1e-30)) + int / n;
  const phi = new Float32Array(n);
  for (let i = 0; i < n; i++) phi[i] = 2 * phiA[i] - 1;
  return { F, fieldResidual, incomp, phi, Q };
}

function scftCell(cfg: SimConfig, nx: number, Dstar: number, hex: boolean) {
  const boxNm = cfg.nx * cfg.dxNm;
  const L0 = Math.max(cfg.L0Nm, 1e-6);
  const maxP = Math.max(2, Math.floor(nx / (hex ? 14 : 20)));
  const kind = cfg.guide.kind;
  const guided = (kind === "chemo-lamellar" || kind === "fin-array") && cfg.guide.LsNm > 0;

  if ((kind === "contact-holes" || kind === "via-pair") && cfg.guide.strength >= 0.05) {
    // Periodic SCFT must contain complete template repeats. A cell based only
    // on L0 cuts arbitrary contact/via guides at its boundaries when Ls changes
    // during inverse design. Hex guides require an even number of staggered rows.
    const pitch = Math.max(cfg.guide.LsNm, L0 * (kind === "via-pair" ? 1.6 : 1));
    const maxGuides = Math.max(1, Math.floor(maxP * L0 / pitch));
    const nCol = Math.max(1, Math.min(maxGuides, Math.round(boxNm / pitch)));
    const hexGuide = hex && kind === "contact-holes";
    const nRow = hexGuide ? 2 * Math.max(1, Math.round(nCol / Math.sqrt(3))) : nCol;
    const cellNm = nCol * pitch;
    const cellLyNm = nRow * pitch * (hexGuide ? Math.sqrt(3) / 2 : 1);
    const naturalPeriodRg = hex ? (2 / Math.sqrt(3)) * Dstar : Dstar;
    return {
      nPeriods: Math.max(1, Math.round(cellNm / L0)),
      nRow,
      LxRg: cellNm / L0 * naturalPeriodRg,
      LyRg: cellLyNm / L0 * naturalPeriodRg,
      aCcRg: naturalPeriodRg,
      cellNm,
      cellLyNm,
      morphology: hex ? "HEX" as const : "LAM" as const,
    };
  }

  if (hex) {
    const aCcRg = (2 / Math.sqrt(3)) * Dstar;
    let nCol = Math.max(2, Math.round(boxNm / L0));
    nCol = Math.min(maxP, nCol);
    if (nCol % 2) nCol = Math.max(2, nCol - 1);
    const nRow = 2 * Math.max(1, Math.round(nCol / Math.sqrt(3)));
    const LxRg = nCol * aCcRg;
    const LyRg = nRow * aCcRg * (Math.sqrt(3) / 2);
    return {
      nPeriods: nCol,
      nRow,
      LxRg,
      LyRg,
      aCcRg,
      cellNm: nCol * L0,
      cellLyNm: nCol * L0 * (LyRg / LxRg),
      morphology: "HEX" as const,
    };
  }

  let nPeriods: number;
  let cellNm: number;
  if (guided) {
    const Ls = cfg.guide.LsNm;
    const mult = Math.max(1, Math.round(Ls / L0));
    let nG = Math.max(1, Math.round(boxNm / Ls));
    nPeriods = nG * mult;
    if (nPeriods > maxP) {
      nG = Math.max(1, Math.floor(maxP / mult));
      nPeriods = nG * mult;
    }
    cellNm = nG * Ls;
  } else {
    nPeriods = Math.max(1, Math.round(boxNm / L0));
    if (nPeriods > maxP) nPeriods = maxP;
    cellNm = nPeriods * L0;
  }
  nPeriods = Math.max(1, nPeriods);
  const LxRg = nPeriods * Dstar;
  return {
    nPeriods,
    nRow: nPeriods,
    LxRg,
    LyRg: LxRg,
    aCcRg: Dstar,
    cellNm,
    cellLyNm: cellNm,
    morphology: "LAM" as const,
  };
}

function cosineSeed1d(
  wA: Float64Array,
  wB: Float64Array,
  nx: number,
  chi: number,
  f: number,
  k0: number,
  dxRg: number,
) {
  for (let i = 0; i < nx; i++) {
    const a = f + 0.22 * Math.cos(k0 * i * dxRg);
    wA[i] = chi * (1 - a);
    wB[i] = chi * a;
  }
}

function extrude1d(
  wA: Float64Array,
  wB: Float64Array,
  srcA: Float64Array,
  srcB: Float64Array,
  nx: number,
  ny: number,
  nPeriods: number,
) {
  const m = srcA.length;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const t = (x / nx) * nPeriods * m;
      const i0 = Math.floor(t);
      const frac = t - i0;
      const a = ((i0 % m) + m) % m;
      const b = (a + 1) % m;
      const i = y * nx + x;
      wA[i] = srcA[a] * (1 - frac) + srcA[b] * frac;
      wB[i] = srcB[a] * (1 - frac) + srcB[b] * frac;
    }
  }
}

function gauge(wA: Float64Array, wB: Float64Array) {
  let s = 0;
  const n = wA.length;
  for (let i = 0; i < n; i++) s += wA[i] + wB[i];
  const shift = s / (2 * n);
  for (let i = 0; i < n; i++) {
    wA[i] -= shift;
    wB[i] -= shift;
  }
}

function k2_1d(nx: number, dx: number) {
  const out = new Float64Array(nx);
  const L = nx * dx;
  for (let i = 0; i < nx; i++) {
    const n = i <= nx / 2 ? i : i - nx;
    const k = (2 * Math.PI * n) / L;
    out[i] = k * k;
  }
  return out;
}

function k2_2d(nx: number, ny: number, dx: number, dy: number) {
  const out = new Float64Array(nx * ny);
  const Lx = nx * dx;
  const Ly = ny * dy;
  for (let y = 0; y < ny; y++) {
    const ny_ = y <= ny / 2 ? y : y - ny;
    const ky = (2 * Math.PI * ny_) / Ly;
    for (let x = 0; x < nx; x++) {
      const nx_ = x <= nx / 2 ? x : x - nx;
      const kx = (2 * Math.PI * nx_) / Lx;
      out[y * nx + x] = kx * kx + ky * ky;
    }
  }
  return out;
}

function stepMde1d(
  src: Float64Array,
  dst: Float64Array,
  w: Float64Array,
  ds: number,
  k2: Float64Array,
  re: Float64Array,
  im: Float64Array,
  nx: number,
) {
  const h = 0.5 * ds;
  for (let i = 0; i < nx; i++) re[i] = src[i] * Math.exp(-h * w[i]);
  im.fill(0);
  fft1d(re, im, nx, 0, 1, false);
  for (let i = 0; i < nx; i++) {
    const g = Math.exp(-k2[i] * ds);
    re[i] *= g;
    im[i] *= g;
  }
  fft1d(re, im, nx, 0, 1, true);
  for (let i = 0; i < nx; i++) dst[i] = re[i] * Math.exp(-h * w[i]);
}

function stepMde2d(
  src: Float64Array,
  dst: Float64Array,
  w: Float64Array,
  ds: number,
  k2: Float64Array,
  re: Float64Array,
  im: Float64Array,
  nx: number,
  ny: number,
) {
  const n = nx * ny;
  const h = 0.5 * ds;
  for (let i = 0; i < n; i++) re[i] = src[i] * Math.exp(-h * w[i]);
  im.fill(0);
  fft2d(re, im, nx, ny, false);
  for (let i = 0; i < n; i++) {
    const g = Math.exp(-k2[i] * ds);
    re[i] *= g;
    im[i] *= g;
  }
  fft2d(re, im, nx, ny, true);
  for (let i = 0; i < n; i++) dst[i] = re[i] * Math.exp(-h * w[i]);
}

function forward1d(
  q: Float64Array,
  wA: Float64Array,
  wB: Float64Array,
  sA: number,
  Ns: number,
  ds: number,
  nx: number,
  k2: Float64Array,
  re: Float64Array,
  im: Float64Array,
  tmp: Float64Array,
) {
  q.fill(1, 0, nx);
  for (let s = 0; s < Ns; s++) {
    const w = s < sA ? wA : wB;
    const src = q.subarray(s * nx, (s + 1) * nx);
    const dst = q.subarray((s + 1) * nx, (s + 2) * nx);
    stepMde1d(src, tmp, w, ds, k2, re, im, nx);
    dst.set(tmp);
  }
  let Q = 0;
  const last = q.subarray(Ns * nx, (Ns + 1) * nx);
  for (let i = 0; i < nx; i++) Q += last[i];
  return Q / nx;
}

function forward2d(
  q: Float64Array,
  wA: Float64Array,
  wB: Float64Array,
  sA: number,
  Ns: number,
  ds: number,
  nx: number,
  ny: number,
  k2: Float64Array,
  re: Float64Array,
  im: Float64Array,
  tmp: Float64Array,
) {
  const n = nx * ny;
  q.fill(1, 0, n);
  for (let s = 0; s < Ns; s++) {
    const w = s < sA ? wA : wB;
    const src = q.subarray(s * n, (s + 1) * n);
    const dst = q.subarray((s + 1) * n, (s + 2) * n);
    stepMde2d(src, tmp, w, ds, k2, re, im, nx, ny);
    dst.set(tmp);
  }
  let Q = 0;
  const last = q.subarray(Ns * n, (Ns + 1) * n);
  for (let i = 0; i < n; i++) Q += last[i];
  return Q / n;
}

function seedFields(
  wA: Float64Array,
  wB: Float64Array,
  h: Float64Array,
  nx: number,
  ny: number,
  chiN: number,
  f: number,
  dxRg: number,
  dyRg: number,
  aCcRg: number,
  seedPhi: Float32Array | undefined,
) {
  const n = wA.length;
  if (seedPhi && seedPhi.length === n) {
    for (let i = 0; i < n; i++) {
      const a = Math.min(0.95, Math.max(0.05, (seedPhi[i] + 1) * 0.5));
      wA[i] = chiN * (1 - a) - h[i];
      wB[i] = chiN * a + h[i];
    }
    return;
  }
  if (f < 0.42) {
    const kx = (2 * Math.PI) / Math.max(aCcRg, 1e-3);
    const ky = (2 * Math.PI) / (Math.max(aCcRg, 1e-3) * Math.sqrt(3));
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        const xr = (x + 0.5) * dxRg;
        const yr = (y + 0.5) * dyRg;
        const a =
          f +
          0.16 *
            (Math.cos(kx * xr - ky * yr) + Math.cos(2 * ky * yr) + Math.cos(kx * xr + ky * yr));
        wA[i] = chiN * (1 - a) - h[i];
        wB[i] = chiN * a + h[i];
      }
    }
    return;
  }
  const D = lamellarDOverRg(chiN);
  const k0 = (2 * Math.PI) / Math.max(D, 1e-3);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      const a = f + 0.16 * Math.cos(k0 * x * dxRg);
      wA[i] = chiN * (1 - a) - h[i];
      wB[i] = chiN * a + h[i];
    }
  }
}

function resampleGuide(cfg: SimConfig, nx: number, ny: number, dyNm = cfg.dxNm) {
  const raw = buildGuideField({ ...cfg, nx, ny }, dyNm);
  const h = new Float64Array(nx * ny);
  const wall = 3.2 * cfg.guide.strength * cfg.guide.wetting;
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    h[i] = v >= 90 ? wall : v;
  }
  return h;
}

function shiftAlignX(wA: Float64Array, wB: Float64Array, h: Float64Array, nx: number, ny: number) {
  let bestS = 0;
  let best = -Infinity;
  for (let s = 0; s < nx; s++) {
    let c = 0;
    for (let x = 0; x < nx; x++) {
      const xs = x + s < nx ? x + s : x + s - nx;
      c += (wB[xs] - wA[xs]) * h[x];
    }
    if (c > best) {
      best = c;
      bestS = s;
    }
  }
  if (bestS === 0) return;
  const tmpA = new Float64Array(nx);
  const tmpB = new Float64Array(nx);
  for (let y = 0; y < ny; y++) {
    const off = y * nx;
    for (let x = 0; x < nx; x++) {
      const xs = x + bestS < nx ? x + bestS : x + bestS - nx;
      tmpA[x] = wA[off + xs];
      tmpB[x] = wB[off + xs];
    }
    wA.set(tmpA, off);
    wB.set(tmpB, off);
  }
}

function registrationScore(phiA: Float64Array, h: Float64Array, n: number) {
  let hMean = 0;
  for (let i = 0; i < n; i++) hMean += h[i];
  hMean /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const g = h[i] > hMean ? 1 : -1;
    const p = 2 * phiA[i] - 1;
    num += p * g;
    den += 1;
  }
  return den > 0 ? num / den : 0;
}

function structurePeriod1d(phi: Float64Array, nx: number, dxRg: number) {
  const n = nextPow2(nx);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(phi);
  fft1d(re, im, n, 0, 1, false);
  let peakI = 1;
  let peak = 0;
  const mags = new Float64Array(n);
  for (let i = 1; i < n / 2; i++) {
    const mag = re[i] * re[i] + im[i] * im[i];
    mags[i] = mag;
    if (mag > peak) {
      peak = mag;
      peakI = i;
    }
  }
  let fund = peakI;
  for (let i = 1; i <= peakI; i++) {
    if (mags[i] > 0.32 * peak) {
      fund = i;
      break;
    }
  }
  const L = nx * dxRg;
  const kk = Math.abs((2 * Math.PI * fund) / L);
  return kk > 1e-8 ? (2 * Math.PI) / kk : 0;
}

function structurePeriod2d(phi: Float64Array, nx: number, ny: number, dxRg: number, dyRg: number) {
  const n = nx * ny;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(phi);
  fft2d(re, im, nx, ny, false);
  let peakI = 1;
  let peak = 0;
  for (let i = 1; i < n; i++) {
    const mag = re[i] * re[i] + im[i] * im[i];
    if (mag > peak) {
      peak = mag;
      peakI = i;
    }
  }
  const y = (peakI / nx) | 0;
  const x = peakI - y * nx;
  const kx = x <= nx / 2 ? x : x - nx;
  const ky = y <= ny / 2 ? y : y - ny;
  const k = Math.hypot((kx * 2 * Math.PI) / (nx * dxRg), (ky * 2 * Math.PI) / (ny * dyRg));
  return k > 1e-8 ? (2 * Math.PI) / k : 0;
}

function widthFromPhi(phiA: Float64Array, dxRg: number) {
  let maxS = 0;
  for (let i = 1; i < phiA.length; i++) {
    const s = Math.abs(phiA[i] - phiA[i - 1]) / dxRg;
    if (s > maxS) maxS = s;
  }
  if (maxS < 1e-8) return interfaceWidthRg(20);
  return 1 / maxS;
}

function profile1d(phiA: Float64Array, nx: number, dxRg: number, chiN: number): ScftProfile[] {
  const d = phiA.length;
  let x0 = 0;
  for (let i = 1; i < d; i++) {
    if ((phiA[i - 1] - 0.5) * (phiA[i] - 0.5) <= 0) {
      const t = (0.5 - phiA[i - 1]) / (phiA[i] - phiA[i - 1] + 1e-12);
      x0 = (i - 1 + t) * dxRg;
      break;
    }
  }
  const Delta = interfaceWidthRg(chiN) * 0.5;
  const out: ScftProfile[] = [];
  const step = Math.max(1, (d / 96) | 0);
  for (let i = 0; i < d; i += step) {
    const x = i * dxRg;
    const phi = 2 * phiA[i] - 1;
    out.push({ x, phi, tanh: Math.tanh((x - x0) / Math.max(Delta, 1e-4)) });
  }
  return out;
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function toPow2(n: number) {
  if (isPow2(n) && n >= 8) return n;
  return nextPow2(Math.max(8, n));
}

class Anderson {
  m: number;
  n: number;
  beta: number;
  xs: Float64Array[] = [];
  ds: Float64Array[] = [];
  constructor(n: number, m = 5, beta = 1) {
    this.n = n;
    this.m = m;
    this.beta = beta;
  }
  reset() {
    this.xs = [];
    this.ds = [];
  }
  mix(x: Float64Array, xNew: Float64Array): Float64Array | null {
    const n = this.n;
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) d[i] = xNew[i] - x[i];
    this.xs.push(x.slice());
    this.ds.push(d);
    if (this.xs.length > this.m + 1) {
      this.xs.shift();
      this.ds.shift();
    }
    const mhist = this.ds.length;
    if (mhist < 3) return xNew;
    const p = mhist - 1;
    const U: number[][] = [];
    const b: number[] = [];
    const dLast = this.ds[p];
    for (let i = 0; i < p; i++) {
      U[i] = [];
      const di = subVec(this.ds[i], dLast);
      b[i] = -dotVec(di, dLast);
      for (let j = 0; j < p; j++) U[i][j] = dotVec(di, subVec(this.ds[j], dLast));
      U[i][i] += 1e-4;
    }
    const c = solveSys(U, b);
    const alpha = new Float64Array(mhist);
    let s = 0;
    for (let i = 0; i < p; i++) {
      if (!Number.isFinite(c[i]) || Math.abs(c[i]) > 4) return null;
      alpha[i] = c[i];
      s += alpha[i];
    }
    alpha[p] = 1 - s;
    if (!Number.isFinite(alpha[p]) || Math.abs(alpha[p]) > 6) return null;
    const out = new Float64Array(n);
    const beta = this.beta;
    for (let k = 0; k < mhist; k++) {
      const xk = this.xs[k];
      const dk = this.ds[k];
      const a = alpha[k];
      for (let i = 0; i < n; i++) out[i] += a * (xk[i] + beta * dk[i]);
    }
    return out;
  }
}

function subVec(a: Float64Array, b: Float64Array) {
  const o = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] - b[i];
  return o;
}

function dotVec(a: Float64Array, b: Float64Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function solveSys(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    if (piv !== i) {
      const tmp = M[i];
      M[i] = M[piv];
      M[piv] = tmp;
    }
    const diag = M[i][i] || 1e-12;
    for (let j = i; j <= n; j++) M[i][j] /= diag;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let j = i; j <= n; j++) M[r][j] -= f * M[i][j];
    }
  }
  return M.map((row) => row[n]);
}

function finiteArr(a: Float64Array) {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}

function exchangeRms(
  wA: Float64Array,
  wB: Float64Array,
  phiA: Float64Array,
  phiB: Float64Array,
  chi: number,
  n: number,
  h?: Float64Array,
  hScale = 1,
) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const hh = h ? h[i] * hScale : 0;
    const wMinus = 0.5 * (wA[i] - wB[i]);
    const star = 0.5 * chi * (phiB[i] - phiA[i]) - hh;
    const e = wMinus - star;
    s += e * e;
  }
  return Math.sqrt(s / n);
}

function quadraticMin(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
  const d = (x1 - x2) * (x1 - x3) * (x2 - x3);
  if (Math.abs(d) < 1e-18) return x2;
  const a = (x3 * (y2 - y1) + x2 * (y1 - y3) + x1 * (y3 - y2)) / d;
  const b = (x3 * x3 * (y1 - y2) + x2 * x2 * (y3 - y1) + x1 * x1 * (y2 - y3)) / d;
  if (a <= 0) return x2;
  return -b / (2 * a);
}
