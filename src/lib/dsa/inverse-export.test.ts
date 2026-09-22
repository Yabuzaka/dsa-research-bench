import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inverseReportJson, inverseTrialsCsv } from "./inverse-export.ts";
import { defaultInverseTarget, runInverse } from "./inverse.ts";
import { DEFAULT_CONFIG } from "./types.ts";

const report = runInverse(DEFAULT_CONFIG, defaultInverseTarget(DEFAULT_CONFIG), {
  trials: 1,
  initialTrials: 1,
  seed: 17,
  scft: { nx: 16, Ns: 8, maxIter: 2 },
});

describe("inverse report exports", () => {
  it("exports ranked scalar values without mutating the trial history", () => {
    const trials = [
      { ...report.best, id: 1, loss: 3 },
      {
        ...report.best,
        id: 2,
        loss: 1,
        predictedMean: 1.2,
        predictedSigma: 0.3,
        expectedImprovement: 0.2,
      },
    ];
    const csv = inverseTrialsCsv(trials);
    const [header, first, second] = csv.trimEnd().split("\r\n");
    const columns = header.split(",");
    const row = Object.fromEntries(first.split(",").map((value, i) => [columns[i], value]));
    assert.equal(row.trial, "2");
    assert.equal(row.loss, "1");
    assert.equal(row.predicted_sigma, "0.3");
    assert.equal(row.f, String(report.best.evaluatedConfig.f));
    assert.equal(row.scft_status, report.best.scftStatus);
    assert.equal(first.split(",").length, columns.length);
    assert.equal(second.split(",").length, columns.length);
    assert.deepEqual(
      trials.map((trial) => trial.id),
      [1, 2],
    );
  });

  it("escapes commas, quotes and line breaks in failure diagnostics", () => {
    const csv = inverseTrialsCsv([
      { ...report.best, error: 'SCFT failed, "retry"\nwith a lower field.' },
    ]);
    assert.ok(csv.endsWith(',"SCFT failed, ""retry""\nwith a lower field."\r\n'));
    assert.equal(inverseTrialsCsv([]).trimEnd().split("\r\n").length, 1);
  });

  it("preserves complete report provenance and actual evaluated configuration", () => {
    const exportedAt = "2026-09-20T00:00:00.000Z";
    const parsed = JSON.parse(inverseReportJson(report, "completed", exportedAt));
    assert.equal(parsed.runStatus, "completed");
    assert.equal(parsed.exportedAt, exportedAt);
    assert.deepEqual(parsed.settings, report.settings);
    assert.deepEqual(parsed.best.evaluatedConfig, report.best.evaluatedConfig);
    assert.deepEqual(parsed.history, report.history);
    assert.equal(parsed.source, report.source);
    assert.equal(parsed.seed, 17);
    assert.equal(parsed.method, "gp-ei-scft2d");
    assert.equal("runStatus" in report, false);
  });

  it("distinguishes a stopped partial history from its intended trial budget", () => {
    const partial = { ...report, settings: { ...report.settings, trials: 16, initialTrials: 5 } };
    const parsed = JSON.parse(inverseReportJson(partial, "stopped"));
    assert.equal(parsed.runStatus, "stopped");
    assert.equal(parsed.nEval, 1);
    assert.equal(parsed.trials.length, 1);
    assert.equal(parsed.settings.trials, 16);
    assert.equal(parsed.settings.initialTrials, 5);
    assert.equal(parsed.source, report.source);
  });
});
