/**
 * Field palettes taken from DSA paper figures, keyed by chemistry.
 *
 * Paper (default): schematic colours used in the chemistry's literature.
 *   PS-b-PMMA  — Nealey / Sibener Nano Lett. 2017: PS red, PMMA blue,
 *                PS-OH dark red, random brush gold, Si gray.
 *   PS-b-PDMS  — Ross-group schematics: PS charcoal, PDMS gold (SiOx).
 *   PS-b-P2VP  — pyridine block violet, PS orange-red.
 *   Si-BCP     — organic amber, Si-rich teal.
 *   P4ClS-PMA  — chlorostyrene brick, PMA seafoam.
 *   PS-b-PGFM  — PS red, fluorinated PMMA cyan (Maekawa 2024/25).
 *   A-b-(B-r-C)— MRS Commun. 2025: nonpolar red, polar blue.
 * AFM: tapping-mode gold. Bright = remaining / high-modulus block.
 * TEM: RuO4 stain. Dark = stained block (PS, P2VP, organic).
 * Etch: after selective removal. Remaining mask bright on dark.
 */

export type FieldLook = "paper" | "afm" | "tem" | "etch";

export type LookFamily =
  | "pspmma"
  | "pspdms"
  | "psp2vp"
  | "sibcp"
  | "p4cls"
  | "pgfm"
  | "abc";

export type Rgb = [number, number, number];

export type LookPalette = {
  id: FieldLook;
  family: LookFamily;
  title: string;
  blurb: string;
  ps: Rgb; // φ = +1 (block A)
  pmma: Rgb; // φ = −1 (block B)
  mid: Rgb;
  brush: Rgb;
  guide: Rgb;
  wall: Rgb;
  psLabel: string;
  pmmaLabel: string;
  guideLabel: string;
  brushLabel: string;
  etchKeepA: boolean;
};

export const LOOK_META: Record<FieldLook, { title: string; blurb: string }> = {
  paper: {
    title: "Paper",
    blurb: "Schematic colours from that chemistry's literature figures.",
  },
  afm: {
    title: "AFM",
    blurb: "Tapping-mode gold. Bright = remaining / high-modulus block.",
  },
  tem: {
    title: "TEM",
    blurb: "RuO₄ stain. Dark = stained block (PS, P2VP, organic).",
  },
  etch: {
    title: "Etch",
    blurb: "After selective removal. Remaining mask bright on dark.",
  },
};

export const LOOK_IDS = Object.keys(LOOK_META) as FieldLook[];

type FamilySpec = {
  aName: string;
  bName: string;
  a: Rgb;
  b: Rgb;
  mid: Rgb;
  brush: Rgb;
  guide: Rgb;
  wall: Rgb;
  guideLabel: string;
  brushLabel: string;
  aTone: string;
  bTone: string;
  stainA: boolean;
  etchKeepA: boolean;
};

