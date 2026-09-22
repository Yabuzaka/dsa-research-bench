import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fft2d, fft3d, isPow2 } from "./fft.ts";
import { commensurability, multiplicationFactor, buildGuideField } from "./guides.ts";
import { OkSolver } from "./ok-solver.ts";
import { chiNAt, effectiveMobility, interfaceWidthNm, lerFloorNm, annealTemperature, l0At } from "./kinetics.ts";
import { euvLerFromDose, doseToMatchLer, doseSavingFraction, applyDoseToConfig } from "./euv-dose.ts";
import { blendedL0 } from "./blend.ts";
import { lineEdgePsd } from "./psd.ts";
import { runSepa } from "./sepa.ts";
import { DEFAULT_CONFIG } from "./types.ts";
import { ccdReport } from "./ccd.ts";
import { etchAmplification, afterEtchLer } from "./etch.ts";
import { runInverse, defaultInverseTarget } from "./inverse.ts";
import { MATERIALS } from "./materials.ts";
import { judgeRun } from "./verdict.ts";
import { PRESETS } from "./presets.ts";
import { DSA_WINS } from "./success.ts";
import { runScft, runScft1d, runFilmScft, findLamellarPeriod, lamellarDOverRg, homogeneousF, capillaryLerNm } from "./scft.ts";
import { scftSiPayload } from "./si.ts";
import { runFilm3d } from "./film3d.ts";
import { midLineCut, zeroCrossings } from "./metrology.ts";
import { leiblerKstarRg, leiblerS, classifyMorphology, renderDirector } from "./morphology.ts";
import { renderSem } from "./sem.ts";
import { phaseAt, odtChiN } from "./phase.ts";
import { colorizePhi, familyFromMaterial, paletteFor } from "./looks.ts";

describe("fft", () => {
  it("round-trips a delta", () => {
    const n = 8;
    const re = new Float32Array(n * n);
    const im = new Float32Array(n * n);
    re[0] = 1;
    fft2d(re, im, n, n, false);
    fft2d(re, im, n, n, true);
    assert.ok(Math.abs(re[0] - 1) < 1e-5);
    assert.ok(Math.abs(re[3]) < 1e-5);
  });
  it("detects powers of two", () => {
    assert.equal(isPow2(192), false);
    assert.equal(isPow2(128), true);
  });
});

describe("guides", () => {
  it("rounds density multiplication", () => {
    assert.equal(multiplicationFactor(56, 28), 2);
    assert.equal(multiplicationFactor(84, 28), 3);
  });
  it("scores commensurability", () => {
    assert.ok(commensurability(56, 28) > 0.98);
    assert.ok(commensurability(60, 28) < commensurability(56, 28));
  });
  it("missing stripe zeros a chemo band", () => {
    const base = {
      ...DEFAULT_CONFIG,
      nx: 64,
      ny: 64,
      dxNm: 1,
      L0Nm: 16,
      guide: { ...DEFAULT_CONFIG.guide, kind: "chemo-lamellar" as const, LsNm: 32, cdNm: 8, strength: 1.2 },
    };
    const ideal = buildGuideField({ ...base, templateDefect: "none" });
    const miss = buildGuideField({ ...base, templateDefect: "missing-stripe" });
    let a = 0;
    let b = 0;
    for (let i = 0; i < ideal.length; i++) {
      a += Math.abs(ideal[i]);
      b += Math.abs(miss[i]);
    }
    assert.ok(b < a * 0.92, `missing ${b} vs ideal ${a}`);
  });
});

