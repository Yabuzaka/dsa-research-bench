import type { ScftReport } from "./scft.ts";
import type { SimConfig } from "./types.ts";

export type InverseMeasurements = {
  cdNm: number;
  pitchNm: number;
  lerNm: number;
  lcduNm: number;
  ppeNm: number;
  circularityLoss: number;
  missing: number;
  nDomains: number;
  resolved: boolean;
  order: number;
  dxNm: number;
  dyNm: number;
};

/** Field geometry at phi_A=0.5, with physical rectangular-cell distances.
 * A homogeneous field has no resolved interfaces. This is deterministic
 * geometry, not experimental stochastic LER/LCDU.
 */
export function measureInverseField(
  r: Pick<ScftReport, "phi" | "nx" | "ny" | "cellNm" | "cellLyNm" | "periodNm">,
  cfg: SimConfig,
  mode: "lamellar" | "holes" | "via-pair",
  targetGuidePitch: number,
  multiplication: number,
): InverseMeasurements {
  const { phi, nx, ny } = r;
  const W = r.cellNm,
    H = r.cellLyNm,
    dxNm = W / nx,
    dyNm = H / ny;
  let lo = Infinity,
    hi = -Infinity,
    variance = 0,
    avg = 0;
  for (const v of phi) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
    avg += v;
  }
  avg /= phi.length;
  for (const v of phi) variance += (v - avg) ** 2;
  const empty = {
    cdNm: 0,
    pitchNm: 0,
    lerNm: 0,
    lcduNm: 0,
    ppeNm: 0,
    circularityLoss: 1,
    missing: 1,
    nDomains: 0,
    resolved: false,
    order: Math.min(1, Math.sqrt(variance / phi.length)),
    dxNm,
    dyNm,
  };
  if (!Number.isFinite(lo + hi) || lo >= -0.01 || hi <= 0.01 || hi - lo < 0.1) return empty;

  if (mode === "lamellar") {
    const widths: number[] = [],
      pitches: number[] = [],
      rows: number[][] = [];
    const ca = Math.cos(cfg.guide.angle),
      sa = Math.sin(cfg.guide.angle);
    const periodicCut = Math.abs(sa) < 1e-8 || (Math.abs(ca) < 1e-8 && Math.abs(W - H) < 1e-8);
    // Sample normal to the guide, preserving distances even in a rotated cell.
    const sample = (x: number, y: number) => {
      const xx = (((x / dxNm) % nx) + nx) % nx,
        yy = (((y / dyNm) % ny) + ny) % ny;
      const ix = Math.floor(xx),
        iy = Math.floor(yy),
        tx = xx - ix,
        ty = yy - iy;
      const at = (a: number, b: number) => phi[(b % ny) * nx + (a % nx)];
      return (
        (1 - ty) * ((1 - tx) * at(ix, iy) + tx * at(ix + 1, iy)) +
        ty * ((1 - tx) * at(ix, iy + 1) + tx * at(ix + 1, iy + 1))
      );
    };
    for (let y = 0; y < ny; y++) {
      const crossings: { x: number; rise: boolean }[] = [];
      const tangent = (y / ny - 0.5) * H;
      let prev = sample(W / 2 - (W / 2) * ca - tangent * sa, H / 2 - (W / 2) * sa + tangent * ca);
      for (let x = 1; x <= nx; x++) {
        const normal = (x / nx - 0.5) * W;
        const next = sample(W / 2 + normal * ca - tangent * sa, H / 2 + normal * sa + tangent * ca);
        if ((prev < 0 && next >= 0) || (prev >= 0 && next < 0)) {
          crossings.push({ x: (x - 1 + prev / (prev - next)) * dxNm, rise: next > prev });
        }
        prev = next;
      }
      const rising = crossings.filter((p) => p.rise).map((p) => p.x);
      if (rising.length) rows.push(rising);
      for (let i = 1; i < rising.length; i++) pitches.push(rising[i] - rising[i - 1]);
      if (periodicCut && rising.length) pitches.push(W - rising[rising.length - 1] + rising[0]);
      for (let i = 0; i < crossings.length; i++) {
        const next = crossings[i + 1] ?? (periodicCut ? crossings[0] : undefined);
        if (crossings[i].rise && next && !next.rise) {
          widths.push(next.x - crossings[i].x + (i === crossings.length - 1 ? W : 0));
        }
      }
    }
    const deviations: number[] = [];
    const nEdges = rows[0]?.length ?? 0;
    for (let e = 0; e < nEdges; e++) {
      const values = rows.filter((row) => row.length === nEdges).map((row) => row[e]);
      const center = mean(values);
      deviations.push(...values.map((v) => v - center));
    }
    const resolved = widths.length >= ny / 2 && pitches.length > 0;
    const expected = Math.max(1, W / (targetGuidePitch / multiplication));
    const actual = mean(rows.map((row) => row.length));
    return {
      ...empty,
      cdNm: mean(widths),
      pitchNm: mean(pitches),
      lerNm: 3 * std(deviations),
      lcduNm: 3 * std(widths),
      circularityLoss: 0,
      missing: Math.min(3, Math.abs(actual - expected) / expected + (ny - rows.length) / ny),
      nDomains: Math.round(actual),
      resolved,
    };
  }

  const sign = cfg.f > 0.58 ? -1 : 1;
  const seen = new Uint8Array(nx * ny);
  const domains: { x: number; y: number; cd: number; ellipse: number }[] = [];
  for (let start = 0; start < phi.length; start++) {
    if (seen[start] || sign * phi[start] <= 0) continue;
    const stack = [start],
      px: number[] = [],
      py: number[] = [];
    const coordinates = new Map<number, [number, number]>([
      [start, [start % nx, Math.floor(start / nx)]],
    ]);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!,
        [ux, uy] = coordinates.get(p)!;
      px.push(ux * dxNm);
      py.push(uy * dyNm);
      const x = p % nx,
        y = Math.floor(p / nx);
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const q = ((y + oy + ny) % ny) * nx + ((x + ox + nx) % nx);
        if (!seen[q] && sign * phi[q] > 0) {
          seen[q] = 1;
          stack.push(q);
          coordinates.set(q, [ux + ox, uy + oy]);
        }
      }
    }
    if (px.length < 4 || px.length > phi.length * 0.45) continue;
    const x = mean(px),
      y = mean(py);
    let xx = 0,
      yy = 0,
      xy = 0;
    for (let i = 0; i < px.length; i++) {
      xx += (px[i] - x) ** 2;
      yy += (py[i] - y) ** 2;
      xy += (px[i] - x) * (py[i] - y);
    }
    xx /= px.length;
    yy /= px.length;
    xy /= px.length;
    const disc = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy));
    const major = Math.sqrt(Math.max(0, (xx + yy + disc) / 2));
    const minor = Math.sqrt(Math.max(0, (xx + yy - disc) / 2));
    if (minor <= 0 || major / minor > 5) continue;
    domains.push({
      x: ((x % W) + W) % W,
      y: ((y % H) + H) % H,
      cd: 2 * Math.sqrt((px.length * dxNm * dyNm) / Math.PI),
      ellipse: (1 - minor / major) ** 2,
    });
  }
  const nearest = domains
    .map((a, i) => {
      let nearest = Infinity;
      for (let j = 0; j < domains.length; j++)
        if (i !== j) {
          const b = domains[j],
            x = Math.abs(a.x - b.x),
            y = Math.abs(a.y - b.y);
          nearest = Math.min(nearest, Math.hypot(Math.min(x, W - x), Math.min(y, H - y)));
        }
      return nearest;
    })
    .filter(Number.isFinite);
  // Match the zero-origin lattice used by buildGuideField, with periodic
  // distances and one-to-one greedy assignment to avoid duplicate matches.
  const rowHeight = targetGuidePitch * (mode === "holes" && cfg.f < 0.42 ? Math.sqrt(3) / 2 : 1);
  const sites: { x: number; y: number }[] = [];
  for (let row = 0; row * rowHeight < H - 1e-8; row++) {
    const offset = mode === "holes" && cfg.f < 0.42 && row % 2 ? targetGuidePitch / 2 : 0;
    for (let col = 0; col * targetGuidePitch + offset < W - 1e-8; col++) {
      const cx = col * targetGuidePitch + offset - cfg.guide.overlayNm;
      const shifts = mode === "via-pair" ? [-configPair(cfg) / 2, configPair(cfg) / 2] : [0];
      for (const shift of shifts)
        sites.push({ x: (((cx + shift) % W) + W) % W, y: row * rowHeight });
    }
  }
  const pairs: { domain: number; site: number; distance: number }[] = [];
  domains.forEach((a, domain) =>
    sites.forEach((b, site) => {
      const x = Math.abs(a.x + dxNm / 2 - b.x),
        y = Math.abs(a.y + dyNm / 2 - b.y);
      pairs.push({
        domain,
        site,
        distance: Math.hypot(Math.min(x, Math.abs(W - x)), Math.min(y, Math.abs(H - y))),
      });
    }),
  );
  pairs.sort((a, b) => a.distance - b.distance);
  const matchedDomains = new Set<number>(),
    matchedSites = new Set<number>(),
    placement: number[] = [];
  for (const pair of pairs)
    if (!matchedDomains.has(pair.domain) && !matchedSites.has(pair.site)) {
      matchedDomains.add(pair.domain);
      matchedSites.add(pair.site);
      placement.push(pair.distance);
    }
  const expected = Math.max(1, sites.length);
  return {
    ...empty,
    cdNm: mean(domains.map((d) => d.cd)),
    pitchNm: mean(nearest),
    lcduNm: 3 * std(domains.map((d) => d.cd)),
    circularityLoss: domains.length ? mean(domains.map((d) => d.ellipse)) : 1,
    ppeNm: Math.sqrt(mean(placement.map((d) => d * d))),
    missing: Math.min(3, Math.abs(domains.length - expected) / expected),
    nDomains: domains.length,
    resolved: domains.length >= 2 && nearest.length >= 2,
  };
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function std(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
function configPair(cfg: SimConfig) {
  return Math.max(cfg.guide.pairNm || cfg.L0Nm * 1.35, cfg.L0Nm * 0.8);
}
