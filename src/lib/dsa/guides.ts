import type { SimConfig, TemplateDefect } from "./types.ts";

export const TEMPLATE_DEFECT_LABELS: Record<TemplateDefect, string> = {
  none: "Ideal template",
  "missing-stripe": "Missing stripe",
  "broken-stripe": "Broken stripe",
  "cd-outlier": "CD outlier",
  overlay: "Overlay shift",
  stitch: "High-NA stitch seam",
};

export function stripeWidthNm(cfg: SimConfig) {
  const { guide } = cfg;
  if (guide.cdNm > 0) return guide.cdNm;
  return guide.duty * guide.LsNm;
}

/** Sample guides at cell centers, allowing different physical x/y spacing. */
export function buildGuideField(cfg: SimConfig, dyNm = cfg.dxNm): Float32Array {
  if (!Number.isFinite(dyNm) || dyNm <= 0) {
    throw new RangeError("Guide y spacing must be finite and positive.");
  }
  const { nx, ny, dxNm, L0Nm, guide } = cfg;
  const h = new Float32Array(nx * ny);
  const kind = guide.kind;
  if (kind === "none") return h;

  const s = guide.strength;
  const w = guide.wetting;
  const ang = guide.angle;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const rng = mulberry32(cfg.seed + 91);
  const lerSigma = (cfg.euvLerNm || 0) / 3;
  const cdSigma = (cfg.euvCdJitterNm || 0) / 3;
  const nl = cfg.deltaGamma * 0.35;
  const overlay = guide.overlayNm || 0;

  if (kind === "chemo-lamellar" || kind === "fin-array") {
    const Ls = Math.max(guide.LsNm, dxNm);
    const baseW = Math.max(stripeWidthNm(cfg), dxNm * 0.5);
    const nStripes = Math.ceil((nx * dxNm) / Ls) + 4;
    const offsets = new Float32Array(ny);
    const widths = new Float32Array(nStripes);
    offsets[0] = gauss(rng) * lerSigma;
    for (let y = 1; y < ny; y++) {
      offsets[y] = 0.86 * offsets[y - 1] + 0.51 * gauss(rng) * lerSigma;
    }
    for (let i = 0; i < nStripes; i++) {
      widths[i] = Math.max(dxNm, baseW + gauss(rng) * cdSigma);
    }
    applyTemplateDefects(cfg, widths, nStripes, Ls);

    const missIdx = defectStripeIndex(cfg, nStripes, Ls);
    const brokenY0 = ny * 0.35;
    const brokenY1 = ny * 0.65;
    const stitchY = ny * 0.5;
    const stitchJump = stitchPhaseNm(cfg);

    for (let y = 0; y < ny; y++) {
      const stitch = cfg.templateDefect === "stitch" && y >= stitchY ? stitchJump : 0;
      const broken =
        cfg.templateDefect === "broken-stripe" && y >= brokenY0 && y < brokenY1;
      for (let x = 0; x < nx; x++) {
        const xr = (x + 0.5) * dxNm + offsets[y] + overlay + stitch;
        const yr = (y + 0.5) * dyNm;
        const u = xr * ca + yr * sa;
        const idx = Math.floor(u / Ls);
        const wrapped = ((idx % nStripes) + nStripes) % nStripes;
        if (cfg.templateDefect === "missing-stripe" && wrapped === missIdx) {
          h[y * nx + x] = nl;
          continue;
        }
        if (broken && wrapped === missIdx) {
          h[y * nx + x] = nl;
          continue;
        }
        const stripe = widths[wrapped];
        const mod = ((u % Ls) + Ls) % Ls;
        const d = Math.min(mod, Ls - mod);
        const edge = Math.max(stripe * 0.5, 0.6);
        const profile = 0.5 * (1 + Math.tanh((edge - d) / (0.35 * L0Nm)));
        h[y * nx + x] = s * w * profile + nl;
      }
    }
    if (kind === "fin-array") {
      const cutPitch = Ls * 8;
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const yr = (y + 0.5) * dyNm;
          const v = -xrComponent(x, dxNm, sa) + yr * ca;
          const mod = ((v % cutPitch) + cutPitch) % cutPitch;
          if (mod < 3) h[y * nx + x] *= 0.15;
        }
      }
    }
    return h;
  }

  if (kind === "grapho-trench") {
    const Ls = Math.max(guide.LsNm, dxNm * 4);
    const open = Math.max(guide.duty * Ls, L0Nm);
    const wall = Math.max(guide.wallNm, dxNm);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const xr = (x + 0.5) * dxNm + overlay;
        const u = xr * ca + (y + 0.5) * dyNm * sa;
        const mod = ((u % Ls) + Ls) % Ls;
        const halfOpen = open * 0.5;
        const center = Ls * 0.5;
        const d = Math.abs(mod - center);
        if (d > halfOpen && d < halfOpen + wall) {
          h[y * nx + x] = s * w * 2.4 + nl;
        } else if (d >= halfOpen + wall) {
          h[y * nx + x] = 99;
        } else {
          h[y * nx + x] = nl;
        }
      }
    }
    return h;
  }

  if (kind === "contact-holes") {
    const pitch = Math.max(guide.LsNm, L0Nm);
    const r0 = Math.max(guide.holeNm * 0.5, dxNm);
    const hex = cfg.f < 0.42;
    const rowH = hex ? pitch * Math.sin(Math.PI / 3) : pitch;
    const miss = cfg.templateDefect === "missing-stripe";
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const xr = (x + 0.5) * dxNm + overlay;
        const yr = (y + 0.5) * dyNm;
        const row = Math.round(yr / rowH);
        const xoff = hex && row % 2 !== 0 ? pitch * 0.5 : 0;
        const cx = Math.round((xr - xoff) / pitch) * pitch + xoff;
        const cy = row * rowH;
        const jitter = cdSigma * 0.4;
        const d = Math.hypot(xr - cx, yr - cy);
        if (miss && Math.abs(cx - nx * dxNm * 0.5) < pitch * 0.6 && Math.abs(cy - ny * dyNm * 0.5) < rowH * 0.6) {
          h[y * nx + x] = nl;
          continue;
        }
        if (d < r0 + 1.2 + jitter) {
          const profile = 0.5 * (1 + Math.tanh((r0 - d) / 0.7));
          h[y * nx + x] = s * w * profile * 1.6 + nl;
        } else if (d > r0 + guide.wallNm) {
          h[y * nx + x] = 99;
        } else {
          h[y * nx + x] = nl;
        }
      }
    }
    return h;
  }

  if (kind === "via-pair") {
    // Zhou et al. arXiv:2510.02715 Gaussian peanut descriptor.
    // Superimpose two isotropic Gaussians; contour τ is the grapho wall.
    // Manufacturable templates keep τ ≳ 0.35 (mild curvature).
    const pitch = Math.max(guide.LsNm, L0Nm * 1.6);
    const pair = Math.max(guide.pairNm || L0Nm * 1.35, L0Nm * 0.8);
    const R = Math.max(guide.holeNm * 0.5, dxNm * 2);
    const tau = clamp(guide.tau || 0.35, 0.12, 0.75);
    const sigma2 = Math.max(-(R * R) / (2 * Math.log(Math.max(tau, 0.08))), dxNm * dxNm);
    const miss = cfg.templateDefect === "missing-stripe";
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const xr = (x + 0.5) * dxNm + overlay;
        const yr = (y + 0.5) * dyNm;
        const col = Math.round(xr / pitch);
        const row = Math.round(yr / pitch);
        const cx = col * pitch;
        const cy = row * pitch;
        if (miss && Math.abs(cx - nx * dxNm * 0.5) < pitch * 0.6) {
          h[y * nx + x] = 99;
          continue;
        }
        const c1x = cx - pair * 0.5;
        const c2x = cx + pair * 0.5;
        const g1 = Math.exp(-((xr - c1x) ** 2 + (yr - cy) ** 2) / (2 * sigma2));
        const g2 = Math.exp(-((xr - c2x) ** 2 + (yr - cy) ** 2) / (2 * sigma2));
        const f = g1 + g2;
        if (f >= tau) {
          h[y * nx + x] = s * w * Math.min(f, 1.6) + nl;
        } else {
          h[y * nx + x] = 99;
        }
      }
    }
    return h;
  }

  return h;
}

