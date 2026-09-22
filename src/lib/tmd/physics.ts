import { tmdById, type TmdMaterial } from "./materials.ts";

const Q = 1.602176634e-19;
const KB = 1.380649e-23;
const EPS0 = 8.854187817e-12;
const EPS_SIO2 = 3.9;
const HBAR = 1.054571817e-34;
const M0 = 9.1093837e-31;
const IRDS_ION_UA_UM = 900;
const IRDS_SS_MV = 70;
const IRDS_RC_OHM_UM = 100;
const SI_BODY_NM = 3;
const SI_EPS = 11.7;

export type GateKind = 1 | 2 | 4;
export type ContactKind = "top" | "edge" | "hybrid";

export type BenchInput = {
  materialId: string;
  layers: number;
  lgNm: number;
  eotNm: number;
  gates: GateKind;
  rcOhmUm: number;
  muCm2Vs: number;
  vdd: number;
  vov: number;
  dit: number;
  tK: number;
  /** Phys. Rev. Applied 2026: edge vs top vs hybrid injection. */
  contactKind: ContactKind;
  /** Contact length along the channel, nm. TSMC 2025: current holds to ~30 nm. */
  lcNm: number;
};

export const DEFAULT_BENCH: BenchInput = {
  materialId: "mos2",
  layers: 1,
  lgNm: 30,
  eotNm: 0.9,
  gates: 2,
  rcOhmUm: 270,
  muCm2Vs: 40,
  vdd: 0.7,
  vov: 0.5,
  dit: 2e12,
  tK: 300,
  contactKind: "hybrid",
  lcNm: 30,
};

export type IdVgPoint = { vg: number; idUa: number };

export type BenchResult = {
  mat: TmdMaterial;
  tChNm: number;
  lambdaNm: number;
  siLambdaNm: number;
  lgOverLambda: number;
  ssMVdec: number;
  diblMVv: number;
  coxUFCm2: number;
  cqUFCm2: number;
  vt: number;
  ionUAUm: number;
  ioffNAUm: number;
  ionIoff: number;
  rchOhmUm: number;
  contactShare: number;
  irdsIonFrac: number;
  irdsSsOk: boolean;
  irdsRcOk: boolean;
  rcEffOhmUm: number;
  sourceLimited: boolean;
  ionSrcUAUm: number;
  idvg: IdVgPoint[];
};

export function thermalVoltage(tK: number) {
  return (KB * tK) / Q;
}

export function coxFm2(eotNm: number) {
  return (EPS_SIO2 * EPS0) / (eotNm * 1e-9);
}

export function lambdaNm(tChNm: number, eotNm: number, epsZ: number, gates: GateKind) {
  return Math.sqrt((epsZ / (gates * EPS_SIO2)) * tChNm * eotNm);
}

export function quantumCapUFCm2(mStar: number) {
  const cq = (Q * Q * 2 * 2 * mStar * M0) / (2 * Math.PI * HBAR * HBAR);
  return cq * 1e-4 * 1e6;
}

/**
 * Compact Rc multiplier from Deylgat et al., Phys. Rev. Applied 25, 044057 (2026).
 * Hybrid wins below 10 nm contact length; edge is poorest (higher SBH, no image-force
 * lowering from an open vertical lead). TSMC 2025: current independent to ~30 nm for
 * Sb/MoS2 once the tunnel gap is ~1.5 Å.
 */
export function contactRcFactor(kind: ContactKind, lcNm: number) {
  const lc = Math.max(lcNm, 4);
  if (kind === "edge") return 2.35 * (1 + 10 / lc);
  if (kind === "hybrid") return 0.72 * (1 + 3 / Math.max(lc, 8));
  return 1 * (1 + 5 / Math.max(lc, 12));
}

/** Source-injection ceiling, arXiv:2608.06793. Binds I_on once L_g ≲ 10 nm. */
export function sourceLimitedIonUAUm(vSatCms: number, lgNm: number) {
  const n2d = 1.2e13;
  const v = vSatCms * Math.min(1, Math.max(lgNm, 5) / 12);
  const iAmp = Q * n2d * v * 1e-4;
  return iAmp * 1e6;
}

