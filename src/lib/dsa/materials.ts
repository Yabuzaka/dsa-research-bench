export type Morphology = "lamellar" | "cylindrical" | "spherical";

export type BcpMaterial = {
  id: string;
  name: string;
  short: string;
  blockA: string;
  blockB: string;
  /** Typical χN at 180 °C anneal for the listed N. */
  chiN: number;
  /** Volume fraction of A (φ = +1 domain). */
  f: number;
  /** Degree of polymerization. */
  N: number;
  /** Natural period from SAXS-typical values, nm. */
  L0Nm: number;
  /** Glass / anneal temperature, K. */
  TAnnealK: number;
  morphology: Morphology;
  note: string;
  refs: string;
};

export const MATERIALS: BcpMaterial[] = [
  {
    id: "ps-pmma-28",
    name: "PS-b-PMMA 25/25",
    short: "PS–PMMA",
    blockA: "PS",
    blockB: "PMMA",
    chiN: 18.5,
    f: 0.5,
    N: 480,
    L0Nm: 28,
    TAnnealK: 523,
    morphology: "lamellar",
    note: "Workhorse 193/EUV DSA pair. χ is modest; floor near 22–28 nm L0. Chemoepitaxy 2×/3× LiNe flow.",
    refs: "Nealey, Stoykovich, Liu (LiNe); IRDS DSA",
  },
  {
    id: "ps-pmma-cyl",
    name: "PS-b-PMMA cylinder 70/30",
    short: "PS–PMMA cyl",
    blockA: "PMMA",
    blockB: "PS",
    chiN: 22,
    f: 0.3,
    N: 520,
    L0Nm: 32,
    TAnnealK: 523,
    morphology: "cylindrical",
    note: "PMMA cylinders in PS for contact-hole shrink / via multiplication after PMMA wet etch.",
    refs: "Ross, Black; TEL DSA contacts",
  },
  {
    id: "ps-p2vp",
    name: "PS-b-P2VP high-χ",
    short: "PS–P2VP",
    blockA: "PS",
    blockB: "P2VP",
    chiN: 38,
    f: 0.5,
    N: 220,
    L0Nm: 16,
    TAnnealK: 473,
    morphology: "lamellar",
    note: "High-χ enables sub-20 nm L0. Stronger defect penalty, slower annealing, tighter commensurability.",
    refs: "Bates, Hillmyer; IMEC high-χ DSA",
  },
  {
    id: "si-bcp",
    name: "Si-containing high-χ BCP",
    short: "Si-BCP",
    blockA: "organic",
    blockB: "Si-block",
    chiN: 52,
    f: 0.5,
    N: 140,
    L0Nm: 11,
    TAnnealK: 453,
    morphology: "lamellar",
    note: "Silicon etch contrast for sub-10 nm half-pitch metal / fin-like lines. Target for angstrom-era M0.",
    refs: "Willson, Gourdin; IMEC/TEL Si-BCP",
  },
  {
    id: "ps-pdms",
    name: "PS-b-PDMS",
    short: "PS–PDMS",
    blockA: "PS",
    blockB: "PDMS",
    chiN: 45,
    f: 0.34,
    N: 180,
    L0Nm: 18,
    TAnnealK: 443,
    morphology: "cylindrical",
    note: "Strong etch contrast (PDMS oxidizes to silica). Used for fins and dense contact hex arrays.",
    refs: "Ross MIT; Aissou, Sinturel",
  },
  {
    id: "ps-pgfm",
    name: "PS-b-PGFM (higher-χ PMMA)",
    short: "PS–PGFM",
    blockA: "PS",
    blockB: "PGFM",
    chiN: 32,
    f: 0.5,
    N: 260,
    L0Nm: 16.6,
    TAnnealK: 523,
    morphology: "lamellar",
    note: "Maekawa et al. Adv. Funct. Mater. 2025. 300 mm, sub-10 nm HP, no topcoat. Defect-free when guide CD ≈ 0.57–1.0 L0.",
    refs: "Maekawa 2025 AFM; 300 mm DSA",
  },
  {
    id: "abc-euv",
    name: "A-b-(B-r-C) EUV BCP",
    short: "A–(B-r-C)",
    blockA: "A",
    blockB: "B-r-C",
    chiN: 36,
    f: 0.5,
    N: 120,
    L0Nm: 8,
    TAnnealK: 453,
    morphology: "lamellar",
    note: "MRS Commun. 2025. Decouples χ from surface energy γ so perpendicular lamellae are intrinsic. Target High-NA EUV pitches < 24 nm.",
    refs: "MRS Commun. 2025 EUV+DSA; IMEC High-NA DSA",
  },
  {
    id: "hchi-12",
    name: "High-χ C/Si 12 nm",
    short: "Hχ-12",
    blockA: "C-rich",
    blockB: "Si-rich",
    chiN: 40,
    f: 0.5,
    N: 160,
    L0Nm: 12,
    TAnnealK: 473,
    morphology: "lamellar",
    note: "Monreal et al. SPIE 2025. L0 = 12 nm. 24 nm 1:1 EUV rectification, 18 nm 5×, LWR 0.85 nm / LER 1.06 nm after polar-block etch.",
    refs: "Monreal SPIE 2025 134270F; Janes SPIE 2026 24 nm 1:1",
  },
  {
    id: "p4cls-pma",
    name: "P4ClS-b-PMA",
    short: "P4ClS–PMA",
    blockA: "P4ClS",
    blockB: "PMA",
    chiN: 28,
    f: 0.5,
    N: 190,
    L0Nm: 14.1,
    TAnnealK: 473,
    morphology: "lamellar",
    note: "ACS Appl. Nano Mater. 2025. Higher χ than PS-b-PMMA with matched γ, so perpendicular lamellae form on a neutral mat without a topcoat. 7× density multiplication, ~7.5 nm features.",
    refs: "ACS Appl. Nano Mater. 2025 8/48 22977",
  },
];

export function materialById(id: string) {
  return MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
}