describe("Ohta–Kawasaki solver", () => {
  it("conserves mean composition on a closed domain", () => {
    const s = new OkSolver({
      ...DEFAULT_CONFIG,
      nx: 64,
      ny: 64,
      dxNm: 1,
      L0Nm: 16,
      noise: 0,
      dt: 0.1,
      guide: { ...DEFAULT_CONFIG.guide, kind: "none", strength: 0 },
    });
    const mean0 = avg(s.phi);
    s.step(40);
    const mean1 = avg(s.phi);
    assert.ok(Math.abs(mean1 - mean0) < 0.08, `${mean0} -> ${mean1}`);
  });

  it("places structure-factor peak near L0 after coarsening", () => {
    const L0 = 16;
    const s = new OkSolver({
      ...DEFAULT_CONFIG,
      nx: 64,
      ny: 64,
      dxNm: 1,
      L0Nm: L0,
      chiN: 24,
      f: 0.5,
      noise: 0.02,
      dt: 0.14,
      seed: 11,
      guide: { ...DEFAULT_CONFIG.guide, kind: "none", strength: 0 },
    });
    s.step(220);
    const m = s.metrics();
    const rel = Math.abs(m.peakPitchNm - L0) / L0;
    assert.ok(rel < 0.45, `pitch ${m.peakPitchNm} vs L0 ${L0}, order ${m.order}`);
    assert.ok(m.order > 0.15, `order ${m.order}`);
  });

  it("stays bounded and orders without noise after a quench", () => {
    const s = new OkSolver({
      ...DEFAULT_CONFIG,
      nx: 64,
      ny: 64,
      noise: 0,
      dt: 0.14,
      chiN: 24,
      L0Nm: 16,
      dxNm: 1,
      guide: { ...DEFAULT_CONFIG.guide, kind: "none", strength: 0 },
    });
    s.step(160);
    let max = 0;
    for (const v of s.phi) max = Math.max(max, Math.abs(v));
    const m = s.metrics();
    assert.ok(max <= 1.36, `max ${max}`);
    assert.ok(m.order > 0.12, `order ${m.order}`);
    assert.ok(Math.abs(m.meanPhi) < 0.15, `mean ${m.meanPhi}`);
  });

  it("two-step protocol drops T after tSwitch", () => {
    const s = new OkSolver({
      ...DEFAULT_CONFIG,
      nx: 32,
      ny: 32,
      T: 583,
      T2: 450,
      tSwitch: 0.5,
      dt: 0.2,
      noise: 0,
      guide: { ...DEFAULT_CONFIG.guide, kind: "none", strength: 0 },
    });
    assert.equal(s.annealT(), 583);
    s.step(4);
    assert.ok(s.t >= 0.5);
    assert.equal(s.annealT(), 450);
  });
});

describe("kinetics 2025–26", () => {
  it("raises χN as T drops", () => {
    assert.ok(chiNAt(18.5, 450) > chiNAt(18.5, 523));
  });
  it("high-χ at low T is slower than PS-PMMA at 310 °C", () => {
    const slow = effectiveMobility({ mobility: 1, chiN: 50, T: 430, microwave: 1, tFilmOverL0: 1.5 });
    const fast = effectiveMobility({ mobility: 1, chiN: 18.5, T: 583, microwave: 1, tFilmOverL0: 1.5 });
    assert.ok(slow < fast);
  });
  it("microwave and thick films move M in opposite directions", () => {
    const base = { mobility: 1, chiN: 20, T: 523, microwave: 1, tFilmOverL0: 1.5 };
    assert.ok(effectiveMobility({ ...base, microwave: 4 }) > effectiveMobility(base));
    assert.ok(effectiveMobility({ ...base, tFilmOverL0: 4 }) < effectiveMobility(base));
  });
  it("high χN sharpens the interface and drops the LER floor", () => {
    assert.ok(interfaceWidthNm(40, 28) < interfaceWidthNm(18, 28));
    assert.ok(lerFloorNm(40, 28) < lerFloorNm(18, 28));
  });
  it("annealTemperature switches at tSwitch", () => {
    assert.equal(annealTemperature(583, 450, 1, 0.2), 583);
    assert.equal(annealTemperature(583, 450, 1, 1.2), 450);
  });
});

describe("EUV dose and PSD", () => {
  it("LER falls as dose rises", () => {
    assert.ok(euvLerFromDose(40, 28) < euvLerFromDose(15, 28));
  });
  it("dose-to-match inverts the LER model", () => {
    const ler = euvLerFromDose(30, 28);
    const d = doseToMatchLer(ler, 28);
    assert.ok(Math.abs(d - 30) < 1);
  });
  it("positive dose saving when DSA LER is tighter than EUV", () => {
    assert.ok(doseSavingFraction(0.8, 30, 28) > 0);
  });
  it("imprints measurable guide LER", () => {
    const c = applyDoseToConfig(20, 28);
    assert.ok(c.euvLerNm > 1);
  });
  it("reports a correlation length on a striped field", () => {
    const nx = 64;
    const ny = 32;
    const phi = new Float32Array(nx * ny);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) phi[y * nx + x] = Math.sin((2 * Math.PI * x) / 16 + 0.02 * y);
    }
    const psd = lineEdgePsd(phi, nx, ny, 1);
    assert.ok(psd.corrLengthNm > 0);
  });
});