/** Schematic RGB taken from published figure keys, not from the bench chrome. */
const FAMILIES: Record<LookFamily, FamilySpec> = {
  pspmma: {
    aName: "PS",
    bName: "PMMA",
    a: [198, 40, 40],
    b: [21, 101, 192],
    mid: [236, 230, 214],
    brush: [212, 160, 23],
    guide: [139, 30, 45],
    wall: [74, 85, 96],
    guideLabel: "PS-OH",
    brushLabel: "neutral brush",
    aTone: "red",
    bTone: "blue",
    stainA: true,
    etchKeepA: true,
  },
  pspdms: {
    aName: "PS",
    bName: "PDMS",
    a: [52, 58, 72],
    b: [218, 168, 32],
    mid: [140, 118, 72],
    brush: [96, 102, 112],
    guide: [32, 36, 44],
    wall: [70, 74, 80],
    guideLabel: "PS guide",
    brushLabel: "neutral",
    aTone: "charcoal",
    bTone: "gold",
    stainA: true,
    etchKeepA: false,
  },
  psp2vp: {
    aName: "PS",
    bName: "P2VP",
    a: [196, 72, 36],
    b: [88, 52, 148],
    mid: [220, 206, 196],
    brush: [196, 148, 48],
    guide: [132, 40, 28],
    wall: [74, 85, 96],
    guideLabel: "PS-OH",
    brushLabel: "neutral brush",
    aTone: "orange",
    bTone: "violet",
    stainA: false,
    etchKeepA: true,
  },
  sibcp: {
    aName: "organic",
    bName: "Si-rich",
    a: [196, 96, 28],
    b: [16, 140, 148],
    mid: [210, 196, 168],
    brush: [180, 140, 48],
    guide: [120, 56, 20],
    wall: [74, 85, 96],
    guideLabel: "organic guide",
    brushLabel: "neutral",
    aTone: "amber",
    bTone: "teal",
    stainA: true,
    etchKeepA: false,
  },
  p4cls: {
    aName: "P4ClS",
    bName: "PMA",
    a: [160, 32, 40],
    b: [20, 140, 124],
    mid: [228, 220, 200],
    brush: [196, 148, 48],
    guide: [112, 24, 32],
    wall: [74, 85, 96],
    guideLabel: "P4ClS guide",
    brushLabel: "neutral brush",
    aTone: "brick",
    bTone: "seafoam",
    stainA: true,
    etchKeepA: true,
  },
  pgfm: {
    aName: "PS",
    bName: "PGFM",
    a: [198, 40, 40],
    b: [0, 140, 176],
    mid: [236, 230, 214],
    brush: [212, 160, 23],
    guide: [139, 30, 45],
    wall: [74, 85, 96],
    guideLabel: "PS-OH",
    brushLabel: "neutral brush",
    aTone: "red",
    bTone: "cyan",
    stainA: true,
    etchKeepA: true,
  },
  abc: {
    aName: "A",
    bName: "B-r-C",
    a: [196, 36, 36],
    b: [24, 92, 176],
    mid: [232, 224, 208],
    brush: [196, 148, 48],
    guide: [120, 28, 36],
    wall: [74, 85, 96],
    guideLabel: "A-wet",
    brushLabel: "neutral",
    aTone: "red",
    bTone: "blue",
    stainA: true,
    etchKeepA: true,
  },
};

export function familyFromMaterial(id: string): LookFamily {
  if (id.includes("pdms")) return "pspdms";
  if (id.includes("p2vp")) return "psp2vp";
  if (id.includes("si-bcp") || id.includes("hchi")) return "sibcp";
  if (id.includes("p4cls")) return "p4cls";
  if (id.includes("pgfm")) return "pgfm";
  if (id.includes("abc")) return "abc";
  return "pspmma";
}

export function paletteFor(look: FieldLook = "paper", family: LookFamily = "pspmma"): LookPalette {
  const spec = FAMILIES[family] ?? FAMILIES.pspmma;
  const meta = LOOK_META[look] ?? LOOK_META.paper;
  if (look === "afm") {
    const dark: Rgb = [42, 28, 14];
    return {
      id: "afm",
      family,
      title: meta.title,
      blurb: `${meta.blurb} ${spec.etchKeepA ? spec.aName : spec.bName} bright.`,
      ps: spec.etchKeepA ? [236, 201, 96] : dark,
      pmma: spec.etchKeepA ? dark : [236, 201, 96],
      mid: [156, 102, 36],
      brush: spec.brush,
      guide: spec.guide,
      wall: [28, 22, 16],
      psLabel: `${spec.aName} ${spec.etchKeepA ? "gold" : "dark"}`,
      pmmaLabel: `${spec.bName} ${spec.etchKeepA ? "dark" : "gold"}`,
      guideLabel: spec.guideLabel,
      brushLabel: spec.brushLabel,
      etchKeepA: spec.etchKeepA,
    };
  }
  if (look === "tem") {
    const dark: Rgb = [32, 24, 18];
    const light: Rgb = [236, 228, 208];
    const aDark = spec.stainA;
    return {
      id: "tem",
      family,
      title: meta.title,
      blurb: `${meta.blurb} ${aDark ? spec.aName : spec.bName} stained dark.`,
      ps: aDark ? dark : light,
      pmma: aDark ? light : dark,
      mid: [148, 128, 104],
      brush: spec.brush,
      guide: spec.guide,
      wall: [60, 56, 52],
      psLabel: `${spec.aName} ${aDark ? "dark" : "bright"}`,
      pmmaLabel: `${spec.bName} ${aDark ? "bright" : "dark"}`,
      guideLabel: spec.guideLabel,
      brushLabel: spec.brushLabel,
      etchKeepA: spec.etchKeepA,
    };
  }
  if (look === "etch") {
    const keep: Rgb = [232, 228, 220];
    const gone: Rgb = [22, 24, 28];
    return {
      id: "etch",
      family,
      title: meta.title,
      blurb: `${meta.blurb} ${spec.etchKeepA ? spec.aName : spec.bName} remains.`,
      ps: spec.etchKeepA ? keep : gone,
      pmma: spec.etchKeepA ? gone : keep,
      mid: [88, 90, 96],
      brush: spec.brush,
      guide: spec.guide,
      wall: [18, 20, 24],
      psLabel: `${spec.aName} ${spec.etchKeepA ? "mask" : "removed"}`,
      pmmaLabel: `${spec.bName} ${spec.etchKeepA ? "removed" : "mask"}`,
      guideLabel: spec.guideLabel,
      brushLabel: spec.brushLabel,
      etchKeepA: spec.etchKeepA,
    };
  }
  return {
    id: "paper",
    family,
    title: meta.title,
    blurb: `${spec.aName} ${spec.aTone}, ${spec.bName} ${spec.bTone}. ${spec.guideLabel} / ${spec.brushLabel}.`,
    ps: spec.a,
    pmma: spec.b,
    mid: spec.mid,
    brush: spec.brush,
    guide: spec.guide,
    wall: spec.wall,
    psLabel: `${spec.aName} ${spec.aTone}`,
    pmmaLabel: `${spec.bName} ${spec.bTone}`,
    guideLabel: spec.guideLabel,
    brushLabel: spec.brushLabel,
    etchKeepA: spec.etchKeepA,
  };
}

