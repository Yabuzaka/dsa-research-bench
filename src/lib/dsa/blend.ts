const SHORT_RATIO = 0.72;

export function blendedL0(L0Nm: number, blendFrac: number) {
  const f = clamp(blendFrac, 0, 0.6);
  return (1 - f) * L0Nm + f * SHORT_RATIO * L0Nm;
}

export function blendedChiN(chiN: number, blendFrac: number) {
  const f = clamp(blendFrac, 0, 0.6);
  return chiN * (1 + 0.12 * f);
}

export function blendSeedAmp(blendFrac: number, path: "quench" | "anneal") {
  if (blendFrac <= 0.02) return 0;
  return path === "anneal" ? 0.22 * blendFrac : 0.05 * blendFrac;
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