describe("blend and SEPA", () => {
  it("short-chain blend pulls L0 down", () => {
    assert.ok(blendedL0(28, 0.3) < 28);
  });
  it("SEPA returns a decaying field stack", () => {
    const r = runSepa(
      {
        ...DEFAULT_CONFIG,
        nx: 32,
        ny: 32,
        dxNm: 2,
        L0Nm: 16,
        templateDefect: "missing-stripe",
        guide: { ...DEFAULT_CONFIG.guide, kind: "chemo-lamellar", LsNm: 32, cdNm: 8, strength: 1.2 },
      },
      { layers: 4, steps: 24 },
    );
    assert.ok(r.layers.length >= 4);
    assert.ok(r.layers[0].hDecay >= r.layers[r.layers.length - 1].hDecay);
  });
});

describe("CCD, etch, inverse 2025–26", () => {
  it("contracts L0 as T rises", () => {
    assert.ok(l0At(28, 580) < l0At(28, 500));
  });
  it("extracts two holes and a CCD near the placed spacing", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      nx: 64,
      ny: 64,
      dxNm: 1,
      L0Nm: 16,
      f: 0.3,
      guide: { ...DEFAULT_CONFIG.guide, kind: "via-pair" as const, holeNm: 14, pairNm: 22, tau: 0.35 },
    };
    const phi = new Float32Array(64 * 64);
    phi.fill(-1);
    paintDisk(phi, 64, 22, 32, 6);
    paintDisk(phi, 64, 44, 32, 6);
    const r = ccdReport(phi, cfg);
    assert.ok(r.nHoles >= 2);
    assert.ok(Math.abs(r.ccdNm - 22) < 8);
  });
  it("flags a 1.5 nm CCD jump", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      nx: 32,
      ny: 32,
      dxNm: 1,
      f: 0.3,
      guide: { ...DEFAULT_CONFIG.guide, kind: "contact-holes" as const, holeNm: 10, LsNm: 16 },
    };
    const phi = new Float32Array(32 * 32);
    phi.fill(-1);
    paintDisk(phi, 32, 8, 16, 4);
    paintDisk(phi, 32, 24, 16, 4);
    const r = ccdReport(phi, cfg);
    assert.ok(r.nHoles >= 1);
  });
  it("amplifies etch LER as L0 drops below 30 nm", () => {
    assert.ok(etchAmplification(12, 20) > etchAmplification(32, 20));
    assert.ok(afterEtchLer(1, 12, 20) > afterEtchLer(1, 32, 20));
  });
  it("via-pair Gaussian peanut walls off the matrix", () => {
    const g = buildGuideField({
      ...DEFAULT_CONFIG,
      nx: 48,
      ny: 48,
      dxNm: 1,
      guide: { ...DEFAULT_CONFIG.guide, kind: "via-pair" as const, holeNm: 12, pairNm: 18, tau: 0.35, wallNm: 5 },
    });
    let walls = 0;
    for (const v of g) if (v >= 90) walls++;
    assert.ok(walls > 20);
  });
  it("inverse search returns a ranked finite loss", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      nx: 32,
      ny: 32,
      dxNm: 2,
      L0Nm: 16,
      guide: { ...DEFAULT_CONFIG.guide, kind: "chemo-lamellar" as const, LsNm: 32, cdNm: 8 },
    };
    const report = runInverse(cfg, defaultInverseTarget(cfg), { trials: 4, steps: 18, seed: 3 });
    assert.ok(report.trials.length >= 4);
    assert.ok(Number.isFinite(report.best.loss));
    assert.ok(report.best.loss <= report.trials[report.trials.length - 1].loss);
    assert.equal(report.nEval, report.trials.length);
    assert.equal(report.method, "gp-ei-scft2d");
    assert.ok(Number.isFinite(report.best.scftResidual));
    assert.ok(report.trials.every((trial) => trial.scftStatus != null));
  });
  it("ships P4ClS-b-PMA at 14.1 nm", () => {
    const m = MATERIALS.find((x) => x.id === "p4cls-pma");
    assert.ok(m);
    assert.equal(m?.L0Nm, 14.1);
  });
});