/** Default (PS-b-PMMA) palettes — used when family is omitted. */
export const LOOKS: Record<FieldLook, LookPalette> = {
  paper: paletteFor("paper", "pspmma"),
  afm: paletteFor("afm", "pspmma"),
  tem: paletteFor("tem", "pspmma"),
  etch: paletteFor("etch", "pspmma"),
};

export function colorizePhi(
  phi: Float32Array,
  mask: Uint8Array,
  look: FieldLook = "paper",
  family: LookFamily = "pspmma",
): Uint8ClampedArray {
  const pal = paletteFor(look, family);
  const rgba = new Uint8ClampedArray(phi.length * 4);
  const [ar, ag, ab] = pal.pmma;
  const [br, bg, bb] = pal.ps;
  const [mr, mg, mb] = pal.mid;
  const [wr, wg, wb] = pal.wall;
  const binary = look === "etch";
  for (let i = 0; i < phi.length; i++) {
    const o = i * 4;
    if (!mask[i]) {
      rgba[o] = wr;
      rgba[o + 1] = wg;
      rgba[o + 2] = wb;
      rgba[o + 3] = 255;
      continue;
    }
    if (binary) {
      const [kr, kg, kb] = phi[i] >= 0 ? pal.ps : pal.pmma;
      rgba[o] = kr;
      rgba[o + 1] = kg;
      rgba[o + 2] = kb;
      rgba[o + 3] = 255;
      continue;
    }
    const t = clamp((phi[i] + 1) * 0.5, 0, 1);
    const s = t * t * (3 - 2 * t);
    const lo = s < 0.5 ? s * 2 : 1;
    const hi = s < 0.5 ? 0 : (s - 0.5) * 2;
    rgba[o] = (ar + (mr - ar) * lo + (br - mr) * hi) | 0;
    rgba[o + 1] = (ag + (mg - ag) * lo + (bg - mg) * hi) | 0;
    rgba[o + 2] = (ab + (mb - ab) * lo + (bb - mb) * hi) | 0;
    rgba[o + 3] = 255;
  }
  return rgba;
}

export function overlayRgba(
  look: FieldLook,
  kind: "brush" | "guide" | "stitch",
  family: LookFamily = "pspmma",
  alpha?: number,
) {
  const pal = paletteFor(look, family);
  if (kind === "brush") {
    const a = alpha ?? 0.92;
    return `rgba(${pal.brush[0]},${pal.brush[1]},${pal.brush[2]},${a})`;
  }
  if (kind === "guide") {
    const a = alpha ?? 0.92;
    return `rgba(${pal.guide[0]},${pal.guide[1]},${pal.guide[2]},${a})`;
  }
  return `rgba(${pal.ps[0]},${pal.ps[1]},${pal.ps[2]},0.7)`;
}

export function cssRgb(rgb: Rgb) {
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

/** Nice scale-bar length in nm for a square FOV. */
export function niceScaleBarNm(fovNm: number) {
  const target = fovNm * 0.22;
  const steps = [10, 20, 25, 50, 100, 200, 250, 500];
  let best = steps[0];
  for (const s of steps) {
    if (Math.abs(s - target) < Math.abs(best - target)) best = s;
  }
  return Math.min(best, Math.max(8, fovNm * 0.45));
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
