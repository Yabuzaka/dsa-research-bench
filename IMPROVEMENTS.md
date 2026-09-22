# Improvements and verification

Completed 20 September 2026. This is an improved working copy; the downloaded original was left unchanged.

## What changed

- Replaced fixed Latin-hypercube/local-walk search with sequential Gaussian-process Bayesian optimization using a Matérn-5/2 covariance, fitted lengthscale, Cholesky factorization, and expected-improvement proposals.
- Every initial and adaptive candidate now uses the same 2D SCFT model and dimensionless objective. The former mixed OK/SCFT ranking is removed.
- Contact CD and pitch targets now influence the objective. Physical geometry measurements handle rectangular pixels, periodic contact domains, and a single lamellar period. Unresolved fields and missing domains receive explicit penalties.
- Added SCFT field-residual and incompressibility reporting, failed-trial handling, and full run provenance. Inverse remains a single-diblock model; unsupported blend optimization is removed.
- Added an independent optimizer worker, live evaluation/phase updates, a loss chart, stop/restart, convergence labels, ranked candidates, apply-to-Chamber, and JSON/CSV exports, including partial results after cancellation.
- Corrected vertical guide spacing in rectangular SCFT cells. Contact/VIA cells contain complete guide repeats; hex guide rows close periodically.
- Fixed Windows startup and added a double-click launcher. Inherited platform tests now isolate their sample metadata and use Windows-compatible directory junctions; their assertions are retained.

## Reproducible example runs

Settings: LiNe starting recipe, L0=28 nm; line A fraction 0.50, contact/VIA A fraction 0.33; 16 evaluations (5 initial), seed 17; grid 32 x 32, 32 contour steps, maximum 64 SCFT iterations. These are demonstrations of the implemented objective, not experimentally validated process recipes.

| Mode | Best initial loss | Best final loss | Improvement | Field residual | Numerical status |
|---|---:|---:|---:|---:|---|
| LiNe | 0.447467 | 0.200696 | 55.1% | 4.29e-4 | Converged |
| Contacts | 2.233806 | 0.979316 | 56.2% | 4.98e-2 | Unconverged |
| VIA pairs | 1.439319 | 1.387891 | 3.6% | 2.73e-1 | Unconverged |

The LiNe candidate's measured CD was 12.76 nm against a 14 nm target; incompressibility was 4.12e-4. Lower objective loss is not a claim that every dimensional target was met. Contact/VIA estimates require further numerical refinement and are labelled accordingly in the product.

Full inputs, recipes, history, and numerical results are in `examples/inverse-*-seed-17.json`. `examples/verification.json` summarizes these three runs. Browser and Node replay matched within floating-point rounding.

## Validation completed

- 345 passing tests: 196 platform helper tests, 55 application helper tests, and 94 DSA/TMD/optimizer/export/guide tests.
- TypeScript typecheck passed.
- Production build passed.
- Original Matsen free-energy, residual, period, and 2D LiNe/hex assertions were preserved; the legacy inverse-method assertion was updated and strengthened for the new algorithm.
- Browser: complete 16-evaluation production run, clean console, live progress, stop/recovery, JSON and CSV downloads verified on disk, and apply-to-Chamber parameters verified.
- Desktop and 390 x 844 mobile layouts inspected. No horizontal page overflow at the mobile size.

## Scope and remaining limits

The optimizer is GP-BO on local single-diblock 2D SCFT. It does not implement Zhou's binary-blend thermodynamics, 3D chain SCFT, or calibrated manufacturing metrology. Contact/VIA guide walls remain the existing finite-field approximation. The original film/3D, high-chi, and synthetic SEM models retain their existing limitations. No new wafer literature results or continuous monitoring were added in this upgrade.

Use `README.md` for startup and operation.
