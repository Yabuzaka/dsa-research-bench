export type GuideKind =
  | "chemo-lamellar"
  | "grapho-trench"
  | "contact-holes"
  | "via-pair"
  | "fin-array"
  | "none";

export type TemplateDefect =
  | "none"
  | "missing-stripe"
  | "broken-stripe"
  | "cd-outlier"
  | "overlay"
  | "stitch";

export type BlendPath = "quench" | "anneal";
export type MorphClass = "LAM" | "HEX" | "DIS" | "MIX";

export type GuideConfig = {
  kind: GuideKind;
  LsNm: number;
  duty: number;
  cdNm: number;
  wetting: number;
  strength: number;
  wallNm: number;
  holeNm: number;
  angle: number;
  overlayNm: number;
  tau: number;
  pairNm: number;
};

export type SimConfig = {
  nx: number;
  ny: number;
  dxNm: number;
  chiN: number;
  f: number;
  L0Nm: number;
  mobility: number;
  noise: number;
  dt: number;
  T: number;
  seed: number;
  guide: GuideConfig;
  euvLerNm: number;
  euvCdJitterNm: number;
  deltaGamma: number;
  tFilmOverL0: number;
  microwave: number;
  euvDose: number;
  blendFrac: number;
  blendPath: BlendPath;
  T2: number;
  tSwitch: number;
  templateDefect: TemplateDefect;
};

export type Metrics = {
  t: number;
  steps: number;
  energy: number;
  bulkEnergy: number;
  gradEnergy: number;
  longEnergy: number;
  meanPhi: number;
  order: number;
  peakK: number;
  peakPitchNm: number;
  cdNm: number;
  lwrNm: number;
  lerNm: number;
  defectIndex: number;
  hexatic: number;
  nDomains: number;
  commensurability: number;
  multiplication: number;
  chiNEff: number;
  mobilityEff: number;
  dislocations: number;
  misalignedFrac: number;
  nBridges: number;
  guideLerNm: number;
  dsaLerNm: number;
  rectification: number;
  lcduNm: number;
  ppeNm: number;
  densityPer1000um2: number;
  kineticTrap: number;
  corrLengthNm: number;
  psd0: number;
  interfaceWidthNm: number;
  lerFloorNm: number;
  doseSaving: number;
  repairability: number;
  blendL0Nm: number;
  chiNOdt: number;
  annealT: number;
  ccdNm: number;
  ccdSigmaNm: number;
  nHoles: number;
  circularity: number;
  nJumpOutliers: number;
  etchLerNm: number;
  etchLwrNm: number;
  etchAmp: number;
  residualNm: number;
  lossPos: number;
  lossCir: number;
  lossRd: number;
  lossTotal: number;
  morphology: MorphClass;
};

export type PsdBin = { k: number; psd: number; k2?: number; k4?: number };
export type HoleMarker = { x: number; y: number; cd: number };
export type LineCut = { x: number; phi: number; tanh?: number };
export type EdgePt = { x: number; y: number };

export type FramePayload = {
  rgba: Uint8ClampedArray;
  semRgba: Uint8ClampedArray;
  directorRgba: Uint8ClampedArray;
  phi: Float32Array;
  mask: Uint8Array;
  nx: number;
  ny: number;
  metrics: Metrics;
  radial: { k: number; s: number; sTh?: number }[];
  psd: PsdBin[];
  holes: HoleMarker[];
  lineCut: LineCut[];
  edges: EdgePt[];
  energyParts: { bulk: number; grad: number; longr: number; total: number };
};

export const DEFAULT_GUIDE: GuideConfig = {
  kind: "chemo-lamellar",
  LsNm: 56,
  duty: 0.25,
  cdNm: 14,
  wetting: 1,
  strength: 1.1,
  wallNm: 8,
  holeNm: 18,
  angle: 0,
  overlayNm: 0,
  tau: 0.35,
  pairNm: 22,
};

export const DEFAULT_CONFIG: SimConfig = {
  nx: 128,
  ny: 128,
  dxNm: 1,
  chiN: 18.5,
  f: 0.5,
  L0Nm: 28,
  mobility: 1,
  noise: 0.012,
  dt: 0.12,
  T: 523,
  seed: 7,
  guide: DEFAULT_GUIDE,
  euvLerNm: 0,
  euvCdJitterNm: 0,
  deltaGamma: 0,
  tFilmOverL0: 1.5,
  microwave: 1,
  euvDose: 0,
  blendFrac: 0,
  blendPath: "quench",
  T2: 0,
  tSwitch: 0,
  templateDefect: "none",
};
