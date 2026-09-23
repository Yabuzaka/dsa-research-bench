import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transferOntoTmd } from "../dsa/tmd-transfer.ts";
import { tmdById, TMD_MATERIALS, tmdsIn } from "./materials.ts";
import {
  DEFAULT_BENCH,
  contactRcFactor,
  evaluateBench,
  judgeDevice,
  lambdaNm,
  quantumCapUFCm2,
  sourceLimitedIonUAUm,
} from "./physics.ts";

describe("lambda", () => {
  it("is sub-nm for monolayer DG MoS2 at EOT 0.9", () => {
    const mat = tmdById("mos2");
    const lam = lambdaNm(mat.tMonoNm, 0.9, mat.epsZ, 2);
    assert.ok(lam < 1.0, `λ=${lam}`);
    assert.ok(lam > 0.3);
  });
  it("is larger for 3 nm Si than for monolayer MoS2", () => {
    const mat = tmdById("mos2");
    const tmd = lambdaNm(mat.tMonoNm, 1, mat.epsZ, 2);
    const si = lambdaNm(3, 1, 11.7, 2);
    assert.ok(si > 2 * tmd);
  });
  it("shrinks with more gates", () => {
    const a = lambdaNm(0.65, 1, 4.8, 1);
    const b = lambdaNm(0.65, 1, 4.8, 2);
    const c = lambdaNm(0.65, 1, 4.8, 4);
    assert.ok(a > b && b > c);
  });
});

describe("bench", () => {
  it("returns finite I_on in a lab-typical band", () => {
    const r = evaluateBench(DEFAULT_BENCH);
    assert.ok(r.ionUAUm > 50 && r.ionUAUm < 2000, `Ion=${r.ionUAUm}`);
    assert.ok(r.ssMVdec > 59 && r.ssMVdec < 200, `SS=${r.ssMVdec}`);
    assert.ok(r.ioffNAUm > 0);
    assert.equal(r.idvg.length, 41);
  });
  it("I_on falls as Rc rises", () => {
    const lo = evaluateBench({ ...DEFAULT_BENCH, rcOhmUm: 80 });
    const hi = evaluateBench({ ...DEFAULT_BENCH, rcOhmUm: 800 });
    assert.ok(lo.ionUAUm > hi.ionUAUm);
    assert.ok(hi.contactShare > lo.contactShare);
  });
  it("SS worsens with Dit and with short L", () => {
    const clean = evaluateBench({ ...DEFAULT_BENCH, dit: 1e11, lgNm: 40 });
    const dirty = evaluateBench({ ...DEFAULT_BENCH, dit: 1e13, lgNm: 12 });
    assert.ok(dirty.ssMVdec > clean.ssMVdec);
  });
  it("thicker body increases λ", () => {
    const m1 = evaluateBench({ ...DEFAULT_BENCH, layers: 1 });
    const m3 = evaluateBench({ ...DEFAULT_BENCH, layers: 3 });
    assert.ok(m3.lambdaNm > m1.lambdaNm);
  });
});

describe("quantum cap", () => {
  it("is several µF/cm² for MoS2", () => {
    const cq = quantumCapUFCm2(0.45);
    assert.ok(cq > 10 && cq < 80, `Cq=${cq}`);
  });
});

describe("contacts 2026", () => {
  it("hybrid beats edge, especially at short L_c", () => {
    assert.ok(contactRcFactor("hybrid", 8) < contactRcFactor("top", 8));
    assert.ok(contactRcFactor("top", 8) < contactRcFactor("edge", 8));
    assert.ok(contactRcFactor("hybrid", 8) > contactRcFactor("hybrid", 40));
  });
  it("source ceiling drops as L_g shrinks", () => {
    assert.ok(sourceLimitedIonUAUm(3.4e6, 8) < sourceLimitedIonUAUm(3.4e6, 40));
  });
  it("edge contacts raise effective Rc and cut I_on", () => {
    const hy = evaluateBench({ ...DEFAULT_BENCH, contactKind: "hybrid", lcNm: 8 });
    const ed = evaluateBench({ ...DEFAULT_BENCH, contactKind: "edge", lcNm: 8 });
    assert.ok(ed.rcEffOhmUm > hy.rcEffOhmUm);
    assert.ok(hy.ionUAUm > ed.ionUAUm);
  });
  it("flags source-limited devices at 8 nm", () => {
    const r = evaluateBench({ ...DEFAULT_BENCH, lgNm: 8, rcOhmUm: 40, contactKind: "hybrid", lcNm: 30, muCm2Vs: 200 });
    const v = judgeDevice({ ...DEFAULT_BENCH, lgNm: 8 }, r);
    assert.ok(r.sourceLimited || v.level !== "pass");
  });
});

describe("TMD library", () => {
  it("has the five Group-6 2H logic channels", () => {
    const ids = tmdsIn("logic").map((m) => m.id).sort();
    assert.deepEqual(ids, ["mos2", "mose2", "mote2", "ws2", "wse2"]);
    assert.ok(tmdsIn("logic").every((m) => m.polytype === "2H"));
  });
  it("keeps WTe2 as a Td semimetal, not a logic FET", () => {
    const w = tmdById("wte2");
    assert.equal(w.polytype, "Td");
    assert.equal(w.carrier, "semi");
    assert.equal(w.egMonoEv, 0);
    assert.equal(w.family, "research");
  });
  it("does not treat the library as every MX2", () => {
    assert.ok(TMD_MATERIALS.length < 20);
    assert.ok(tmdsIn("research").some((m) => m.id === "hfs2"));
    assert.ok(tmdsIn("research").some((m) => m.id === "ptse2"));
  });
});

describe("BCP mask onto a TMD", () => {
  it("cuts a ribbon inside the published MoS2 window", () => {
    const r = transferOntoTmd({
      morphology: "LAM",
      guideKind: "chemo-lamellar",
      pitchNm: 28,
      cdNm: 14,
      etchLerNm: 1.3,
      residualNm: 0.4,
      materialId: "mos2",
    });
    assert.equal(r.kind, "ribbon");
    assert.equal(r.open, true);
    assert.equal(r.inDemonstratedRange, true);
    assert.equal(r.featureNm, 14);
  });
  it("blocks transfer when the residual skin is thick", () => {
    const r = transferOntoTmd({
      morphology: "LAM",
      guideKind: "chemo-lamellar",
      pitchNm: 28,
      cdNm: 14,
      etchLerNm: 1.3,
      residualNm: 6,
      materialId: "mos2",
    });
    assert.equal(r.open, false);
    assert.match(r.label, /blocked/i);
  });
  it("does not invent a mask from a disordered field", () => {
    const r = transferOntoTmd({
      morphology: "DIS",
      guideKind: "chemo-lamellar",
      pitchNm: 28,
      cdNm: 14,
      etchLerNm: 1,
      residualNm: 0,
      materialId: "mos2",
    });
    assert.equal(r.kind, "none");
  });
  it("keeps a semimetal as geometry only", () => {
    const r = transferOntoTmd({
      morphology: "LAM",
      guideKind: "chemo-lamellar",
      pitchNm: 28,
      cdNm: 14,
      etchLerNm: 1,
      residualNm: 0.2,
      materialId: "wte2",
    });
    assert.equal(r.logicChannel, false);
    assert.equal(r.inDemonstratedRange, false);
  });
});

