import { DEFAULT_BENCH, type BenchInput } from "@/lib/tmd/physics";
import { DEFAULT_CONFIG, type SimConfig } from "@/lib/dsa/types";
import type { FieldLook } from "@/lib/dsa/looks";

export type LabId = "dsa" | "tmd";
export type DsaTab = "assemble" | "window" | "repair" | "inverse" | "transfer" | "theory";
export type TmdTab = "bench" | "materials" | "context";

export type Persisted = {
  lab: LabId;
  dsaTab: DsaTab;
  tmdTab: TmdTab;
  presetId: string;
  materialId: string;
  config: SimConfig;
  bench: BenchInput;
  look: FieldLook;
  explainHover: boolean;
};

const KEY = "dsa-bench-local-v8";

const TMD_TABS: TmdTab[] = ["bench", "materials", "context"];
const DSA_TABS: DsaTab[] = ["assemble", "window", "repair", "inverse", "transfer", "theory"];
const LOOKS: FieldLook[] = ["paper", "afm", "tem", "etch"];

export const DEFAULT_PERSIST: Persisted = {
  lab: "dsa",
  dsaTab: "assemble",
  tmdTab: "bench",
  presetId: "line-2x",
  materialId: "ps-pmma-28",
  config: DEFAULT_CONFIG,
  bench: DEFAULT_BENCH,
  look: "paper",
  explainHover: true,
};

function coerceTmdTab(raw: unknown): TmdTab {
  if (typeof raw === "string" && (TMD_TABS as string[]).includes(raw)) return raw as TmdTab;
  if (raw === "why" || raw === "limits" || raw === "roadmap") return "context";
  return "bench";
}

function coerceDsaTab(raw: unknown): DsaTab {
  if (typeof raw === "string" && (DSA_TABS as string[]).includes(raw)) return raw as DsaTab;
  return "assemble";
}

function coerceLook(raw: unknown): FieldLook {
  if (raw === "lab") return "paper";
  if (typeof raw === "string" && (LOOKS as string[]).includes(raw)) return raw as FieldLook;
  return "paper";
}

export function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(KEY) ??
      window.localStorage.getItem("dsa-bench-local-v7") ??
      window.localStorage.getItem("dsa-bench-local-v6") ??
      window.localStorage.getItem("dsa-bench-local-v5");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      ...DEFAULT_PERSIST,
      ...parsed,
      dsaTab: coerceDsaTab(parsed.dsaTab),
      tmdTab: coerceTmdTab(parsed.tmdTab),
      look: coerceLook(parsed.look),
      explainHover: parsed.explainHover !== false,
      config: {
        ...DEFAULT_CONFIG,
        ...parsed.config,
        guide: { ...DEFAULT_CONFIG.guide, ...parsed.config?.guide },
      },
      bench: { ...DEFAULT_BENCH, ...parsed.bench },
    };
  } catch {
    return null;
  }
}

export function savePersisted(state: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}
