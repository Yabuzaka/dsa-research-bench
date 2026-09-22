/** Temperature, χ, thickness, microwave, and interfacial-width effects. */

export const T_REF_K = 523;
/** Leibler mean-field ODT for a symmetric diblock. */
export const CHI_N_ODT_MF = 10.495;

/** Flory-like χ(T) ~ 1/T, anchored at the material χN at T_ref. */
export function chiNAt(chiNRef: number, T: number) {
  return chiNRef * (T_REF_K / Math.max(T, 250));
}

/**
 * Weak thermal contraction of L0 (Maekawa Adv. Funct. Mater. 2025).
 * Higher T lowers L0 and raises correlation length, so the 5× DSA
 * window expands and shifts toward smaller Ls.
 */
export function l0At(L0Nm: number, T: number) {
  return L0Nm * (1 - 0.07 * (T - T_REF_K) / T_REF_K);
}

/**
 * Fredrickson–Helfand fluctuation-corrected ODT.
 * Fluctuations stabilize the disordered melt, so (χN)_ODT rises as N falls.
 * MRS Commun. 2025 quotes the SCFT floor 10.495; FH is the finite-N shift.
 */
export function chiNOdt(N: number) {
  const n = Math.max(N, 40);
  return CHI_N_ODT_MF + 41.0 / Math.cbrt(n);
}

/**
 * SST interfacial width. MRS Commun. 2025: w ~ (χN)^{-a}, with
 * w ≈ a √(6/χN)/2 in the SCFT limit. We report w in nm using L0 as
 * the chain scale (w/L0 ≈ 0.55/√χN → ~4.5 nm for PS-b-PMMA 28 nm).
 */
export function interfaceWidthNm(chiN: number, L0Nm: number) {
  const chi = Math.max(chiN, 6);
  return L0Nm * 0.55 / Math.sqrt(chi);
}

/**
 * Capillary-wave LER floor from the interface (Semenov / SCFT).
 * High-χ sharpens w and drops this floor — the reason new Hχ BCPs
 * beat PS-b-PMMA on 24 nm 1:1 rectification (Monreal, SPIE 2025).
 */
export function lerFloorNm(chiN: number, L0Nm: number) {
  const w = interfaceWidthNm(chiN, L0Nm);
  const log = Math.log(Math.max(L0Nm / Math.max(w, 0.4), 1.2));
  return 0.32 * w * Math.sqrt(log);
}

/**
 * High-χ slows defect annihilation (MRS Commun. 2025; IMEC EUV+DSA).
 * Ea scales up with χN/18.5. Microwave annealing (Appl. Surf. Sci. 2026)
 * is a mobility multiplier. Films thicker than ~3 L0 trap interior defects
 * (Chen–Nealey GISAXS).
 */
export function effectiveMobility(args: {
  mobility: number;
  chiN: number;
  T: number;
  microwave: number;
  tFilmOverL0: number;
}) {
  const ea = 2400 * Math.pow(Math.max(args.chiN, 8) / 18.5, 1.2);
  const arrhenius = Math.exp(-ea * (1 / args.T - 1 / T_REF_K));
  const thick =
    args.tFilmOverL0 <= 3 ? 1 : 1 / (1 + 0.55 * (args.tFilmOverL0 - 3));
  return Math.max(0.04, args.mobility * Math.max(args.microwave, 0.2) * arrhenius * thick);
}

export function kineticTrapScore(chiN: number, T: number, order: number) {
  const m = effectiveMobility({
    mobility: 1,
    chiN,
    T,
    microwave: 1,
    tFilmOverL0: 1,
  });
  return clamp((1 - order) * (1.2 / (m + 0.2)), 0, 2);
}

/**
 * Two-step protocol (MRS 2025): high T annihilates dislocations, then a
 * lower T raises χN and sharpens w without re-nucleating defects.
 */
export function annealTemperature(T: number, T2: number, tSwitch: number, t: number) {
  if (tSwitch > 0 && T2 > 0 && t >= tSwitch) return T2;
  return T;
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
