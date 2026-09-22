import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, FlaskConical, Play, Square } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Slider, fmt } from "@/components/kit";
import {
  defaultInverseTarget,
  type InverseMode,
  type InverseProgress,
  type InverseReport,
  type InverseTarget,
  type InverseTrial,
} from "@/lib/dsa/inverse";
import { downloadInverseReport } from "@/lib/dsa/inverse-export";
import type { InverseWorkerRequest, InverseWorkerResponse } from "@/lib/dsa/inverse.worker";
import type { SimConfig } from "@/lib/dsa/types";
import { cn } from "@/lib/utils";

const MODES: { id: InverseMode; label: string }[] = [
  { id: "lamellar", label: "Lines" },
  { id: "holes", label: "Contact holes" },
  { id: "via-pair", label: "Via pairs" },
];
const QUALITY = {
  quick: { nx: 32, Ns: 32, maxIter: 64 },
  refined: { nx: 64, Ns: 56, maxIter: 160 },
};
const INPUT = "mt-2 h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg";
type RunStatus = "idle" | "running" | "error" | "stopped" | "completed";
type RunSnapshot = {
  config: SimConfig;
  target: InverseTarget;
  trials: number;
  initialTrials: number;
  seed: number;
  scft: typeof QUALITY.quick;
};

export function InversePanel({
  config,
  onApply,
}: {
  config: SimConfig;
  onApply: (config: SimConfig) => void;
}) {
  const [target, setTarget] = useState<InverseTarget>(() => defaultInverseTarget(config));
  const [composition, setComposition] = useState(Math.max(0.3, Math.min(0.7, config.f)));
  const [budget, setBudget] = useState(16);
  const [seed, setSeed] = useState(17);
  const [quality, setQuality] = useState<keyof typeof QUALITY>("quick");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<InverseProgress | null>(null);
  const [trials, setTrials] = useState<InverseTrial[]>([]);
  const [report, setReport] = useState<InverseReport | null>(null);
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef("");
  const runCounter = useRef(0);
  useEffect(
    () => () => {
      requestRef.current = "";
      workerRef.current?.terminate();
    },
    [],
  );

  function releaseWorker() {
    workerRef.current?.terminate();
    workerRef.current = null;
    requestRef.current = "";
  }
  function run() {
    releaseWorker();
    const settings: RunSnapshot = {
      config: { ...config, f: composition },
      target: { ...target },
      trials: budget,
      initialTrials: Math.min(6, Math.max(4, Math.floor(budget / 3))),
      seed,
      scft: QUALITY[quality],
    };
    setSnapshot(settings);
    setReport(null);
    setTrials([]);
    setProgress(null);
    setError("");
    setStatus("running");
    const requestId = `inverse-${Date.now()}-${++runCounter.current}`;
    requestRef.current = requestId;
    const fail = (message: string) => {
      if (requestRef.current !== requestId) return;
      releaseWorker();
      setError(message);
      setStatus("error");
    };
    try {
      const worker = new Worker(new URL("../lib/dsa/inverse.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<InverseWorkerResponse>) => {
        const message = event.data;
        if (message.requestId !== requestRef.current) return;
        if (message.type === "progress") {
          setProgress(message.progress);
          setTrials((previous) => [
            ...previous.filter((trial) => trial.id !== message.progress.latest.id),
            message.progress.latest,
          ]);
        } else if (message.type === "completed") {
          setReport(message.report);
          setTrials(message.report.trials);
          setStatus("completed");
          releaseWorker();
        } else fail(message.error);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail(event.message || "The search worker could not complete this run.");
      };
      worker.onmessageerror = () => fail("The search worker returned an unreadable result.");
      const request: InverseWorkerRequest = {
        type: "run-inverse",
        requestId,
        config: settings.config,
        target: settings.target,
        options: {
          trials: settings.trials,
          initialTrials: settings.initialTrials,
          seed: settings.seed,
          scft: settings.scft,
        },
      };
      worker.postMessage(request);
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : String(cause));
    }
  }
  function stop() {
    releaseWorker();
    setStatus("stopped");
  }

  const running = status === "running";
  const ranked = [...(report?.trials ?? trials)].sort((a, b) => a.loss - b.loss);
  const best = ranked.find((trial) => trial.scftStatus !== "failed");
  const history = report?.history ?? progress?.history ?? [];
  const total = snapshot?.trials ?? budget;
  const completed = ranked.length;
  const initialBest = history.filter((entry) => entry.phase === "initial").at(-1)?.bestLoss;
  const initialComplete = completed >= (snapshot?.initialTrials ?? 4);
  const gain =
    best && initialComplete && initialBest != null && initialBest > 0
      ? (1 - best.loss / initialBest) * 100
      : null;
  const converged = ranked.filter((trial) => trial.scftConverged).length;
  const partialReport: InverseReport | null =
    report ??
    (snapshot && ranked.length
      ? {
          method: "gp-ei-scft2d",
          target: snapshot.target,
          trials: ranked,
          best: best ?? ranked[0],
          nEval: ranked.length,
          history,
          seed: snapshot.seed,
          source:
            "Local single-diblock 2D SCFT with Matérn 5/2 Gaussian-process expected improvement; incomplete run. Fixed composition, temperature and natural period; no blend thermodynamics or thermal kinetics. Phi_A=0.5 interfaces; equilibrium field metrics, not stochastic process predictions.",
          settings: {
            trials: snapshot.trials,
            initialTrials: snapshot.initialTrials,
            scft: snapshot.scft,
            model: "single-diblock",
            multiplication:
              snapshot.target.mode === "lamellar"
                ? Math.max(1, Math.round(snapshot.config.guide.LsNm / snapshot.config.L0Nm))
                : 1,
          },
        }
      : null);
  const resultTarget = snapshot?.target ?? target;
  const guideCd = (trial: InverseTrial) =>
    resultTarget.mode === "lamellar" ? trial.guideCdNm : trial.holeNm;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-amber">
            Inverse design · SCFT + Bayesian search
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">Design toward a target.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Set the geometry. Evaluate an initial design, then let a Gaussian process propose the
            next recipe. Every candidate faces the same 2D SCFT objective.
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-xs text-muted">
          Runs locally in your browser
        </span>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <section className="panel min-w-0 p-5">
          <h2 className="font-display text-lg font-semibold">01 / Define the search</h2>
          <fieldset disabled={running} className="mt-5 min-w-0 space-y-5 disabled:opacity-60">
            <legend className="sr-only">Inverse search setup</legend>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Target geometry">
              {MODES.map((mode) => (
                <Button
                  key={mode.id}
                  className="h-11 px-1 text-xs"
                  variant={target.mode === mode.id ? "default" : "outline"}
                  aria-pressed={target.mode === mode.id}
                  data-explain="Changing geometry resets the A-block fraction: 0.50 for lines and 0.33 for contacts or via pairs."
                  onClick={() => {
                    setTarget((previous) => ({ ...previous, mode: mode.id }));
                    setComposition(mode.id === "lamellar" ? 0.5 : 0.33);
                  }}
                >
                  {mode.label}
                </Button>
              ))}
            </div>
            <div>
              <Slider
                label="Target guide pitch (nm)"
                hint="Chemical template repeat distance. Line multiplication is fixed from the chamber's guide pitch and natural period."
                value={target.pitchNm}
                min={12}
                max={80}
                step={0.5}
                onChange={(pitchNm) => setTarget((previous) => ({ ...previous, pitchNm }))}
              />
              <Slider
                label="Target feature CD (nm)"
                hint="Desired assembled feature width or contact diameter; guide CD is optimized independently."
                value={target.cdNm}
                min={4}
                max={28}
                step={0.5}
                onChange={(cdNm) => setTarget((previous) => ({ ...previous, cdNm }))}
              />
              {target.mode === "lamellar" ? (
                <Slider
                  label="Max LER 3σ (nm)"
                  hint="Line-edge roughness ceiling in the common search objective."
                  value={target.maxLerNm}
                  min={0.4}
                  max={3}
                  step={0.1}
                  onChange={(maxLerNm) => setTarget((previous) => ({ ...previous, maxLerNm }))}
                />
              ) : (
                <Slider
                  label="Max LCDU 3σ (nm)"
                  hint="Contact diameter variation ceiling in the common search objective."
                  value={target.maxLcduNm}
                  min={0.4}
                  max={4}
                  step={0.1}
                  onChange={(maxLcduNm) => setTarget((previous) => ({ ...previous, maxLcduNm }))}
                />
              )}
              <Slider
                label="A-block fraction f"
                hint="Fixed chain composition for this search. About 0.50 favors lamellae; 0.33 favors A-rich contact domains."
                value={composition}
                min={0.3}
                max={0.7}
                step={0.01}
                onChange={setComposition}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
              <label
                className="text-xs text-muted"
                data-explain="Total SCFT evaluations, including the initial design."
              >
                Trial budget
                <select
                  className={INPUT}
                  value={budget}
                  onChange={(event) => setBudget(Number(event.target.value))}
                >
                  {[8, 16, 24, 32].map((n) => (
                    <option key={n} value={n}>
                      {n} evaluations
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="text-xs text-muted"
                data-explain="Use the same seed and settings to reproduce the search."
              >
                Random seed
                <input
                  className={INPUT}
                  type="number"
                  min={0}
                  max={4294967295}
                  step={1}
                  value={seed}
                  onChange={(event) =>
                    setSeed(
                      Math.max(
                        0,
                        Math.min(4294967295, Math.trunc(Number(event.target.value) || 0)),
                      ),
                    )
                  }
                />
              </label>
            </div>
            <label
              className="block text-xs text-muted"
              data-explain="Higher resolution and a larger iteration cap cost more time. A cap does not guarantee SCFT convergence."
            >
              SCFT quality
              <select
                className={INPUT}
                value={quality}
                onChange={(event) => setQuality(event.target.value as keyof typeof QUALITY)}
              >
                <option value="quick">Quick · 32² / 64 iterations</option>
                <option value="refined">Refined · 64² / 160 iterations</option>
              </select>
            </label>
          </fieldset>
          <div className="mt-5">
            {running ? (
              <Button
                className="h-11 w-full"
                variant="outline"
                onClick={stop}
                data-explain="Stop immediately and retain every completed evaluation for review, export or application."
              >
                <Square className="mr-2 size-4" />
                Stop search
              </Button>
            ) : (
              <Button
                className="h-11 w-full"
                onClick={run}
                data-explain="Start a reproducible SCFT search using this target, trial budget and seed. A new run replaces the current history."
              >
                <Play className="mr-2 size-4" />
                {status === "idle" ? "Run inverse search" : "Run new search"}
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Optimizes guide geometry, strength and χN. Composition, temperature and L₀ stay fixed.
            Binary blend fraction is set to zero.
          </p>
        </section>

        <section className="min-w-0 space-y-4 lg:col-span-2">
          <div className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">02 / Follow the evidence</h2>
                <p className="mt-1 text-xs text-muted" role="status" aria-live="polite">
                  {running
                    ? `${initialComplete ? "GP expected improvement" : "Initial space-filling design"} · evaluating ${Math.min(completed + 1, total)} of ${total}`
                    : status === "completed"
                      ? "Search complete · review convergence before applying"
                      : status === "stopped"
                        ? "Stopped · completed evaluations retained"
                        : status === "error"
                          ? "Search interrupted · completed evaluations retained"
                          : "Your search history will appear here"}
                </p>
              </div>
              <span className="font-mono text-sm tabular-nums">
                {completed}
                <span className="text-muted"> / {total}</span>
              </span>
            </div>
            <progress
              className="mt-4 h-1.5 w-full accent-teal"
              value={completed}
              max={total}
              aria-label="Completed inverse evaluations"
            />
            {error ? (
              <p
                className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Metric label="Best loss ↓" value={best ? fmt(best.loss, 3) : "—"} />
              <Metric
                label="Gain after initial"
                value={gain == null ? "—" : `${Math.max(0, gain).toFixed(1)}%`}
              />
              <Metric label="SCFT converged" value={`${converged} / ${completed}`} />
            </div>
            <div className="mt-5 h-52 min-w-0" aria-label="Best objective loss by evaluation">
              {history.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 12, right: 10, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="iteration"
                      tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                      allowDecimals={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                      width={55}
                      tickFormatter={(value: number) => value.toFixed(2)}
                      domain={[0, "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-surface)",
                        borderColor: "var(--color-border)",
                        borderRadius: 8,
                        color: "var(--color-fg)",
                      }}
                      labelFormatter={(value) => `Evaluation ${value}`}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="bestLoss"
                      name="Best loss"
                      stroke="var(--color-teal)"
                      strokeWidth={2}
                      dot={history.length < 20}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-border text-center">
                  <FlaskConical className="mb-3 size-7 text-muted" />
                  <p className="text-sm text-muted">One objective. Every evaluation.</p>
                  <p className="mt-1 max-w-sm px-4 text-xs leading-relaxed text-muted">
                    Lower loss means a closer match to the target. The curve records the best result
                    so far.
                  </p>
                </div>
              )}
            </div>
          </div>

          {best ? (
            <div className="panel border-teal/30 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-teal">
                    Best evaluated recipe
                  </p>
                  <p className="mt-2 font-mono text-2xl">L {fmt(best.loss, 3)}</p>
                </div>
                <Button
                  disabled={running}
                  onClick={() => onApply(best.evaluatedConfig)}
                  data-explain="Load the exact evaluated recipe into the chamber. An unconverged result remains provisional."
                >
                  <ArrowRight className="mr-2 size-4" />
                  Apply to chamber
                </Button>
              </div>
              <p className={cn("mt-3 text-xs", best.scftConverged ? "text-teal" : "text-amber")}>
                {best.scftConverged ? "SCFT converged" : "Unconverged SCFT · provisional candidate"}{" "}
                · residual {best.scftResidual.toExponential(2)} · incompressibility{" "}
                {best.scftIncomp.toExponential(2)}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                <Stat label="χN" value={fmt(best.chiN, 2)} />
                <Stat label="A fraction" value={fmt(best.evaluatedConfig.f, 2)} />
                <Stat label="Field strength" value={fmt(best.strength, 2)} />
                <Stat label="Guide pitch" value={`${fmt(best.lsNm)} nm`} />
                <Stat label="Guide CD" value={`${fmt(guideCd(best))} nm`} />
                <Stat label="Output CD" value={`${fmt(best.cdNm)} nm`} />
                <Stat
                  label={resultTarget.mode === "lamellar" ? "LER 3σ" : "LCDU 3σ"}
                  value={`${fmt(resultTarget.mode === "lamellar" ? best.dsaLerNm : best.lcduNm, 2)} nm`}
                />
                <Stat label="Temperature" value={`${fmt(best.T, 0)} K`} />
                <Stat label="L₀" value={`${fmt(best.evaluatedConfig.L0Nm)} nm`} />
              </dl>
            </div>
          ) : completed > 0 ? (
            <div className="panel p-5 text-sm text-amber">
              No usable candidate yet. Failed evaluations remain in the history for inspection.
            </div>
          ) : null}
        </section>
      </div>

      {ranked.length ? (
        <section className="panel min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="font-display text-lg font-semibold">Evaluated recipes</h2>
              <p className="mt-1 text-xs text-muted">
                Ranked by the same objective · {ranked.length} retained evaluations
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                data-explain="Download the report with evaluated configurations, search settings, convergence diagnostics and completion status."
                size="sm"
                variant="outline"
                disabled={running || !partialReport}
                onClick={() =>
                  partialReport && downloadInverseReport(partialReport, "json", status)
                }
              >
                <ArrowDownToLine className="mr-2 size-3.5" />
                JSON report
              </Button>
              <Button
                data-explain="Download the ranked evaluation table, including loss, convergence, predicted uncertainty and failure diagnostics."
                size="sm"
                variant="outline"
                disabled={running || !partialReport}
                onClick={() => partialReport && downloadInverseReport(partialReport, "csv", status)}
              >
                CSV table
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse whitespace-nowrap text-left text-xs">
              <thead className="bg-bg/40 font-mono text-muted">
                <tr>
                  {[
                    "#",
                    "Proposal",
                    "Loss ↓",
                    "χN",
                    "Guide CD",
                    "Output CD",
                    "Residual / status",
                    "",
                  ].map((label, i) => (
                    <th key={i} className="px-4 py-3 font-normal">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((trial, index) => (
                  <tr key={trial.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-muted">{index + 1}</td>
                    <td className="px-4 py-2">
                      {trial.phase === "initial" ? "Initial design" : "GP proposal"}
                    </td>
                    <td className="px-4 py-2 font-mono text-teal">{fmt(trial.loss, 3)}</td>
                    <td className="px-4 py-2 font-mono">{fmt(trial.chiN, 1)}</td>
                    <td className="px-4 py-2 font-mono">{fmt(guideCd(trial))} nm</td>
                    <td className="px-4 py-2 font-mono">{fmt(trial.cdNm)} nm</td>
                    <td
                      className={cn(
                        "px-4 py-2 font-mono",
                        trial.scftConverged ? "text-teal" : "text-amber",
                      )}
                    >
                      {trial.scftResidual.toExponential(1)}
                      <span className="ml-2 font-sans">{trial.scftStatus}</span>
                    </td>
                    <td className="px-4 py-2">
                      <Button
                        data-explain="Load this evaluated recipe into the chamber. Failed evaluations cannot be applied."
                        variant="ghost"
                        size="sm"
                        disabled={running || trial.scftStatus === "failed"}
                        onClick={() => onApply(trial.evaluatedConfig)}
                      >
                        Apply
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="max-w-4xl text-xs leading-relaxed text-muted">
        Model scope: local, single-diblock 2D SCFT. This search is inspired by{" "}
        <a
          className="text-accent underline underline-offset-2"
          href="https://arxiv.org/abs/2510.02715"
          target="_blank"
          rel="noreferrer"
        >
          Zhou et al.
        </a>
        ; it does not reproduce their binary-blend or 3D model.{" "}
        <a
          className="text-accent underline underline-offset-2"
          href="https://gaussianprocess.org/gpml/"
          target="_blank"
          rel="noreferrer"
        >
          Matérn Gaussian-process
        </a>{" "}
        uncertainty guides exploration. Iteration-capped results and coarse-grid feature metrics
        need further validation.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums">{value}</p>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border/60 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-sm">{value}</dd>
    </div>
  );
}
