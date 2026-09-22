/** In-place radix-2 Cooley–Tukey FFT. n must be a power of two. */

export type FftArray = Float32Array | Float64Array;

function bitReverse(x: number, bits: number) {
  let y = 0;
  for (let i = 0; i < bits; i++) {
    y = (y << 1) | (x & 1);
    x >>= 1;
  }
  return y;
}

function log2(n: number) {
  return Math.log2(n) | 0;
}

export function isPow2(n: number) {
  return n > 0 && (n & (n - 1)) === 0;
}

export function fft1d(
  re: FftArray,
  im: FftArray,
  n: number,
  off: number,
  stride: number,
  invert: boolean,
) {
  const bits = log2(n);
  for (let i = 0; i < n; i++) {
    const j = bitReverse(i, bits);
    if (j > i) {
      const a = off + i * stride;
      const b = off + j * stride;
      const tr = re[a];
      const ti = im[a];
      re[a] = re[b];
      im[a] = im[b];
      re[b] = tr;
      im[b] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const theta = ((invert ? 2 : -2) * Math.PI) / size;
    const wr0 = Math.cos(theta);
    const wi0 = Math.sin(theta);
    for (let i = 0; i < n; i += size) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < half; j++) {
        const even = off + (i + j) * stride;
        const odd = off + (i + j + half) * stride;
        const or_ = re[odd];
        const oi = im[odd];
        const tr = wr * or_ - wi * oi;
        const ti = wr * oi + wi * or_;
        re[odd] = re[even] - tr;
        im[odd] = im[even] - ti;
        re[even] += tr;
        im[even] += ti;
        const nwr = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = nwr;
      }
    }
  }
  if (invert) {
    const s = 1 / n;
    for (let i = 0; i < n; i++) {
      const a = off + i * stride;
      re[a] *= s;
      im[a] *= s;
    }
  }
}

export function fft2d(re: FftArray, im: FftArray, nx: number, ny: number, invert: boolean) {
  for (let y = 0; y < ny; y++) fft1d(re, im, nx, y * nx, 1, invert);
  for (let x = 0; x < nx; x++) fft1d(re, im, ny, x, nx, invert);
}

/** In-place 3D FFT, all sizes powers of two. Layout: i = ((z * ny) + y) * nx + x */
export function fft3d(
  re: FftArray,
  im: FftArray,
  nx: number,
  ny: number,
  nz: number,
  invert: boolean,
) {
  const nxy = nx * ny;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) fft1d(re, im, nx, z * nxy + y * nx, 1, invert);
  }
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) fft1d(re, im, ny, z * nxy + x, nx, invert);
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) fft1d(re, im, nz, y * nx + x, nxy, invert);
  }
}
