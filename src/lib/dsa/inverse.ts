/** Sequential GP expected-improvement optimization of a project-defined 2D
 * single-diblock SCFT objective. Inspired by inverse DSA design, not a
 * replication of the Zhou blend model: https://arxiv.org/abs/2510.02715
 * All evaluations use identical fidelity.
 */
import { proposeExpectedImprovement } from "./gp.ts";
import { measureInverseField, type InverseMeasurements } from "./inverse-metrics.ts";
import { runScft, type ScftReport } from "./scft.ts";
import type { SimConfig } from "./types.ts";

export type InverseMode = "lamellar" | "holes" | "via-pair";
export type InverseTarget = {
  mode: InverseMode;
  pitchNm: number;
  cdNm: number;
  maxLerNm: number;
  maxLcduNm: number;
};
export type InversePhase = "initial" | "bayesian";
export type InverseHistory = {
  iteration: number;
  bestLoss: number;
  loss: number;
  phase: InversePhase;
};
export type InverseTrial = {
  id: number;
  loss: number;
  lossPos: number;
  lossCir: number;
  lossRd: number;
  defectIndex: number;
  order: number;
  cdNm: number;
  dsaLerNm: number;
  lcduNm: number;
  ppeNm: number;
  ccdNm: number;
  nJumpOutliers: number;
  blendFrac: number;
  chiN: number;
  T: number;
  strength: number;
  lsNm: number;
  guideCdNm: number;
  holeNm: number;
  tau: number;
  config: SimConfig;
  evaluatedConfig: SimConfig;
  phase: InversePhase;
  scftResidual: number;
  scftIncomp: number;
  scftF: number;
  scftReg: number;
  scftLoss: number;
  scftConverged: boolean;
  scftStatus: "converged" | "unconverged" | "failed";
  predictedMean?: number;
  predictedSigma?: number;
  expectedImprovement?: number;
  measurements: InverseMeasurements;
  error?: string;
  grid: { nx: number; ny: number; ns: number; cellNm: number; cellLyNm: number; iters: number };
};
export type InverseProgress = {
  completed: number;
  total: number;
  phase: InversePhase;
  bestLoss: number;
  latest: InverseTrial;
  history: InverseHistory[];
};
export type InverseOptions = {
  trials?: number;
  initialTrials?: number;
  seed?: number;
  steps?: number;
  scft?: { nx?: number; Ns?: number; maxIter?: number };
  onProgress?: (progress: InverseProgress) => void;
};
export type InverseReport = {
  target: InverseTarget;
  trials: InverseTrial[];
  best: InverseTrial;
  nEval: number;
  method: "gp-ei-scft2d";
  history: InverseHistory[];
  seed: number;
  settings: {
    trials: number;
    initialTrials: number;
    scft: { nx: number; Ns: number; maxIter: number };
    model: "single-diblock";
    multiplication: number;
  };
  source: string;
};

export function defaultInverseTarget(cfg: SimConfig): InverseTarget {
  const mode =
    cfg.guide.kind === "via-pair"
      ? "via-pair"
      : cfg.guide.kind === "contact-holes"
        ? "holes"
        : "lamellar";
  return {
    mode,
    pitchNm: cfg.guide.LsNm || cfg.L0Nm,
    cdNm: mode === "lamellar" ? cfg.L0Nm * cfg.f : cfg.guide.holeNm || cfg.L0Nm * 0.55,
    maxLerNm: 1.4,
    maxLcduNm: 1.8,
  };
}