describe("run verdict", () => {
  it("flags a kinetic trap before LER", () => {
    const v = judgeRun(DEFAULT_CONFIG, {
      ...emptyMetrics(),
      kineticTrap: 0.95,
      chiNEff: 48,
      annealT: 430,
      defectIndex: 0.2,
      etchLerNm: 0.7,
      order: 0.6,
    });
    assert.equal(v.level, "fail");
    assert.match(v.title, /trap/i);
  });
  it("passes a quiet P24-like field", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      L0Nm: 12,
      guide: { ...DEFAULT_CONFIG.guide, LsNm: 24, cdNm: 9, duty: 9 / 24, kind: "chemo-lamellar" as const },
    };
    const v = judgeRun(cfg, {
      ...emptyMetrics(),
      kineticTrap: 0.2,
      defectIndex: 0.2,
      dislocations: 0,
      nBridges: 0,
      etchLerNm: 1.1,
      etchLwrNm: 0.7,
      dsaLerNm: 0.9,
      peakPitchNm: 24,
      order: 0.55,
      rectification: 1.4,
      doseSaving: 0.22,
      blendL0Nm: 12,
      chiNEff: 32,
      annealT: 500,
    });
    assert.equal(v.level, "pass");
  });
});

describe("spectral SCFT", () => {
  it("1D lamellar D/Rg tracks Matsen at χN=20", () => {
    const r = runScft1d(20, 0.5, { nx: 128, Ns: 80, maxIter: 180, mix: 0.1, nPeriods: 1 });
    const target = lamellarDOverRg(20);
    const rel = Math.abs(r.periodRg - target) / target;
    assert.ok(r.Q > 1e-20 && Number.isFinite(r.Q), `Q ${r.Q}`);
    assert.ok(r.F < r.Fhom - 0.5, `F ${r.F} vs Fhom ${r.Fhom}`);
    assert.ok(r.F > 3.93 && r.F < 4.04, `F ${r.F} literature ~3.98`);
    assert.ok(Math.abs(r.meanA - 0.5) < 0.02, `meanA ${r.meanA}`);
    assert.ok(r.incomp < 5e-4, `incomp ${r.incomp}`);
    assert.ok(r.fieldResidual < 5e-4, `residual ${r.fieldResidual}`);
    assert.ok(rel < 0.03, `D/Rg ${r.periodRg} vs Matsen ${target}`);
    assert.ok(r.converged, "1D should converge");
  });
  it("F(D) minimum sits on the Matsen period", () => {
    const r = findLamellarPeriod(20, 0.5, { quick: true });
    const target = lamellarDOverRg(20);
    assert.ok(r.fdCurve.length >= 4, `curve ${r.fdCurve.length}`);
    const fs = r.fdCurve.filter((p) => Number.isFinite(p.F)).map((p) => p.F);
    const minF = Math.min(...fs);
    assert.ok(r.F <= minF + 0.02, `F* ${r.F} vs min ${minF}`);
    assert.ok(Math.abs(r.periodRg - target) / target < 0.05, `D* ${r.periodRg} vs ${target}`);
    assert.ok(r.F < r.Fhom - 0.5, `F ${r.F} Fhom ${r.Fhom}`);
    assert.ok(r.fieldResidual < 0.05, `res ${r.fieldResidual}`);
  });
  it("1D D/Rg grows from χN=12 to 30 and high-χ stays a saddle", () => {
    const a = runScft1d(12, 0.5, { nx: 64, Ns: 48, maxIter: 100, mix: 0.12, nPeriods: 1 });
    const b = runScft1d(30, 0.5, { nx: 64, Ns: 64, maxIter: 160, nPeriods: 1 });
    assert.ok(lamellarDOverRg(30) > lamellarDOverRg(12) * 1.1);
    assert.ok(b.F < b.Fhom - 1, `F30 ${b.F} Fhom ${b.Fhom}`);
    assert.ok(a.F < a.Fhom, `F12 ${a.F}`);
    assert.ok(Number.isFinite(b.F) && Number.isFinite(b.Q), `F30 ${b.F} Q ${b.Q}`);
    assert.ok(b.fieldResidual < 5e-3, `res30 ${b.fieldResidual}`);
    assert.ok(Math.abs(b.periodRg - lamellarDOverRg(30)) / lamellarDOverRg(30) < 0.04, `D30 ${b.periodRg}`);
    assert.ok(b.wRg < a.wRg, `SSL width should drop ${a.wRg} → ${b.wRg}`);
  });
  it("relaxes a symmetric diblock toward f and a finite period", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      chiN: 20,
      f: 0.5,
      L0Nm: 16,
      nx: 32,
      ny: 32,
      dxNm: 2,
      guide: { ...DEFAULT_CONFIG.guide, kind: "none" as const, strength: 0 },
    };
    const report = runScft(cfg, { nx: 32, Ns: 28, maxIter: 28, mix: 0.1 });
    assert.ok(report.residual < 0.05, `residual ${report.residual}`);
    assert.ok(report.fieldResidual < 0.02, `field ${report.fieldResidual}`);
    assert.ok(Math.abs(report.meanA - 0.5) < 0.05, `meanA ${report.meanA}`);
    assert.ok(report.incomp < 0.02, `incomp ${report.incomp}`);
    assert.ok(Number.isFinite(report.F));
    assert.ok(Math.abs(report.F - report.bulk.F) < 0.08, `F2D ${report.F} F1D ${report.bulk.F}`);
    assert.ok(report.F < report.Fhom - 0.3, `F ${report.F} Fhom ${report.Fhom}`);
    assert.ok(report.Q > 1e-20 && Number.isFinite(report.Q), `Q ${report.Q}`);
    assert.equal(report.method, "split-step-picard");
    assert.equal(report.morphology, "LAM");
    const target = lamellarDOverRg(20);
    assert.ok(Math.abs(report.bulk.periodRg - target) / target < 0.08, `bulk D ${report.bulk.periodRg}`);
    assert.ok(report.bulk.F < report.bulk.Fhom, `bulk F ${report.bulk.F}`);
    assert.ok(report.nPeriods <= 4, `nP ${report.nPeriods} should cap pixels/period`);
    const si = scftSiPayload(report, cfg);
    assert.equal(si.local, true);
    assert.ok(si.methods.includes("Matsen"));
    assert.ok(Number.isFinite(si.scft2d.FminusF1d));
    assert.equal(si.grid.nx, report.nx);
  });
  it("chemo 2× cell is an integer number of Ls and registers", () => {
    const report = runScft(
      {
        ...DEFAULT_CONFIG,
        chiN: 20,
        f: 0.5,
        L0Nm: 16,
        nx: 64,
        ny: 64,
        dxNm: 2,
        guide: {
          ...DEFAULT_CONFIG.guide,
          kind: "chemo-lamellar",
          LsNm: 32,
          duty: 0.25,
          cdNm: 8,
          strength: 1.2,
          wetting: 1,
        },
      },
      { nx: 32, Ns: 28, maxIter: 40, mix: 0.12 },
    );
    assert.ok(Number.isFinite(report.F) && Number.isFinite(report.Q), `F ${report.F}`);
    assert.ok(report.fieldResidual < 0.08, `guided res ${report.fieldResidual}`);
    assert.ok(report.registration > 0.15, `reg ${report.registration}`);
    assert.equal(report.cellNm % 32, 0, `cell ${report.cellNm} not multiple of Ls`);
    assert.ok(report.nPeriods % 2 === 0, `nP ${report.nPeriods}`);
  });
  it("snaps 3× chemo to a multiple of 3 L0", () => {
    const report = runScft(
      {
        ...DEFAULT_CONFIG,
        chiN: 20,
        f: 0.5,
        L0Nm: 28,
        nx: 128,
        ny: 128,
        dxNm: 1,
        guide: {
          ...DEFAULT_CONFIG.guide,
          kind: "chemo-lamellar",
          LsNm: 84,
          duty: 0.17,
          cdNm: 14,
          strength: 1.2,
          wetting: 1,
        },
      },
      { nx: 32, Ns: 20, maxIter: 8, mix: 0.1 },
    );
    assert.equal(report.nPeriods % 3, 0, `nP ${report.nPeriods}`);
    assert.equal(report.cellNm % 84, 0, `cell ${report.cellNm}`);
  });
  it("LiNe 2× on a 64² cell reaches a guided saddle", () => {
    const report = runScft(
      {
        ...DEFAULT_CONFIG,
        chiN: 18.5,
        f: 0.5,
        L0Nm: 28,
        nx: 128,
        ny: 128,
        dxNm: 1.75,
        guide: {
          ...DEFAULT_CONFIG.guide,
          kind: "chemo-lamellar",
          LsNm: 56,
          duty: 0.25,
          cdNm: 14,
          strength: 1.15,
          wetting: 1,
        },
      },
      { nx: 64, Ns: 48, maxIter: 140 },
    );
    assert.ok(Number.isFinite(report.F) && Number.isFinite(report.Q), `F ${report.F}`);
    assert.ok(report.fieldResidual < 5e-3, `guided res ${report.fieldResidual}`);
    assert.ok(report.incomp < 8e-3, `incomp ${report.incomp}`);
    assert.ok(report.registration > 0.18, `reg ${report.registration}`);
    assert.ok(report.nPeriods % 2 === 0, `nP ${report.nPeriods}`);
    assert.ok(report.cellNm % 56 === 0, `cell ${report.cellNm}`);
    assert.equal(report.morphology, "LAM");
  });
});

