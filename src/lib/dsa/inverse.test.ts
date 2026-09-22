import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runInverse,
  defaultInverseTarget,
  inverseObjective,
  type InverseProgress,
} from "./inverse.ts";
import { measureInverseField } from "./inverse-metrics.ts";
import { DEFAULT_CONFIG } from "./types.ts";

const quick = { trials: 5, initialTrials: 3, seed: 17, scft: { nx: 16, Ns: 12, maxIter: 12 } };

describe("SCFT inverse design", () => {
  it("replays deterministic adaptive proposals, scores every trial with SCFT and reports progress", () => {
    const base = {
      ...DEFAULT_CONFIG,
      nx: 64,
      ny: 32,
      dxNm: 2.1,
      T: 555,
      blendFrac: 0.35,
      seed: 23,
      guide: { ...DEFAULT_CONFIG.guide, overlayNm: 1.25 },
    };
    const before = JSON.stringify(base);
    const progress: InverseProgress[] = [];
    const target = defaultInverseTarget(base);
    const a = runInverse(base, target, { ...quick, onProgress: (p) => progress.push(p) });
    const b = runInverse(base, target, quick);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(base), before);
    assert.equal(a.method, "gp-ei-scft2d");
    assert.equal(a.nEval, 5);
    assert.equal(progress.length, 5);
    assert.deepEqual(
      progress.map((p) => p.completed),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(
      progress.map((p) => p.history.length),
      [1, 2, 3, 4, 5],
    );
    for (let i = 1; i < a.history.length; i++)
      assert.ok(a.history[i].bestLoss <= a.history[i - 1].bestLoss);
    for (const t of a.trials) {
      assert.equal(t.loss, t.scftLoss);
      assert.ok(Number.isFinite(t.scftResidual));
      assert.ok(Number.isFinite(t.scftIncomp));
      assert.equal(t.grid.nx, 16);
      assert.equal(t.grid.ns, 12);
      assert.equal(t.config.nx, 64);
      assert.equal(t.config.ny, 32);
      assert.equal(t.config.dxNm, 2.1);
      assert.equal(t.config.T, 555);
      assert.equal(t.config.blendFrac, 0);
      assert.equal(t.config.seed, 23);
      assert.equal(t.config.guide.overlayNm, 1.25);
      assert.deepEqual(t.evaluatedConfig, t.config);
      if (t.phase === "bayesian") {
        assert.ok(Number.isFinite(t.predictedSigma));
        assert.ok(t.expectedImprovement! >= 0);
      }
    }
    assert.notEqual(a.best.scftStatus, "failed");
    assert.equal(
      a.best.loss,
      Math.min(...a.trials.filter((t) => t.scftStatus !== "failed").map((t) => t.loss)),
    );
  });

  it("CD and pitch targets influence contact loss independently", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      f: 0.33,
      guide: { ...DEFAULT_CONFIG.guide, kind: "contact-holes" as const, LsNm: 28 },
    };
    const m = {
      cdNm: 14,
      pitchNm: 28,
      lerNm: 0,
      lcduNm: 0,
      ppeNm: 0,
      circularityLoss: 0,
      missing: 0,
      nDomains: 4,
      resolved: true,
      order: 0.8,
      dxNm: 1,
      dyNm: 1,
    };
    const r = { registration: 0.8, fieldResidual: 0.001, incomp: 0.001 };
    const target = { ...defaultInverseTarget(cfg), cdNm: 14, pitchNm: 28 };
    const exact = inverseObjective(m, r, cfg, target, 1).total;
    assert.ok(inverseObjective(m, r, cfg, { ...target, cdNm: 8 }, 1).total > exact);
    assert.ok(inverseObjective(m, r, cfg, { ...target, pitchNm: 40 }, 1).total > exact);
    assert.ok(
      inverseObjective(
        { ...m, resolved: false, nDomains: 0, missing: 1, cdNm: 0, pitchNm: 0 },
        r,
        cfg,
        target,
        1,
      ).total >
        exact + 1,
    );
  });

  it("changes contact search bounds when target CD or pitch changes", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      f: 0.33,
      guide: { ...DEFAULT_CONFIG.guide, kind: "contact-holes" as const },
    };
    const target = defaultInverseTarget(cfg);
    const a = runInverse(cfg, target, { ...quick, trials: 1 });
    const b = runInverse(
      cfg,
      { ...target, cdNm: target.cdNm / 2, pitchNm: target.pitchNm * 1.2 },
      { ...quick, trials: 1 },
    );
    assert.equal(b.best.config.guide.holeNm, a.best.config.guide.holeNm / 2);
    assert.ok(Math.abs(b.best.config.guide.LsNm - a.best.config.guide.LsNm * 1.2) < 1e-10);
    assert.notEqual(a.best.loss, b.best.loss);
  });

  it("rejects invalid target, recipe composition, and non-power-of-two grids", () => {
    const target = defaultInverseTarget(DEFAULT_CONFIG);
    assert.throws(
      () => runInverse(DEFAULT_CONFIG, { ...target, cdNm: NaN }, quick),
      /positive and finite/,
    );
    assert.throws(() => runInverse({ ...DEFAULT_CONFIG, f: NaN }, target, quick), /finite/);
    assert.throws(
      () => runInverse({ ...DEFAULT_CONFIG, f: 0.1 }, target, quick),
      /A-block fractions/,
    );
    assert.throws(() => runInverse({ ...DEFAULT_CONFIG, L0Nm: 0 }, target, quick), /positive/);
    assert.throws(
      () => runInverse(DEFAULT_CONFIG, target, { ...quick, scft: { nx: 24 } }),
      /power of two/,
    );
    assert.throws(() => runInverse(DEFAULT_CONFIG, target, { ...quick, trials: 0 }), /trials/);
  });
});

