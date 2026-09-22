import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Download, Search, Menu, X, LayoutGrid, Columns3, Hammer, Crosshair, BookOpen, Cpu, FlaskConical, Info } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  Pie,
  PieChart,
  Cell,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Fold, Metric, Panel, Slider, fmt, KpiCard } from "@/components/kit";
import { Theory } from "@/components/theory";
import { TmdLab } from "@/components/tmd-lab";
import {
  loadPersisted,
  savePersisted,
  type DsaTab,
  type LabId,
  type TmdTab,
} from "@/lib/persist";
import { DEFAULT_BENCH, type BenchInput } from "@/lib/tmd/physics";
import { WindowPanel } from "@/components/window-panel";
import { RepairPanel } from "@/components/repair-panel";
import { InversePanel } from "@/components/inverse-panel";
import { MATERIALS, materialById } from "@/lib/dsa/materials";
import { GUIDE_LABELS, PRESETS } from "@/lib/dsa/presets";
import { TEMPLATE_DEFECT_LABELS } from "@/lib/dsa/guides";
import { applyDoseToConfig } from "@/lib/dsa/euv-dose";
import { judgeRun, P24_SPEC } from "@/lib/dsa/verdict";
import {
  ColorBar,
  EnergyBars,
  FilmStage,
  GuideStrip,
  LineCutChart,
  LookSwitch,
  PhaseDiagram,
  PsdChart,
  ScftMeta,
  ScftProfileChart,
  SkChart,
  ViewSwitch,
  type FieldView,
} from "@/components/field-views";
import type { Film3dReport } from "@/lib/dsa/film3d";
import type { ScftReport } from "@/lib/dsa/scft";
import { scftSiCsv, scftSiPayload } from "@/lib/dsa/si";
import { colorizePhi, familyFromMaterial, niceScaleBarNm, overlayRgba, paletteFor, type FieldLook } from "@/lib/dsa/looks";
import type { BlendPath, FramePayload, GuideKind, SimConfig, TemplateDefect } from "@/lib/dsa/types";
import { cn } from "@/lib/utils";
import { ExplainLayer } from "@/components/explain";

type Tab = DsaTab;

