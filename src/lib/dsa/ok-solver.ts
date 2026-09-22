import { fft2d } from "./fft.ts";
import { buildGuideField, commensurability, multiplicationFactor } from "./guides.ts";
import { computeMetrics, midLineCut, renderRgba, zeroCrossings, type RadialBin } from "./metrology.ts";
import { classifyDefects } from "./defects.ts";
import {
  annealTemperature,
  chiNAt,
  chiNOdt,
  effectiveMobility,
  interfaceWidthNm,
  kineticTrapScore,
  lerFloorNm,
  l0At,
} from "./kinetics.ts";
import { blendedChiN, blendedL0, blendSeedAmp } from "./blend.ts";
import { doseSavingFraction } from "./euv-dose.ts";
import { lineEdgePsd } from "./psd.ts";
import { ccdReport } from "./ccd.ts";
import { afterEtchLer, afterEtchLwr, etchAmplification, residualLayerNm } from "./etch.ts";
import { classifyMorphology, overlayLeibler, renderDirector, tanhReference } from "./morphology.ts";
import { renderSem } from "./sem.ts";
import type { FramePayload, Metrics, SimConfig } from "./types.ts";

export class OkSolver {
  cfg: SimConfig;
  phi: Float32Array;
  re: Float32Array;
  im: Float32Array;
  wRe: Float32Array;
  wIm: Float32Array;
  hField: Float32Array;
  mobile: Uint8Array;
  k2: Float32Array;
  steps = 0;
  t = 0;
  rng: () => number;

  constructor(cfg: SimConfig) {
    this.cfg = { ...cfg, guide: { ...cfg.guide } };
    const n = cfg.nx * cfg.ny;
    this.phi = new Float32Array(n);
    this.re = new Float32Array(n);
    this.im = new Float32Array(n);
    this.wRe = new Float32Array(n);
    this.wIm = new Float32Array(n);
    this.hField = new Float32Array(n);
    this.mobile = new Uint8Array(n);
    this.k2 = new Float32Array(n);
    this.rng = mulberry32(cfg.seed);
    this.buildK();
    this.rebuildGuide();
    this.seedField();
  }

  private buildK() {
    const { nx, ny } = this.cfg;
    for (let y = 0; y < ny; y++) {
      const ky = y <= ny / 2 ? y : y - ny;
      for (let x = 0; x < nx; x++) {
        const kx = x <= nx / 2 ? x : x - nx;
        const k2 =
          (2 * Math.PI * kx) ** 2 / nx ** 2 + (2 * Math.PI * ky) ** 2 / ny ** 2;
        this.k2[y * nx + x] = k2;
      }
    }
  }

  rebuildGuide() {
    const raw = buildGuideField(this.cfg);
    const n = raw.length;
    this.mobile.fill(1);
    for (let i = 0; i < n; i++) {
      if (raw[i] >= 90) {
        this.mobile[i] = 0;
        this.hField[i] = 0;
      } else {
        this.hField[i] = raw[i];
      }
    }
  }

  seedField() {
    const { f, noise, nx, dxNm } = this.cfg;
    const m = 2 * f - 1;
    const n = this.phi.length;
    const amp = blendSeedAmp(this.cfg.blendFrac, this.cfg.blendPath);
    const Lblend = Math.max(this.L0(), 4);
    for (let i = 0; i < n; i++) {
      if (!this.mobile[i]) {
        this.phi[i] = Math.sign(this.cfg.guide.wetting) || 1;
        continue;
      }
      const x = (i % nx) * dxNm;
      const wave = amp * Math.sin((2 * Math.PI * x) / (1.7 * Lblend));
      this.phi[i] = clamp(
        m + wave + Math.max(noise * 4, 0.18) * (this.rng() * 2 - 1),
        -1.2,
        1.2,
      );
    }
    this.steps = 0;
    this.t = 0;
  }

  annealT() {
    return annealTemperature(this.cfg.T, this.cfg.T2, this.cfg.tSwitch, this.t);
  }

