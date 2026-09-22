import { OkSolver } from "./ok-solver.ts";
import { sampleProcessWindow, type WindowKind } from "./process-window.ts";
import { runSepa, type SepaReport } from "./sepa.ts";
import { runScft, runFilmScft, type ScftReport } from "./scft.ts";
import { runFilm3d, type Film3dReport } from "./film3d.ts";
import { renderRgba } from "./metrology.ts";
import type { SimConfig } from "./types.ts";

let solver: OkSolver | null = null;

export type WorkerIn =
  | { type: "init"; config: SimConfig }
  | { type: "step"; count: number }
  | { type: "reset" }
  | { type: "setConfig"; config: SimConfig; keepField?: boolean }
  | { type: "window"; config: SimConfig; kind?: WindowKind }
  | { type: "sepa"; config: SimConfig }
  | { type: "scft"; config: SimConfig }
  | { type: "film3d"; config: SimConfig };

type WindowOut = { type: "window"; cells: ReturnType<typeof sampleProcessWindow> };
type SepaOut = { type: "sepa"; report: SepaReport };
type ScftOut = { type: "scft"; report: ScftReport; rgba: Uint8ClampedArray };
type FilmOut = { type: "film3d"; report: Film3dReport };

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    solver = new OkSolver(msg.config);
    postFrame();
    return;
  }
  if (msg.type === "window") {
    const cells = sampleProcessWindow(msg.config, msg.kind ?? "cd", { steps: 85 });
    const out: WindowOut = { type: "window", cells };
    self.postMessage(out);
    return;
  }
  if (msg.type === "sepa") {
    const report = runSepa(msg.config, { layers: 6, steps: 70 });
    const out: SepaOut = { type: "sepa", report };
    self.postMessage(out);
    return;
  }
  if (msg.type === "scft") {
    const guided = msg.config.guide.kind !== "none" && msg.config.guide.strength >= 0.05;
    const hex = msg.config.f < 0.42;
    const report = runScft(msg.config, {
      nx: 64,
      Ns: guided ? 56 : 48,
      maxIter: guided ? 160 : hex ? 120 : 48,
    });
    const dummy = new Uint8Array(report.nx * report.ny);
    dummy.fill(1);
    const rgba = renderRgba(report.phi, { ...msg.config, nx: report.nx, ny: report.ny }, dummy);
    const out: ScftOut = { type: "scft", report, rgba };
    (self as unknown as WorkerScope).postMessage(out, [rgba.buffer]);
    return;
  }
  if (msg.type === "film3d") {
    const report = runFilm3d(msg.config, { nx: 32, nz: 16, steps: 56 });
    const scft = runFilmScft(msg.config, { nx: 64, nz: 16, maxIter: 56, Ns: 40 });
    report.scft = scft;
    const dummy = new Uint8Array(scft.nx * scft.nz);
    dummy.fill(1);
    const xzCfg = { ...msg.config, nx: scft.nx, ny: scft.nz };
    report.perpRgba = renderRgba(scft.perpPhi, xzCfg, dummy);
    report.paraRgba = renderRgba(scft.paraPhi, xzCfg, dummy);
    const out: FilmOut = { type: "film3d", report };
    (self as unknown as WorkerScope).postMessage(out, [
      report.midRgba.buffer,
      report.botRgba.buffer,
      report.topRgba.buffer,
      report.xzRgba.buffer,
      report.yzRgba.buffer,
      report.perpRgba.buffer,
      report.paraRgba.buffer,
    ]);
    return;
  }
  if (!solver) return;
  if (msg.type === "reset") {
    solver.seedField();
    postFrame();
    return;
  }
  if (msg.type === "setConfig") {
    const phi = msg.keepField ? solver.phi.slice() : null;
    solver = new OkSolver(msg.config);
    if (phi && phi.length === solver.phi.length) {
      solver.phi.set(phi);
    }
    postFrame();
    return;
  }
  if (msg.type === "step") {
    solver.step(msg.count);
    postFrame();
  }
};

type WorkerScope = {
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

function postFrame() {
  if (!solver) return;
  const frame = solver.frame();
  (self as unknown as WorkerScope).postMessage({ type: "frame", frame }, [
    frame.rgba.buffer,
    frame.semRgba.buffer,
    frame.directorRgba.buffer,
    frame.phi.buffer,
    frame.mask.buffer,
  ]);
}
