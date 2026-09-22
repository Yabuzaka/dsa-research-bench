import { useEffect, useMemo, useRef } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Film3dReport } from "@/lib/dsa/film3d";
import { phaseAt, phaseMesh, type PhaseId } from "@/lib/dsa/phase";
import type { ScftReport } from "@/lib/dsa/scft";
import { LOOK_META, LOOK_IDS, cssRgb, paletteFor, type FieldLook, type LookFamily } from "@/lib/dsa/looks";
import type { FramePayload } from "@/lib/dsa/types";
import { cn } from "@/lib/utils";

export type FieldView = "field" | "edges" | "sem" | "hex" | "cut" | "sk" | "psd" | "film";

const TIP = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  fontSize: 12,
  color: "var(--color-fg)",
};

const VIEWS: { id: FieldView; label: string; explain: string }[] = [
  { id: "field", label: "Field", explain: "Volume fraction φ. Colour follows the look: PS vs PMMA (or equivalent blocks)." },
  { id: "edges", label: "Edges", explain: "Detected line edges used for LER / LWR." },
  { id: "sem", label: "SEM", explain: "Synthetic CD-SEM. PS is the bright tone." },
  { id: "hex", label: "Director", explain: "Hexatic director field. Hue is 2θ." },
  { id: "cut", label: "φ(x)", explain: "Line cut through the field, compared with a tanh interface." },
  { id: "sk", label: "S(k)", explain: "Structure factor. The peak sets the pitch." },
  { id: "psd", label: "PSD", explain: "Line-edge roughness power spectrum." },
  { id: "film", label: "3D film", explain: "Thin-film SCFT. Δγ sets perpendicular vs parallel lamellae." },
];

export function ViewSwitch({
  view,
  onView,
  onScft,
  onFilm,
  scftBusy,
  filmBusy,
}: {
  view: FieldView;
  onView: (v: FieldView) => void;
  onScft: () => void;
  onFilm: () => void;
  scftBusy: boolean;
  filmBusy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {VIEWS.map(({ id, label, explain }) => (
        <button
          key={id}
          type="button"
          onClick={() => onView(id)}
          data-explain={explain}
          className={cn(
            "h-11 rounded-md px-3 text-sm",
            view === id ? "tab-active" : "text-muted hover:bg-elevated hover:text-fg",
          )}
        >
          {label}
        </button>
      ))}
      <button type="button" onClick={onScft} data-explain="Incompressible diblock SCFT saddle. Reports F and residual vs Matsen D*." className="h-11 rounded-md px-3 text-sm text-teal hover:bg-elevated hover:text-fg">
        {scftBusy ? "SCFT…" : "SCFT relax"}
      </button>
      <button type="button" onClick={onFilm} data-explain="3D film SCFT with Δγ. Perpendicular vs parallel orientation." className="h-11 rounded-md px-3 text-sm text-amber hover:bg-elevated hover:text-fg">
        {filmBusy ? "Film…" : "Solve 3D"}
      </button>
    </div>
  );
}

export function LookSwitch({
  look,
  onLook,
}: {
  look: FieldLook;
  onLook: (v: FieldLook) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {LOOK_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onLook(id)}
          data-explain={LOOK_META[id].blurb}
          className={cn(
            "h-11 px-3 text-sm",
            look === id ? "tab-active" : "text-muted hover:text-fg",
          )}
        >
          {LOOK_META[id].title}
        </button>
      ))}
    </div>
  );
}