  L0() {
    return l0At(blendedL0(this.cfg.L0Nm, this.cfg.blendFrac), this.annealT());
  }

  chiNNow() {
    return chiNAt(blendedChiN(this.cfg.chiN, this.cfg.blendFrac), this.annealT());
  }

  /** Linear-stability ε so that k* = 2π / L0_px. */
  epsilon() {
    const Lpx = this.L0() / this.cfg.dxNm;
    return (Lpx * Lpx) / (8 * Math.PI * Math.PI);
  }

  wellScale() {
    return Math.max(this.chiNNow(), 4) / 12;
  }

  alpha() {
    const eps = this.epsilon();
    const odt = 10.5;
    const ratio = Math.max(this.chiNNow(), 4) / odt;
    return (1 / (4 * eps)) / Math.sqrt(ratio);
  }

  M() {
    return effectiveMobility({
      mobility: this.cfg.mobility,
      chiN: blendedChiN(this.cfg.chiN, this.cfg.blendFrac),
      T: this.annealT(),
      microwave: this.cfg.microwave,
      tFilmOverL0: this.cfg.tFilmOverL0,
    });
  }

  step(count = 1) {
    const { nx, ny, dt, noise } = this.cfg;
    const n = nx * ny;

    for (let s = 0; s < count; s++) {
      const eps = this.epsilon();
      const alpha = this.alpha();
      const well = this.wellScale();
      const mobility = this.M();
      const amp = Math.sqrt(Math.max(2 * mobility * noise * dt, 0));

      for (let i = 0; i < n; i++) {
        const p = this.phi[i];
        const bulk = well * (p * p * p - p);
        this.wRe[i] = this.mobile[i] ? bulk - this.hField[i] : 0;
        this.wIm[i] = 0;
        this.re[i] = p;
        this.im[i] = 0;
      }
      fft2d(this.re, this.im, nx, ny, false);
      fft2d(this.wRe, this.wIm, nx, ny, false);

      for (let i = 0; i < n; i++) {
        const k2 = this.k2[i];
        if (k2 === 0) {
          continue;
        }
        const denom = 1 + dt * mobility * (eps * k2 * k2 + alpha);
        const wr = this.wRe[i];
        const wi = this.wIm[i];
        this.re[i] = (this.re[i] - dt * mobility * k2 * wr) / denom;
        this.im[i] = (this.im[i] - dt * mobility * k2 * wi) / denom;
      }
      fft2d(this.re, this.im, nx, ny, true);

      for (let i = 0; i < n; i++) {
        if (!this.mobile[i]) {
          this.phi[i] = Math.sign(this.cfg.guide.wetting) || 1;
          continue;
        }
        let p = this.re[i];
        if (amp > 0) p += amp * gauss(this.rng);
        this.phi[i] = clamp(p, -1.35, 1.35);
      }
      this.steps += 1;
      this.t += dt;
    }
  }