export function Workbench() {
  const [lab, setLab] = useState<LabId>("dsa");
  const [tab, setTab] = useState<Tab>("assemble");
  const [tmdTab, setTmdTab] = useState<TmdTab>("bench");
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [materialId, setMaterialId] = useState(PRESETS[0].materialId);
  const [config, setConfig] = useState<SimConfig>(PRESETS[0].config);
  const [bench, setBench] = useState<BenchInput>(DEFAULT_BENCH);
  const [hydrated, setHydrated] = useState(false);
  const [running, setRunning] = useState(true);
  const [frame, setFrame] = useState<FramePayload | null>(null);
  const [history, setHistory] = useState<{ t: number; energy: number; order: number; ler: number }[]>(
    [],
  );
  const [worker, setWorker] = useState<Worker | null>(null);
  const [view, setView] = useState<FieldView>("field");
  const [scft, setScft] = useState<ScftReport | null>(null);
  const [film, setFilm] = useState<Film3dReport | null>(null);
  const [scftBusy, setScftBusy] = useState(false);
  const [filmBusy, setFilmBusy] = useState(false);
  const [look, setLook] = useState<FieldLook>("paper");
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [explainHover, setExplainHover] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const skipConfig = useRef(true);

  useEffect(() => {
    const p = loadPersisted();
    if (p) {
      setLab(p.lab);
      setTab(p.dsaTab);
      setTmdTab(p.tmdTab);
      setPresetId(p.presetId);
      setMaterialId(p.materialId);
      setConfig(p.config);
      setBench(p.bench);
      setLook(p.look);
      setExplainHover(p.explainHover);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePersisted({
      lab,
      dsaTab: tab,
      tmdTab,
      presetId,
      materialId,
      config,
      bench,
      look,
      explainHover,
    });
  }, [hydrated, lab, tab, tmdTab, presetId, materialId, config, bench, look, explainHover]);

  useEffect(() => {
    if (!hydrated) return;
    const w = new Worker(new URL("../lib/dsa/ok.worker.ts", import.meta.url), {
      type: "module",
    });
    setWorker(w);
    w.onmessage = (ev: MessageEvent<{
      type: string;
      frame?: FramePayload;
      report?: ScftReport | Film3dReport;
      rgba?: Uint8ClampedArray;
    }>) => {
      if (ev.data.type === "frame" && ev.data.frame) {
        setFrame(ev.data.frame);
        const met = ev.data.frame.metrics;
        setHistory((h) => {
        const next = [...h, { t: met.t, energy: met.energy, order: met.order, ler: met.dsaLerNm }];
          return next.length > 80 ? next.slice(-80) : next;
        });
      }
      if (ev.data.type === "scft" && ev.data.report) {
        setScft(ev.data.report as ScftReport);
        setScftBusy(false);
        setRunning(false);
      }
      if (ev.data.type === "film3d" && ev.data.report) {
        setFilm(ev.data.report as Film3dReport);
        setFilmBusy(false);
        setView("film");
      }
    };
    w.postMessage({ type: "init", config });
    return () => {
      w.terminate();
      setWorker(null);
    };
    // init after local restore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!worker) return;
    if (skipConfig.current) {
      skipConfig.current = false;
      return;
    }
    worker.postMessage({ type: "setConfig", config, keepField: true });
  }, [config, worker]);

  useEffect(() => {
    if (!running || !worker) return;
    if (lab !== "dsa" || tab !== "assemble") return;
    let id = 0;
    const tick = () => {
      worker.postMessage({ type: "step", count: config.nx >= 256 ? 2 : 4 });
      id = window.setTimeout(tick, 40);
    };
    id = window.setTimeout(tick, 40);
    return () => window.clearTimeout(id);
  }, [running, config.nx, worker, lab, tab]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const useScft = !running && scft && (view === "field" || view === "edges");
    const nx = useScft ? scft.nx : frame?.nx;
    const ny = useScft ? scft.ny : frame?.ny;
    if (!nx || !ny) return;
    c.width = nx;
    c.height = ny;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let src: Uint8ClampedArray | undefined;
    if (view === "sem") src = frame?.semRgba;
    else if (view === "hex") src = frame?.directorRgba;
    else if (useScft && scft.phi) {
      const dummy = new Uint8Array(scft.phi.length);
      dummy.fill(1);
      src = colorizePhi(scft.phi, dummy, look, familyFromMaterial(materialId));
    } else if (frame?.phi && frame.mask) src = colorizePhi(frame.phi, frame.mask, look, familyFromMaterial(materialId));
    else src = frame?.rgba;
    if (!src) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(src), nx, ny), 0, 0);
  }, [frame, scft, running, view, look, materialId]);

  useEffect(() => {
    const c = overlayRef.current;
    if (!c) return;
    const nx = config.nx;
    const ny = config.ny;
    c.width = nx;
    c.height = ny;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, nx, ny);
    const family = familyFromMaterial(materialId);
    if (view === "sem" || view === "hex") {
      const holes = frame?.holes ?? [];
      if (holes.length) {
        ctx.strokeStyle = overlayRgba(look, "brush", family, 0.95);
        ctx.lineWidth = 1;
        for (const h of holes) {
          const px = h.x / config.dxNm;
          const py = h.y / config.dxNm;
          const r = Math.max(h.cd / (2 * config.dxNm), 1.2);
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      return;
    }
    // Paper figures keep the field clean and show the chemo key as a thin
    // prepattern bar at the top of the FOV (Nealey / LiNe schematic).
    if (config.guide.kind === "chemo-lamellar" || config.guide.kind === "fin-array") {
      const LsPx = config.guide.LsNm / config.dxNm;
      const dutyPx = config.guide.duty * LsPx;
      const shiftPx = (config.guide.overlayNm || 0) / config.dxNm;
      const barH = Math.max(3, (ny * 0.05) | 0);
      const brush = overlayRgba(look, "brush", family, 0.95);
      const guide = overlayRgba(look, "guide", family, 0.95);
      for (let x = 0; x < nx; x++) {
        const mod = (((x - shiftPx) % LsPx) + LsPx) % LsPx;
        ctx.fillStyle = mod < dutyPx ? guide : brush;
        ctx.fillRect(x, 0, 1, barH);
      }
    }
    if (config.templateDefect === "stitch") {
      ctx.fillStyle = overlayRgba(look, "stitch", family);
      ctx.fillRect(0, ny / 2 - 1, nx, 2);
    }
    const holes = frame?.holes ?? [];
    if (holes.length) {
      ctx.strokeStyle = overlayRgba(look, "brush", family, 0.95);
      ctx.lineWidth = 1;
      for (const h of holes) {
        const px = h.x / config.dxNm;
        const py = h.y / config.dxNm;
        const r = Math.max(h.cd / (2 * config.dxNm), 1.2);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = overlayRgba(look, "guide", family, 0.95);
        ctx.fillRect(px - 0.7, py - 0.7, 1.4, 1.4);
      }
    }
    if (view === "edges" && frame?.edges) {
      ctx.fillStyle = "rgba(18,32,51,0.92)";
      for (const e of frame.edges) {
        ctx.fillRect(e.x / config.dxNm - 0.6, e.y / config.dxNm - 0.6, 1.2, 1.2);
      }
    }
  }, [config, frame, view, look, materialId]);

  const mat = materialById(materialId);
  const m = frame?.metrics;

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
    setPresetId(id);
    setMaterialId(p.materialId);
    setConfig(p.config);
    setHistory([]);
    worker?.postMessage({ type: "init", config: p.config });
  }

  function applyMaterial(id: string) {
    const next = materialById(id);
    setMaterialId(id);
    setConfig((c) => ({
      ...c,
      chiN: next.chiN,
      f: next.f,
      L0Nm: next.L0Nm,
      T: next.TAnnealK,
      dxNm: (8 * next.L0Nm) / c.nx,
      guide: {
        ...c.guide,
        LsNm: 2 * next.L0Nm,
        duty: 0.25,
      },
    }));
  }

  function patch<K extends keyof SimConfig>(key: K, value: SimConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function exportRecipe() {
    const blob = new Blob(
      [
        JSON.stringify(
          { app: "DSA Research Bench", materialId, presetId, config, metrics: m },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dsa-bench-${presetId}.json`;
    a.click();
  }

  function exportCsv() {
    if (!frame) return;
    const rows = [
      "t,energy,order,cd_nm,lwr_nm,dsa_ler_nm,etch_ler_nm,etch_lwr_nm,guide_ler_nm,rectification,dislocations,bridges,misaligned,lcdu,ppe,ccd_nm,ccd_sigma,n_holes,circularity,jumps,chiN_eff,M_eff,defect,pitch_nm,corr_nm,psd0,w_nm,dose_saving,repairability,T,loss_total",
      [
        m?.t,
        m?.energy,
        m?.order,
        m?.cdNm,
        m?.lwrNm,
        m?.dsaLerNm,
        m?.etchLerNm,
        m?.etchLwrNm,
        m?.guideLerNm,
        m?.rectification,
        m?.dislocations,
        m?.nBridges,
        m?.misalignedFrac,
        m?.lcduNm,
        m?.ppeNm,
        m?.ccdNm,
        m?.ccdSigmaNm,
        m?.nHoles,
        m?.circularity,
        m?.nJumpOutliers,
        m?.chiNEff,
        m?.mobilityEff,
        m?.defectIndex,
        m?.peakPitchNm,
        m?.corrLengthNm,
        m?.psd0,
        m?.interfaceWidthNm,
        m?.doseSaving,
        m?.repairability,
        m?.annealT,
        m?.lossTotal,
      ].join(","),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    a.download = "dsa-bench-metrology.csv";
    a.click();
  }

  function exportHistory() {
    const rows = ["t,energy,order,ler_nm", ...history.map((h) => `${h.t},${h.energy},${h.order},${h.ler}`)];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    a.download = "dsa-bench-anneal.csv";
    a.click();
  }

  function exportSi() {
    if (!scft) return;
    const si = scftSiPayload(scft, config);
    const json = new Blob([JSON.stringify(si, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(json);
    a.download = `dsa-scft-si-${presetId}.json`;
    a.click();
    const csv = new Blob([scftSiCsv(si)], { type: "text/csv" });
    const b = document.createElement("a");
    b.href = URL.createObjectURL(csv);
    b.download = `dsa-scft-si-${presetId}.csv`;
    b.click();
  }

  function exportFigure() {
    const src = canvasRef.current;
    const over = overlayRef.current;
    if (!src) return;
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
    if (over) ctx.drawImage(over, 0, 0);
    const barNm = niceScaleBarNm(fov);
    const barPx = barNm / config.dxNm;
    ctx.fillStyle = "#eeeaf8";
    ctx.fillRect(6, src.height - 16, barPx + 4, 8);
    ctx.fillStyle = "#12101c";
    ctx.fillRect(8, src.height - 13, barPx, 3);
    ctx.fillStyle = "#eeeaf8";
    ctx.font = "8px IBM Plex Mono, monospace";
    ctx.fillText(`${barNm} nm`, 8, src.height - 18);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dsa-figure-${look}.png`;
      a.click();
    }, "image/png");
  }

  const defectTone =
    (m?.defectIndex ?? 1) < 0.45 ? "text-good" : (m?.defectIndex ?? 1) < 0.9 ? "text-warn" : "text-danger";
  const verdict = judgeRun(config, m);

  const fov = config.nx * config.dxNm;
  const barNm = niceScaleBarNm(fov);
  const pal = paletteFor(look, familyFromMaterial(materialId));
  const cdL0 =
    (config.guide.cdNm || config.guide.duty * config.guide.LsNm) / Math.max(config.L0Nm, 1e-6);
  const inMaekawa = cdL0 >= 0.57 && cdL0 <= 1;
  const twoStep = config.T2 > 0 && config.tSwitch > 0;
  const recipe = PRESETS.find((p) => p.id === presetId);
  const recipeHits = query.trim()
    ? PRESETS.filter((p) =>
        `${p.title} ${p.blurb} ${p.cpuUse}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [];
  const energyPie = [
    { name: "bulk", value: Math.abs(frame?.energyParts?.bulk ?? 0) },
    { name: "grad", value: Math.abs(frame?.energyParts?.grad ?? 0) },
    { name: "long", value: Math.abs(frame?.energyParts?.longr ?? 0) },
  ];
  const pieColors = ["var(--color-accent)", "var(--color-teal)", "var(--color-amber)"];
  const pageTitle =
    lab === "tmd"
      ? tmdTab === "materials"
        ? "TMD materials"
        : tmdTab === "context"
          ? "Successful DSA combinations"
          : "2D FET bench"
      : tab === "window"
        ? "Process window"
        : tab === "repair"
          ? "Repairability"
          : tab === "inverse"
            ? "Inverse search"
            : tab === "theory"
              ? "Solver model"
              : (recipe?.title ?? "Chamber");
  const crumb = lab === "tmd" ? "TMD FET" : "Patterning";
  const cdTarget = config.L0Nm * 0.5;
  const cdDelta = m?.cdNm != null && cdTarget > 0 ? ((m.cdNm - cdTarget) / cdTarget) * 100 : 0;

  function goDsa(next: Tab) {
    setLab("dsa");
    setTab(next);
    setNavOpen(false);
  }
  function goTmd(next: TmdTab) {
    setLab("tmd");
    setTmdTab(next);
    setNavOpen(false);
  }

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
      <ExplainLayer enabled={explainHover} />
      {navOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-bg/70 lg:hidden"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-60 flex-col border-r border-border bg-sidebar p-4 lg:static lg:flex",
          navOpen ? "flex" : "hidden",
        )}
      >
        <div className="mb-6 flex items-center gap-3 px-1">
          <span className="flex size-9 items-center justify-center rounded-md bg-accent font-display text-lg font-bold text-accent-fg">
            D
          </span>
          <div>
            <p className="font-display text-sm font-semibold leading-tight">DSA Bench</p>
            <p className="text-xs text-muted">local · no API</p>
          </div>
        </div>
        <p className="px-2 pb-2 text-xs uppercase tracking-[0.16em] text-muted">Patterning</p>
        <nav className="flex flex-col gap-1">
          {(
            [
              ["assemble", "Chamber", LayoutGrid, "Live anneal: Ohta–Kawasaki field, LER, and SCFT on the current recipe."],
              ["window", "Window", Columns3, "Sweep CD/L0, overlay, dose, or χN. Colour is defect, repair, or rectification."],
              ["repair", "Repair", Hammer, "Template defects (missing stripe, stitch) and whether the film heals them."],
              ["inverse", "Inverse", Crosshair, "Optimize guide parameters with a Gaussian process and 2D SCFT."],
              ["theory", "Model", BookOpen, "Spectral OK + SCFT methods, residuals, Matsen D*."],
            ] as const
          ).map(([id, label, Icon, explain]) => (
            <button
              key={id}
              type="button"
              onClick={() => goDsa(id)}
              className={cn("nav-item", lab === "dsa" && tab === id && "nav-item-active")}
              data-explain={explain}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <p className="mt-6 px-2 pb-2 text-xs uppercase tracking-[0.16em] text-muted">TMD FET</p>
        <p className="px-2 pb-2 text-xs leading-relaxed text-muted">
          Transistor stack. Separate from DSA patterning.
        </p>
        <nav className="flex flex-col gap-1">
          {(
            [
              ["bench", "2D FET", Cpu, "EKV + 2 Rc transistor stack versus IRDS 2D option."],
              ["materials", "Materials", FlaskConical, "MX₂ library. Group-6 logic channels plus research extras."],
              ["context", "Notes", BookOpen, "Published DSA combinations that passed on wafer or SEM. Load into Chamber."],
            ] as const
          ).map(([id, label, Icon, explain]) => (
            <button
              key={id}
              type="button"
              onClick={() => goTmd(id)}
              className={cn("nav-item", lab === "tmd" && tmdTab === id && "nav-item-active")}
              data-explain={explain}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <p className="mt-auto px-2 pt-8 text-xs leading-relaxed text-muted">
          SCFT and Ohta–Kawasaki run in this browser. Nothing is sent out.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu" data-explain="Open the section list.">
              {navOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
            <div className="relative min-w-0 flex-1" data-explain="Type to jump to a published recipe (P24, via, LiNe, Maekawa).">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                className="search-field"
                placeholder="Search recipes, guides, materials"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search recipes"
              />
              {query.trim() && recipeHits.length > 0 ? (
                <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-border bg-surface shadow-border">
                  {recipeHits.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-elevated"
                      onClick={() => {
                        applyPreset(p.id);
                        setQuery("");
                        goDsa("assemble");
                      }}
                    >
                      <span className="text-sm">{p.title}</span>
                      <span className="text-xs text-muted">{p.cpuUse}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              aria-pressed={explainHover}
              data-explain="When on, hovering a control shows a short explanation of what it does."
              onClick={() => setExplainHover((v) => !v)}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm",
                explainHover ? "border-accent bg-elevated text-fg" : "border-border text-muted hover:text-fg",
              )}
            >
              <Info className="size-4" />
              <span className="hidden sm:inline">{explainHover ? "Help on" : "Help off"}</span>
            </button>
            <span
              className="hidden rounded-md border border-border px-2 py-1 font-mono text-xs uppercase tracking-[0.14em] text-muted sm:inline"
              data-explain="SCFT, Ohta–Kawasaki, inverse search, and TMD FET all run in this browser. Nothing is sent out."
            >
              local · no API
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="mb-5">
            <p className="text-xs text-muted">
              {crumb} / {pageTitle}
            </p>
            <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight">{pageTitle}</h1>
          </div>

      {lab === "tmd" ? (
        <TmdLab
          tab={tmdTab}
          bench={bench}
          onBench={setBench}
          onLoadRecipe={(id) => {
            applyPreset(id);
            goDsa("assemble");
          }}
        />
      ) : tab === "theory" ? (
        <Theory />
      ) : tab === "window" ? (
        <WindowPanel config={config} worker={worker} />
      ) : tab === "repair" ? (
        <RepairPanel config={config} worker={worker} onConfig={setConfig} />
      ) : tab === "inverse" ? (
        <InversePanel
          config={config}
          onApply={(next) => {
            setConfig(next);
            setHistory([]);
            setScft(null);
            setFilm(null);
            setRunning(false);
            setTab("assemble");
            worker?.postMessage({ type: "init", config: next });
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Critical dimension"
              value={`${fmt(m?.cdNm)} nm`}
              hint="DSA line CD versus L0/2."
              delta={`${cdDelta >= 0 ? "+" : ""}${cdDelta.toFixed(1)}% vs L0/2`}
              up={Math.abs(cdDelta) < 8}
            >
              <div className="mt-3 flex items-center gap-3">
                <div className="h-16 w-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={energyPie} dataKey="value" innerRadius={18} outerRadius={28} stroke="none">
                        {energyPie.map((row, i) => (
                          <Cell key={row.name} fill={pieColors[i]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1 text-xs text-muted">
                  {energyPie.map((row, i) => (
                    <li key={row.name} className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: pieColors[i] }} />
                      {row.name} {row.value.toFixed(2)}
                    </li>
                  ))}
                </ul>
              </div>
            </KpiCard>
            <KpiCard
              label="After-etch LER"
              value={`${fmt(m?.etchLerNm, 2)} nm`}
              hint={`P24 spec ${P24_SPEC.lerNm} nm.`}
              delta={(m?.etchLerNm ?? 9) <= P24_SPEC.lerNm ? "meets P24" : "over P24"}
              up={(m?.etchLerNm ?? 9) <= P24_SPEC.lerNm}
            >
              <div className="mt-3 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <Area type="monotone" dataKey="ler" stroke="var(--color-accent)" fill="var(--color-accent)" fillOpacity={0.25} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </KpiCard>
            <KpiCard
              label="Order parameter"
              value={fmt(m?.order, 2)}
              hint="Microphase order from S(k)."
              delta={m?.morphology ?? "—"}
              up
            >
              <p className="mt-3 text-xs text-muted">
                χN {fmt(m?.chiNEff, 1)} · {m?.steps ?? 0} steps
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-good"
                  style={{ width: `${Math.min(100, Math.max(4, (m?.order ?? 0) * 100))}%` }}
                />
              </div>
            </KpiCard>
            <KpiCard
              label="Defect index"
              value={fmt(m?.defectIndex, 2)}
              hint="Composite of dislocations, bridges, and misalignment."
              delta={(m?.defectIndex ?? 1) < 0.45 ? "pass" : "watch"}
              up={(m?.defectIndex ?? 1) < 0.45}
            >
              <div className="mt-3 flex -space-x-2">
                {["PS", "PMMA", "NL"].map((tag) => (
                  <span
                    key={tag}
                    className="flex size-8 items-center justify-center rounded-full border border-border bg-elevated font-mono text-xs"
                  >
                    {tag[0]}
                  </span>
                ))}
                <span className="flex size-8 items-center justify-center rounded-full border border-border bg-accent font-mono text-xs text-accent-fg">
                  {m?.morphology?.[0] ?? "+"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                {m?.dislocations ?? 0} dislocations · {m?.nBridges ?? 0} bridges
              </p>
            </KpiCard>
          </div>

        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_240px]">
          <aside className="flex flex-col gap-3 lg:col-start-1">
            <Panel className="panel-teal">
              <label className="block" data-explain="Published process recipes. Picks BCP, L0, guide, and anneal together.">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                  Recipe
                </span>
                <select
                  className="field mt-1"
                  value={presetId}
                  onChange={(e) => applyPreset(e.target.value)}
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs leading-relaxed text-muted">{recipe?.blurb}</p>
              <p className="mt-1 text-xs text-accent">{recipe?.cpuUse}</p>
            </Panel>

            <Fold title="Film" defaultOpen hint="BCP, χN (segregation), and natural period L0.">
              <select
                className="field"
                value={materialId}
                onChange={(e) => applyMaterial(e.target.value)}
              >
                {MATERIALS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 font-mono text-xs text-muted">
                {mat.blockA} / {mat.blockB} · N={mat.N} · {mat.morphology}
              </p>
              <Slider
                label="χN"
                hint="Segregation strength. Higher χN sharpens interfaces and slows kinetics."
                value={config.chiN}
                min={8}
                max={70}
                step={0.5}
                onChange={(v) => patch("chiN", v)}
              />
              <Slider
                label="L0 (nm)"
                hint="Natural period of the copolymer."
                value={config.L0Nm}
                min={8}
                max={40}
                step={0.5}
                onChange={(v) => {
                  setConfig((c) => ({
                    ...c,
                    L0Nm: v,
                    dxNm: (8 * v) / c.nx,
                  }));
                }}
              />
            </Fold>
            <Fold title="Blend / f" defaultOpen={false} hint="A-block volume fraction and short-chain blend. f ~ 0.5 lamellae; ~0.3 cylinders.">
              <Slider
                label="f (A volume)"
                hint="Volume fraction of block A. ~0.5 → lamellae; ~0.3 → cylinders."
                value={config.f}
                min={0.25}
                max={0.5}
                step={0.01}
                onChange={(v) => patch("f", v)}
              />
              <Slider
                label="Blend φ_short"
                hint="Short-chain volume. Lowers L0; quench vs anneal sets mixing."
                value={config.blendFrac}
                min={0}
                max={0.5}
                step={0.02}
                onChange={(v) => patch("blendFrac", v)}
              />
              <div className="mt-2 flex gap-2">
                {(["quench", "anneal"] as BlendPath[]).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={config.blendPath === p ? "default" : "outline"}
                    onClick={() => patch("blendPath", p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </Fold>

            <Fold title="Guide" defaultOpen hint="Chemo or grapho template. CD/L0 in the Maekawa island (0.57–1.0) registers lines.">
              <select
                className="field"
                value={config.guide.kind}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    guide: { ...c.guide, kind: e.target.value as GuideKind },
                  }))
                }
              >
                {(Object.keys(GUIDE_LABELS) as GuideKind[]).map((k) => (
                  <option key={k} value={k}>
                    {GUIDE_LABELS[k]}
                  </option>
                ))}
              </select>
              <select
                className="field mt-2"
                value={config.templateDefect}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    templateDefect: e.target.value as TemplateDefect,
                  }))
                }
              >
                {(Object.keys(TEMPLATE_DEFECT_LABELS) as TemplateDefect[]).map((k) => (
                  <option key={k} value={k}>
                    {TEMPLATE_DEFECT_LABELS[k]}
                  </option>
                ))}
              </select>
              <Slider
                label="Ls (nm)"
                hint="Guide pitch. Integer × L0 is density multiplication."
                value={config.guide.LsNm}
                min={config.L0Nm}
                max={config.L0Nm * 8}
                step={0.5}
                onChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    guide: {
                      ...c.guide,
                      LsNm: v,
                      duty: c.guide.cdNm > 0 ? c.guide.cdNm / v : c.guide.duty,
                    },
                  }))
                }
              />
              <Slider
                label="Guide CD (nm)"
                hint="Wetting-stripe width. Maekawa window ~0.57–1.0 L0."
                value={config.guide.cdNm || config.guide.duty * config.guide.LsNm}
                min={4}
                max={Math.max(8, config.guide.LsNm * 0.7)}
                step={0.5}
                onChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    guide: { ...c.guide, cdNm: v, duty: v / c.guide.LsNm },
                  }))
                }
              />
              <p className={cn("mt-1 font-mono text-xs tabular-nums", inMaekawa ? "text-good" : "text-warn")}>
                CD/L0 {cdL0.toFixed(2)} · Maekawa island 0.57–1.0 {inMaekawa ? "in" : "out"}
              </p>
              <Slider
                label="Overlay (nm)"
                hint="Rigid shift of the chemo stripe."
                value={config.guide.overlayNm}
                min={0}
                max={8}
                step={0.2}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, guide: { ...c.guide, overlayNm: v } }))
                }
              />
              <Slider
                label="Affinity h0"
                hint="Chemical contrast of the guide."
                value={config.guide.strength}
                min={0}
                max={2.5}
                step={0.05}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, guide: { ...c.guide, strength: v } }))
                }
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant={config.guide.wetting > 0 ? "default" : "outline"}
                  onClick={() =>
                    setConfig((c) => ({ ...c, guide: { ...c.guide, wetting: 1 } }))
                  }
                >
                  A-wet
                </Button>
                <Button
                  size="sm"
                  variant={config.guide.wetting < 0 ? "default" : "outline"}
                  onClick={() =>
                    setConfig((c) => ({ ...c, guide: { ...c.guide, wetting: -1 } }))
                  }
                >
                  B-wet
                </Button>
              </div>
              {config.guide.kind === "contact-holes" || config.guide.kind === "via-pair" ? (
                <Slider
                  label="Hole Ø (nm)"
                  hint="Grapho well diameter. Sets shrink CD for contacts."
                  value={config.guide.holeNm}
                  min={6}
                  max={28}
                  step={0.5}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, guide: { ...c.guide, holeNm: v } }))
                  }
                />
              ) : null}
              {config.guide.kind === "via-pair" ? (
                <>
                  <Slider
                    label="Pair spacing (nm)"
                    hint="Hole–hole centre distance inside the peanut."
                    value={config.guide.pairNm}
                    min={8}
                    max={40}
                    step={0.5}
                    onChange={(v) =>
                      setConfig((c) => ({ ...c, guide: { ...c.guide, pairNm: v } }))
                    }
                  />
                  <Slider
                    label="τ contour"
                    hint="Gaussian peanut threshold. Zhou 2025: manufacturable τ ≳ 0.35."
                    value={config.guide.tau}
                    min={0.18}
                    max={0.7}
                    step={0.01}
                    onChange={(v) =>
                      setConfig((c) => ({ ...c, guide: { ...c.guide, tau: v } }))
                    }
                  />
                </>
              ) : null}
            </Fold>

            <Fold title="Anneal" defaultOpen={false} hint="Temperature, two-step quench, microwave mobility, and film thickness.">
              <Slider
                label="T (K)"
                hint="Anneal temperature. High T kills dislocations; low T sharpens w."
                value={config.T}
                min={400}
                max={620}
                step={5}
                onChange={(v) => patch("T", v)}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant={twoStep ? "default" : "outline"}
                  onClick={() =>
                    setConfig((c) =>
                      twoStep
                        ? { ...c, T2: 0, tSwitch: 0 }
                        : { ...c, T2: Math.max(400, c.T - 80), tSwitch: 7 },
                    )
                  }
                >
                  Two-step
                </Button>
              </div>
              {twoStep ? (
                <Slider
                  label="T2 (K)"
                  value={config.T2}
                  min={380}
                  max={600}
                  step={5}
                  onChange={(v) => patch("T2", v)}
                />
              ) : null}
              <Slider
                label="Microwave ×"
                hint="Mobility multiplier. Proxy for microwave-assisted anneal."
                value={config.microwave}
                min={1}
                max={6}
                step={0.1}
                onChange={(v) => patch("microwave", v)}
              />
              <Slider
                label="t_film / L0"
                hint="Film thickness in natural periods. >3 L0 traps defects."
                value={config.tFilmOverL0}
                min={0.6}
                max={5}
                step={0.1}
                onChange={(v) => patch("tFilmOverL0", v)}
              />
              <Slider
                label="Mobility M0"
                value={config.mobility}
                min={0.2}
                max={2.5}
                step={0.05}
                onChange={(v) => patch("mobility", v)}
              />
              <Slider
                label="Thermal noise"
                value={config.noise}
                min={0}
                max={0.06}
                step={0.002}
                onChange={(v) => patch("noise", v)}
              />
              <p className="mt-2 font-mono text-xs text-muted tabular-nums">
                T {m?.annealT?.toFixed(0) ?? "—"} K · χN_eff {m?.chiNEff?.toFixed(1) ?? "—"} · M_eff{" "}
                {m?.mobilityEff?.toFixed(2) ?? "—"}
              </p>
            </Fold>

            <Fold title="EUV" defaultOpen={false} hint="Shot-noise LER on 1:1 guides scales as dose^−1/2. Δγ sets film orientation.">
              <Slider
                label="EUV dose (mJ/cm²)"
                hint="Shot-noise LER ∝ dose^−1/2 on 1:1 guides."
                value={config.euvDose}
                min={0}
                max={80}
                step={1}
                onChange={(v) => {
                  const pitch = config.guide.LsNm || config.L0Nm;
                  const stoch = applyDoseToConfig(v, pitch);
                  setConfig((c) => ({ ...c, ...stoch }));
                }}
              />
              <Slider
                label="EUV LER 3σ (nm)"
                value={config.euvLerNm}
                min={0}
                max={5}
                step={0.1}
                onChange={(v) => patch("euvLerNm", v)}
              />
              <Slider
                label="EUV CD jitter (nm)"
                value={config.euvCdJitterNm}
                min={0}
                max={3}
                step={0.1}
                onChange={(v) => patch("euvCdJitterNm", v)}
              />
              <Slider
                label="Δγ mismatch"
                hint="Surface-energy mismatch. Drives perpendicular vs parallel."
                value={config.deltaGamma}
                min={-1.2}
                max={1.2}
                step={0.05}
                onChange={(v) => patch("deltaGamma", v)}
              />
            </Fold>
          </aside>

          <main className="order-first flex min-w-0 flex-col gap-3 lg:order-none lg:col-start-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setRunning((r) => !r)} data-explain="Run or pause Model-B (Cahn–Hilliard) anneal of the current field.">
                {running ? <Pause className="size-4" /> : <Play className="size-4" />}
                {running ? "Pause" : "Anneal"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-explain="Reset the field to a fresh quench. History is cleared."
                onClick={() => {
                  setHistory([]);
                  worker?.postMessage({ type: "reset" });
                }}
              >
                <RotateCcw className="size-4" />
                Quench
              </Button>
              <Button size="sm" variant="ghost" onClick={exportRecipe} data-explain="Download the current recipe as JSON. Stays on this machine.">
                <Download className="size-4" />
                Recipe
              </Button>
              <Button size="sm" variant="ghost" onClick={exportCsv} data-explain="Download a CSV snapshot of the live metrics.">
                <Download className="size-4" />
                Snapshot
              </Button>
              <Button size="sm" variant="ghost" onClick={exportHistory} data-explain="Download energy, order, and LER versus time.">
                <Download className="size-4" />
                Trace
              </Button>
              <Button size="sm" variant="ghost" onClick={exportFigure} data-explain="PNG of the field with a nanometre scale bar.">
                <Download className="size-4" />
                Figure
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={exportSi}
                disabled={!scft}
                data-explain="Download SCFT methods SI: F, residual, D* vs Matsen, F(D), mix history. Local JSON + CSV."
              >
                <Download className="size-4" />
                SI
              </Button>
              <span
                className="ml-auto font-mono text-xs text-muted tabular-nums"
                data-explain="Field of view, grid, and anneal step count."
              >
                {fov.toFixed(0)} nm · {config.nx}² · {m?.steps ?? 0}
              </span>
            </div>
            <ViewSwitch
              view={view}
              onView={setView}
              scftBusy={scftBusy}
              filmBusy={filmBusy}
              onScft={() => {
                if (!worker) return;
                setScftBusy(true);
                setRunning(false);
                worker.postMessage({ type: "scft", config });
              }}
              onFilm={() => {
                if (!worker) return;
                setFilmBusy(true);
                setRunning(false);
                worker.postMessage({ type: "film3d", config });
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <LookSwitch look={look} onLook={setLook} />
            </div>
            <ColorBar look={look} family={familyFromMaterial(materialId)} />
            {config.guide.kind === "chemo-lamellar" || config.guide.kind === "fin-array" ? (
              <GuideStrip
                look={look}
                family={familyFromMaterial(materialId)}
                LsNm={config.guide.LsNm}
                cdNm={config.guide.cdNm}
                duty={config.guide.duty}
                L0Nm={config.L0Nm}
              />
            ) : null}
            <ScftMeta
              scft={scft}
              live={{ pitchNm: m?.peakPitchNm, cdNm: m?.cdNm, lerNm: m?.dsaLerNm }}
            />

            {view === "film" ? (
              <FilmStage film={film} />
            ) : view === "cut" ? (
              <LineCutChart frame={frame} />
            ) : view === "sk" ? (
              <SkChart frame={frame} />
            ) : view === "psd" ? (
              <PsdChart frame={frame} />
            ) : (
            <div className="relative overflow-hidden rounded-xl border border-border bg-elevated chamber-grid">
              <div className="relative mx-auto size-72 lg:h-96 lg:w-96">
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 size-full [image-rendering:pixelated]"
                />
                <canvas
                  ref={overlayRef}
                  className="absolute inset-0 size-full [image-rendering:pixelated]"
                />
                <div className="absolute left-3 top-3 rounded-md bg-bg/90 px-2 py-1 font-mono text-xs uppercase tracking-widest text-header-fg">
                  {view === "sem"
                    ? "CD-SEM · PS bright"
                    : view === "hex"
                      ? "director · hue = 2θ"
                      : (
                        <>
                          φ · <span className="text-ps">{pal.psLabel}</span> ·{" "}
                          <span className="text-pmma">{pal.pmmaLabel}</span>
                        </>
                      )}
                </div>
                <div className="absolute bottom-16 left-3 flex items-center gap-2 text-header-fg">
                  <span
                    className="h-1 rounded-sm bg-header-fg"
                    style={{ width: `${Math.max(12, (barNm / fov) * 100)}%` }}
                  />
                  <span className="rounded-md bg-bg/90 px-1.5 py-0.5 font-mono text-xs tabular-nums">
                    {barNm} nm
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-bg/90 px-3 py-2 text-header-fg">
                  <p
                    className={cn(
                      "text-xs font-medium uppercase tracking-[0.16em]",
                      verdict.level === "pass" ? "text-teal" : verdict.level === "warn" ? "text-amber" : "text-accent",
                    )}
                  >
                    {verdict.title}
                    {m?.morphology ? ` · ${m.morphology}` : ""}
                  </p>
                  <p className="mt-0.5 text-sm text-header-fg">{verdict.reason}</p>
                  <p className="mt-0.5 text-xs text-header-muted">{verdict.next}</p>
                </div>
              </div>
            </div>
            )}

            {scft ? <ScftProfileChart scft={scft} /> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-56 rounded-xl border border-border bg-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-muted">Anneal this run</p>
                  <p className="font-mono text-xs text-muted tabular-nums">{fov.toFixed(0)} nm</p>
                </div>
                <p className="font-display text-2xl font-semibold tabular-nums">
                  {fmt(m?.energy, 2)}
                  <span className="ml-2 text-xs font-normal text-good">order {fmt(m?.order, 2)}</span>
                </p>
                <div className="mt-2 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="t" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <RTooltip
                      contentStyle={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        fontSize: 12,
                        color: "var(--color-fg)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="energy"
                      stroke="var(--color-teal)"
                      fill="var(--color-teal)"
                      fillOpacity={0.22}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="order"
                      stroke="var(--color-accent)"
                      fill="transparent"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="ler"
                      stroke="var(--color-amber)"
                      fill="transparent"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                </div>
              </div>
              <EnergyBars parts={frame?.energyParts} />
            </div>
          </main>

          <aside className="flex flex-col gap-3 lg:col-start-3">
            <Panel className="panel-crimson">
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
                Key
              </div>
              <Metric k="CD" v={fmt(m?.cdNm)} u="nm" hint="Critical dimension of the DSA line." />
              <Metric
                k="Morphology"
                v={m?.morphology ?? "—"}
                u=""
                hint="LAM / HEX / DIS from S(k) and hexatic ψ6."
              />
              <Metric
                k="After-etch LER"
                v={fmt(m?.etchLerNm, 2)}
                u="nm"
                hint={`3σ after polar-block etch. 0.33-NA P24 spec ${P24_SPEC.lerNm} nm.`}
                className={(m?.etchLerNm ?? 9) <= P24_SPEC.lerNm ? "text-good" : "text-warn"}
              />
              <Metric
                k="Defect index"
                v={fmt(m?.defectIndex, 2)}
                u=""
                hint="Composite of dislocations, bridges, and misalignment."
                className={defectTone}
              />
              <Metric
                k="Rectification"
                v={fmt(m?.rectification, 2)}
                u="×"
                hint="Guide LER / DSA LER. >1 means the film healed the template."
                className={(m?.rectification ?? 0) > 1.15 ? "text-good" : "text-warn"}
              />
              <p className="mt-2 font-mono text-xs text-muted tabular-nums">
                Ls/L0 {fmt(config.guide.LsNm / (m?.blendL0Nm || config.L0Nm), 2)}× · CD/L0{" "}
                {fmt((config.guide.cdNm || config.guide.duty * config.guide.LsNm) / config.L0Nm, 2)}
              </p>
            </Panel>
            <Fold title="All metrology" defaultOpen={false} hint="Full CD, LER, LCDU, CCD, dislocations, and Zhou loss on the live field.">
              <Metric k="Pitch S(k)" v={fmt(m?.peakPitchNm)} u="nm" />
              <Metric k="Guide LER" v={fmt(m?.guideLerNm, 2)} u="nm" />
              <Metric k="ξ (corr.)" v={fmt(m?.corrLengthNm, 1)} u="nm" />
              <Metric k="w interface" v={fmt(m?.interfaceWidthNm, 2)} u="nm" />
              <Metric k="LER floor" v={fmt(m?.lerFloorNm, 2)} u="nm" />
              <Metric k="LWR 3σ" v={fmt(m?.lwrNm)} u="nm" />
              <Metric k="LCDU" v={fmt(m?.lcduNm, 2)} u="nm" />
              <Metric k="PPE" v={fmt(m?.ppeNm, 2)} u="nm" />
              <Metric k="CCD" v={fmt(m?.ccdNm, 1)} u="nm" hint="Nearest-neighbour centre-to-centre. IWAPS 2025." />
              <Metric k="CCD 3σ" v={fmt(m?.ccdSigmaNm, 2)} u="nm" />
              <Metric k="Holes" v={String(m?.nHoles ?? "—")} u="" />
              <Metric k="Circularity" v={fmt(m?.circularity, 2)} u="" />
              <Metric
                k="CCD jumps"
                v={String(m?.nJumpOutliers ?? "—")}
                u=""
                hint="CCD outliers beyond 1.5 nm of the median."
                className={(m?.nJumpOutliers ?? 0) > 0 ? "text-danger" : "text-fg"}
              />
              <Metric k="Etch amp" v={fmt(m?.etchAmp, 2)} u="×" />
              <Metric k="After-etch LWR" v={fmt(m?.etchLwrNm, 2)} u="nm" />
              <Metric k="Residual" v={fmt(m?.residualNm, 2)} u="nm" hint="Wetting-asymmetry residual layer." />
              <Metric k="L_total" v={fmt(m?.lossTotal, 3)} u="" hint="Zhou 2025 inverse loss on the live field." />
              <Metric k="Dislocations" v={String(m?.dislocations ?? "—")} u="" />
              <Metric k="Misaligned" v={fmt((m?.misalignedFrac ?? 0) * 100, 0)} u="%" />
              <Metric k="Bridges" v={String(m?.nBridges ?? "—")} u="" />
              <Metric
                k="Repairability"
                v={fmt(m?.repairability, 2)}
                u=""
                className={(m?.repairability ?? 1) < 0.4 ? "text-danger" : "text-good"}
              />
              <Metric
                k="Kinetic trap"
                v={fmt(m?.kineticTrap, 2)}
                u=""
                className={(m?.kineticTrap ?? 0) > 0.8 ? "text-danger" : "text-fg"}
              />
              <Metric k="Ls / L0" v={fmt(config.guide.LsNm / (m?.blendL0Nm || config.L0Nm), 2)} u="×" />
              <Metric k="CD / L0" v={fmt((config.guide.cdNm || 0) / config.L0Nm, 2)} u="" />
              <Metric k="χN_eff" v={fmt(m?.chiNEff, 1)} u="" />
              <Metric k="(χN)_ODT" v={fmt(m?.chiNOdt, 1)} u="" />
              <Metric k="M_eff" v={fmt(m?.mobilityEff, 2)} u="" />
            </Fold>
            <PhaseDiagram f={config.f} chiN={m?.chiNEff ?? config.chiN} />
          </aside>
        </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
