const E0 = 40;
const LER0_28 = 2.4;

export function euvLerFromDose(doseMJcm2: number, pitchNm: number) {
  const ler0 = LER0_28 * Math.sqrt(Math.max(pitchNm, 8) / 28);
  return ler0 * Math.sqrt(E0 / Math.max(doseMJcm2, 4));
}

export function euvCdJitterFromDose(doseMJcm2: number, pitchNm: number) {
  return 0.5 * euvLerFromDose(doseMJcm2, pitchNm);
}

export function doseToMatchLer(targetLerNm: number, pitchNm: number) {
  const ler0 = LER0_28 * Math.sqrt(Math.max(pitchNm, 8) / 28);
  return E0 * (ler0 / Math.max(targetLerNm, 0.15)) ** 2;
}

export function doseSavingFraction(dsaLerNm: number, workingDose: number, pitchNm: number) {
  if (workingDose <= 0 || dsaLerNm <= 0) return 0;
  const need = doseToMatchLer(dsaLerNm, pitchNm);
  return clamp((need - workingDose) / Math.max(need, 1e-6), -1, 4);
}

export function applyDoseToConfig(euvDose: number, pitchNm: number) {
  if (euvDose <= 0) return { euvDose: 0, euvLerNm: 0, euvCdJitterNm: 0 };
  return {
    euvDose,
    euvLerNm: euvLerFromDose(euvDose, pitchNm),
    euvCdJitterNm: euvCdJitterFromDose(euvDose, pitchNm),
  };
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
