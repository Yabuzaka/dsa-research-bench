import type { SimConfig } from "./types.ts";
import type { ScftReport } from "./scft.ts";

const METHODS =
  "Incompressible diblock SCFT (Matsen/Fredrickson). Length unit Rg, MDE ∂s q = ∇²q − w q, split-step Fourier. F/nkT = −ln Q + ⟨χN φA φB − w·φ⟩. Residual is the exchange-field error ‖w− − (χN/2)(φB−φA) + h‖. Bulk D* minimizes F(D) vs Matsen 1996 Fig. 3. 2D cells are commensurate (n L0 or n Ls). Anderson mixes w−; pressure is Picard. Not PSCF, not 3D chain-resolved SCFT.";

export type ScftSi = {
  app: "DSA Research Bench";
  local: true;
  methods: string;
  chiN: number;
  f: number;
  L0Nm: number;
  grid: {
    nx: number;
    ny: number;
    Ns: number;
    method: string;
    nPeriods: number;
    cellNm: number;
    cellLyNm: number;
    morphology: string;
  };
  bulk1d: {
    F: number;
    Fhom: number;
    residual: number;
    incomp: number;
    D_Rg: number;
    Matsen_D_Rg: number;
    DrelPct: number;
    wRg: number;
    sslRg: number;
    Q: number;
    saddle: boolean;
  };
  scft2d: {
    F: number;
    Fhom: number;
    residual: number;
    incomp: number;
    registration: number;
    FminusF1d: number;
    wRg: number;
    sslRg: number;
    capillaryLerNm: number;
    saddle: boolean;
  };
  fdCurve: { D: number; F: number; residual: number }[];
  mixHistory: { iter: number; residual: number; incomp: number }[];
};

export function scftSiPayload(scft: ScftReport, cfg: SimConfig): ScftSi {
  const Drel =
    Math.abs(scft.bulk.periodRg - scft.bulk.matsenD) / Math.max(scft.bulk.matsenD, 1e-6);
  return {
    app: "DSA Research Bench",
    local: true,
    methods: METHODS,
    chiN: cfg.chiN,
    f: cfg.f,
    L0Nm: cfg.L0Nm,
    grid: {
      nx: scft.nx,
      ny: scft.ny,
      Ns: scft.ns,
      method: scft.method,
      nPeriods: scft.nPeriods,
      cellNm: scft.cellNm,
      cellLyNm: scft.cellLyNm,
      morphology: scft.morphology,
    },
    bulk1d: {
      F: scft.bulk.F,
      Fhom: scft.bulk.Fhom,
      residual: scft.bulk.fieldResidual,
      incomp: scft.bulk.incomp,
      D_Rg: scft.bulk.periodRg,
      Matsen_D_Rg: scft.bulk.matsenD,
      DrelPct: Drel * 100,
      wRg: scft.bulk.wRg,
      sslRg: scft.widthSslRg,
      Q: scft.bulk.Q,
      saddle: scft.bulk.fieldResidual < 5e-4 && scft.bulk.incomp < 5e-4,
    },
    scft2d: {
      F: scft.F,
      Fhom: scft.Fhom,
      residual: scft.fieldResidual,
      incomp: scft.incomp,
      registration: scft.registration,
      FminusF1d: scft.F - scft.bulk.F,
      wRg: scft.wRg,
      sslRg: scft.widthSslRg,
      capillaryLerNm: scft.lerCapillaryNm,
      saddle: scft.fieldResidual < 5e-3 && scft.incomp < 8e-3,
    },
    fdCurve: scft.bulk.fdCurve.filter((p) => Number.isFinite(p.F)),
    mixHistory: scft.history.filter((p) => Number.isFinite(p.residual)),
  };
}

export function scftSiCsv(si: ScftSi) {
  const rows = [
    "key,value",
    `chiN,${si.chiN}`,
    `f,${si.f}`,
    `L0_nm,${si.L0Nm}`,
    `nx,${si.grid.nx}`,
    `Ns,${si.grid.Ns}`,
    `method,${si.grid.method}`,
    `morphology,${si.grid.morphology}`,
    `F1d,${si.bulk1d.F}`,
    `F1d_hom,${si.bulk1d.Fhom}`,
    `residual_1d,${si.bulk1d.residual}`,
    `D_Rg,${si.bulk1d.D_Rg}`,
    `Matsen_D_Rg,${si.bulk1d.Matsen_D_Rg}`,
    `Drel_pct,${si.bulk1d.DrelPct}`,
    `saddle_1d,${si.bulk1d.saddle}`,
    `F2d,${si.scft2d.F}`,
    `residual_2d,${si.scft2d.residual}`,
    `F2d_minus_F1d,${si.scft2d.FminusF1d}`,
    `registration,${si.scft2d.registration}`,
    `w_Rg,${si.scft2d.wRg}`,
    `w_SSL_Rg,${si.scft2d.sslRg}`,
    `saddle_2d,${si.scft2d.saddle}`,
    "",
    "D_Rg,F,residual",
    ...si.fdCurve.map((p) => `${p.D},${p.F},${p.residual}`),
  ];
  return rows.join("\n");
}