export function evaluateBench(input: BenchInput): BenchResult {
  const mat = tmdById(input.materialId);
  const tChNm = mat.tMonoNm * input.layers;
  const lam = lambdaNm(tChNm, input.eotNm, mat.epsZ, input.gates);
  const siLam = lambdaNm(SI_BODY_NM, input.eotNm, SI_EPS, input.gates);
  const cox = coxFm2(input.eotNm);
  const coxUF = cox * 1e-4 * 1e6;
  const cqUF = quantumCapUFCm2(mat.mStar);
  const vtTherm = thermalVoltage(input.tK);
  const ss60 = vtTherm * Math.log(10) * 1000;
  const coxCm2 = cox * 1e-4;
  const cit = Q * input.dit;
  const nIdeality = 1 + cit / coxCm2 + 0.55 * (lam / input.lgNm) ** 2;
  const ss = ss60 * nIdeality;
  const dibl = 120 * (lam / input.lgNm) ** 2 * Math.max(0.2, input.vdd);
  const vt = 0.2 + 0.07 * input.eotNm + 0.015 * (input.layers - 1);
  const mu = input.muCm2Vs * 1e-4;
  const w = 1e-6;
  const l = input.lgNm * 1e-9;
  const prefactor = 2 * nIdeality * cox * mu * (w / l) * vtTherm * vtTherm;
  const vgsOn = vt + input.vov;
  const ionCh = ekvCurrent(prefactor, nIdeality, vtTherm, vgsOn, vt);
  const rch = input.vdd / Math.max(ionCh, 1e-15);
  const rcEff = input.rcOhmUm * contactRcFactor(input.contactKind ?? "hybrid", input.lcNm ?? 30);
  const rtot = rch + 2 * rcEff * 1e-6;
  const ionRc = input.vdd / rtot;
  const ionSrc = sourceLimitedIonUAUm(mat.vSatCms, input.lgNm) * 1e-6;
  const sourceLimited = ionSrc < ionRc;
  const ion = Math.min(ionRc, ionSrc);
  const ionUA = ion * 1e6;
  const ioffA = ekvCurrent(prefactor, nIdeality, vtTherm, 0, vt);
  const rchOff = input.vdd / Math.max(ioffA, 1e-22);
  const ioff = input.vdd / (rchOff + 2 * rcEff * 1e-6);
  const idvg: IdVgPoint[] = [];
  for (let i = 0; i <= 40; i++) {
    const vg = -0.15 + (input.vdd + 0.25 + 0.15) * (i / 40);
    const ich = ekvCurrent(prefactor, nIdeality, vtTherm, vg, vt);
    const r = input.vdd / Math.max(ich, 1e-22);
    const iamp = Math.min(input.vdd / (r + 2 * rcEff * 1e-6), ionSrc);
    idvg.push({ vg, idUa: Math.max(iamp * 1e6, 1e-6) });
  }
  return {
    mat,
    tChNm,
    lambdaNm: lam,
    siLambdaNm: siLam,
    lgOverLambda: input.lgNm / lam,
    ssMVdec: ss,
    diblMVv: dibl,
    coxUFCm2: coxUF,
    cqUFCm2: cqUF,
    vt,
    ionUAUm: ionUA,
    ioffNAUm: ioff * 1e9,
    ionIoff: ion / Math.max(ioff, 1e-22),
    rchOhmUm: rch / 1e-6,
    contactShare: (2 * rcEff * 1e-6) / rtot,
    irdsIonFrac: ionUA / IRDS_ION_UA_UM,
    irdsSsOk: ss <= IRDS_SS_MV,
    irdsRcOk: rcEff <= IRDS_RC_OHM_UM,
    rcEffOhmUm: rcEff,
    sourceLimited,
    ionSrcUAUm: ionSrc * 1e6,
    idvg,
  };
}

function ekvCurrent(prefactor: number, n: number, vtTherm: number, vgs: number, vt: number) {
  const x = (vgs - vt) / (2 * n * vtTherm);
  const lim = x > 40 ? x : x < -40 ? 0 : Math.log1p(Math.exp(x));
  return prefactor * lim * lim;
}

export function lambdaSweep(epsZ: number, eotNm: number, gates: GateKind, tMin: number, tMax: number, n = 24) {
  const pts: { t: number; lam: number; si: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = tMin + ((tMax - tMin) * i) / (n - 1);
    pts.push({
      t,
      lam: lambdaNm(t, eotNm, epsZ, gates),
      si: lambdaNm(t, eotNm, SI_EPS, gates),
    });
  }
  return pts;
}

export const IRDS = {
  ionUAUm: IRDS_ION_UA_UM,
  ssMVdec: IRDS_SS_MV,
  rcOhmUm: IRDS_RC_OHM_UM,
};

export function judgeDevice(input: BenchInput, r: BenchResult) {
  if (r.sourceLimited) {
    return {
      level: "fail" as const,
      title: "Source-limited",
      reason: `At L_g = ${input.lgNm} nm the injection ceiling is ${r.ionSrcUAUm.toFixed(0)} µA/µm (arXiv:2608.06793).`,
      next: "Raising μ no longer helps. Cut Rc via hybrid contacts or a topological semimetal, or stay above ~12 nm.",
    };
  }
  if (r.contactShare > 0.45) {
    return {
      level: "warn" as const,
      title: "Contacts dominate I_on",
      reason: `Effective Rc ${r.rcEffOhmUm.toFixed(0)} Ω·µm (${input.contactKind}, L_c ${input.lcNm} nm) takes ${(r.contactShare * 100).toFixed(0)}% of Vdd.`,
      next: "Hybrid contacts beat edge below 10 nm L_c (Phys. Rev. Applied 2026). TSMC Sb/MoS₂ holds current to L_c ≈ 30 nm.",
    };
  }
  if (!r.irdsSsOk) {
    return {
      level: "warn" as const,
      title: "SS misses IRDS",
      reason: `${r.ssMVdec.toFixed(1)} mV/dec vs 70 mV/dec. Dit and L_g/λ set the n-factor.`,
      next: "Drop Dit, add a gate, or thicken EOT only if you can afford λ.",
    };
  }
  if (r.irdsIonFrac < 0.5) {
    return {
      level: "warn" as const,
      title: "I_on is half of HP",
      reason: `${r.ionUAUm.toFixed(0)} µA/µm vs IRDS 900 µA/µm.`,
      next: "μ, Rc, and L_g trade. Nanoribbon side-injection posted ~995 µA/µm champions (Nat. Commun. 2026).",
    };
  }
  return {
    level: "pass" as const,
    title: "Inside the screening box",
    reason: `I_on ${r.ionUAUm.toFixed(0)} µA/µm · SS ${r.ssMVdec.toFixed(1)} · Rc_eff ${r.rcEffOhmUm.toFixed(0)} Ω·µm.`,
    next: "Sweep L_c and contact kind. Hybrid is the sub-10 nm contact that still approaches the quantum limit.",
  };
}

