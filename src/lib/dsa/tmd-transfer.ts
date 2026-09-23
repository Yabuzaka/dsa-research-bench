/**
 * Pattern transfer of a block-copolymer mask into a TMD sheet.
 *
 * The polymer phase-separates. The TMD is etched through that mask
 * (Yun et al., Adv. Funct. Mater. 2018; Comm. Mater. 2021). Features
 * down to about 4 nm have been cut into monolayer MoS2. This is a
 * screening estimate of the remaining ribbon or hole, not a TMD SCFT
 * and not a foundry etch.
 */

import { tmdById } from "../tmd/materials.ts";
import type { GuideKind, MorphClass } from "./types.ts";

export type TransferKind = "ribbon" | "hole" | "dot" | "none";

export type TmdTransfer = {
  kind: TransferKind;
  formula: string;
  logicChannel: boolean;
  pitchNm: number;
  featureNm: number;
  edgeNm: number;
  residualNm: number;
  /** Residual wetting skin is thin enough for the etch to reach the sheet. */
  open: boolean;
  /** Feature is narrower than ~8 nm, so edges dominate the sheet. */
  edgeDominated: boolean;
  /** Inside the published BCP-on-MoS2 window, about 4–40 nm. */
  inDemonstratedRange: boolean;
  edgeEatsFeature: boolean;
  label: string;
  note: string;
};

const DEMO_MIN_NM = 4;
const DEMO_MAX_NM = 40;
const EDGE_DOMINATED_NM = 8;

export function transferOntoTmd(input: {
  morphology: MorphClass | "recipe";
  guideKind: GuideKind;
  pitchNm: number;
  cdNm: number;
  etchLerNm: number;
  residualNm: number;
  materialId: string;
}): TmdTransfer {
  const mat = tmdById(input.materialId);
  const logicChannel = mat.egMonoEv > 0.2 && mat.polytype === "2H";
  const pitchNm = finite(input.pitchNm, 28);
  const residualNm = Math.max(0, finite(input.residualNm, 0));
  const edgeNm = Math.max(0, finite(input.etchLerNm, 0));
  const kind = kindOf(input.morphology, input.guideKind);
  const featureNm =
    kind === "none" ? 0 : Math.max(0.5, finite(input.cdNm, pitchNm * (kind === "ribbon" ? 0.5 : 0.35)));
  const open = kind !== "none" && residualNm < 3;
  const inDemonstratedRange =
    open && logicChannel && featureNm >= DEMO_MIN_NM && featureNm <= DEMO_MAX_NM;
  const edgeDominated = open && featureNm < EDGE_DOMINATED_NM;
  const edgeEatsFeature = open && edgeNm > 0.3 * featureNm;

  let label = "no ordered mask";
  if (kind === "none") label = "no ordered mask — anneal until lines or holes form";
  else if (!open) label = "blocked — residual skin thicker than the sheet";
  else if (!logicChannel) label = "geometry only — this TMD is not a logic channel";
  else if (featureNm < DEMO_MIN_NM) label = "narrower than the ~4 nm MoS2 demos";
  else if (edgeEatsFeature) label = "screening — edge roughness eats the feature";
  else if (inDemonstratedRange) label = "screening — inside the published BCP-on-TMD window";
  else label = "screening — wider than the published nanoribbon demos";

  const shape = kind === "ribbon" ? "ribbon" : kind === "hole" ? "hole" : kind === "dot" ? "dot" : "feature";
  const note =
    kind === "none"
      ? "A disordered field is not a mask. The TMD is not what phase-separates."
      : `PS mask leaves a ${featureNm.toFixed(1)} nm ${shape} on ${mat.formula} at pitch ${pitchNm.toFixed(1)} nm. Etch LER ${edgeNm.toFixed(2)} nm is copied onto the sheet. Not a microscope and not a TMD solver.`;

  return {
    kind,
    formula: mat.formula,
    logicChannel,
    pitchNm,
    featureNm,
    edgeNm,
    residualNm,
    open,
    edgeDominated,
    inDemonstratedRange,
    edgeEatsFeature,
    label,
    note,
  };
}

function kindOf(morphology: MorphClass | "recipe", guide: GuideKind): TransferKind {
  if (morphology === "DIS" || morphology === "MIX") return "none";
  if (guide === "contact-holes" || guide === "via-pair") return "hole";
  if (morphology === "HEX") return "dot";
  if (morphology === "LAM" || morphology === "recipe" || guide === "chemo-lamellar" || guide === "grapho-trench" || guide === "fin-array") {
    return "ribbon";
  }
  return "none";
}

function finite(v: number, fallback: number) {
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