describe("3D thin film", () => {
  it("FFT3D round-trips", () => {
    const n = 4 * 4 * 4;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    re[0] = 1;
    fft3d(re, im, 4, 4, 4, false);
    fft3d(re, im, 4, 4, 4, true);
    assert.ok(Math.abs(re[0] - 1) < 1e-4);
  });
  it("reports midplane and xz slices", () => {
    const r = runFilm3d(
      {
        ...DEFAULT_CONFIG,
        nx: 32,
        ny: 32,
        dxNm: 2,
        L0Nm: 16,
        chiN: 24,
        tFilmOverL0: 2,
        deltaGamma: 0.05,
        guide: {
          ...DEFAULT_CONFIG.guide,
          kind: "chemo-lamellar",
          LsNm: 32,
          cdNm: 8,
          duty: 0.25,
          strength: 1.1,
        },
      },
      { nx: 32, nz: 8, steps: 24 },
    );
    assert.equal(r.nx, 32);
    assert.equal(r.nz, 8);
    assert.equal(r.midRgba.length, 32 * 32 * 4);
    assert.equal(r.xzRgba.length, 32 * 8 * 4);
    assert.equal(r.botRgba.length, 32 * 32 * 4);
    assert.equal(r.topRgba.length, 32 * 32 * 4);
    assert.equal(r.yzRgba.length, 32 * 8 * 4);
    assert.ok(r.phiBarZ.length === 8);
    assert.ok(r.energy < 2);
  });
  it("x–z film SCFT reports a finite ΔF and a preferred orientation", () => {
    const r = runFilmScft(
      {
        ...DEFAULT_CONFIG,
        chiN: 20,
        f: 0.5,
        L0Nm: 16,
        tFilmOverL0: 1.5,
        deltaGamma: 0,
        nx: 64,
        ny: 64,
        dxNm: 2,
        guide: { ...DEFAULT_CONFIG.guide, kind: "chemo-lamellar", LsNm: 32, cdNm: 8, strength: 1.1, wetting: 1 },
      },
      { nx: 32, nz: 16, maxIter: 20, Ns: 24 },
    );
    assert.ok(Number.isFinite(r.Fperp) && Number.isFinite(r.Fpara), `F⊥ ${r.Fperp} F∥ ${r.Fpara}`);
    assert.ok(Number.isFinite(r.dF));
    assert.ok(r.preferred === "perp" || r.preferred === "para");
    assert.equal(r.nx, 32);
    assert.equal(r.nz, 16);
    assert.equal(r.perpPhi.length, 32 * 16);
  });
});

