import { OkSolver } from "./ok-solver.ts";
import { applyDoseToConfig } from "./euv-dose.ts";
import { runSepa } from "./sepa.ts";
import type { SimConfig } from "./types.ts";

export type WindowKind = "ls" | "cd" | "kinetic" | "repair" | "dose" | "contrast" | "tls";

export type WindowCell = {
  x: number;
  chiN: number;
  defectIndex: number;
  order: number;
  pitchNm: number;
  dislocations: number;
  rectification: number;
  repairability: number;
  doseSaving: number;
  lcduNm: number;
};

export function sampleProcessWindow(
  base: SimConfig,
  kind: WindowKind = "cd",
  opts?: { steps?: number },
): WindowCell[] {
  const steps = opts?.steps ?? 90;
  if (kind === "kinetic") return kineticWindow(base, steps);
  if (kind === "ls") return lsWindow(base, steps);
  if (kind === "repair") return repairWindow(base);
  if (kind === "dose") return doseWindow(base, steps);
  if (kind === "contrast") return contrastWindow(base, steps);
  if (kind === "tls") return tlsWindow(base, steps);
  return cdWindow(base, steps);
}

function lsWindow(base: SimConfig, steps: number): WindowCell[] {
  const xs = [1.6, 1.8, 2.0, 2.2, 2.5, 3.0, 3.5, 4.0];
  const chis = [12, 16, 20, 26, 34, 44];
  const cells: WindowCell[] = [];
  for (const chiN of chis) {
    for (const r of xs) {
      cells.push(
        runCell(
          {
            ...base,
            chiN,
            guide: {
              ...base.guide,
              kind: "chemo-lamellar",
              LsNm: r * base.L0Nm,
              duty: 0.5 / r,
              cdNm: 0.5 * base.L0Nm,
            },
          },
          r,
          chiN,
          steps,
        ),
      );
    }
  }
  return cells;
}

/** Maekawa 2025: defect-free island vs guide CD / L0 at fixed 3× Ls. */
function cdWindow(base: SimConfig, steps: number): WindowCell[] {
  const xs = [0.4, 0.55, 0.7, 0.85, 1.0, 1.15, 1.3];
  const chis = [14, 18, 24, 32, 42, 52];
  const cells: WindowCell[] = [];
  const Ls = 3 * base.L0Nm;
  for (const chiN of chis) {
    for (const r of xs) {
      const cd = r * base.L0Nm;
      cells.push(
        runCell(
          {
            ...base,
            chiN,
            guide: {
              ...base.guide,
              kind: "chemo-lamellar",
              LsNm: Ls,
              cdNm: cd,
              duty: cd / Ls,
            },
          },
          r,
          chiN,
          steps,
        ),
      );
    }
  }
  return cells;
}

function kineticWindow(base: SimConfig, steps: number): WindowCell[] {
  const Ts = [450, 490, 523, 560, 583, 610];
  const chis = [14, 18, 24, 32, 42, 52];
  const cells: WindowCell[] = [];
  for (const chiN of chis) {
    for (const T of Ts) {
      cells.push(
        runCell(
          {
            ...base,
            chiN,
            T,
            guide: {
              ...base.guide,
              kind: "chemo-lamellar",
              LsNm: 2 * base.L0Nm,
              cdNm: 0.5 * base.L0Nm,
              duty: 0.25,
            },
          },
          T,
          chiN,
          steps,
        ),
      );
    }
  }
  return cells;
}