export function runInverse(
  base: SimConfig,
  target: InverseTarget,
  opts: InverseOptions = {},
): InverseReport {
  validateTarget(target);
  validateBase(base);
  const budget = integer(opts.trials ?? 16, 1, 64, "trials");
  const initialTrials = Math.min(budget, integer(opts.initialTrials ?? 5, 1, 32, "initialTrials"));
  const nx = integer(opts.scft?.nx ?? 32, 16, 128, "nx");
  if ((nx & (nx - 1)) !== 0) throw new Error("SCFT grid must be a power of two.");
  const scft = {
    nx,
    Ns: integer(opts.scft?.Ns ?? 32, 8, 128, "Ns"),
    maxIter: integer(opts.scft?.maxIter ?? 64, 1, 400, "maxIter"),
  };
  const seed = opts.seed ?? 17;
  if (!Number.isFinite(seed)) throw new Error("Search seed must be finite.");
  const rng = mulberry32(seed);
  const multiplication =
    target.mode === "lamellar" ? Math.max(1, Math.round(base.guide.LsNm / base.L0Nm)) : 1;
  const settings: InverseReport["settings"] = {
    trials: budget,
    initialTrials,
    scft,
    model: "single-diblock",
    multiplication,
  };
  const dims = dimensions(base, target);
  const initial = latinHypercube(initialTrials, dims.length, rng);
  const points: number[][] = [],
    values: number[] = [],
    trials: InverseTrial[] = [],
    history: InverseHistory[] = [];
  for (let i = 0; i < budget; i++) {
    const phase: InversePhase = i < initialTrials ? "initial" : "bayesian";
    const proposal = phase === "bayesian" ? proposeExpectedImprovement(points, values, rng) : null;
    const point = proposal?.point ?? initial[i];
    const config = decode(base, target, dims, point);
    const trial = evaluate(config, target, scft, multiplication, i, phase);
    if (proposal)
      Object.assign(trial, {
        predictedMean: proposal.mean,
        predictedSigma: proposal.sigma,
        expectedImprovement: proposal.expectedImprovement,
      });
    points.push(point);
    values.push(trial.loss);
    trials.push(trial);
    const bestLoss = Math.min(...values);
    history.push({ iteration: i + 1, bestLoss, loss: trial.loss, phase });
    opts.onProgress?.({
      completed: i + 1,
      total: budget,
      phase,
      bestLoss,
      latest: trial,
      history: history.map((h) => ({ ...h })),
    });
  }
  if (trials.every((t) => t.scftStatus === "failed"))
    throw new Error(
      "Every SCFT evaluation failed. Reduce guide strength or choose a supported recipe.",
    );
  trials.sort((a, b) => a.loss - b.loss || a.id - b.id);
  const best = trials.find((t) => t.scftStatus !== "failed")!;
  return {
    target: { ...target },
    trials,
    best,
    nEval: trials.length,
    method: "gp-ei-scft2d",
    history,
    seed,
    settings,
    source:
      "Project-defined dimensionless SCFT field loss; sequential Gaussian process + expected improvement. Inspired by Zhou et al. (https://arxiv.org/abs/2510.02715), not their blend-model reproduction. Single diblock; no blend thermodynamics or thermal kinetics. Phi_A=0.5 interfaces; physical rectangular-cell distances; equilibrium field LER/LCDU, not a stochastic process prediction. Existing SCFT rescales cells and approximates guide walls as finite fields.",
  };
}

type Dim = { key: string; lo: number; hi: number };
function dimensions(base: SimConfig, target: InverseTarget): Dim[] {
  const dims: Dim[] = [
    { key: "LsNm", lo: target.pitchNm * 0.9, hi: target.pitchNm * 1.1 },
    {
      key: target.mode === "lamellar" ? "cdNm" : "holeNm",
      lo: target.cdNm * 0.65,
      hi: target.cdNm * 1.35,
    },
    { key: "strength", lo: 0.4, hi: 1.8 },
    { key: "chiN", lo: 14, hi: 30 },
  ];
  if (target.mode === "via-pair")
    dims.push(
      { key: "tau", lo: 0.35, hi: 0.55 },
      {
        key: "pairNm",
        lo: Math.max(base.L0Nm * 0.8, target.cdNm * 1.05),
        hi: Math.max(base.L0Nm * 0.9, target.pitchNm * 0.7, target.cdNm * 1.15),
      },
    );
  return dims;
}

