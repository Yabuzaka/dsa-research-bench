import type { InverseReport, InverseTrial } from "./inverse.ts";

function cell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Every row uses the same SCFT objective, including the initial design. */
export function inverseTrialsCsv(trials: InverseTrial[]): string {
  const columns = [
    "rank",
    "trial",
    "phase",
    "loss",
    "scft_status",
    "scft_residual",
    "incompressibility",
    "registration",
    "free_energy",
    "chiN",
    "f",
    "guide_pitch_nm",
    "guide_cd_nm",
    "guide_hole_nm",
    "output_cd_nm",
    "strength",
    "tau",
    "LER_3sigma_nm",
    "LCDU_3sigma_nm",
    "predicted_mean",
    "predicted_sigma",
    "expected_improvement",
    "error",
  ];
  const rows = [...trials]
    .sort((a, b) => a.loss - b.loss)
    .map((trial, i) => [
      i + 1,
      trial.id,
      trial.phase,
      trial.loss,
      trial.scftStatus,
      trial.scftResidual,
      trial.scftIncomp,
      trial.scftReg,
      trial.scftF,
      trial.chiN,
      trial.evaluatedConfig.f,
      trial.lsNm,
      trial.guideCdNm,
      trial.holeNm,
      trial.cdNm,
      trial.strength,
      trial.tau,
      trial.dsaLerNm,
      trial.lcduNm,
      trial.predictedMean,
      trial.predictedSigma,
      trial.expectedImprovement,
      trial.error,
    ]);
  return [columns, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Preserve settings and the evaluated recipes even when a run stopped early. */
export function inverseReportJson(
  report: InverseReport,
  status: string,
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify({ ...report, runStatus: status, exportedAt }, null, 2);
}

export function downloadInverseReport(
  report: InverseReport,
  format: "json" | "csv",
  status: string,
): void {
  const content =
    format === "json" ? inverseReportJson(report, status) : inverseTrialsCsv(report.trials);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dsa-inverse-${report.target.mode}-seed-${report.seed}-${status}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
