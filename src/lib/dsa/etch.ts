export function etchAmplification(L0Nm: number, chiN: number) {
  const pitchTerm = 1 + 0.62 * Math.pow(30 / Math.max(L0Nm, 6), 0.85);
  const chiTerm = 18.5 / Math.max(chiN, 10);
  return clamp(0.62 * pitchTerm * (0.5 + 0.5 * chiTerm), 0.85, 3.2);
}

export function afterEtchLer(dsaLerNm: number, L0Nm: number, chiN: number) {
  return dsaLerNm * etchAmplification(L0Nm, chiN);
}

export function afterEtchLwr(dsaLwrNm: number, L0Nm: number, chiN: number) {
  return dsaLwrNm * (0.92 * etchAmplification(L0Nm, chiN));
}

export function residualLayerNm(deltaGamma: number, L0Nm: number) {
  return 0.16 * L0Nm * Math.abs(deltaGamma);
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
