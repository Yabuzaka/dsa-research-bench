/**
 * Thin-film 3D Ohta–Kawasaki. Periodic in x,y; spectral in z as well
 * (power-of-two nz). Substrate chemo h(x,y) decays as exp(−z/λ);
 * free-surface Δγ at the top selects perpendicular vs parallel (MRS 2025).
 */

import { fft3d } from "./fft.ts";
import { buildGuideField } from "./guides.ts";
import { renderRgba } from "./metrology.ts";
import { chiNAt, effectiveMobility, l0At } from "./kinetics.ts";
import { blendedChiN, blendedL0 } from "./blend.ts";
import type { FilmScftReport } from "./scft.ts";
import type { SimConfig } from "./types.ts";

export type Film3dReport = {
  nx: number;
  ny: number;
  nz: number;
  dzNm: number;
  energy: number;
  order: number;
  parallelFrac: number;
  perpScore: number;
  midRgba: Uint8ClampedArray;
  botRgba: Uint8ClampedArray;
  topRgba: Uint8ClampedArray;
  xzRgba: Uint8ClampedArray;
  yzRgba: Uint8ClampedArray;
  phiBarZ: { z: number; amp: number }[];
  steps: number;
  scft?: FilmScftReport;
  perpRgba?: Uint8ClampedArray;
  paraRgba?: Uint8ClampedArray;
};

export function runFilm3d(
  cfg: SimConfig,
  opts?: { nx?: number; nz?: number; steps?: number },
): Film3dReport {
  const nx = opts?.nx ?? 64;
  const ny = nx;
  const nz = opts?.nz ?? 16;
  const steps = opts?.steps ?? 70;
  const solver = new Film3d(cfg, nx, ny, nz);
  solver.step(steps);
  return solver.report();
}

class Film3d {
  cfg: SimConfig;
  nx: number;
  ny: number;
  nz: number;
  dxNm: number;
  dzNm: number;
  phi: Float32Array;
  re: Float32Array;
  im: Float32Array;
  wRe: Float32Array;
  wIm: Float32Array;
  h: Float32Array;
  k2: Float32Array;
  mobile: Uint8Array;
  rng: () => number;
  steps = 0;

  constructor(cfg: SimConfig, nx: number, ny: number, nz: number) {
    this.cfg = cfg;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    const box = cfg.nx * cfg.dxNm;
    this.dxNm = box / nx;
    const tNm = Math.max(cfg.tFilmOverL0, 0.8) * cfg.L0Nm;
    this.dzNm = tNm / nz;
    const n = nx * ny * nz;
    this.phi = new Float32Array(n);
    this.re = new Float32Array(n);
    this.im = new Float32Array(n);
    this.wRe = new Float32Array(n);
    this.wIm = new Float32Array(n);
    this.h = new Float32Array(n);
    this.k2 = new Float32Array(n);
    this.mobile = new Uint8Array(n);
    this.mobile.fill(1);
    this.rng = mulberry32(cfg.seed + 19);
    this.buildK();
    this.buildH();
    this.seed();
  }

  private idx(x: number, y: number, z: number) {
    return (z * this.ny + y) * this.nx + x;
  }

  private buildK() {
    const { nx, ny, nz, dxNm, dzNm } = this;
    for (let z = 0; z < nz; z++) {
      const kz = z <= nz / 2 ? z : z - nz;
      const kzz = (2 * Math.PI * kz) / (nz * dzNm / dxNm);
      for (let y = 0; y < ny; y++) {
        const ky = y <= ny / 2 ? y : y - ny;
        for (let x = 0; x < nx; x++) {
          const kx = x <= nx / 2 ? x : x - nx;
          const kxx = (2 * Math.PI * kx) / nx;
          const kyy = (2 * Math.PI * ky) / ny;
          this.k2[this.idx(x, y, z)] = kxx * kxx + kyy * kyy + kzz * kzz;
        }
      }
    }
  }

  private buildH() {
    const guide = buildGuideField({
      ...this.cfg,
      nx: this.nx,
      ny: this.ny,
      dxNm: this.dxNm,
    });
    const L0 = l0At(blendedL0(this.cfg.L0Nm, this.cfg.blendFrac), this.cfg.T);
    const lam = 0.45 * L0;
    const dg = this.cfg.deltaGamma;
    for (let z = 0; z < this.nz; z++) {
      const zNm = (z + 0.5) * this.dzNm;
      const decay = Math.exp(-zNm / lam);
      const top = Math.exp(-((this.nz - 1 - z) * this.dzNm) / (0.28 * L0));
      for (let y = 0; y < this.ny; y++) {
        for (let x = 0; x < this.nx; x++) {
          const g = guide[y * this.nx + x];
          const i = this.idx(x, y, z);
          if (g >= 90) {
            this.mobile[i] = 0;
            this.h[i] = 0;
          } else {
            this.h[i] = g * decay + dg * 1.4 * top;
          }
        }
      }
    }
  }

  private seed() {
    const m = 2 * this.cfg.f - 1;
    const Lpx = Math.max(this.cfg.L0Nm / this.dxNm, 4);
    const n = this.phi.length;
    for (let i = 0; i < n; i++) {
      if (!this.mobile[i]) {
        this.phi[i] = Math.sign(this.cfg.guide.wetting) || 1;
        continue;
      }
      const x = i % this.nx;
      const z = (i / (this.nx * this.ny)) | 0;
      const wave = Math.sin((2 * Math.PI * x) / Lpx);
      const para = Math.sin((2 * Math.PI * z) / Math.max(this.nz / 2, 2));
      const mix = Math.min(1, Math.abs(this.cfg.deltaGamma));
      this.phi[i] = clamp(
        m + 0.35 * ((1 - mix) * wave + mix * para) + 0.22 * (this.rng() * 2 - 1),
        -1.2,
        1.2,
      );
    }
  }