/** Overlay / stitch repairability vs χN. ACS 2026 SEPA. */
function repairWindow(base: SimConfig): WindowCell[] {
  const overlays = [0, 1.5, 3, 5, 7];
  const chis = [18, 26, 34, 48];
  const cells: WindowCell[] = [];
  for (const chiN of chis) {
    for (const ov of overlays) {
      const report = runSepa(
        {
          ...base,
          chiN,
          nx: 64,
          ny: 64,
          templateDefect: ov === 0 ? "none" : "overlay",
          guide: {
            ...base.guide,
            kind: "chemo-lamellar",
            LsNm: 2 * base.L0Nm,
            cdNm: 0.5 * base.L0Nm,
            overlayNm: ov,
          },
        },
        { layers: 4, steps: 40 },
      );
      const last = report.layers[report.layers.length - 1];
      cells.push({
        x: ov,
        chiN,
        defectIndex: last.defectIndex,
        order: last.order,
        pitchNm: base.L0Nm,
        dislocations: last.dislocations,
        rectification: last.rectification,
        repairability: report.repairability,
        doseSaving: 0,
        lcduNm: 0,
      });
    }
  }
  return cells;
}

/** EUV dose × χN: rectification and dose-saving at 1:1 pitch. SPIE 2026 24 nm flow. */
function doseWindow(base: SimConfig, steps: number): WindowCell[] {
  const doses = [12, 20, 30, 45, 60];
  const chis = [18, 26, 36, 48];
  const cells: WindowCell[] = [];
  const pitch = base.guide.LsNm || base.L0Nm;
  for (const chiN of chis) {
    for (const dose of doses) {
      const stoch = applyDoseToConfig(dose, pitch);
      cells.push(
        runCell(
          {
            ...base,
            chiN,
            ...stoch,
            guide: {
              ...base.guide,
              kind: "chemo-lamellar",
              LsNm: pitch,
              cdNm: 0.5 * pitch,
              duty: 0.5,
            },
          },
          dose,
          chiN,
          steps,
        ),
      );
    }
  }
  return cells;
}

/**
 * MRS Commun. 2025: raising chemical contrast (h0) of the PS-guide
 * stripe opens the commensurability window from ~0% to ±10% in Ls/L0.
 */
function contrastWindow(base: SimConfig, steps: number): WindowCell[] {
  const xs = [1.7, 1.85, 2.0, 2.15, 2.3, 2.5];
  const hs = [0.25, 0.55, 0.9, 1.2, 1.6, 2.1];
  const cells: WindowCell[] = [];
  for (const h0 of hs) {
    for (const r of xs) {
      cells.push(
        runCell(
          {
            ...base,
            chiN: base.chiN,
            guide: {
              ...base.guide,
              kind: "chemo-lamellar",
              LsNm: r * base.L0Nm,
              cdNm: 0.5 * base.L0Nm,
              duty: 0.5 / r,
              strength: h0,
            },
          },
          r,
          h0,
          steps,
        ),
      );
    }
  }
  return cells;
}

/**
 * Maekawa 2025 Fig. 5 analogue: 5× DSA window vs T and Ls/L0.
 * Higher T expands the island and shifts it toward lower Ls because
 * L0 contracts and correlation length grows.
 */
function tlsWindow(base: SimConfig, steps: number): WindowCell[] {
  const xs = [1.8, 2.2, 2.6, 3.0, 3.5, 4.0];
  const Ts = [450, 490, 523, 560, 583];
  const cells: WindowCell[] = [];
  for (const T of Ts) {
    for (const r of xs) {
      cells.push(
        runCell(
          {
            ...base,
            T,
            guide: {
              ...base.guide,
              kind: "chemo-lamellar",
              LsNm: r * base.L0Nm,
              cdNm: 0.5 * base.L0Nm,
              duty: 0.5 / r,
            },
          },
          r,
          T,
          steps,
        ),
      );
    }
  }
  return cells;
}

function runCell(cfg: SimConfig, x: number, chiN: number, steps: number): WindowCell {
  const s = new OkSolver({
    ...cfg,
    nx: 64,
    ny: 64,
    noise: 0.016,
    dt: 0.16,
    seed: 3,
  });
  s.step(steps);
  const m = s.metrics();
  return {
    x,
    chiN,
    defectIndex: m.defectIndex,
    order: m.order,
    pitchNm: m.peakPitchNm,
    dislocations: m.dislocations,
    rectification: m.rectification,
    repairability: m.repairability,
    doseSaving: m.doseSaving,
    lcduNm: m.lcduNm,
  };
}
