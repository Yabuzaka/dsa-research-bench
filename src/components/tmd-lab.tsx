import { useEffect, useRef } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Fold, Metric, Panel, Slider } from "@/components/kit";
import { GLOSSARY } from "@/lib/tmd/content";
import { TMD_MATERIALS, tmdById, CARRIER_LABEL, tmdsIn, type TmdMaterial } from "@/lib/tmd/materials";
import {
  DEFAULT_BENCH,
  IRDS,
  evaluateBench,
  judgeDevice,
  type BenchInput,
  type ContactKind,
  type GateKind,
} from "@/lib/tmd/physics";
import type { TmdTab } from "@/lib/persist";
import { cn } from "@/lib/utils";
import { DsaNotes } from "@/components/dsa-notes";

export function TmdLab({
  tab,
  bench,
  onBench,
  onLoadRecipe,
}: {
  tab: TmdTab;
  bench: BenchInput;
  onBench: (b: BenchInput) => void;
  onLoadRecipe: (recipeId: string) => void;
}) {
  return (
    <div className="mx-auto max-w-7xl">
      {tab === "bench" ? <PhysicsBench bench={bench} onBench={onBench} /> : null}
      {tab === "materials" ? (
        <Materials
          selected={bench.materialId}
          onSelect={(id) =>
            onBench({
              ...bench,
              materialId: id,
              muCm2Vs: mid(tmdById(id).muExp),
            })
          }
        />
      ) : null}
      {tab === "context" ? <DsaNotes onLoad={onLoadRecipe} /> : null}
    </div>
  );
}

function hint(term: string) {
  return GLOSSARY.find((g) => g.term.toLowerCase().startsWith(term.toLowerCase()))?.def;
}