  private L0() {
    return l0At(blendedL0(this.cfg.L0Nm, this.cfg.blendFrac), this.cfg.T);
  }
  private chiN() {
    return chiNAt(blendedChiN(this.cfg.chiN, this.cfg.blendFrac), this.cfg.T);
  }
  private eps() {
    const Lpx = this.L0() / this.dxNm;
    return (Lpx * Lpx) / (8 * Math.PI * Math.PI);
  }
  private well() {
    return Math.max(this.chiN(), 4) / 12;
  }
  private alpha() {
    const eps = this.eps();
    return (1 / (4 * eps)) / Math.sqrt(Math.max(this.chiN(), 4) / 10.5);
  }
  private M() {
    return effectiveMobility({
      mobility: this.cfg.mobility,
      chiN: blendedChiN(this.cfg.chiN, this.cfg.blendFrac),
      T: this.cfg.T,
      microwave: this.cfg.microwave,
      tFilmOverL0: this.cfg.tFilmOverL0,
    });
  }

  step(count: number) {
    const { nx, ny, nz } = this;
    const n = nx * ny * nz;
    const dt = Math.min(this.cfg.dt, 0.1);
    for (let s = 0; s < count; s++) {
      const eps = this.eps();
      const alpha = this.alpha();
      const well = this.well();
      const mobility = this.M();
      for (let i = 0; i < n; i++) {
        const p = this.phi[i];
        this.wRe[i] = this.mobile[i] ? well * (p * p * p - p) - this.h[i] : 0;
        this.wIm[i] = 0;
        this.re[i] = p;
        this.im[i] = 0;
      }
      fft3d(this.re, this.im, nx, ny, nz, false);
      fft3d(this.wRe, this.wIm, nx, ny, nz, false);
      for (let i = 0; i < n; i++) {
        const k2 = this.k2[i];
        if (k2 === 0) continue;
        const denom = 1 + dt * mobility * (eps * k2 * k2 + alpha);
        this.re[i] = (this.re[i] - dt * mobility * k2 * this.wRe[i]) / denom;
        this.im[i] = (this.im[i] - dt * mobility * k2 * this.wIm[i]) / denom;
      }
      fft3d(this.re, this.im, nx, ny, nz, true);
      for (let i = 0; i < n; i++) {
        if (!this.mobile[i]) continue;
        this.phi[i] = clamp(this.re[i], -1.35, 1.35);
      }
      this.steps += 1;
    }
  }

  energy() {
    const n = this.phi.length;
    const well = this.well();
    let bulk = 0;
    for (let i = 0; i < n; i++) {
      const pm1 = this.phi[i] * this.phi[i] - 1;
      bulk += (well / 4) * pm1 * pm1;
    }
    return bulk / n;
  }

  report(): Film3dReport {
    const { nx, ny, nz } = this;
    const slice = (z: number) => {
      const out = new Float32Array(nx * ny);
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) out[y * nx + x] = this.phi[this.idx(x, y, z)];
      }
      return out;
    };
    const midZ = (nz / 2) | 0;
    const mid = slice(midZ);
    const bot = slice(0);
    const top = slice(nz - 1);
    const xz = new Float32Array(nx * nz);
    const yMid = (ny / 2) | 0;
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) xz[z * nx + x] = this.phi[this.idx(x, yMid, z)];
    }
    const yz = new Float32Array(ny * nz);
    const xMid = (nx / 2) | 0;
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) yz[z * ny + y] = this.phi[this.idx(xMid, y, z)];
    }
    const sliceCfg = { ...this.cfg, nx, ny, dxNm: this.dxNm };
    const dummy = new Uint8Array(nx * ny);
    dummy.fill(1);
    const xzCfg = { ...this.cfg, nx, ny: nz, dxNm: this.dxNm };
    const yzCfg = { ...this.cfg, nx: ny, ny: nz, dxNm: this.dxNm };
    const dummyXz = new Uint8Array(nx * nz);
    dummyXz.fill(1);
    const dummyYz = new Uint8Array(ny * nz);
    dummyYz.fill(1);

    const phiBarZ: { z: number; amp: number }[] = [];
    let para = 0;
    let perp = 0;
    for (let z = 0; z < nz; z++) {
      let mean = 0;
      let var_ = 0;
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) mean += this.phi[this.idx(x, y, z)];
      }
      mean /= nx * ny;
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const d = this.phi[this.idx(x, y, z)] - mean;
          var_ += d * d;
        }
      }
      var_ /= nx * ny;
      phiBarZ.push({ z: (z + 0.5) * this.dzNm, amp: Math.sqrt(var_) });
      para += mean * mean;
      perp += var_;
    }
    const order = Math.min(1, perp / (perp + para + 1e-6));

    return {
      nx,
      ny,
      nz,
      dzNm: this.dzNm,
      energy: this.energy(),
      order,
      parallelFrac: para / (para + perp + 1e-6),
      perpScore: order,
      midRgba: renderRgba(mid, sliceCfg, dummy),
      botRgba: renderRgba(bot, sliceCfg, dummy),
      topRgba: renderRgba(top, sliceCfg, dummy),
      xzRgba: renderRgba(xz, xzCfg, dummyXz),
      yzRgba: renderRgba(yz, yzCfg, dummyYz),
      phiBarZ,
      steps: this.steps,
    };
  }
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
