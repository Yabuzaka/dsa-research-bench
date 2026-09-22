/**
 * Sequential Energy Pathway Analysis (SEPA)
 * ACS Appl. Polym. Mater. 2026, 8, 6866–6877.
 *
 * Template-induced fields decay through the film. Each layer is a 2D
 * Ohta–Kawasaki slice whose chemical pattern is screened by exp(−z/λ)
 * and whose morphology is inherited from the layer below. ΔF between
 * successive layers tells whether a template defect (missing line,
 * overlay, stitch) is thermodynamically repairable or kinetically trapped.
 */

import { OkSolver } from "./ok-solver.ts";
import type { SimConfig } from "./types.ts";

export type SepaLayer = {
  zOverL0: number;
  hDecay: number;
  energy: number;
  dF: number;
  order: number;
  dislocations: number;
  rectification: number;
  defectIndex: number;
  cdNm: number;
};

export type SepaReport = {
  layers: SepaLayer[];
  repaired: boolean;
  repairability: number;
  trappedAt: number | null;
  deltaFTotal: number;
  defect: SimConfig["templateDefect"];
};

export function runSepa(
  base: SimConfig,
  opts?: { layers?: number; steps?: number },
): SepaReport {
  const nZ = opts?.layers ?? 6;
  const steps = opts?.steps ?? 64;
  const tFilm = Math.max(base.tFilmOverL0, 0.8);
  const nx = 64;
  const screening = 1.15;
  const dxNm = (8 * base.L0Nm) / nx;

  let prevPhi: Float32Array | null = null;
  let prevE = 0;
  const layers: SepaLayer[] = [];

  for (let z = 0; z < nZ; z++) {
    const zMid = ((z + 0.5) / nZ) * tFilm;
    const decay = Math.exp(-zMid / screening);
    const cfg: SimConfig = {
      ...base,
      nx,
      ny: nx,
      dxNm,
      noise: z === 0 ? Math.max(base.noise, 0.018) : 0.006,
      dt: Math.max(base.dt, 0.14),
      seed: base.seed + z,
      guide: {
        ...base.guide,
        strength: base.guide.strength * decay,
      },
      tFilmOverL0: tFilm,
    };
    const s = new OkSolver(cfg);
    if (prevPhi && prevPhi.length === s.phi.length) s.phi.set(prevPhi);
    s.step(steps);
    const m = s.metrics();
    const dF = z === 0 ? 0 : m.energy - prevE;
    layers.push({
      zOverL0: zMid,
      hDecay: decay,
      energy: m.energy,
      dF,
      order: m.order,
      dislocations: m.dislocations,
      rectification: m.rectification,
      defectIndex: m.defectIndex,
      cdNm: m.cdNm,
    });
    prevE = m.energy;
    prevPhi = s.phi.slice();
  }

  const first = layers[0];
  const last = layers[layers.length - 1];
  const healDx =
    (first.dislocations - last.dislocations) / Math.max(first.dislocations, 1);
  const downhill =
    layers.filter((l, i) => i > 0 && l.dF < 0).length / Math.max(nZ - 1, 1);
  const repairability = clamp(
    0.5 * clamp(healDx, -0.3, 1) + 0.3 * downhill + 0.2 * last.order,
    0,
    1,
  );
  const repaired =
    base.templateDefect === "none"
      ? last.defectIndex < 0.55
      : last.dislocations <= Math.max(1, first.dislocations * 0.45) && last.order > 0.32;

  let trappedAt: number | null = null;
  for (let i = 1; i < layers.length; i++) {
    if (layers[i].dF > 0.02 && layers[i].dislocations >= layers[i - 1].dislocations) {
      trappedAt = layers[i].zOverL0;
      break;
    }
  }

  const deltaFTotal = last.energy - first.energy;
  return {
    layers,
    repaired,
    repairability,
    trappedAt,
    deltaFTotal,
    defect: base.templateDefect,
  };
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