describe("physical inverse field measurements", () => {
  it("resolves one-period lamellae and wraps the seam for CD and pitch", () => {
    const nx = 64,
      ny = 32,
      W = 28,
      H = 28;
    const phi = Float32Array.from({ length: nx * ny }, (_, i) =>
      Math.cos((2 * Math.PI * (i % nx)) / nx),
    );
    const cfg = { ...DEFAULT_CONFIG, guide: { ...DEFAULT_CONFIG.guide, LsNm: 28 } };
    const m = measureInverseField(
      { phi, nx, ny, cellNm: W, cellLyNm: H, periodNm: W },
      cfg,
      "lamellar",
      28,
      1,
    );
    assert.equal(m.resolved, true);
    assert.ok(Math.abs(m.cdNm - 14) < 0.01);
    assert.ok(Math.abs(m.pitchNm - 28) < 0.01);
    assert.equal(m.nDomains, 1);
    assert.ok(m.lerNm < 1e-8);
  });

  it("uses physical rectangular pixels and merges periodic contact domains", () => {
    const nx = 64,
      ny = 32,
      W = 64,
      H = 64;
    const phi = new Float32Array(nx * ny).fill(-1);
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const px = x + 0.5,
          py = (y + 0.5) * 2;
        for (const cx of [0, 32]) {
          const dx = Math.min(Math.abs(px - cx), W - Math.abs(px - cx));
          const dy = Math.min(Math.abs(py), H - Math.abs(py));
          if (dx * dx + dy * dy < 36) phi[y * nx + x] = 1;
        }
      }
    const cfg = {
      ...DEFAULT_CONFIG,
      f: 0.5,
      guide: { ...DEFAULT_CONFIG.guide, kind: "contact-holes" as const, LsNm: 32, overlayNm: 0 },
    };
    const m = measureInverseField(
      { phi, nx, ny, cellNm: W, cellLyNm: H, periodNm: 32 },
      cfg,
      "holes",
      32,
      1,
    );
    assert.equal(m.nDomains, 2);
    assert.equal(m.dxNm, 1);
    assert.equal(m.dyNm, 2);
    assert.equal(m.resolved, true);
    assert.ok(Math.abs(m.cdNm - 12) < 1);
    assert.ok(Math.abs(m.pitchNm - 32) < 1e-8);
    assert.ok(m.circularityLoss < 0.02);
    assert.ok(m.ppeNm < 0.1);
  });

  it("does not give an unresolved homogeneous contact field perfect quality", () => {
    const m = measureInverseField(
      {
        phi: new Float32Array(256).fill(-0.34),
        nx: 16,
        ny: 16,
        cellNm: 32,
        cellLyNm: 40,
        periodNm: 16,
      },
      DEFAULT_CONFIG,
      "holes",
      16,
      1,
    );
    assert.equal(m.resolved, false);
    assert.equal(m.nDomains, 0);
    assert.equal(m.missing, 1);
    assert.equal(m.circularityLoss, 1);
  });
});