  energy(): { total: number; bulk: number; grad: number; longr: number } {
    const { nx, ny } = this.cfg;
    const n = nx * ny;
    const eps = this.epsilon();
    const alpha = this.alpha();
    const well = this.wellScale();
    let bulk = 0;
    let grad = 0;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        const p = this.phi[i];
        const pm1 = p * p - 1;
        bulk += (well / 4) * pm1 * pm1;
        const px = this.phi[y * nx + ((x + 1) % nx)];
        const py = this.phi[((y + 1) % ny) * nx + x];
        const dx = px - p;
        const dy = py - p;
        grad += 0.5 * eps * (dx * dx + dy * dy);
      }
    }
    this.re.set(this.phi);
    this.im.fill(0);
    fft2d(this.re, this.im, nx, ny, false);
    let longr = 0;
    for (let i = 0; i < n; i++) {
      const k2 = this.k2[i];
      if (k2 === 0) continue;
      const mag2 = this.re[i] * this.re[i] + this.im[i] * this.im[i];
      longr += 0.5 * alpha * (mag2 / k2) / n;
    }
    bulk /= n;
    grad /= n;
    const total = bulk + grad + longr;
    return { total, bulk, grad, longr };
  }

  metrics(): Metrics {
    const e = this.energy();
    const extra = computeMetrics(this.phi, this.cfg, this.k2, this.re, this.im);
    const def = classifyDefects(this.phi, this.hField, this.cfg);
    const Tnow = this.annealT();
    const chiEff = this.chiNNow();
    const mEff = this.M();
    const L0 = this.L0();
    const w = interfaceWidthNm(chiEff, L0);
    const floor = lerFloorNm(chiEff, L0);
    const dsaLer = Math.hypot(def.dsaLerNm, floor);
    const rectification = dsaLer > 1e-6 ? def.guideLerNm / dsaLer : def.rectification;
    const psd = lineEdgePsd(this.phi, this.cfg.nx, this.cfg.ny, this.cfg.dxNm);
    const pitch = this.cfg.guide.LsNm || L0;
    const saving = doseSavingFraction(dsaLer, this.cfg.euvDose, pitch);
    const liveRepair =
      this.cfg.templateDefect === "none"
        ? 1
        : clamp(
            extra.order * Math.min(rectification, 3) / (1 + def.dislocations),
            0,
            1,
          );
    const ccd = ccdReport(this.phi, this.cfg);
    const etchAmp = etchAmplification(L0, chiEff);
    const etchLer = afterEtchLer(dsaLer, L0, chiEff);
    const etchLwr = afterEtchLwr(extra.lwrNm, L0, chiEff);
    const residual = residualLayerNm(this.cfg.deltaGamma, L0);
    const holey =
      this.cfg.guide.kind === "contact-holes" || this.cfg.guide.kind === "via-pair";
    const lossPos = holey
      ? ccd.lossPos
      : ((extra.peakPitchNm - L0) / Math.max(L0, 1)) ** 2;
    const lossCir = holey ? ccd.lossCir : (extra.lwrNm / Math.max(L0 * 0.5, 1)) ** 2;
    const lossRd = holey ? ccd.lossRd : extra.defectIndex * 0.5;
    const lossTotal = 0.4 * lossPos + 0.3 * lossCir + 0.3 * lossRd;
    const radial = radialStructure(this.phi, this.cfg, this.k2, this.re, this.im);
    const morphology = classifyMorphology({
      order: extra.order,
      hexatic: extra.hexatic,
      f: this.cfg.f,
      radial,
    });
    return {
      t: this.t,
      steps: this.steps,
      energy: e.total,
      bulkEnergy: e.bulk,
      gradEnergy: e.grad,
      longEnergy: e.longr,
      meanPhi: extra.meanPhi,
      order: extra.order,
      peakK: extra.peakK,
      peakPitchNm: extra.peakPitchNm,
      cdNm: extra.cdNm,
      lwrNm: extra.lwrNm,
      lerNm: extra.lerNm,
      defectIndex: extra.defectIndex,
      hexatic: extra.hexatic,
      nDomains: extra.nDomains,
      commensurability: commensurability(this.cfg.guide.LsNm, L0),
      multiplication: multiplicationFactor(this.cfg.guide.LsNm, L0),
      chiNEff: chiEff,
      mobilityEff: mEff,
      dislocations: def.dislocations,
      misalignedFrac: def.misalignedFrac,
      nBridges: def.nBridges,
      guideLerNm: def.guideLerNm,
      dsaLerNm: dsaLer,
      rectification,
      lcduNm: ccd.lcduNm || def.lcduNm,
      ppeNm: ccd.ppeNm || def.ppeNm,
      densityPer1000um2: def.densityPer1000um2,
      kineticTrap: kineticTrapScore(chiEff, Tnow, extra.order),
      corrLengthNm: psd.corrLengthNm,
      psd0: psd.psd0,
      interfaceWidthNm: w,
      lerFloorNm: floor,
      doseSaving: saving,
      repairability: liveRepair,
      blendL0Nm: L0,
      chiNOdt: chiNOdt(Math.round(18.5 * 480 / Math.max(this.cfg.chiN, 8))),
      annealT: Tnow,
      ccdNm: ccd.ccdNm,
      ccdSigmaNm: ccd.ccdSigmaNm,
      nHoles: ccd.nHoles,
      circularity: ccd.circularity,
      nJumpOutliers: ccd.nJumpOutliers,
      etchLerNm: etchLer,
      etchLwrNm: etchLwr,
      etchAmp,
      residualNm: residual,
      lossPos,
      lossCir,
      lossRd,
      lossTotal,
      morphology,
    };
  }

  frame(): FramePayload {
    const metrics = this.metrics();
    const rgba = renderRgba(this.phi, this.cfg, this.mobile);
    const radialRaw = radialStructure(this.phi, this.cfg, this.k2, this.re, this.im);
    const radial = overlayLeibler(radialRaw, this.chiNNow(), this.cfg.f, this.L0());
    const psd = lineEdgePsd(this.phi, this.cfg.nx, this.cfg.ny, this.cfg.dxNm);
    const e = this.energy();
    const ccd = ccdReport(this.phi, this.cfg);
    const lineCut = tanhReference(
      midLineCut(this.phi, this.cfg.nx, this.cfg.ny, this.cfg.dxNm),
      this.chiNNow(),
      this.L0(),
    );
    const psdGuide = psd.bins.map((b) => {
      const k2ref = psd.bins[Math.min(4, psd.bins.length - 1)]?.psd ?? 1;
      const kRef = psd.bins[Math.min(4, psd.bins.length - 1)]?.k ?? 0.05;
      return {
        k: b.k,
        psd: b.psd,
        k2: k2ref * (kRef * kRef) / Math.max(b.k * b.k, 1e-12),
        k4: k2ref * (kRef ** 4) / Math.max(b.k ** 4, 1e-18),
      };
    });
    return {
      rgba,
      semRgba: renderSem(this.phi, this.cfg.nx, this.cfg.ny, this.cfg.dxNm, this.mobile),
      directorRgba: renderDirector(this.phi, this.cfg.nx, this.cfg.ny, this.mobile),
      phi: this.phi.slice(),
      mask: this.mobile.slice(),
      nx: this.cfg.nx,
      ny: this.cfg.ny,
      metrics,
      radial,
      psd: psdGuide,
      holes: ccd.holes.map((h) => ({ x: h.x, y: h.y, cd: h.cd })),
      lineCut,
      edges: zeroCrossings(this.phi, this.cfg.nx, this.cfg.ny, this.cfg.dxNm),
      energyParts: { bulk: e.bulk, grad: e.grad, longr: e.longr, total: e.total },
    };
  }
}

export function radialStructure(
  phi: Float32Array,
  cfg: SimConfig,
  k2: Float32Array,
  re: Float32Array,
  im: Float32Array,
): RadialBin[] {
  const { nx, ny, dxNm } = cfg;
  re.set(phi);
  im.fill(0);
  fft2d(re, im, nx, ny, false);
  const nb = 36;
  const acc = new Float64Array(nb);
  const cnt = new Float64Array(nb);
  const kmaxNm = Math.PI / Math.max(dxNm, 1e-6);
  for (let i = 1; i < nx * ny; i++) {
    const kNm = Math.sqrt(k2[i]) / dxNm;
    const b = Math.min(nb - 1, Math.floor((kNm / kmaxNm) * nb));
    acc[b] += re[i] * re[i] + im[i] * im[i];
    cnt[b] += 1;
  }
  const out: RadialBin[] = [];
  for (let i = 1; i < nb; i++) {
    const k = ((i + 0.5) / nb) * kmaxNm;
    out.push({ k, s: cnt[i] ? acc[i] / cnt[i] : 0 });
  }
  return out;
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function gauss(rng: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
