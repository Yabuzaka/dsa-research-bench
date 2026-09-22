/**
 * Approximate diblock melt phase diagram (Leibler + Matsen).
 * Used as a live locator for the current (f, χN), not a fitted EOS.
 */

export type PhaseId = "DIS" | "LAM" | "HEX" | "BCC";

export function odtChiN(f: number) {
  const x = f - 0.5;
  return 10.495 + 52 * x * x + 480 * x * x * x * x;
}

export function phaseAt(f: number, chiN: number): PhaseId {
  const ff = f < 0.5 ? f : 1 - f;
  if (chiN < odtChiN(f)) return "DIS";
  if (ff < 0.14) return "BCC";
  if (ff < 0.33) return "HEX";
  return "LAM";
}

export function phaseMesh(nf = 36, nc = 28) {
  const cells: { f: number; chiN: number; phase: PhaseId }[] = [];
  for (let j = 0; j < nc; j++) {
    const chiN = 8 + (j / (nc - 1)) * 52;
    for (let i = 0; i < nf; i++) {
      const f = 0.12 + (i / (nf - 1)) * 0.76;
      cells.push({ f, chiN, phase: phaseAt(f, chiN) });
    }
  }
  return { cells, nf, nc };
}