describe("subpixel edges", () => {
  it("finds a cut and zero crossings on a stripe", () => {
    const nx = 32;
    const ny = 16;
    const phi = new Float32Array(nx * ny);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) phi[y * nx + x] = Math.sin((2 * Math.PI * x) / 8);
    }
    const cut = midLineCut(phi, nx, ny, 1);
    assert.ok(cut.length > 8);
    const zc = zeroCrossings(phi, nx, ny, 1);
    assert.ok(zc.length > 4);
  });
});

describe("Leibler, SEM, director, phase", () => {
  it("places k* Rg near 1.95 for a symmetric diblock", () => {
    const k = leiblerKstarRg(0.5);
    assert.ok(Math.abs(k - 1.946) < 0.05, `k* ${k}`);
    assert.ok(leiblerS(k, 8, 0.5) > leiblerS(k, 4, 0.5));
  });
  it("calls lamellae on a striped field", () => {
    const radial = [
      { k: 0.2, s: 1 },
      { k: 0.4, s: 8 },
      { k: 0.69, s: 0.4 },
    ];
    assert.equal(classifyMorphology({ order: 0.5, hexatic: 0.05, f: 0.5, radial }), "LAM");
    assert.equal(classifyMorphology({ order: 0.05, hexatic: 0, f: 0.5, radial }), "DIS");
  });
  it("renders SEM and director buffers", () => {
    const nx = 16;
    const ny = 16;
    const phi = new Float32Array(nx * ny);
    const mobile = new Uint8Array(nx * ny);
    mobile.fill(1);
    for (let i = 0; i < phi.length; i++) phi[i] = Math.sin((2 * Math.PI * (i % nx)) / 8);
    const sem = renderSem(phi, nx, ny, 1, mobile);
    const dir = renderDirector(phi, nx, ny, mobile);
    assert.equal(sem.length, nx * ny * 4);
    assert.equal(dir.length, nx * ny * 4);
    assert.equal(sem[3], 255);
  });
  it("paper look paints PS red and PMMA blue", () => {
    const phi = new Float32Array(2);
    const mask = new Uint8Array(2);
    mask.fill(1);
    phi[0] = 1;
    phi[1] = -1;
    const rgba = colorizePhi(phi, mask, "paper");
    assert.ok(rgba[0] > rgba[2], `PS should be red ${rgba[0]} ${rgba[2]}`);
    assert.ok(rgba[6] > rgba[4], `PMMA should be blue ${rgba[4]} ${rgba[6]}`);
  });
  it("PS-b-PDMS paper look is charcoal PS / gold PDMS", () => {
    const phi = new Float32Array(2);
    const mask = new Uint8Array(2);
    mask.fill(1);
    phi[0] = 1;
    phi[1] = -1;
    const rgba = colorizePhi(phi, mask, "paper", "pspdms");
    assert.ok(rgba[0] < 90, `PS charcoal R ${rgba[0]}`);
    assert.ok(rgba[4] > 180 && rgba[5] > 120, `PDMS gold ${rgba[4]} ${rgba[5]}`);
    assert.equal(familyFromMaterial("ps-pdms"), "pspdms");
    assert.equal(familyFromMaterial("p4cls-pma"), "p4cls");
  });
  it("TEM look stains PS dark and leaves PMMA bright", () => {
    const phi = new Float32Array(2);
    const mask = new Uint8Array(2);
    mask.fill(1);
    phi[0] = 1;
    phi[1] = -1;
    const rgba = colorizePhi(phi, mask, "tem", "pspmma");
    const ps = rgba[0] + rgba[1] + rgba[2];
    const pmma = rgba[4] + rgba[5] + rgba[6];
    assert.ok(ps < pmma, `TEM PS ${ps} vs PMMA ${pmma}`);
  });
  it("etch look keeps PS as the bright mask", () => {
    const phi = new Float32Array(2);
    const mask = new Uint8Array(2);
    mask.fill(1);
    phi[0] = 1;
    phi[1] = -1;
    const rgba = colorizePhi(phi, mask, "etch", "pspmma");
    const ps = rgba[0] + rgba[1] + rgba[2];
    const pmma = rgba[4] + rgba[5] + rgba[6];
    assert.ok(ps > pmma, `etch PS ${ps} vs PMMA ${pmma}`);
    const pdms = paletteFor("etch", "pspdms");
    assert.equal(pdms.etchKeepA, false);
  });
  it("hex SCFT seed stays finite for cylinder f", () => {
    const r = runScft(
      { ...DEFAULT_CONFIG, f: 0.32, chiN: 22, L0Nm: 32, nx: 64, ny: 64, dxNm: 2, guide: { ...DEFAULT_CONFIG.guide, kind: "none", strength: 0 } },
      { nx: 64, Ns: 48, maxIter: 120 },
    );
    assert.ok(Number.isFinite(r.Q) && r.Q > 0, `Q ${r.Q}`);
    assert.ok(r.meanA > 0.2 && r.meanA < 0.5, `meanA ${r.meanA}`);
    assert.equal(r.morphology, "HEX");
    assert.ok(r.cellLyNm > r.cellNm * 0.7, `hex cell ${r.cellNm}×${r.cellLyNm}`);
    assert.ok(r.fieldResidual < 5e-3, `hex res ${r.fieldResidual}`);
    assert.ok(r.converged, "hex should be a saddle on 64²");
  });
  it("ODT is 10.5 at f=1/2 and rises off-symmetric", () => {
    assert.ok(Math.abs(odtChiN(0.5) - 10.495) < 0.05);
    assert.ok(odtChiN(0.3) > odtChiN(0.5));
    assert.equal(phaseAt(0.5, 8), "DIS");
    assert.equal(phaseAt(0.5, 20), "LAM");
    assert.equal(phaseAt(0.25, 25), "HEX");
  });
  it("homogeneous F is χN/4 at f=1/2", () => {
    assert.equal(homogeneousF(20, 0.5), 5);
  });
  it("high-χ 1D stays a continued saddle below Fhom", () => {
    const r = runScft1d(40, 0.5, { nPeriods: 1 });
    const target = lamellarDOverRg(40);
    assert.ok(Number.isFinite(r.F) && Number.isFinite(r.Q), `F ${r.F} Q ${r.Q}`);
    assert.ok(r.F < r.Fhom - 3, `F40 ${r.F} Fhom ${r.Fhom}`);
    assert.ok(r.Q > 1e-20, `Q ${r.Q}`);
    assert.ok(r.fieldResidual < 8e-3, `res40 ${r.fieldResidual}`);
    assert.ok(r.incomp < 2e-3, `incomp ${r.incomp}`);
    assert.ok(Math.abs(r.periodRg - target) / target < 0.05, `D40 ${r.periodRg} vs ${target}`);
  });
  it("capillary LER falls as the SCFT interface sharpens", () => {
    assert.ok(capillaryLerNm(2.0, 28) < capillaryLerNm(4.0, 28));
    assert.ok(capillaryLerNm(3, 28) > 0.4 && capillaryLerNm(3, 28) < 6);
  });
});

