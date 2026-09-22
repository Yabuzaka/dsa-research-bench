/**
 * Synthetic top-down CD-SEM of the order-parameter field.
 * PS remains (bright), PMMA is the etched block (dark). A 1.2 nm
 * Gaussian PSF plus Poisson shot noise stand in for a 500 V SEM
 * (not a calibrated CD-SEM library — screening only).
 */

export function renderSem(
  phi: Float32Array,
  nx: number,
  ny: number,
  dxNm: number,
  mobile: Uint8Array,
  electrons = 48,
): Uint8ClampedArray {
  const n = nx * ny;
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = mobile[i] ? (phi[i] + 1) * 0.5 : 0.08;
    src[i] = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const sigma = Math.max(0.7, 1.2 / Math.max(dxNm, 0.4));
  const blur = blurSep(src, nx, ny, sigma);
  const rgba = new Uint8ClampedArray(n * 4);
  let seed = 17_901;
  for (let i = 0; i < n; i++) {
    seed = (seed + 0x6d2b79f5) | 0;
    const rnd = ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
    const g = Math.sqrt(-2 * Math.log(Math.max(rnd, 1e-9))) * Math.cos(2 * Math.PI * rnd);
    const I = blur[i];
    const shot = I + Math.sqrt(Math.max(I, 1e-4) / electrons) * g;
    const v = Math.min(1, Math.max(0, shot));
    const g8 = (18 + 220 * v) | 0;
    const o = i * 4;
    rgba[o] = g8;
    rgba[o + 1] = g8;
    rgba[o + 2] = (g8 * 0.96) | 0;
    rgba[o + 3] = 255;
  }
  return rgba;
}

function blurSep(src: Float32Array, nx: number, ny: number, sigma: number) {
  const r = Math.max(1, Math.min(8, Math.ceil(3 * sigma)));
  const ker = new Float64Array(2 * r + 1);
  let s = 0;
  const t2 = 2 * sigma * sigma;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / t2);
    ker[i + r] = v;
    s += v;
  }
  for (let i = 0; i < ker.length; i++) ker[i] /= s;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        const xi = xx < 0 ? x : xx >= nx ? x : xx;
        acc += src[y * nx + xi] * ker[k + r];
      }
      tmp[y * nx + x] = acc;
    }
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        const yi = yy < 0 ? y : yy >= ny ? y : yy;
        acc += tmp[yi * nx + x] * ker[k + r];
      }
      out[y * nx + x] = acc;
    }
  }
  return out;
}
