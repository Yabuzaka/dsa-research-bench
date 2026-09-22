import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WindowCell, WindowKind } from "@/lib/dsa/process-window";
import type { SimConfig } from "@/lib/dsa/types";

const KINDS: {
  id: WindowKind;
  title: string;
  axis: string;
  row: string;
  short: string;
  blurb: string;
  metric: "defect" | "repair" | "rect";
}[] = [
  {
    id: "cd",
    title: "Guide CD / L0  ×  χN",
    axis: "CD/L0",
    row: "χN",
    short: "Guide CD",
    blurb:
      "Maekawa 2025 300 mm window: dislocation-free sub-10 nm HP when PS-guide CD sits in ~0.57–1.0 L0 at 3× Ls. Colour is defect index.",
    metric: "defect",
  },
  {
    id: "ls",
    title: "Ls / L0  ×  χN",
    axis: "Ls/L0",
    row: "χN",
    short: "Pitch",
    blurb: "Commensurability islands at integer density multiplication.",
    metric: "defect",
  },
  {
    id: "kinetic",
    title: "T (K)  ×  χN",
    axis: "T (K)",
    row: "χN",
    short: "Anneal T",
    blurb:
      "High-χ kinetic trap vs anneal temperature. MRS 2025: 310 °C (583 K) annihilates dislocations in PS-b-PMMA; high-χ needs still more budget — or microwave.",
    metric: "defect",
  },
  {
    id: "contrast",
    title: "Ls / L0  ×  h0",
    axis: "Ls/L0",
    row: "h0",
    short: "Contrast h0",
    blurb:
      "MRS Commun. 2025: raising chemical contrast of the PS-guide stripe opens the commensurability window from essentially 0% to about ±10% in Ls/L0.",
    metric: "defect",
  },
  {
    id: "tls",
    title: "Ls / L0  ×  T",
    axis: "Ls/L0",
    row: "T (K)",
    short: "T vs pitch",
    blurb:
      "Maekawa 2025 5× DSA: the process window expands and shifts toward lower Ls as T rises because L0 contracts and the correlation length grows.",
    metric: "defect",
  },
  {
    id: "repair",
    title: "Overlay (nm)  ×  χN",
    axis: "overlay",
    row: "χN",
    short: "Overlay",
    blurb:
      "ACS 2026 sequential energy pathway. Rigid overlay of the chemo stripe; colour is repairability of the free surface (1 = healed).",
    metric: "repair",
  },
  {
    id: "dose",
    title: "EUV dose (mJ/cm²)  ×  χN",
    axis: "dose",
    row: "χN",
    short: "EUV dose",
    blurb:
      "Shot-noise LER ∝ dose^{−1/2} imprinted on 1:1 guides. Colour is DSA rectification (guide LER / DSA LER). SPIE 2026 24 nm 1:1 / imec P24.",
    metric: "rect",
  },
];