export function ColorBar({ look, family = "pspmma" }: { look: FieldLook; family?: LookFamily }) {
  const pal = paletteFor(look, family);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs" style={{ color: cssRgb(pal.pmma) }}>
          {pal.pmmaLabel}
        </span>
        <div
          className="h-2 flex-1 rounded-full"
          style={{
            background: `linear-gradient(to right, ${cssRgb(pal.pmma)}, ${cssRgb(pal.mid)}, ${cssRgb(pal.ps)})`,
          }}
        />
        <span className="font-mono text-xs" style={{ color: cssRgb(pal.ps) }}>
          {pal.psLabel}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm" style={{ background: cssRgb(pal.guide) }} />
          {pal.guideLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm" style={{ background: cssRgb(pal.brush) }} />
          {pal.brushLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm" style={{ background: cssRgb(pal.wall) }} />
          Si
        </span>
      </div>
      <p className="font-mono text-xs leading-snug text-muted">{pal.blurb}</p>
    </div>
  );
}

export function GuideStrip({
  look,
  family,
  LsNm,
  cdNm,
  duty,
  L0Nm,
}: {
  look: FieldLook;
  family: LookFamily;
  LsNm: number;
  cdNm: number;
  duty: number;
  L0Nm: number;
}) {
  const pal = paletteFor(look, family);
  const n = Math.max(2, Math.min(8, Math.round(LsNm / Math.max(L0Nm, 1))));
  const cd = cdNm || duty * LsNm;
  const segs: { kind: "guide" | "brush"; w: number }[] = [];
  for (let i = 0; i < n; i++) {
    segs.push({ kind: "guide", w: cd });
    segs.push({ kind: "brush", w: Math.max(LsNm - cd, 0.5) });
  }
  const total = segs.reduce((s, x) => s + x.w, 0);
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">
        chemical prepattern · Ls {LsNm.toFixed(0)} nm · n={n}×
      </p>
      <div className="flex h-4 overflow-hidden rounded-sm border border-border">
        {segs.map((s, i) => (
          <div
            key={i}
            style={{
              width: `${(s.w / total) * 100}%`,
              background: cssRgb(s.kind === "guide" ? pal.guide : pal.brush),
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function EnergyBars({
  parts,
}: {
  parts?: { bulk: number; grad: number; longr: number; total: number };
}) {
  const data = [
    { k: "bulk", v: parts?.bulk ?? 0 },
    { k: "∇", v: parts?.grad ?? 0 },
    { k: "long", v: parts?.longr ?? 0 },
  ];
  return (
    <div className="h-36 rounded-md border border-border bg-surface p-2">
      <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">F components</p>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="k" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
          <YAxis hide />
          <RTooltip contentStyle={TIP} />
          <Bar dataKey="v" fill="var(--color-accent)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineCutChart({ frame }: { frame: FramePayload | null }) {
  return (
    <div className="h-56 rounded-md border border-border bg-surface p-2">
      <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">
        φ(x) mid-line · dashed tanh SST
      </p>
      <ResponsiveContainer width="100%" height="88%">
        <LineChart data={frame?.lineCut ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis dataKey="x" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
          <YAxis domain={[-1.2, 1.2]} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={32} />
          <RTooltip contentStyle={TIP} />
          <Line
            type="monotone"
            dataKey="phi"
            stroke="var(--color-ps)"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="tanh"
            stroke="var(--color-pmma)"
            dot={false}
            strokeDasharray="4 3"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SkChart({ frame }: { frame: FramePayload | null }) {
  return (
    <div className="h-56 rounded-md border border-border bg-surface p-2">
      <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">
        S(k) radial · dashed Leibler RPA
      </p>
      <ResponsiveContainer width="100%" height="88%">
        <LineChart data={frame?.radial ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="k"
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            tickFormatter={(v) => Number(v).toFixed(2)}
          />
          <YAxis hide />
          <RTooltip contentStyle={TIP} />
          <Line
            type="monotone"
            dataKey="s"
            stroke="var(--color-amber)"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="sTh"
            stroke="var(--color-navy)"
            dot={false}
            strokeDasharray="4 3"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PsdChart({ frame }: { frame: FramePayload | null }) {
  const data = (frame?.psd ?? []).filter((p) => p.k > 0 && p.psd > 0);
  return (
    <div className="h-56 rounded-md border border-border bg-surface p-2">
      <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">
        LER PSD · k⁻² capillary · k⁻⁴ white
      </p>
      <ResponsiveContainer width="100%" height="88%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="k"
            scale="log"
            domain={["auto", "auto"]}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            tickFormatter={(v) => Number(v).toExponential(0)}
          />
          <YAxis
            scale="log"
            domain={["auto", "auto"]}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            width={36}
            tickFormatter={(v) => Number(v).toExponential(0)}
          />
          <RTooltip contentStyle={TIP} />
          <Line type="monotone" dataKey="psd" stroke="var(--color-teal)" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="k2" stroke="var(--color-accent)" dot={false} strokeDasharray="4 3" isAnimationActive={false} />
          <Line type="monotone" dataKey="k4" stroke="var(--color-amber)" dot={false} strokeDasharray="2 3" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FilmStage({ film }: { film: Film3dReport | null }) {
  const mid = useRef<HTMLCanvasElement | null>(null);
  const bot = useRef<HTMLCanvasElement | null>(null);
  const top = useRef<HTMLCanvasElement | null>(null);
  const xz = useRef<HTMLCanvasElement | null>(null);
  const yz = useRef<HTMLCanvasElement | null>(null);
  const iso = useRef<HTMLCanvasElement | null>(null);
  const perpScft = useRef<HTMLCanvasElement | null>(null);
  const paraScft = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    paint(mid.current, film?.midRgba, film?.nx, film?.ny);
    paint(bot.current, film?.botRgba, film?.nx, film?.ny);
    paint(top.current, film?.topRgba, film?.nx, film?.ny);
    paint(xz.current, film?.xzRgba, film?.nx, film?.nz);
    paint(yz.current, film?.yzRgba, film?.ny, film?.nz);
    paintIso(iso.current, film);
    if (film?.scft) {
      paint(perpScft.current, film.perpRgba, film.scft.nx, film.scft.nz);
      paint(paraScft.current, film.paraRgba, film.scft.nx, film.scft.nz);
    }
  }, [film]);
  if (!film) {
    return (
      <p className="rounded-md border border-border bg-surface px-3 py-8 text-sm text-muted">
        Solve 3D for a thin-film stack: substrate, midplane, free surface, x–z / y–z cuts, and an
        exploded isometric. An x–z SCFT then compares F⊥ vs F∥ — the sign of ΔF is the
        perpendicular vs parallel orientation.
      </p>
    );
  }
  const sc = film.scft;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {sc ? (
        <div className="sm:col-span-3 rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-muted tabular-nums">
          x–z SCFT · t = {sc.tOverL0.toFixed(2)} L0 ({sc.tFilmNm.toFixed(0)} nm) · F⊥ {sc.Fperp.toFixed(3)} ·
          F∥ {sc.Fpara.toFixed(3)} · ΔF {sc.dF >= 0 ? "+" : ""}
          {sc.dF.toFixed(3)} → {sc.preferred === "perp" ? "perpendicular" : "parallel"} · ‖w−w[φ]‖⊥{" "}
          {sc.resPerp.toExponential(2)}
        </div>
      ) : null}
      <figure>
        <canvas ref={bot} className="w-full rounded-md border border-border [image-rendering:pixelated]" />
        <figcaption className="mt-1 font-mono text-xs text-muted">substrate z = 0</figcaption>
      </figure>
      <figure>
        <canvas ref={mid} className="w-full rounded-md border border-border [image-rendering:pixelated]" />
        <figcaption className="mt-1 font-mono text-xs text-muted">midplane z = t/2</figcaption>
      </figure>
      <figure>
        <canvas ref={top} className="w-full rounded-md border border-border [image-rendering:pixelated]" />
        <figcaption className="mt-1 font-mono text-xs text-muted">free surface</figcaption>
      </figure>
      <figure>
        <canvas ref={xz} className="w-full rounded-md border border-border [image-rendering:pixelated]" />
        <figcaption className="mt-1 font-mono text-xs text-muted">
          x–z · perp {film.perpScore.toFixed(2)}
        </figcaption>
      </figure>
      <figure>
        <canvas ref={yz} className="w-full rounded-md border border-border [image-rendering:pixelated]" />
        <figcaption className="mt-1 font-mono text-xs text-muted">
          y–z · parallel {film.parallelFrac.toFixed(2)}
        </figcaption>
      </figure>
      <figure>
        <canvas ref={iso} className="w-full rounded-md border border-border bg-navy" />
        <figcaption className="mt-1 font-mono text-xs text-muted">exploded stack</figcaption>
      </figure>
      {film.perpRgba && film.scft ? (
        <figure>
          <canvas ref={perpScft} className="w-full rounded-md border border-border [image-rendering:pixelated]" />
          <figcaption className="mt-1 font-mono text-xs text-muted">
            SCFT x–z ⊥ · F {film.scft.Fperp.toFixed(3)}
          </figcaption>
        </figure>
      ) : null}
      {film.paraRgba && film.scft ? (
        <figure>
          <canvas ref={paraScft} className="w-full rounded-md border border-border [image-rendering:pixelated]" />
          <figcaption className="mt-1 font-mono text-xs text-muted">
            SCFT x–z ∥ · F {film.scft.Fpara.toFixed(3)}
          </figcaption>
        </figure>
      ) : null}
      <div className="h-36 sm:col-span-3 rounded-md border border-border bg-surface p-2">
        <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">√⟨φ²⟩ vs z</p>
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={film.phiBarZ} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="z" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
            <YAxis hide />
            <RTooltip contentStyle={TIP} />
            <Area
              type="monotone"
              dataKey="amp"
              stroke="var(--color-teal)"
              fill="var(--color-teal)"
              fillOpacity={0.25}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ScftMeta({
  scft,
  live,
}: {
  scft: ScftReport | null;
  live?: { pitchNm?: number; cdNm?: number; lerNm?: number };
}) {
  if (!scft) return null;
  const dRel = Math.abs(scft.bulk.periodRg - scft.bulk.matsenD) / Math.max(scft.bulk.matsenD, 1e-6);
  const ok = scft.bulk.fieldResidual < 5e-4 && scft.bulk.incomp < 5e-4;
  const saddle2 = scft.fieldResidual < 5e-3 && scft.incomp < 8e-3;
  const hex = scft.morphology === "HEX";
  const dF = scft.F - scft.bulk.F;
  const wRatio = scft.wRg / Math.max(scft.widthSslRg, 1e-6);
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 font-mono text-xs text-muted tabular-nums">
      <p>
        2D {scft.morphology} SCFT {scft.nPeriods}×L0 ({scft.cellNm.toFixed(0)}
        {hex ? ` × ${scft.cellLyNm.toFixed(0)}` : ""} nm) · F/nkT {scft.F.toFixed(3)} · F_hom{" "}
        {scft.Fhom.toFixed(3)} · ΔF {dF >= 0 ? "+" : ""}
        {dF.toFixed(3)} vs 1D · ‖w−w[φ]‖ {scft.fieldResidual.toExponential(2)} · incomp{" "}
        {scft.incomp.toExponential(2)} · {scft.iters} it {saddle2 ? "saddle" : "open"}
        {scft.registration ? ` · reg ${(scft.registration * 100).toFixed(0)}%` : ""}
      </p>
      <p className="mt-1">
        bulk 1D D*/Rg {scft.bulk.periodRg.toFixed(3)} vs Matsen {scft.bulk.matsenD.toFixed(3)} (
        {(dRel * 100).toFixed(1)}%) · F {scft.bulk.F.toFixed(3)} · ‖w−w[φ]‖{" "}
        {scft.bulk.fieldResidual.toExponential(2)} · {ok ? "saddle" : "open"} · {scft.nx}² Ns=
        {scft.ns} · {scft.method}
        {" · w "}
        {scft.wRg.toFixed(2)} Rg / SSL {scft.widthSslRg.toFixed(2)} ({wRatio.toFixed(2)}×)
        {scft.lerCapillaryNm > 0 ? ` · capillary 3σ ${scft.lerCapillaryNm.toFixed(2)} nm` : ""}
      </p>
      {live?.pitchNm ? (
        <p className="mt-1">
          OK live pitch {live.pitchNm.toFixed(2)} nm vs SCFT D {scft.periodNm.toFixed(2)} nm
          {live.cdNm ? ` · OK CD ${live.cdNm.toFixed(2)} nm` : ""}
          {live.lerNm ? ` · OK LER ${live.lerNm.toFixed(2)} nm` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function ScftProfileChart({ scft }: { scft: ScftReport | null }) {
  if (!scft) return null;
  const fd = scft.bulk.fdCurve.filter((p) => Number.isFinite(p.F));
  const hist = scft.history.filter((p) => Number.isFinite(p.residual));
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="h-36 rounded-md border border-border bg-surface p-2">
        <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">
          SCFT φ(x) · dashed tanh
        </p>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={scft.profile} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="x" hide />
            <YAxis domain={[-1.2, 1.2]} hide />
            <RTooltip contentStyle={TIP} />
            <Line type="monotone" dataKey="phi" stroke="var(--color-teal)" dot={false} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="tanh"
              stroke="var(--color-accent)"
              dot={false}
              strokeDasharray="4 3"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {fd.length > 2 ? (
        <div className="h-36 rounded-md border border-border bg-surface p-2">
          <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">
            F(D) · min is D*
          </p>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={fd} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="D" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
              <YAxis hide domain={["auto", "auto"]} />
              <RTooltip contentStyle={TIP} />
              <Line type="monotone" dataKey="F" stroke="var(--color-teal)" dot={{ r: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {hist.length > 2 ? (
        <div className="h-36 rounded-md border border-border bg-surface p-2">
          <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">
            ‖w−w[φ]‖ vs iter
          </p>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={hist} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="iter" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
              <YAxis hide domain={["auto", "auto"]} />
              <RTooltip contentStyle={TIP} />
              <Line type="monotone" dataKey="residual" stroke="var(--color-accent)" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

const PHASE_FILL: Record<PhaseId, string> = {
  DIS: "#e7f3f2",
  LAM: "#d0123a",
  HEX: "#0e8f8a",
  BCC: "#c47a12",
};

export function PhaseDiagram({ f, chiN }: { f: number; chiN: number }) {
  const mesh = useMemo(() => phaseMesh(32, 24), []);
  const here = phaseAt(f, chiN);
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">Melt phase</p>
      <svg viewBox="0 0 320 180" className="mt-2 h-36 w-full" role="img" aria-label="diblock phase diagram">
        {mesh.cells.map((c, i) => {
          const x = ((c.f - 0.12) / 0.76) * 300 + 10;
          const y = 170 - ((c.chiN - 8) / 52) * 155;
          const w = 300 / mesh.nf;
          const h = 155 / mesh.nc;
          return <rect key={i} x={x} y={y - h} width={w + 0.4} height={h + 0.4} fill={PHASE_FILL[c.phase]} opacity={0.85} />;
        })}
        <circle
          cx={((f - 0.12) / 0.76) * 300 + 10}
          cy={170 - ((chiN - 8) / 52) * 155}
          r={5}
          fill="var(--color-navy)"
          stroke="#fffdf8"
          strokeWidth={1.5}
        />
        <text x="12" y="14" fill="var(--color-muted)" fontSize="10" fontFamily="IBM Plex Mono, monospace">
          χN
        </text>
        <text x="268" y="176" fill="var(--color-muted)" fontSize="10" fontFamily="IBM Plex Mono, monospace">
          f
        </text>
      </svg>
      <p className="mt-1 font-mono text-xs tabular-nums text-muted">
        f {f.toFixed(2)} · χN {chiN.toFixed(1)} · {here}
      </p>
      <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-muted">
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-elevated" />
          DIS
        </span>
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-pmma" />
          LAM
        </span>
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-teal" />
          HEX
        </span>
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-amber" />
          BCC
        </span>
      </div>
    </div>
  );
}

function paint(
  canvas: HTMLCanvasElement | null,
  rgba: Uint8ClampedArray | undefined,
  w?: number,
  h?: number,
) {
  if (!canvas || !rgba || !w || !h) return;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
}

function paintIso(canvas: HTMLCanvasElement | null, film: Film3dReport | null) {
  if (!canvas || !film) return;
  const w = 320;
  const h = 200;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#122033";
  ctx.fillRect(0, 0, w, h);
  const img = new ImageData(new Uint8ClampedArray(film.xzRgba), film.nx, film.nz);
  const off = document.createElement("canvas");
  off.width = film.nx;
  off.height = film.nz;
  off.getContext("2d")?.putImageData(img, 0, 0);
  const layers = Math.min(film.nz, 10);
  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(layers - 1, 1);
    const x = 24 + t * 70;
    const y = 28 + t * 10;
    ctx.globalAlpha = 0.55 + 0.45 * t;
    ctx.drawImage(off, 0, 0, film.nx, film.nz, x, y, 220, 28);
  }
  ctx.globalAlpha = 1;
}
