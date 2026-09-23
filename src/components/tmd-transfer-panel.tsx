import { Panel, Metric } from "@/components/kit";
import { transferOntoTmd } from "@/lib/dsa/tmd-transfer";
import type { GuideKind, Metrics, MorphClass } from "@/lib/dsa/types";
import { TMD_MATERIALS, tmdsIn } from "@/lib/tmd/materials";
import type { BenchInput } from "@/lib/tmd/physics";
import { cn } from "@/lib/utils";

export function TmdTransferPanel({
  metrics,
  guideKind,
  pitchNm,
  cdNm,
  bench,
  onBench,
}: {
  metrics: Metrics | null;
  guideKind: GuideKind;
  pitchNm: number;
  cdNm: number;
  bench: BenchInput;
  onBench: (b: BenchInput) => void;
}) {
  const fromField = metrics != null;
  const report = transferOntoTmd({
    morphology: (metrics?.morphology ?? "recipe") as MorphClass | "recipe",
    guideKind,
    pitchNm: fromField ? metrics.peakPitchNm || pitchNm : pitchNm,
    cdNm: fromField ? metrics.cdNm || cdNm : cdNm,
    etchLerNm: fromField ? metrics.etchLerNm : 1.3,
    residualNm: fromField ? metrics.residualNm : 0.4,
    materialId: bench.materialId,
  });
  const logic = tmdsIn("logic");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Panel>
        <p className="text-sm leading-relaxed text-muted" data-explain={report.note}>
          The polymer is the mask. This page estimates the ribbon or hole left in the TMD after that mask is etched.
          The sheet does not self-assemble.
        </p>
        <p className="mt-3 font-medium text-fg">{report.label}</p>
        <p className="mt-1 text-sm text-muted">{report.note}</p>
        {!fromField ? (
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted">
            Recipe estimate. Anneal in Chamber for a field.
          </p>
        ) : null}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted">Cut</p>
          <Metric k="Shape" v={report.kind} u="" hint="Ribbon from lines. Hole from contacts. Dot from cylinders." />
          <Metric k="Pitch" v={report.pitchNm.toFixed(1)} u="nm" hint="Period copied from the polymer, not from the TMD lattice." />
          <Metric k="Feature" v={report.featureNm.toFixed(1)} u="nm" hint="Remaining TMD width. Demos on MoS2 reach about 4 nm." />
          <Metric k="Edge" v={report.edgeNm.toFixed(2)} u="nm" hint="After-etch LER copied onto the sheet." />
          <Metric k="Skin" v={report.residualNm.toFixed(2)} u="nm" hint="Residual polymer. Thicker than ~3 nm blocks the etch." />
          <Metric
            k="Window"
            v={report.inDemonstratedRange ? "inside" : "outside"}
            u=""
            hint="Published BCP-on-MoS2 features are about 4–40 nm on a semiconducting sheet."
          />
        </Panel>
        <Panel>
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted">Sheet</p>
          <div className="flex flex-wrap gap-2">
            {logic.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onBench({ ...bench, materialId: m.id })}
                data-explain={`${m.formula}. Pattern transfer target. Not a polymer.`}
                className={cn(
                  "min-h-11 rounded-lg border px-3 py-2 text-left text-sm",
                  bench.materialId === m.id
                    ? "border-accent bg-elevated text-fg"
                    : "border-border bg-surface text-muted",
                )}
              >
                {m.formula}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Research sheets stay off this list. {TMD_MATERIALS.length - logic.length} of them are not logic channels.
          </p>
        </Panel>
      </div>
    </div>
  );
}