function decode(base: SimConfig, target: InverseTarget, dims: Dim[], point: number[]): SimConfig {
  const v = Object.fromEntries(
    dims.map((d, i) => [d.key, d.lo + clamp(point[i], 0, 1) * (d.hi - d.lo)]),
  );
  const guide = {
    ...base.guide,
    kind:
      target.mode === "lamellar"
        ? ("chemo-lamellar" as const)
        : target.mode === "holes"
          ? ("contact-holes" as const)
          : ("via-pair" as const),
    LsNm: v.LsNm,
    strength: v.strength,
    cdNm: v.cdNm ?? base.guide.cdNm,
    holeNm: v.holeNm ?? base.guide.holeNm,
    tau: v.tau ?? base.guide.tau,
    pairNm: v.pairNm ?? base.guide.pairNm,
  };
  guide.duty = guide.cdNm / guide.LsNm;
  return { ...base, chiN: v.chiN, blendFrac: 0, guide };
}

function evaluate(
  config: SimConfig,
  target: InverseTarget,
  options: InverseReport["settings"]["scft"],
  multiplication: number,
  id: number,
  phase: InversePhase,
): InverseTrial {
  let r: ScftReport;
  try {
    r = runScft(config, { ...options, skipSweep: true });
    if (
      ![r.F, r.fieldResidual, r.incomp, r.registration, r.cellNm, r.cellLyNm].every(
        Number.isFinite,
      ) ||
      !r.phi.every(Number.isFinite)
    )
      throw new Error("Non-finite SCFT result.");
  } catch (e) {
    const measurements: InverseMeasurements = {
      cdNm: 0,
      pitchNm: 0,
      lerNm: 0,
      lcduNm: 0,
      ppeNm: 0,
      circularityLoss: 1,
      missing: 1,
      nDomains: 0,
      resolved: false,
      order: 0,
      dxNm: config.dxNm,
      dyNm: config.dxNm,
    };
    return {
      ...trialRecipe(config, id, phase),
      loss: 1e6,
      lossPos: 1e6,
      lossCir: 1,
      lossRd: 1,
      defectIndex: 1,
      order: 0,
      cdNm: 0,
      dsaLerNm: 0,
      lcduNm: 0,
      ppeNm: 0,
      ccdNm: 0,
      nJumpOutliers: 0,
      scftResidual: 1e6,
      scftIncomp: 1e6,
      scftF: 1e6,
      scftReg: 0,
      scftLoss: 1e6,
      scftConverged: false,
      scftStatus: "failed",
      measurements,
      error: e instanceof Error ? e.message : String(e),
      grid: { nx: options.nx, ny: options.nx, ns: options.Ns, cellNm: 0, cellLyNm: 0, iters: 0 },
    };
  }
  const m = measureInverseField(r, config, target.mode, target.pitchNm, multiplication);
  const loss = inverseObjective(m, r, config, target, multiplication);
  return {
    ...trialRecipe(config, id, phase),
    loss: loss.total,
    lossPos: loss.pos,
    lossCir: loss.cir,
    lossRd: loss.rd,
    defectIndex: m.missing,
    order: m.order,
    cdNm: m.cdNm,
    dsaLerNm: m.lerNm,
    lcduNm: m.lcduNm,
    ppeNm: m.ppeNm,
    ccdNm: target.mode === "lamellar" ? 0 : m.pitchNm,
    nJumpOutliers: 0,
    scftResidual: r.fieldResidual,
    scftIncomp: r.incomp,
    scftF: r.F,
    scftReg: r.registration,
    scftLoss: loss.total,
    scftConverged: r.converged,
    scftStatus: r.converged ? "converged" : "unconverged",
    measurements: m,
    grid: {
      nx: r.nx,
      ny: r.ny,
      ns: r.ns,
      cellNm: r.cellNm,
      cellLyNm: r.cellLyNm,
      iters: Math.min(r.iters, options.maxIter),
    },
  };
}

