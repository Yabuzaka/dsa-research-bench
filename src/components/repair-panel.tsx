import { useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { TEMPLATE_DEFECT_LABELS } from "@/lib/dsa/guides";
import type { SepaReport } from "@/lib/dsa/sepa";
import type { SimConfig, TemplateDefect } from "@/lib/dsa/types";
import { cn } from "@/lib/utils";

const DEFECTS: TemplateDefect[] = [
  "missing-stripe",
  "broken-stripe",
  "cd-outlier",
  "overlay",
  "stitch",
];

export function RepairPanel({
  config,
  worker,
  onConfig,
}: {
  config: SimConfig;
  worker: Worker | null;
  onConfig: (c: SimConfig) => void;
}) {
  const [report, setReport] = useState<SepaReport | null>(null);
  const [busy, setBusy] = useState(false);

  function run() {
    if (!worker) return;
    setBusy(true);
    setReport(null);
    const onMsg = (ev: MessageEvent<{ type: string; report?: SepaReport }>) => {
      if (ev.data.type === "sepa" && ev.data.report) {
        setReport(ev.data.report);
        setBusy(false);
        worker.removeEventListener("message", onMsg);
      }
    };
    worker.addEventListener("message", onMsg);
    worker.postMessage({ type: "sepa", config });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
        Sequential energy pathway
      </p>
      <h1 className="font-display mt-2 text-3xl font-extrabold">
        Template defect repairability
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Layer-by-layer Ohta–Kawasaki with an exponentially screened guide field
        (ACS Appl. Polym. Mater. 2026). Each slice inherits morphology from the
        substrate. Negative ΔF and falling dislocations mean the free surface can
        heal a missing stripe, overlay error, or High-NA stitch seam. Positive ΔF
        with frozen dislocations is a kinetic trap.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {DEFECTS.map((d) => (
          <Button
            key={d}
            size="sm"
            variant={config.templateDefect === d ? "default" : "outline"}
            onClick={() =>
              onConfig({
                ...config,
                templateDefect: d,
                guide: {
                  ...config.guide,
                  overlayNm:
                    d === "overlay" || d === "stitch"
                      ? Math.max(config.guide.overlayNm, 3)
                      : config.guide.overlayNm,
                },
              })
            }
          >
            {TEMPLATE_DEFECT_LABELS[d]}
          </Button>
        ))}
        <Button onClick={run} disabled={busy || !worker}>
          {busy ? "Walking the stack…" : "Run SEPA"}
        </Button>
      </div>

      {report && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_240px]">
          <div className="h-64 rounded-md border border-border bg-surface p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.layers} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="zOverL0"
                  tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                  tickFormatter={(v: number) => `${v.toFixed(1)} L0`}
                />
                <YAxis hide domain={["auto", "auto"]} />
                <RTooltip
                  contentStyle={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="energy"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.15}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="dislocations"
                  stroke="var(--color-danger)"
                  fill="transparent"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <aside className="rounded-md border border-border bg-surface p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Verdict</p>
            <p
              className={cn(
                "mt-2 font-display text-2xl font-extrabold",
                report.repaired ? "text-good" : "text-danger",
              )}
            >
              {report.repaired ? "Repaired" : "Trapped"}
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-fg">
              R = {report.repairability.toFixed(2)}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              ΔF_total {report.deltaFTotal.toFixed(3)}
              {report.trappedAt != null
                ? ` · trap at z = ${report.trappedAt.toFixed(2)} L0`
                : " · downhill through the stack"}
              . Free energy in red, dislocation count as the second series.
            </p>
          </aside>
          <div className="overflow-x-auto lg:col-span-2">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="p-2 font-normal">z / L0</th>
                  <th className="p-2 font-normal">h decay</th>
                  <th className="p-2 font-normal">F</th>
                  <th className="p-2 font-normal">ΔF</th>
                  <th className="p-2 font-normal">order</th>
                  <th className="p-2 font-normal">dx</th>
                  <th className="p-2 font-normal">rect</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {report.layers.map((l) => (
                  <tr key={l.zOverL0} className="border-t border-border">
                    <td className="p-2">{l.zOverL0.toFixed(2)}</td>
                    <td className="p-2">{l.hDecay.toFixed(2)}</td>
                    <td className="p-2">{l.energy.toFixed(3)}</td>
                    <td className={cn("p-2", l.dF < 0 ? "text-good" : l.dF > 0.01 ? "text-danger" : "")}>
                      {l.dF.toFixed(3)}
                    </td>
                    <td className="p-2">{l.order.toFixed(2)}</td>
                    <td className="p-2">{l.dislocations}</td>
                    <td className="p-2">{l.rectification.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