function applyTemplateDefects(cfg: SimConfig, widths: Float32Array, nStripes: number, Ls: number) {
  if (cfg.templateDefect !== "cd-outlier") return;
  const i = defectStripeIndex(cfg, nStripes, Ls);
  widths[i] = Math.max(widths[i] * 1.85, cfg.L0Nm * 0.9);
}

function defectStripeIndex(cfg: SimConfig, nStripes: number, Ls: number) {
  const mid = (cfg.nx * cfg.dxNm * 0.5) / Ls;
  return ((Math.round(mid) % nStripes) + nStripes) % nStripes;
}

function stitchPhaseNm(cfg: SimConfig) {
  if (cfg.guide.overlayNm > 0) return cfg.guide.overlayNm;
  return 0.22 * cfg.L0Nm;
}

function xrComponent(x: number, dxNm: number, sa: number) {
  return (x + 0.5) * dxNm * sa;
}

export function multiplicationFactor(LsNm: number, L0Nm: number) {
  if (L0Nm <= 0) return 1;
  return Math.max(1, Math.round(LsNm / L0Nm));
}

export function commensurability(LsNm: number, L0Nm: number) {
  if (L0Nm <= 0) return 0;
  const n = Math.max(1, Math.round(LsNm / L0Nm));
  const err = Math.abs(LsNm / n - L0Nm) / L0Nm;
  return Math.max(0, 1 - err / 0.08);
}

function gauss(rng: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
