export type TmdId =
  | "mos2"
  | "ws2"
  | "mose2"
  | "wse2"
  | "mote2"
  | "wte2"
  | "res2"
  | "hfs2"
  | "ptse2";
export type Carrier = "n" | "p" | "ambi" | "semi";
export type Metal = "Mo" | "W" | "Re" | "Hf" | "Pt";
export type Chalcogen = "S" | "Se" | "Te";
export type Polytype = "2H" | "1T" | "1T'" | "Td";
export type TmdFamily = "logic" | "research";

export type TmdMaterial = {
  id: TmdId;
  formula: string;
  name: string;
  metal: Metal;
  chalcogen: Chalcogen;
  polytype: Polytype;
  family: TmdFamily;
  carrier: Carrier;
  complementId: TmdId;
  /** Monolayer gap, eV. 0 = semimetal. */
  egMonoEv: number;
  /** Bulk gap, eV. 0 = semimetal. */
  egBulkEv: number;
  tMonoNm: number;
  epsZ: number;
  mStar: number;
  muExp: [number, number];
  muTheory: number;
  latticeAAng: number;
  vSatCms: number;
  colorM: string;
  colorX: string;
  note: string;
  refs: string;
};

export const TMD_MATERIALS: TmdMaterial[] = [
  {
    id: "mos2",
    formula: "MoS₂",
    name: "molybdenum disulfide",
    metal: "Mo",
    chalcogen: "S",
    polytype: "2H",
    family: "logic",
    carrier: "n",
    complementId: "wse2",
    egMonoEv: 1.8,
    egBulkEv: 1.2,
    tMonoNm: 0.65,
    epsZ: 4.8,
    mStar: 0.45,
    muExp: [15, 80],
    muTheory: 400,
    latticeAAng: 3.16,
    vSatCms: 3.4e6,
    colorM: "#3d7ea6",
    colorX: "#e6c229",
    note: "Workhorse n-FET. 300 mm MOCVD, nanoribbon I_on to ~995 µA/µm (Nat. Commun. 2026), L_ch/L_c ≈ 35/30 nm with EOT < 2.5 nm (Nat. Electron. 2025).",
    refs: "Kis 2011; Das Nat. Electron. 2025; Nat. Commun. 2026 nanoribbon",
  },
  {
    id: "ws2",
    formula: "WS₂",
    name: "tungsten disulfide",
    metal: "W",
    chalcogen: "S",
    polytype: "2H",
    family: "logic",
    carrier: "n",
    complementId: "wse2",
    egMonoEv: 2.05,
    egBulkEv: 1.35,
    tMonoNm: 0.62,
    epsZ: 5.5,
    mStar: 0.35,
    muExp: [20, 70],
    muTheory: 500,
    latticeAAng: 3.15,
    vSatCms: 4.0e6,
    colorM: "#c9a227",
    colorX: "#f0d060",
    note: "Wider gap than MoS₂ → easier I_off. Intel/IMEC 300 mm NMOS; often slightly better SS, slightly lower I_on than MoS₂ at the same Rc.",
    refs: "Dorow IEDM 2023 300 mm; IMEC 2026 WS₂ module",
  },
  {
    id: "mose2",
    formula: "MoSe₂",
    name: "molybdenum diselenide",
    metal: "Mo",
    chalcogen: "Se",
    polytype: "2H",
    family: "logic",
    carrier: "ambi",
    complementId: "wse2",
    egMonoEv: 1.55,
    egBulkEv: 1.1,
    tMonoNm: 0.65,
    epsZ: 6.4,
    mStar: 0.5,
    muExp: [10, 50],
    muTheory: 240,
    latticeAAng: 3.29,
    vSatCms: 2.8e6,
    colorM: "#3d7ea6",
    colorX: "#e07a3d",
    note: "Ambipolar, mid-gap. Less foundry traction than the sulfide/WSe₂ pair; useful as a contact or alloy knob.",
    refs: "2D ohmic-contact reviews; ACS Nano 2025 contacts",
  },
  {
    id: "wse2",
    formula: "WSe₂",
    name: "tungsten diselenide",
    metal: "W",
    chalcogen: "Se",
    polytype: "2H",
    family: "logic",
    carrier: "p",
    complementId: "mos2",
    egMonoEv: 1.64,
    egBulkEv: 1.2,
    tMonoNm: 0.65,
    epsZ: 7.2,
    mStar: 0.34,
    muExp: [20, 200],
    muTheory: 270,
    latticeAAng: 3.28,
    vSatCms: 3.6e6,
    colorM: "#c9a227",
    colorX: "#d4652f",
    note: "Leading p-FET. NO-doped bilayer, nanoribbon 357 µA/µm. Complementary to MoS₂/WS₂; contact SBH is the limiter, not the gap.",
    refs: "Nat. Commun. 2025 p-FET; Nat. Commun. 2026 nanoribbon p-FET",
  },
  {
    id: "mote2",
    formula: "MoTe₂",
    name: "molybdenum ditelluride",
    metal: "Mo",
    chalcogen: "Te",
    polytype: "2H",
    family: "logic",
    carrier: "ambi",
    complementId: "wse2",
    egMonoEv: 1.1,
    egBulkEv: 0.9,
    tMonoNm: 0.7,
    epsZ: 8.0,
    mStar: 0.6,
    muExp: [8, 40],
    muTheory: 180,
    latticeAAng: 3.52,
    vSatCms: 2.2e6,
    colorM: "#4a8a9e",
    colorX: "#8b5a2b",
    note: "Narrowest Group-6 2H gap. 2H is semiconducting; 1T′ is also stable. Harder I_off at Vdd. More interesting for phase-change contacts than HP logic.",
    refs: "2H–1T′ MoTe₂ literature; IRDS 2D option space",
  },
  {
    id: "wte2",
    formula: "WTe₂",
    name: "tungsten ditelluride",
    metal: "W",
    chalcogen: "Te",
    polytype: "Td",
    family: "research",
    carrier: "semi",
    complementId: "wse2",
    egMonoEv: 0,
    egBulkEv: 0,
    tMonoNm: 0.71,
    epsZ: 11.0,
    mStar: 0.3,
    muExp: [200, 4000],
    muTheory: 5000,
    latticeAAng: 3.5,
    vSatCms: 2.0e6,
    colorM: "#c9a227",
    colorX: "#6b4423",
    note: "Type-II Weyl / Td semimetal, not a CMOS channel. High μ, no gap, will not switch. Do not confuse with 2H WSe₂. Metastable 2H WTe₂ is a research curiosity.",
    refs: "Td WTe₂ Weyl literature; 2H WTe₂ is not the ground state",
  },
  {
    id: "res2",
    formula: "ReS₂",
    name: "rhenium disulfide",
    metal: "Re",
    chalcogen: "S",
    polytype: "1T'",
    family: "research",
    carrier: "n",
    complementId: "wse2",
    egMonoEv: 1.55,
    egBulkEv: 1.35,
    tMonoNm: 0.7,
    epsZ: 7.0,
    mStar: 0.43,
    muExp: [1, 40],
    muTheory: 300,
    latticeAAng: 6.42,
    vSatCms: 1.5e6,
    colorM: "#7a8894",
    colorX: "#e6c229",
    note: "Distorted 1T, in-plane anisotropy (diamond chains). FET papers exist. Direct gap in every layer count, unlike 2H MX₂. Not a 300 mm logic candidate.",
    refs: "ReS₂ anisotropic FET literature; 1T′ diamond-chain structure",
  },
  {
    id: "hfs2",
    formula: "HfS₂",
    name: "hafnium disulfide",
    metal: "Hf",
    chalcogen: "S",
    polytype: "1T",
    family: "research",
    carrier: "n",
    complementId: "wse2",
    egMonoEv: 1.8,
    egBulkEv: 2.0,
    tMonoNm: 0.59,
    epsZ: 11.0,
    mStar: 0.24,
    muExp: [2, 30],
    muTheory: 1800,
    latticeAAng: 3.64,
    vSatCms: 4.0e6,
    colorM: "#8fa0b3",
    colorX: "#e6c229",
    note: "Group-4 1T (CdI₂). Phonon-limited μ is often quoted far above MoS₂. Grown FETs still sit at the low experimental end — contacts and oxides, not the band.",
    refs: "HfS₂ FET / DFT mobility papers; Group-4 TMD reviews",
  },
  {
    id: "ptse2",
    formula: "PtSe₂",
    name: "platinum diselenide",
    metal: "Pt",
    chalcogen: "Se",
    polytype: "1T",
    family: "research",
    carrier: "ambi",
    complementId: "mos2",
    egMonoEv: 1.2,
    egBulkEv: 0,
    tMonoNm: 0.51,
    epsZ: 20.0,
    mStar: 0.21,
    muExp: [10, 150],
    muTheory: 400,
    latticeAAng: 3.73,
    vSatCms: 2.0e6,
    colorM: "#9aa7b2",
    colorX: "#e07a3d",
    note: "1L is a semiconductor (~1.2 eV); bulk is a type-II Dirac semimetal. Used more as a contact / IR detector than a logic body. Layer count is the switch.",
    refs: "PtSe₂ 1L gap vs bulk semimetal; 2D contact literature",
  },
];

export const CARRIER_LABEL: Record<Carrier, string> = {
  n: "n-FET",
  p: "p-FET",
  ambi: "ambipolar",
  semi: "semimetal",
};

export function tmdById(id: string): TmdMaterial {
  return TMD_MATERIALS.find((m) => m.id === id) ?? TMD_MATERIALS[0];
}

export function tmdsIn(family: TmdFamily) {
  return TMD_MATERIALS.filter((m) => m.family === family);
}
