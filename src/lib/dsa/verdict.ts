import type { Metrics, SimConfig } from "./types.ts";

/** imec SPIE 2026 P24 L/S after-etch into TiN, 0.33-NA EUV spec. */
export const P24_SPEC = { lerNm: 1.32, lwrNm: 0.88 };

/** Maekawa Adv. Funct. Mater. 2025: dislocation-free island on PS guides. */
export const MAEKAWA_CD = { lo: 0.57, hi: 1.0 };

export type VerdictLevel = "pass" | "warn" | "fail";

export type RunVerdict = {
  level: VerdictLevel;
  title: string;
  reason: string;
  next: string;
};

export function cdOverL0(cfg: SimConfig) {
  const cd = cfg.guide.cdNm || cfg.guide.duty * cfg.guide.LsNm;
  return cd / Math.max(cfg.L0Nm, 1e-6);
}

export function lsOverL0(cfg: SimConfig, blendL0?: number) {
  return cfg.guide.LsNm / Math.max(blendL0 || cfg.L0Nm, 1e-6);
}

export function commensurabilityOff(ratio: number) {
  const nearest = Math.max(1, Math.round(ratio));
  return Math.abs(ratio - nearest);
}

export function judgeRun(cfg: SimConfig, m: Metrics | undefined): RunVerdict {
  if (!m) {
    return {
      level: "warn",
      title: "Waiting for the first frame",
      reason: "The spectral solver has not posted metrology yet.",
      next: "Leave Anneal on. A field appears within a second.",
    };
  }

  const ratio = lsOverL0(cfg, m.blendL0Nm);
  const off = commensurabilityOff(ratio);
  const cdR = cdOverL0(cfg);
  const p24 = Math.abs((m.peakPitchNm || cfg.L0Nm * 2) - 24) < 5;
  const ler = m.etchLerNm || m.dsaLerNm;
  const lwr = m.etchLwrNm || m.lwrNm;

  if (m.kineticTrap > 0.85) {
    return {
      level: "fail",
      title: "Kinetic trap",
      reason: `χN_eff ${m.chiNEff.toFixed(0)} at ${m.annealT.toFixed(0)} K is freezing dislocations (trap ${m.kineticTrap.toFixed(2)}).`,
      next: "Raise T toward 310 °C (583 K) or turn Microwave up. MRS Commun. 2025: high T annihilates dislocations; low T only sharpens w.",
    };
  }

  if (m.defectIndex > 0.9 || m.dislocations > 6) {
    return {
      level: "fail",
      title: "Dislocation-rich field",
      reason: `Defect index ${m.defectIndex.toFixed(2)}, ${m.dislocations} dislocations, bridges ${m.nBridges}.`,
      next:
        off > 0.12
          ? `Ls/L0 is ${ratio.toFixed(2)}× — snap the guide pitch to ${Math.round(ratio)} L0.`
          : "Raise chemical contrast h0, or open Repair for a SEPA stack on this template.",
    };
  }

  if (cfg.guide.kind !== "none" && off > 0.12) {
    return {
      level: "warn",
      title: "Off-commensurate guide",
      reason: `Ls/L0 = ${ratio.toFixed(2)}× (nearest integer ${Math.round(ratio)}).`,
      next: "Integer density multiplication is the process-window island. Nudge Ls or L0.",
    };
  }

  if (
    (cfg.guide.kind === "chemo-lamellar" || cfg.guide.kind === "fin-array") &&
    (cdR < MAEKAWA_CD.lo || cdR > MAEKAWA_CD.hi)
  ) {
    return {
      level: "warn",
      title: "Guide CD outside Maekawa island",
      reason: `CD/L0 = ${cdR.toFixed(2)}. 300 mm PS-b-PGFM stays dislocation-free at 0.57–1.0 L0.`,
      next: "Trim the wetting stripe toward ~0.7 L0, then re-anneal.",
    };
  }

  if (ler > P24_SPEC.lerNm) {
    return {
      level: p24 ? "fail" : "warn",
      title: p24 ? "Misses 0.33-NA P24 LER" : "After-etch LER is high",
      reason: `uLER ${ler.toFixed(2)} nm after etch (imec P24 spec 1.32 nm into TiN).`,
      next: "Raise χN or drop the second-step T. Interface width w ~ (χN)^−a sets the LER floor.",
    };
  }

  if (lwr > P24_SPEC.lwrNm && p24) {
    return {
      level: "warn",
      title: "P24 LWR above 0.88 nm",
      reason: `uLWR ${lwr.toFixed(2)} nm vs imec SPIE 2026 after-etch 0.88 nm.`,
      next: "Two-step anneal (high T heal, low T sharpen) then polar-block etch.",
    };
  }

  if (m.order < 0.25) {
    return {
      level: "warn",
      title: "Still coarsening",
      reason: `Order parameter ${m.order.toFixed(2)} — the structure factor has not locked.`,
      next: "Keep annealing, or raise M0 / microwave if the field is frozen.",
    };
  }

  const bits: string[] = [];
  if (m.rectification > 1.15) bits.push(`rectification ${m.rectification.toFixed(2)}×`);
  if (m.doseSaving > 0.1) bits.push(`dose saving ${(m.doseSaving * 100).toFixed(0)}%`);
  if (p24) bits.push(`P24 LER ${ler.toFixed(2)} nm`);

  return {
    level: "pass",
    title: "On-process",
    reason: bits.length ? bits.join(" · ") : `Order ${m.order.toFixed(2)}, defect ${m.defectIndex.toFixed(2)}.`,
    next: "Export JSON/CSV, or sweep the Window map around this point.",
  };
}