function MatPick({
  m,
  selected,
  onSelect,
}: {
  m: TmdMaterial;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(m.id)}
      data-explain={`${m.name}. ${m.polytype} ${CARRIER_LABEL[m.carrier]}. 1L gap ${m.egMonoEv.toFixed(2)} eV.`}
      className={cn(
        "min-h-11 rounded-lg border px-3 py-3 text-left",
        selected === m.id
          ? "border-accent bg-elevated text-fg"
          : "border-border bg-surface text-muted hover:text-fg",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex items-center" aria-hidden>
          <span className="size-3 rounded-full" style={{ background: m.colorM }} />
          <span className="-ml-1 size-3 rounded-full" style={{ background: m.colorX }} />
        </span>
        <span className="font-display text-lg font-bold">{m.formula}</span>
      </div>
      <div className="mt-1 font-mono text-xs uppercase tracking-widest">
        {m.polytype} · {CARRIER_LABEL[m.carrier]} · {m.egMonoEv.toFixed(2)} eV
      </div>
    </button>
  );
}

function Materials({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const mat = tmdById(selected);
  const compare = TMD_MATERIALS.map((m) => ({
    formula: m.formula,
    gap: m.egMonoEv,
    mu: (m.muExp[0] + m.muExp[1]) / 2,
    a: m.latticeAAng,
    fill: m.colorM,
  }));
  const muMax = Math.max(...compare.map((r) => r.mu), 1);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          Channel library
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold">Not every TMD — the FET-relevant set</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          MX₂ is a large family (Groups 4–10 × S/Se/Te, plus alloys). This bench keeps
          the five Group-6 2H films used as logic channels, then four research extras
          (WTe₂ Td semimetal, ReS₂ 1T′, HfS₂ 1T, PtSe₂ 1T). Metallic TMDs such as
          NbSe₂, NbS₂, TaS₂, and most alloys are omitted on purpose — they are not
          CMOS bodies.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_260px]">
        <div className="flex flex-col gap-2">
          <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">Group 6 · 2H logic</p>
          {tmdsIn("logic").map((m) => (
            <MatPick key={m.id} m={m} selected={selected} onSelect={onSelect} />
          ))}
          <p className="mt-3 px-1 font-mono text-xs uppercase tracking-widest text-muted">
            Research extras
          </p>
          {tmdsIn("research").map((m) => (
            <MatPick key={m.id} m={m} selected={selected} onSelect={onSelect} />
          ))}
        </div>
        <div>
          <Lattice matId={mat.id} />
          <p className="mt-3 text-sm leading-relaxed text-muted">{mat.note}</p>
          <p className="mt-2 font-mono text-xs text-muted">{mat.refs}</p>
        </div>
        <Panel>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
            {mat.name}
          </div>
          <Metric k="Pair" v={`${mat.metal} + ${mat.chalcogen}₂`} u="" />
          <Metric k="Polytype" v={mat.polytype} u="" />
          <Metric k="Use" v={mat.family === "logic" ? "logic channel" : "research"} u="" />
          <Metric k="Role" v={CARRIER_LABEL[mat.carrier]} u="" />
          <Metric k="1L gap" v={mat.egMonoEv.toFixed(2)} u="eV" />
          <Metric k="Bulk gap" v={mat.egBulkEv.toFixed(2)} u="eV" />
          <Metric k="t_mono" v={mat.tMonoNm.toFixed(2)} u="nm" />
          <Metric k="a" v={mat.latticeAAng.toFixed(2)} u="Å" />
          <Metric k="ε_z" v={mat.epsZ.toFixed(1)} u="" />
          <Metric k="m*" v={mat.mStar.toFixed(2)} u="m0" />
          <Metric k="μ exp" v={`${mat.muExp[0]}–${mat.muExp[1]}`} u="cm²/Vs" />
          <Metric k="μ theory" v={String(mat.muTheory)} u="cm²/Vs" />
          <Metric k="v_sat" v={(mat.vSatCms / 1e6).toFixed(1)} u="×10⁶ cm/s" />
          <Metric k="CMOS mate" v={tmdById(mat.complementId).formula} u="" />
        </Panel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel p-4">
          <p className="text-sm text-muted">Monolayer gap</p>
          <p className="mb-3 font-mono text-xs text-muted">
            1L gap. WTe₂ is zero (semimetal). WS₂ is the widest 2H.
          </p>
          {compare.map((row) => (
            <div key={row.formula} className="mt-2">
              <div className="flex justify-between font-mono text-xs text-muted">
                <span>{row.formula}</span>
                <span className="tabular-nums">{row.gap.toFixed(2)} eV</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(row.gap / 2.2) * 100}%`, background: row.fill }}
                />
              </div>
            </div>
          ))}
        </section>
        <section className="panel p-4">
          <p className="text-sm text-muted">Typical FET μ</p>
          <p className="mb-3 font-mono text-xs text-muted">Mid of the experimental band, cm²/V·s</p>
          {compare.map((row) => (
            <div key={row.formula} className="mt-2">
              <div className="flex justify-between font-mono text-xs text-muted">
                <span>{row.formula}</span>
                <span className="tabular-nums">{row.mu.toFixed(0)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-teal"
                  style={{ width: `${Math.min(100, (row.mu / muMax) * 100)}%`, background: row.fill }}
                />
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function Lattice({ matId }: { matId: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const mat = tmdById(matId);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const styles = getComputedStyle(c);
    const bg = styles.getPropertyValue("--color-elevated").trim() || "#252140";
    const fg = styles.getPropertyValue("--color-fg").trim() || "#eeeaf8";
    const muted = styles.getPropertyValue("--color-muted").trim() || "#9b96b3";
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const split = Math.floor(w * 0.68);
    const s = Math.min(26, 16 * (mat.latticeAAng / 3.16));
    const rM = mat.metal === "Mo" ? 5.4 : 6.3;
    const rX = mat.chalcogen === "Te" ? 4.8 : mat.chalcogen === "Se" ? 3.9 : 3.1;
    const dx = s * Math.sqrt(3);
    const dy = s * 1.5;
    const shear = mat.polytype === "Td" || mat.polytype === "1T'" ? 0.26 : mat.id === "mote2" ? 0.12 : 0;
    const rot0 = mat.polytype === "2H" ? -30 : 0;

    for (let row = -1; row < h / dy + 2; row++) {
      for (let col = -1; col < split / dx + 2; col++) {
        const x = col * dx + (row % 2 ? dx / 2 : 0) + 10 + row * s * shear;
        const y = row * dy + 18;
        if (x > split - 8) continue;
        ctx.beginPath();
        ctx.arc(x, y, rM, 0, Math.PI * 2);
        ctx.fillStyle = mat.colorM;
        ctx.fill();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 180) * (60 * k + rot0);
          const xx = x + s * Math.cos(a);
          const yy = y + s * Math.sin(a);
          if (xx > split - 4) continue;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(xx, yy);
          ctx.strokeStyle = "rgba(238,234,248,0.16)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(xx, yy, rX, 0, Math.PI * 2);
          ctx.fillStyle = mat.colorX;
          ctx.fill();
        }
      }
    }

    ctx.fillStyle = bg;
    ctx.fillRect(split, 0, w - split, h);
    ctx.strokeStyle = "rgba(238,234,248,0.12)";
    ctx.beginPath();
    ctx.moveTo(split, 12);
    ctx.lineTo(split, h - 12);
    ctx.stroke();

    const cx = split + (w - split) / 2;
    const midY = h * 0.42;
    const pitch = 16;
    const rSideM = rM + 1;
    const rSideX = rX + 0.6;
    const prism = mat.polytype === "2H";
    for (let i = -2; i <= 2; i++) {
      const x = cx + i * pitch;
      ctx.beginPath();
      ctx.arc(x + (prism ? 0 : pitch / 2), midY - 14, rSideX, 0, Math.PI * 2);
      ctx.fillStyle = mat.colorX;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + pitch / 2, midY, rSideM, 0, Math.PI * 2);
      ctx.fillStyle = mat.colorM;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, midY + 14, rSideX, 0, Math.PI * 2);
      ctx.fillStyle = mat.colorX;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + (prism ? 0 : pitch / 2), midY - 14);
      ctx.lineTo(x + pitch / 2, midY);
      ctx.lineTo(x, midY + 14);
      ctx.strokeStyle = "rgba(238,234,248,0.28)";
      ctx.stroke();
    }

    ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
    ctx.fillStyle = fg;
    ctx.fillText(`${mat.polytype} top`, 12, 16);
    ctx.fillStyle = muted;
    ctx.fillText(`a = ${mat.latticeAAng.toFixed(2)} Å`, 12, 30);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.fillText("X–M–X side", cx, 16);
    ctx.fillStyle = muted;
    ctx.fillText(`${mat.tMonoNm.toFixed(2)} nm 1L`, cx, 30);
    ctx.textAlign = "left";
    ctx.fillStyle = bg;
    ctx.fillRect(10, h - 40, 210, 28);
    ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
    ctx.fillStyle = mat.colorM;
    ctx.fillText(`${mat.metal}  metal`, 18, h - 22);
    ctx.fillStyle = mat.colorX;
    ctx.fillText(`${mat.chalcogen}₂  ${mat.polytype}`, 96, h - 22);
  }, [mat]);
  return <canvas ref={ref} className="h-64 w-full rounded-xl border border-border bg-elevated" />;
}

function PhysicsBench({
  bench,
  onBench,
}: {
  bench: BenchInput;
  onBench: (b: BenchInput) => void;
}) {
  const r = evaluateBench(bench);
  const mat = tmdById(bench.materialId);
  const verdict = judgeDevice(bench, r);
  function patch<K extends keyof BenchInput>(key: K, value: BenchInput[K]) {
    onBench({ ...bench, [key]: value });
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_250px]">
      <aside className="flex flex-col gap-3">
        <Fold title="Channel" defaultOpen>
          <select
            className="field"
            value={bench.materialId}
            onChange={(e) => {
              const id = e.target.value;
              onBench({ ...bench, materialId: id, muCm2Vs: mid(tmdById(id).muExp) });
            }}
          >
            {TMD_MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.formula}
              </option>
            ))}
          </select>
          <Slider
            label="Layers"
            hint="Monolayer keeps the gap open; 2–3 L trade μ vs I_off."
            value={bench.layers}
            min={1}
            max={3}
            step={1}
            onChange={(v) => patch("layers", v)}
          />
          <Slider
            label="L_g (nm)"
            hint="Physical gate length. Short-channel when L_g ≲ few × λ."
            value={bench.lgNm}
            min={8}
            max={80}
            step={1}
            onChange={(v) => patch("lgNm", v)}
          />
          <Slider
            label="EOT (nm)"
            hint={hint("EOT")}
            value={bench.eotNm}
            min={0.5}
            max={3}
            step={0.05}
            onChange={(v) => patch("eotNm", v)}
          />
          <div className="mt-3 flex gap-2">
            {([1, 2, 4] as GateKind[]).map((g) => (
              <Button
                key={g}
                size="sm"
                variant={bench.gates === g ? "default" : "outline"}
                onClick={() => patch("gates", g)}
              >
                {gateLabel(g)}
              </Button>
            ))}
          </div>
        </Fold>
        <Fold title="Transport" defaultOpen>
          <Slider
            label="μ (cm²/Vs)"
            hint="Experimental FETs sit at the low end; phonon-limited theory at the high end."
            value={bench.muCm2Vs}
            min={5}
            max={mat.muTheory}
            step={1}
            onChange={(v) => patch("muCm2Vs", v)}
          />
          <Slider
            label="Rc (Ω·µm)"
            hint={hint("Rc")}
            value={bench.rcOhmUm}
            min={15}
            max={900}
            step={5}
            onChange={(v) => patch("rcOhmUm", v)}
          />
          <div className="mt-3 flex gap-2">
            {(["hybrid", "top", "edge"] as ContactKind[]).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={bench.contactKind === k ? "default" : "outline"}
                onClick={() => patch("contactKind", k)}
              >
                {k}
              </Button>
            ))}
          </div>
          <Slider
            label="L_c (nm)"
            hint="Contact length. TSMC 2025: current holds to ~30 nm for Sb/MoS₂. Hybrid wins below 10 nm."
            value={bench.lcNm}
            min={6}
            max={80}
            step={1}
            onChange={(v) => patch("lcNm", v)}
          />
          <Slider
            label="Dit (10¹² cm⁻² eV⁻¹)"
            hint={hint("Dit")}
            value={bench.dit / 1e12}
            min={0.1}
            max={20}
            step={0.1}
            onChange={(v) => patch("dit", v * 1e12)}
          />
          <Slider
            label="Vdd (V)"
            value={bench.vdd}
            min={0.4}
            max={1.2}
            step={0.05}
            onChange={(v) => patch("vdd", v)}
          />
          <Slider
            label="Vov (V)"
            value={bench.vov}
            min={0.2}
            max={1}
            step={0.05}
            onChange={(v) => patch("vov", v)}
          />
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => onBench({ ...DEFAULT_BENCH })}
          >
            Reset
          </Button>
        </Fold>
      </aside>
      <main className="min-w-0">
        <div
          className={
            verdict.level === "pass"
              ? "mb-3 rounded-md border border-teal bg-elevated px-3 py-2"
              : verdict.level === "warn"
                ? "mb-3 rounded-md border border-amber bg-surface px-3 py-2"
                : "mb-3 rounded-md border border-accent bg-surface px-3 py-2"
          }
        >
          <p
            className={
              verdict.level === "pass"
                ? "text-xs font-medium uppercase tracking-[0.16em] text-teal"
                : verdict.level === "warn"
                  ? "text-xs font-medium uppercase tracking-[0.16em] text-warn"
                  : "text-xs font-medium uppercase tracking-[0.16em] text-accent"
            }
          >
            {verdict.title}
          </p>
          <p className="mt-1 text-sm">{verdict.reason}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{verdict.next}</p>
        </div>
        <CrossSection
          rLambda={r.lambdaNm}
          tCh={r.tChNm}
          eot={bench.eotNm}
          gates={bench.gates}
          formula={mat.formula}
          colorM={mat.colorM}
          colorX={mat.colorX}
        />
        <div className="panel mt-3 p-2">
          <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted">
            log₁₀ I_d (µA/µm) vs V_g · V_ds = Vdd
          </p>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height={176}>
              <AreaChart
                data={r.idvg.map((p) => ({
                  vg: p.vg,
                  logId: Math.log10(Math.max(p.idUa, 1e-6)),
                }))}
                margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="vg" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                <YAxis
                  dataKey="logId"
                  type="number"
                  tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                  width={36}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                    color: "var(--color-fg)",
                  }}
                  formatter={(v) => {
                    const n = typeof v === "number" ? v : Number(v);
                    return [`10^${n.toFixed(2)} µA/µm`, "Id"];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="logId"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.28}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
      <Panel>
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
          This transistor
        </div>
        <p className="mb-2 text-xs leading-relaxed text-muted">
          {mat.formula} {CARRIER_LABEL[mat.carrier]} · EKV + 2 Rc vs IRDS 2D option.
        </p>
        <Metric k="λ" v={r.lambdaNm.toFixed(2)} u="nm" hint={hint("λ")} />
        <Metric
          k="L_g / λ"
          v={r.lgOverLambda.toFixed(1)}
          u="×"
          className={r.lgOverLambda > 10 ? "text-good" : "text-danger"}
        />
        <Metric
          k="SS"
          v={r.ssMVdec.toFixed(1)}
          u="mV/dec"
          hint={hint("SS")}
          className={r.irdsSsOk ? "text-good" : "text-warn"}
        />
        <Metric k="DIBL" v={r.diblMVv.toFixed(0)} u="mV/V" />
        <Metric k="V_t" v={r.vt.toFixed(2)} u="V" />
        <Metric k="I_on" v={r.ionUAUm.toFixed(0)} u="µA/µm" />
        <Metric k="I_off" v={fmtLog(r.ioffNAUm)} u="nA/µm" />
        <Metric k="I_on / I_off" v={fmtLog(r.ionIoff)} u="" hint={hint("I_on")} />
        <Metric k="R_ch" v={r.rchOhmUm.toFixed(0)} u="Ω·µm" />
        <Metric
          k="2Rc share"
          v={(r.contactShare * 100).toFixed(0)}
          u="%"
          className={r.contactShare > 0.4 ? "text-danger" : "text-fg"}
        />
        <Metric
          k="Rc_eff"
          v={r.rcEffOhmUm.toFixed(0)}
          u="Ω·µm"
          hint="Geometry × L_c applied to the entered Rc."
          className={r.irdsRcOk ? "text-good" : "text-warn"}
        />
        <Metric
          k="I_src cap"
          v={r.ionSrcUAUm.toFixed(0)}
          u="µA/µm"
          className={r.sourceLimited ? "text-danger" : "text-fg"}
          hint="Source-injection ceiling. Binds I_on below ~10 nm (arXiv:2608.06793)."
        />
        <Metric k="C_ox" v={r.coxUFCm2.toFixed(2)} u="µF/cm²" />
        <Metric k="C_q" v={r.cqUFCm2.toFixed(1)} u="µF/cm²" />
        <div className="mt-3 border-t border-border pt-2 text-xs uppercase tracking-[0.16em] text-muted">
          vs IRDS 2D option
        </div>
        <MeterBar label="I_on / 900" frac={r.irdsIonFrac} />
        <MeterBar label="SS ≤ 70" frac={r.irdsSsOk ? 1 : IRDS.ssMVdec / r.ssMVdec} />
        <MeterBar label="Rc_eff ≤ 100" frac={r.irdsRcOk ? 1 : IRDS.rcOhmUm / r.rcEffOhmUm} />
        <p className="mt-3 text-xs leading-relaxed text-muted">
          EKV + 2 Rc_eff ({bench.contactKind}, L_c {bench.lcNm} nm). Source ceiling at short L_g.
        </p>
      </Panel>
    </div>
  );
}

function CrossSection({
  rLambda,
  tCh,
  eot,
  gates,
  formula,
  colorM,
  colorX,
}: {
  rLambda: number;
  tCh: number;
  eot: number;
  gates: GateKind;
  formula: string;
  colorM: string;
  colorX: string;
}) {
  const tScale = 18;
  const ch = Math.max(6, tCh * tScale);
  const ox = Math.max(4, eot * 10);
  return (
    <div className="panel p-3">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">
        {formula} gate stack · λ {rLambda.toFixed(2)} nm
      </p>
      <svg viewBox="0 0 360 120" className="mt-2 h-28 w-full">
        {gates >= 2 ? <rect x="40" y="18" width="280" height={ox} fill="var(--color-accent)" opacity="0.85" /> : null}
        <rect x="40" y={gates >= 2 ? 18 + ox : 36} width="280" height={Math.max(3, ch * 0.35)} fill={colorX} />
        <rect
          x="40"
          y={(gates >= 2 ? 18 + ox : 36) + Math.max(3, ch * 0.35)}
          width="280"
          height={Math.max(4, ch * 0.3)}
          fill={colorM}
        />
        <rect
          x="40"
          y={(gates >= 2 ? 18 + ox : 36) + Math.max(3, ch * 0.35) + Math.max(4, ch * 0.3)}
          width="280"
          height={Math.max(3, ch * 0.35)}
          fill={colorX}
        />
        {gates !== 2 ? (
          <rect
            x="40"
            y={(gates >= 2 ? 18 + ox : 36) + ch}
            width="280"
            height={ox}
            fill="var(--color-accent)"
            opacity="0.85"
          />
        ) : (
          <rect x="40" y={18 + ox + ch} width="280" height={ox} fill="var(--color-accent)" opacity="0.85" />
        )}
        {gates === 4 ? (
          <>
            <rect x="32" y="18" width="8" height={ox + ch + ox} fill="var(--color-accent)" opacity="0.7" />
            <rect x="320" y="18" width="8" height={ox + ch + ox} fill="var(--color-accent)" opacity="0.7" />
          </>
        ) : null}
        <rect x="28" y="78" width="18" height="28" fill={colorM} stroke="var(--color-accent)" />
        <rect x="314" y="78" width="18" height="28" fill={colorM} stroke="var(--color-accent)" />
        <text x="180" y="114" textAnchor="middle" fill="var(--color-muted)" fontSize="10" fontFamily="IBM Plex Mono, monospace">
          S · {formula} {tCh.toFixed(2)} nm · D · EOT {eot.toFixed(2)} nm
        </text>
      </svg>
    </div>
  );
}

function MeterBar({ label, frac }: { label: string; frac: number }) {
  const p = Math.max(0, Math.min(1, frac));
  return (
    <div className="mt-2">
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums">{(p * 100).toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
        <div className="h-full bg-accent" style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  );
}

function gateLabel(g: GateKind) {
  if (g === 1) return "SG";
  if (g === 2) return "DG";
  return "GAA";
}

function mid([a, b]: [number, number]) {
  return Math.round((a + b) / 2);
}

function fmtLog(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 100) return n.toExponential(1);
  if (n >= 10) return n.toFixed(0);
  if (n >= 1) return n.toFixed(1);
  return n.toExponential(1);
}
