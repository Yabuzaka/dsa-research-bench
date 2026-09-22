import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { buildGuideField } from "./guides.ts";
import { DEFAULT_CONFIG } from "./types.ts";
import type { GuideKind, SimConfig, TemplateDefect } from "./types.ts";

const guideKinds: GuideKind[] = [
  "none", "chemo-lamellar", "fin-array", "grapho-trench", "contact-holes", "via-pair",
];

function contactConfig(): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    nx: 48,
    ny: 24,
    dxNm: 0.5,
    L0Nm: 12,
    f: 0.5,
    guide: {
      ...DEFAULT_CONFIG.guide,
      kind: "contact-holes",
      LsNm: 12,
      holeNm: 6,
      wallNm: 1,
      strength: 1,
    },
  };
}

describe("physical guide sampling", () => {
  it("keeps contact radii circular in physical space on an anisotropic grid", () => {
    const cfg = contactConfig();
    const field = buildGuideField(cfg, 1.5);
    // The first contact is centered at (0,0). These samples are at (2.25,0.75)
    // and (0.75,2.25) nm despite their unequal index distances from the origin.
    assert.equal(field[4], field[cfg.nx + 1]);
    assert.ok(field[4] > 1 && field[4] < 1.6, "both samples lie inside the 3 nm radius");
    // The swapped samples (5.25,0.75) and (0.75,5.25) nm are both outside
    // the 3 nm radius plus 1 nm wall and retain the hard-wall sentinel.
    assert.equal(field[10], 99);
    assert.equal(field[3 * cfg.nx + 1], 99);
  });

  it("matches square-grid contact samples at the same physical coordinates", () => {
    for (const f of [0.5, 0.35]) {
      for (const templateDefect of ["none", "missing-stripe"] as const) {
        const cfg = { ...contactConfig(), f, templateDefect };
        const anisotropic = buildGuideField(cfg, 1.5);
        const reference = buildGuideField({ ...cfg, ny: cfg.ny * 3 });
        for (let y = 0; y < cfg.ny; y++) {
          for (let x = 0; x < cfg.nx; x++) {
            assert.equal(anisotropic[y * cfg.nx + x], reference[(3 * y + 1) * cfg.nx + x],
              `f=${f}, defect=${templateDefect}, pixel (${x},${y})`);
          }
        }
      }
    }
  });

  it("uses physical y spacing for rotated stripes, trenches, fin cuts, and via pairs", () => {
    for (const kind of ["chemo-lamellar", "grapho-trench", "fin-array", "via-pair"] as const) {
      const cfg = contactConfig();
      cfg.guide = { ...cfg.guide, kind, angle: Math.PI / 3, cdNm: 4 };
      const anisotropic = buildGuideField(cfg, 1.5);
      const reference = buildGuideField({ ...cfg, ny: cfg.ny * 3 });
      for (let y = 0; y < cfg.ny; y++) {
        for (let x = 0; x < cfg.nx; x++) {
          assert.equal(anisotropic[y * cfg.nx + x], reference[(3 * y + 1) * cfg.nx + x],
            `${kind}, pixel (${x},${y})`);
        }
      }
    }
  });

  it("preserves the original square-grid fields bit for bit", () => {
    const hash = createHash("sha256");
    const defects: TemplateDefect[] = ["none", "missing-stripe", "broken-stripe", "cd-outlier", "overlay", "stitch"];
    for (const kind of guideKinds) {
      for (const templateDefect of defects) {
        const cfg: SimConfig = {
          ...DEFAULT_CONFIG,
          nx: 32, ny: 24, dxNm: 1.25, L0Nm: 12, f: 0.35, seed: 19,
          euvLerNm: 0.8, euvCdJitterNm: 1.3, deltaGamma: 0.15, templateDefect,
          guide: {
            ...DEFAULT_CONFIG.guide,
            kind, LsNm: 18, holeNm: 8, cdNm: 4, angle: 0.41, overlayNm: 0.7,
          },
        };
        const implicit = buildGuideField(cfg);
        assert.deepEqual(implicit, buildGuideField(cfg, cfg.dxNm));
        hash.update(new Uint8Array(implicit.buffer));
      }
    }
    // Captured from the original square-grid implementation before adding dyNm.
    assert.equal(hash.digest("hex"), "6c5720bed2615bbd0fb3eca18db19d7fece83a24925c98410ecd19d13e2e19d7");
  });

  it("rejects invalid physical y spacing", () => {
    for (const dyNm of [0, -1, NaN, Infinity, -Infinity]) {
      assert.throws(() => buildGuideField(contactConfig(), dyNm), /finite and positive/);
    }
  });
});
