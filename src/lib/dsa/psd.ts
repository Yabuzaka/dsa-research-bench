/**
 * Line-edge power spectral density (Naulleau / Mack metrology).
 * DSA is expected to cut high-frequency EUV stochastic while leaving
 * low-frequency overlay / correlation-length content (MRS Commun. 2025;
 * Loo et al. SIS vs dry-liftoff PSD).
 */

export type PsdReport = {
  bins: { k: number; psd: number }[];
  corrLengthNm: number;
  psd0: number;
  roughnessExp: number;
};

export function lineEdgePsd(
  phi: Float32Array,
  nx: number,
  ny: number,
  dxNm: number,
): PsdReport {
  const edge = firstVerticalEdge(phi, nx, ny, dxNm);
  if (edge.length < 16) {
    return { bins: [], corrLengthNm: 0, psd0: 0, roughnessExp: 0.5 };
  }
  const m = mean(edge);
  const n = nextPow2(edge.length);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < edge.length; i++) re[i] = edge[i] - m;
  fftRadix2(re, im);

  const df = 1 / (n * dxNm);
  const bins: { k: number; psd: number }[] = [];
  const half = n / 2;
  let psd0 = 0;
  for (let i = 1; i < half; i++) {
    const mag2 = (re[i] * re[i] + im[i] * im[i]) / n;
    const k = i * df;
    bins.push({ k, psd: mag2 });
    if (i <= 3) psd0 += mag2;
  }
  psd0 /= 3;

  const ac = autocorrelation(edge, m);
  const corrLengthNm = corrLength(ac, dxNm);

  let roughnessExp = 0.5;
  if (bins.length > 8) {
    const i0 = Math.max(2, (bins.length * 0.35) | 0);
    const i1 = Math.max(i0 + 2, (bins.length * 0.75) | 0);
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    let c = 0;
    for (let i = i0; i < i1; i++) {
      if (bins[i].psd <= 1e-18) continue;
      const x = Math.log(bins[i].k);
      const y = Math.log(bins[i].psd);
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
      c += 1;
    }
    if (c > 3) {
      const slope = (c * sxy - sx * sy) / (c * sxx - sx * sx);
      roughnessExp = clamp(-slope / 2, 0.1, 1.5);
    }
  }

  return { bins: bins.slice(0, 48), corrLengthNm, psd0, roughnessExp };
}

function firstVerticalEdge(
  phi: Float32Array,
  nx: number,
  ny: number,
  dxNm: number,
) {
  const xs: number[] = [];
  for (let y = 0; y < ny; y++) {
    let found = false;
    for (let x = 1; x < nx; x++) {
      const a = phi[y * nx + x - 1];
      const b = phi[y * nx + x];
      if (a * b < 0) {
        const t = a / (a - b);
        xs.push((x - 1 + t) * dxNm);
        found = true;
        break;
      }
    }
    if (!found && xs.length) xs.push(xs[xs.length - 1]);
  }
  return xs;
}

function autocorrelation(edge: number[], m: number) {
  const n = edge.length;
  const maxLag = Math.min(48, (n / 2) | 0);
  const ac = new Float64Array(maxLag);
  let var0 = 0;
  for (let i = 0; i < n; i++) var0 += (edge[i] - m) ** 2;
  var0 = Math.max(var0, 1e-12);
  for (let lag = 0; lag < maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) {
      s += (edge[i] - m) * (edge[i + lag] - m);
    }
    ac[lag] = s / var0;
  }
  return ac;
}

function corrLength(ac: Float64Array, dxNm: number) {
  for (let i = 1; i < ac.length; i++) {
    if (ac[i] <= 1 / Math.E) {
      const a0 = ac[i - 1];
      const a1 = ac[i];
      const t = (1 / Math.E - a0) / (a1 - a0 + 1e-12);
      return (i - 1 + t) * dxNm;
    }
  }
  return ac.length * dxNm;
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function fftRadix2(re: Float64Array, im: Float64Array) {
  const n = re.length;
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const ang = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ir = re[i + k + half];
        const ii = im[i + k + half];
        const tr = wr * ir - wi * ii;
        const ti = wr * ii + wi * ir;
        re[i + k + half] = re[i + k] - tr;
        im[i + k + half] = im[i + k] - ti;
        re[i + k] += tr;
        im[i + k] += ti;
      }
    }
  }
}

function mean(xs: number[]) {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length ? s / xs.length : 0;
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