/** Same dimensionless objective for all evaluations. Numerical residuals are
 * qualification penalties, not manufacturing defect metrics.
 */
export function inverseObjective(
  m: InverseMeasurements,
  r: Pick<ScftReport, "registration" | "fieldResidual" | "incomp">,
  config: SimConfig,
  target: InverseTarget,
  multiplication: number,
) {
  const relative = (a: number, b: number) => ((a - b) / Math.max(b, 0.1)) ** 2;
  const targetPeriod =
    target.mode === "lamellar"
      ? target.pitchNm / multiplication
      : target.mode === "via-pair"
        ? config.guide.pairNm
        : target.pitchNm;
  const pos =
    relative(m.cdNm, target.cdNm) +
    0.5 * relative(m.pitchNm, targetPeriod) +
    relative(config.guide.LsNm, target.pitchNm) +
    (m.ppeNm / target.pitchNm) ** 2;
  const rough =
    target.mode === "lamellar"
      ? (m.lerNm / target.maxLerNm) ** 2
      : (m.lcduNm / target.maxLcduNm) ** 2;
  const cir = m.circularityLoss + rough;
  const rd = m.missing + (m.resolved ? 0 : 3) + 0.5 * (1 - clamp(r.registration, 0, 1));
  const numerical =
    0.15 * Math.log1p(Math.max(0, r.fieldResidual) / 0.005) +
    0.15 * Math.log1p(Math.max(0, r.incomp) / 0.008);
  return { pos, cir, rd, total: 0.45 * pos + 0.2 * cir + 0.35 * rd + numerical };
}

function trialRecipe(config: SimConfig, id: number, phase: InversePhase) {
  return {
    id,
    phase,
    config: { ...config, guide: { ...config.guide } },
    evaluatedConfig: { ...config, guide: { ...config.guide } },
    blendFrac: 0,
    chiN: config.chiN,
    T: config.T,
    strength: config.guide.strength,
    lsNm: config.guide.LsNm,
    guideCdNm: config.guide.cdNm,
    holeNm: config.guide.holeNm,
    tau: config.guide.tau,
  };
}
function validateTarget(target: InverseTarget) {
  if (!["lamellar", "holes", "via-pair"].includes(target.mode))
    throw new Error("Unknown inverse design mode.");
  for (const key of ["pitchNm", "cdNm", "maxLerNm", "maxLcduNm"] as const)
    if (!Number.isFinite(target[key]) || target[key] <= 0)
      throw new Error(`${key} must be positive and finite.`);
}
function validateBase(base: SimConfig) {
  for (const [key, value] of Object.entries(base))
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error(`Recipe ${key} must be finite.`);
  for (const [key, value] of Object.entries(base.guide))
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error(`Guide ${key} must be finite.`);
  if (base.L0Nm <= 0 || base.dxNm <= 0 || base.guide.LsNm <= 0 || base.nx < 1 || base.ny < 1)
    throw new Error("Recipe dimensions and guide pitch must be positive.");
  if (base.f < 0.3 || base.f > 0.7)
    throw new Error("This SCFT search supports A-block fractions from 0.30 to 0.70.");
}
function integer(v: number, lo: number, hi: number, label: string) {
  if (!Number.isInteger(v) || v < lo || v > hi)
    throw new Error(`${label} must be an integer from ${lo} to ${hi}.`);
  return v;
}
function latinHypercube(n: number, dimensions: number, rng: () => number) {
  const columns = Array.from({ length: dimensions }, () => {
    const values = Array.from({ length: n }, (_, i) => (i + rng()) / n);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  });
  return Array.from({ length: n }, (_, i) => columns.map((c) => c[i]));
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
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
