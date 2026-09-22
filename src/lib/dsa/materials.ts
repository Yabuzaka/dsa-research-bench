export type Morphology = "lamellar" | "cylindrical" | "spherical";

export type BcpMaterial = {
  id: string;
  name: string;
  short: string;
  blockA: string;
  blockB: string;
  chiN: number;
  f: number;
  N: number;
  L0Nm: number;
  TAnnealK: number;
  morphology: Morphology;
  note: string;
  refs: string;
};

export const MATERIALS: BcpMaterial[] = [
  {
    id: "ps-pmma-28",
    name: "PS-b-PMMA 25/25",
    short: "PS-PMMA",
    blockA: "PS",
    blockB: "PMMA",
    chiN: 18.5,
    f: 0.5,
    N: 480,
    L0Nm: 28,
    TAnnealK: 523,
    morphology: "lamellar",
    note: "Workhorse 193/EUV DSA pair. Chemoepitaxy 2x/3x LiNe flow.",
    refs: "Nealey, Stoykovich, Liu (LiNe); IRDS DSA",
  },
  {
    id: "ps-pmma-cyl",
    name: "PS-b-PMMA cylinder 70/30",
    short: "PS-PMMA cyl",
    blockA: "PMMA",
    blockB: "PS",
    chiN: 22,
    f: 0.3,
    N: 520,
    L0Nm: 32,
    TAnnealK: 523,
    morphology: "cylindrical",
    note: "PMMA cylinders in PS for contact-hole shrink / via multiplication.",
    refs: "Ross, Black; TEL DSA contacts",
  },
  {
    id: "ps-pgfm",
    name: "PS-b-PGFM (higher-chi PMMA)",
    short: "PS-PGFM",
    blockA: "PS",
    blockB: "PGFM",
    chiN: 32,
    f: 0.5,
    N: 260,
    L0Nm: 16.6,
    TAnnealK: 523,
    morphology: "lamellar",
    note: "Maekawa et al. Adv. Funct. Mater. 2025. 300 mm, sub-10 nm HP.",
    refs: "Maekawa 2025 AFM; 300 mm DSA",
  },
];

export function materialById(id: string) {
  return MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
}
