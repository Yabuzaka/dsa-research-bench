# Validation report

This page records how the solver was checked, the numbers obtained, and how to reproduce them. Values were measured on Node.js 22.22 with the default solver settings the app uses.

## Test suite

```sh
npm run test:science
```

Result: **94 tests, 94 passing, 0 failing** (about 32 s). The suite covers the SCFT solvers, Ohta–Kawasaki kinetics, guide geometry, the Gaussian-process optimiser, inverse-design exports and the TMD transistor model.

## 1D lamellar reference (χN = 20, f = 0.5)

Grid 128 points, 80 contour steps, up to 180 iterations.

| Quantity | Value |
|---|---|
| Free energy F/nkT | 3.9850 |
| Homogeneous melt F/nkT | 5.0000 |
| Exchange-field residual ‖w − w[φ]‖ | 7.6×10⁻⁵ |
| Incompressibility error | 2.0×10⁻⁵ |
| Converged (threshold 5×10⁻⁴) | yes |

### Equilibrium period

`findLamellarPeriod` computes F on seven cell sizes between 0.84 and 1.18 times the reference period, fits a parabola around the minimum and re-solves at the fitted D*.

| Quantity | Value |
|---|---|
| D*/Rg from F(D) minimisation | 4.0432 |
| Reference D/Rg (Matsen & Bates 1996, Fig. 3, digitised: 1.651 · √6) | 4.0441 |
| Relative difference | 0.02 % |

The reference is read from a published figure, so it carries a digitisation uncertainty of roughly 1 %. The agreement above is therefore well within the accuracy of the reference itself.

> **Note on the tests.** `runScft1d` sets the cell length equal to the reference period, so the assertion *"1D lamellar D/Rg tracks Matsen at χN=20"* compares that value with itself and cannot fail. The meaningful check is the F(D) minimisation above, which is asserted separately (within 5 %). Tightening that assertion to about 1 % would make the test reflect the real accuracy.

## 2D LiNe 2× (default Chamber recipe)

Settings used by **SCFT relax** in the app: 64 × 64 grid, 56 contour steps, 160 iterations, χN = 18.5, L0 = 28 nm, chemo-lamellar guide with Ls = 56 nm.

| Quantity | Value |
|---|---|
| Free energy F/nkT | 3.8445 |
| ΔF vs 1D bulk | +0.006 |
| Registration with guide | 22.7 % |
| Incompressibility error | 7.1×10⁻⁵ |
| Exchange-field residual ‖w − w[φ]‖ | **5.8×10⁻³** |
| Saddle threshold used by the app | 5×10⁻³ |
| Status | **open (not converged)** |

The free energy and registration are consistent with the 1D solution. However, the exchange-field residual stops just above the app's own saddle threshold after 160 iterations. Two different residuals exist in the code: the density-change residual (7.5×10⁻⁵) and the exchange-field residual (5.8×10⁻³). The SI export reports the exchange-field residual, which is the stricter one.

**Until this run reaches the saddle threshold, 2D LiNe results should be treated as screening, not methods-grade.** Possible fixes: raise the iteration cap for guided cells, or continue Anderson mixing once the density residual has plateaued.

## Inverse design

Settings: LiNe starting recipe, L0 = 28 nm; A-fraction 0.50 for lines, 0.33 for contacts and vias; 16 evaluations (5 initial), seed 17; 32 × 32 grid, 32 contour steps, up to 64 SCFT iterations per trial.

| Mode | Initial best loss | Final best loss | Improvement | Field residual | Status |
|---|---:|---:|---:|---:|---|
| Lines | 0.4475 | 0.2007 | 55.1 % | 4.3×10⁻⁴ | converged |
| Contacts | 2.2338 | 0.9793 | 56.2 % | 5.0×10⁻² | unconverged |
| VIA pairs | 1.4393 | 1.3879 | 3.6 % | 2.7×10⁻¹ | unconverged |

The best line candidate reached a CD of 12.76 nm against a 14 nm target. A lower loss does not mean every dimensional target was met. These are demonstrations of the optimiser on a single seed, not validated process recipes.

The inverse model is single-diblock SCFT with no blending. Temperature, L0 and composition are fixed; only guide parameters and χN are optimised.

Full inputs, histories and results: [`examples/`](../examples/).

## Reproducing the solver numbers

From the repository root:

```sh
cat > probe.ts <<'TS'
import { runScft1d, findLamellarPeriod, lamellarDOverRg, runScft } from "./src/lib/dsa/scft.ts";
import { DEFAULT_CONFIG } from "./src/lib/dsa/types.ts";
const r = runScft1d(20, 0.5, { nx: 128, Ns: 80, maxIter: 180, mix: 0.1, nPeriods: 1 });
console.log("1D", r.F, r.fieldResidual, r.incomp, r.converged);
const p = findLamellarPeriod(20, 0.5, {});
console.log("D*", p.periodRg, "ref", lamellarDOverRg(20));
const s = runScft(DEFAULT_CONFIG, { nx: 64, Ns: 56, maxIter: 160 });
console.log("2D", s.F, s.bulk.F, s.fieldResidual, s.registration, s.converged);
TS
node --experimental-strip-types probe.ts && rm probe.ts
```
