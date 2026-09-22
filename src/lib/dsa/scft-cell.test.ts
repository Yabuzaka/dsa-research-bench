import assert from "node:assert/strict";
import { it } from "node:test";
import { runScft } from "./scft.ts";
import { DEFAULT_CONFIG } from "./types.ts";

it("uses complete guide repeats for contact and VIA SCFT cells", () => {
  for (const kind of ["contact-holes", "via-pair"] as const) {
    for (const f of [0.33, 0.5]) {
      const cfg = { ...DEFAULT_CONFIG, f, guide: { ...DEFAULT_CONFIG.guide, kind, LsNm: 61 } };
      const report = runScft(cfg, { nx: 16, Ns: 8, maxIter: 1, skipSweep: true });
      const rows = report.cellLyNm / (61 * (kind === "contact-holes" && f < 0.42 ? Math.sqrt(3) / 2 : 1));
      assert.ok(Math.abs(report.cellNm / 61 - Math.round(report.cellNm / 61)) < 1e-12);
      assert.ok(Math.abs(rows - Math.round(rows)) < 1e-12);
      if (kind === "contact-holes" && f < 0.42) assert.equal(Math.round(rows) % 2, 0);
      if (kind === "via-pair") assert.equal(report.cellLyNm, report.cellNm);
      assert.ok(Number.isFinite(report.F));
    }
  }
});