export function WindowPanel({
  config,
  worker,
}: {
  config: SimConfig;
  worker: Worker | null;
}) {
  const [kind, setKind] = useState<WindowKind>("cd");
  const [cells, setCells] = useState<WindowCell[] | null>(null);
  const [busy, setBusy] = useState(false);
  const meta = KINDS.find((k) => k.id === kind)!;

  function run() {
    if (!worker) return;
    setBusy(true);
    setCells(null);
    const onMsg = (ev: MessageEvent<{ type: string; cells?: WindowCell[] }>) => {
      if (ev.data.type === "window" && ev.data.cells) {
        setCells(ev.data.cells);
        setBusy(false);
        worker.removeEventListener("message", onMsg);
      }
    };
    worker.addEventListener("message", onMsg);
    worker.postMessage({ type: "window", config, kind });
  }

  const xVals = [...new Set((cells ?? []).map((c) => c.x))].sort((a, b) => a - b);
  const chiVals = [...new Set((cells ?? []).map((c) => c.chiN))].sort((a, b) => a - b);
  const intAxis = kind === "kinetic" || kind === "dose" || kind === "repair" || kind === "tls";

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal">Process window</p>
      <h1 className="font-display mt-2 text-3xl font-extrabold">{meta.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{meta.blurb}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Button
            key={k.id}
            size="sm"
            variant={kind === k.id ? "default" : "outline"}
            onClick={() => {
              setKind(k.id);
              setCells(null);
            }}
          >
            {k.short}
          </Button>
        ))}
        <Button onClick={run} disabled={busy || !worker}>
          {busy ? "Annealing map…" : "Run window map"}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-pass" />{" "}
          {meta.metric === "defect" ? "defect-free" : meta.metric === "rect" ? "strong rectification" : "healed"}
        </span>
        <span className="inline-flex h-3 w-16 overflow-hidden rounded-sm">
          <span className="h-full flex-1 bg-pass" />
          <span className="h-full flex-1 bg-brush" />
          <span className="h-full flex-1 bg-accent" />
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-accent" />{" "}
          {meta.metric === "defect" ? "dislocations" : "weak"}
        </span>
      </div>

      {cells && (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <th className="p-1 text-left font-mono text-xs font-normal text-muted">
                  {meta.row} \ {meta.axis}
                </th>
                {xVals.map((v) => (
                  <th
                    key={v}
                    className="p-1 font-mono text-xs font-normal text-muted tabular-nums"
                  >
                    {intAxis && kind !== "tls" ? v.toFixed(0) : v.toFixed(2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chiVals.map((chi) => (
                <tr key={chi}>
                  <th className="p-1 text-left font-mono text-xs font-normal text-muted tabular-nums">
                    {kind === "tls" ? chi.toFixed(0) : chi.toFixed(kind === "contrast" ? 2 : 0)}
                  </th>
                  {xVals.map((x) => {
                    const cell = cells.find((c) => c.chiN === chi && c.x === x);
                    const value =
                      meta.metric === "repair"
                        ? cell?.repairability ?? 0
                        : meta.metric === "rect"
                          ? cell?.rectification ?? 1
                          : cell?.defectIndex ?? 1;
                    const t =
                      meta.metric === "defect"
                        ? Math.min(1, Math.max(0, value))
                        : meta.metric === "rect"
                          ? 1 - Math.min(1, Math.max(0, (value - 0.8) / 0.8))
                          : 1 - Math.min(1, Math.max(0, value));
                    const { bg, fg } = heatTone(t);
                    return (
                      <td key={`${chi}-${x}`} className="p-1">
                        <div
                          className="flex h-12 items-center justify-center rounded-sm font-mono text-xs tabular-nums"
                          style={{ background: bg, color: fg }}
                          title={`order ${cell?.order.toFixed(2)} dx ${cell?.dislocations} rect ${cell?.rectification.toFixed(2)} R ${cell?.repairability.toFixed(2)}`}
                        >
                          {value.toFixed(2)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            {meta.metric === "repair"
              ? "Cells: repairability (1 = free surface healed the template defect)."
              : meta.metric === "rect"
                ? "Cells: LER rectification. Hover for dislocations and dose-saving."
                : "Cells: defect index. Hover for dislocations and LER rectification."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Maekawa-style window: green island → gold fringe → crimson defects. t=0 good, t=1 bad. */
function heatTone(t: number): { bg: string; fg: string } {
  const stops: [number, number, number][] = [
    [27, 122, 78],
    [212, 160, 23],
    [208, 18, 58],
  ];
  const u = Math.min(1, Math.max(0, t));
  const x = u * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const r = stops[i][0] + (stops[i + 1][0] - stops[i][0]) * f;
  const g = stops[i][1] + (stops[i + 1][1] - stops[i][1]) * f;
  const b = stops[i][2] + (stops[i + 1][2] - stops[i][2]) * f;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return {
    bg: `rgb(${r | 0} ${g | 0} ${b | 0})`,
    fg: luma > 140 ? "#122033" : "#f3fff8",
  };
}
