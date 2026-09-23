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

### Period across χN

Full F(D) sweep (7 cell sizes, parabolic fit, re-solve at D*):

| χN | D*/Rg | Reference | Difference | Field residual at D* |
|---:|---:|---:|---:|---:|
| 15 | 3.712 | 3.650 | 1.7 % | 2.0×10⁻⁵ ✅ |
| 20 | 4.043 | 4.044 | 0.02 % | 1.9×10⁻⁵ ✅ |
| 25 | 4.277 | 4.355 | 1.8 % | 1.7×10⁻² ⚠️ |
| 30 | 4.479 | 4.617 | 3.0 % | 2.0×10⁻¹ ⚠️ |

At χN = 15 and 20 the solve converges; the 1.7 % gap at χN = 15 is of the order of the digitisation uncertainty of the reference curve. At χN = 25 and 30 the re-solve at D* does not converge with the default iteration budget, so those periods should be treated as estimates.

> **Note on the tests.** `runScft1d` sets the cell length equal to the reference period, so a period assertion on its output cannot fail. The suite therefore checks the period only through the F(D) minimisation, with a tolerance of 0.5 % at χN = 20.

## 2D SCFT relax across the Chamber recipes

Each recipe was relaxed with the exact settings the **SCFT relax** button uses: 64 × 64 grid, 56 contour steps and up to 160 iterations for guided cells (48 steps and 120 iterations for unguided hexagonal cells, 48 iterations for unguided lamellae). The app labels a run **saddle** when ‖w − w[φ]‖ < 5×10⁻³ and the incompressibility error is below 8×10⁻³; the stricter methods-grade target used here is 5×10⁻⁴.

### Default recipe: LiNe 2× (`line-2x`)

χN = 18.5, L0 = 28 nm, chemo-lamellar guide with Ls = 56 nm, guide strength 1.15.

| Quantity | Value |
|---|---|
| Free energy F/nkT | 3.8449 |
| ΔF vs 1D bulk | +0.006 |
| Exchange-field residual ‖w − w[φ]‖ | 1.1×10⁻⁴ |
| Incompressibility error | 3.9×10⁻⁴ |
| Registration with guide | 22.8 % |
| Iterations | 121 (stopped on convergence) |
| Status | ✅ saddle, methods-grade |

### All recipes

| Recipe | Type | Iterations | Field residual ‖w − w[φ]‖ | Status |
|---|---|---:|---:|---|
| LiNe 2× lamellae (`line-2x`) | guided lamellar | 121 | 1.1×10⁻⁴ | ✅ saddle |
| 3× pitch multiplication (`line-3x`) | guided lamellar | 160 | 1.4×10⁻² | ⚠️ open |
| High-χ 11 nm metal (`highchi-metal`) | guided lamellar | 160 | 2.4×10¹ | ⚠️ open |
| Via / contact hex (`via-hex`) | hexagonal | 160 | 2.9×10⁻¹ | ⚠️ open |
| Grapho fin trenches (`grapho-fins`) | guided lamellar | 160 | 2.0 | ⚠️ open |
| Untemplated quench (`untemplated`) | unguided | 1 | 2.5×10⁻⁴ | ✅ saddle |
| EUV + DSA rectification (`euv-rectify`) | guided lamellar | 160 | 1.7×10⁻² | ⚠️ open |
| 24 nm 1:1, no CD trim (`euv-24-1to1`) | guided lamellar | 160 | 6.2×10⁻¹ | ⚠️ open |
| imec P24 L/S after etch (`imec-p24`) | guided lamellar | 160 | 6.6×10⁻¹ | ⚠️ open |
| Hex contact LCDU (`hex-contact-lcdu`) | hexagonal | 4 | 6.5×10² | ⚠️ diverged |
| VIA peanut pair (`via-pair`) | hexagonal | 160 | 1.4×10⁻¹ | ⚠️ open |
| P4ClS 7× 7.5 nm (`p4cls-7x`) | guided lamellar | 160 | 1.2×10⁻¹ | ⚠️ open |
| Maekawa 3× sub-10 nm (`maekawa-3x`) | guided lamellar | 160 | 1.4×10⁻¹ | ⚠️ open |
| High-NA 24 nm pitch (`highna-24`) | guided lamellar | 160 | 4.4×10⁻¹ | ⚠️ open |
| High-χ kinetic trap (`kinetic-trap`) | guided lamellar | 160 | 2.5×10¹ | ⚠️ open |
| Microwave 4× PS-PMMA (`microwave-4x`) | guided lamellar | 160 | 2.1×10⁻² | ⚠️ open |
| Missing-stripe repair (`missing-line`) | guided lamellar | 160 | 6.1×10⁻³ | ⚠️ open |
| High-NA stitch seam (`stitch-seam`) | guided lamellar | 160 | 6.4×10⁻¹ | ⚠️ open |

**Only the default LiNe 2× recipe and the unguided reference reach the saddle.** The other 16 recipes stop at the iteration cap with residuals between 6×10⁻³ and 25, and the hexagonal contact recipe diverges after four iterations. Their free energies and registration values are therefore not equilibrium results. Treat SCFT relax output for those recipes as screening until the solver reaches the saddle for them.

Raising the iteration cap alone does not fix this. Going from 160 to 400 iterations lowers the residual only two to three times (`line-3x` 1.4×10⁻² → 5.5×10⁻³, `microwave-4x` 2.1×10⁻² → 9.5×10⁻³, `imec-p24` 0.66 → 0.37), and none of them reaches the threshold. Likely causes are the initial guess (the 2D field is extruded from a 1D solution that does not match the guide geometry of most recipes) and an Anderson mixer that resets whenever its coefficients exceed a fixed bound. Improving convergence for the remaining recipes is open work.

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
import { PRESETS } from "./src/lib/dsa/presets.ts";
const r = runScft1d(20, 0.5, { nx: 128, Ns: 80, maxIter: 180, mix: 0.1, nPeriods: 1 });
console.log("1D", r.F, r.fieldResidual, r.incomp, r.converged);
const p = findLamellarPeriod(20, 0.5, {});
console.log("D*", p.periodRg, "ref", lamellarDOverRg(20));
const s = runScft(PRESETS[0].config, { nx: 64, Ns: 56, maxIter: 160 });
console.log("2D", PRESETS[0].id, s.F, s.bulk.F, s.fieldResidual, s.registration, s.iters);
TS
node --experimental-strip-types probe.ts && rm probe.ts
```
