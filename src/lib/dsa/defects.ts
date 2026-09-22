import { ccdReport } from "./ccd.ts";
import type { SimConfig } from "./types.ts";

export type DefectReport = {
  dislocations: number;
  misalignedFrac: number;
  nBridges: number;
  guideLerNm: number;
  dsaLerNm: number;
  rectification: number;
  lcduNm: number;
  ppeNm: number;
  densityPer1000um2: number;
};

/** In-plane defect taxonomy used as a 2D proxy for Maekawa / IMEC SEM classes. */
export function classifyDefects(
  phi: Float32Array,
  hField: Float32Array,
  cfg: SimConfig,
): DefectReport {
  const { nx, ny, dxNm, L0Nm } = cfg;
  const dsa = edgeLerVertical(phi, nx, ny, dxNm);
  const guide = edgeLerVertical(hField, nx, ny, dxNm, 0.25);
  const rectification =
    dsa.ler > 1e-6 ? guide.ler / dsa.ler : guide.ler > 0 ? 8 : 1;

  let gxAbs = 0;
  let gyAbs = 0;
  let nGrad = 0;
  for (let y = 1; y < ny - 1; y++) {
    for (let x = 1; x < nx - 1; x++) {
      const i = y * nx + x;
      const gx = phi[i + 1] - phi[i - 1];
      const gy = phi[i + nx] - phi[i - nx];
      const g = Math.abs(gx) + Math.abs(gy);
      if (g < 0.15) continue;
      gxAbs += Math.abs(gx);
      gyAbs += Math.abs(gy);
      nGrad += 1;
    }
  }
  const misalignedFrac = nGrad ? gyAbs / (gxAbs + gyAbs) : 0;

  const expected = Math.max(2, Math.round((2 * nx * dxNm) / L0Nm));
  let extra = 0;
  let bridges = 0;
  for (let y = 2; y < ny - 2; y += 2) {
    let crossings = 0;
    let last = phi[y * nx];
    let run = 0;
    for (let x = 1; x < nx; x++) {
      const p = phi[y * nx + x];
      if (last * p < 0) crossings += 1;
      if (p > 0) {
        run += 1;
      } else {
        if (run > 0 && run <= 2) bridges += 1;
        run = 0;
      }
      last = p;
    }
    extra += Math.abs(crossings - expected);
  }
  const dislocations = Math.round(extra / Math.max((ny - 4) / 2, 1));

  const fovUm2 = (nx * dxNm * ny * dxNm) / 1e6;
  const densityPer1000um2 = fovUm2 > 0 ? (dislocations / fovUm2) * 1000 : 0;

  const holes = ccdReport(phi, cfg);

  return {
    dislocations,
    misalignedFrac,
    nBridges: bridges,
    guideLerNm: guide.ler,
    dsaLerNm: dsa.ler,
    rectification,
    lcduNm: holes.lcduNm,
    ppeNm: holes.ppeNm,
    densityPer1000um2,
  };
}

function edgeLerVertical(
  field: Float32Array,
  nx: number,
  ny: number,
  dxNm: number,
  thr = 0,
) {
  const xs: number[] = [];
  for (let y = 4; y < ny - 4; y++) {
    for (let x = 1; x < nx; x++) {
      const a = field[y * nx + x - 1] - thr;
      const b = field[y * nx + x] - thr;
      if (a * b < 0) {
        xs.push(x * dxNm);
        break;
      }
    }
  }
  if (xs.length < 8) return { ler: 0 };
  const m = mean(xs);
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  return { ler: 3 * Math.sqrt(v / xs.length) };
}

function mean(xs: number[]) {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length ? s / xs.length : 0;
}