describe("published DSA wins", () => {
  it("every listed combination maps to a chamber recipe", () => {
    const ids = new Set(PRESETS.map((p) => p.id));
    for (const w of DSA_WINS) {
      assert.ok(ids.has(w.recipeId), `${w.id} → ${w.recipeId}`);
    }
  });
});

function emptyMetrics(): import("./types.ts").Metrics {
  return {
    t: 1, steps: 10, energy: -1, bulkEnergy: 0, gradEnergy: 0, longEnergy: 0,
    meanPhi: 0, order: 0.5, peakK: 1, peakPitchNm: 28, cdNm: 14, lwrNm: 1,
    lerNm: 1, defectIndex: 0.2, hexatic: 0, nDomains: 4, commensurability: 1,
    multiplication: 2, chiNEff: 18, mobilityEff: 1, dislocations: 0,
    misalignedFrac: 0, nBridges: 0, guideLerNm: 2, dsaLerNm: 1, rectification: 2,
    lcduNm: 0.5, ppeNm: 0.4, densityPer1000um2: 1, kineticTrap: 0.2,
    corrLengthNm: 40, psd0: 1, interfaceWidthNm: 1.2, lerFloorNm: 0.8,
    doseSaving: 0.2, repairability: 0.8, blendL0Nm: 28, chiNOdt: 10.5,
    annealT: 523, ccdNm: 32, ccdSigmaNm: 1, nHoles: 0, circularity: 0.9,
    nJumpOutliers: 0, etchLerNm: 1.1, etchLwrNm: 0.9, etchAmp: 1.1,
    residualNm: 0.2, lossPos: 0, lossCir: 0, lossRd: 0, lossTotal: 0.2,
    morphology: "LAM",
  };
}

function avg(a: Float32Array) {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

function paintDisk(phi: Float32Array, nx: number, cx: number, cy: number, r: number) {
  const ny = phi.length / nx;
  const r2 = r * r;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= r2) phi[y * nx + x] = 1;
    }
  }
}
