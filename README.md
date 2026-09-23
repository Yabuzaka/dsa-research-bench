<p align="center">
  <img src="public/og.jpg" alt="DSA Research Bench" width="720">
</p>

<p align="center">
  <a href="https://github.com/Yabuzaka/dsa-research-bench/actions/workflows/ci.yml"><img src="https://github.com/Yabuzaka/dsa-research-bench/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license">
  <img src="https://img.shields.io/badge/node-22.18%2B%20%7C%2024%2B-339933.svg" alt="Node 22.18+ or 24+">
</p>

# DSA Research Bench

A browser-based simulator for **directed self-assembly (DSA) lithography**, with a separate compact model for **2D-semiconductor (TMD) transistors**. Everything runs locally in the browser; no data leaves the machine.

**Why it matters.** Optical lithography struggles to print features much smaller than about 20 nm. Block copolymers, long molecules made of two chemically different blocks, spontaneously separate into regular stripes or dots a few nanometres wide. A coarse lithographic "guide" pattern can steer them into place and multiply its density two to seven times. This bench lets you load recipes that have already worked on real wafers, simulate how the polymer film orders, check whether it has reached equilibrium, and export the numbers.

<!-- Add a screenshot of the Chamber view here once available:
<p align="center"><img src="docs/chamber.png" alt="Chamber view" width="820"></p>
-->

## Features

- **Published recipes.** Notes holds only recipes demonstrated on real wafers (imec P24, Maekawa PGFM, LiNe 2× and 3×, microwave 4×, and others), each loadable into the simulator.
- **Kinetics.** Ohta–Kawasaki / Model B annealing shows defects, roughness (LER) and ordering developing over time.
- **Equilibrium.** A spectral self-consistent field theory (SCFT) solver relaxes the film and reports free energy, residuals and the equilibrium period D* compared with Matsen's reference values.
- **Export.** Supporting-information tables (JSON/CSV) with every number needed to reproduce a result.
- **Screening tools.** Process-window maps, template repair (SEPA), and inverse design by Bayesian optimisation over 2D SCFT.
- **2D FET lab.** A compact electrostatic model for MoS₂-class transistors, benchmarked against IRDS targets and kept separate from the polymer solver.

## Engineering

The numerical core is written from scratch in TypeScript, with no numerical libraries (about 13,000 lines across solvers, tests and UI).

| Component | Implementation |
|---|---|
| FFT | In-place radix-2 Cooley–Tukey (`src/lib/dsa/fft.ts`) |
| SCFT | Split-step Fourier solution of the modified diffusion equation, Anderson mixing, χN continuation, commensurate cells (`scft.ts`) |
| Kinetics | Spectral Ohta–Kawasaki / Model B (`ok-solver.ts`) |
| Inverse design | Latin-hypercube seeding, then a Matérn-5/2 Gaussian process with Cholesky factorisation and expected improvement (`gp.ts`, `inverse.ts`) |
| Concurrency | Simulations and optimisation run in Web Workers, so the UI stays responsive |
| App | React, Vite, Tailwind |

## Quick start

Requires **Node.js 22.18+ (22.x) or 24+**.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:8080>. On Windows you can instead double-click **`Start DSA Bench.cmd`**, which installs dependencies if needed and opens the browser.

`npm run build` produces a static site in `dist/`; `npm run preview` serves it at <http://127.0.0.1:8081>.

## Typical session

1. Turn **Help on** (top bar) and hover any control for a one-line explanation.
2. Open **Notes** and load a published recipe, or start from the default **LiNe 2×** in **Chamber**.
3. Press **Anneal** until the stripes register with the guide, then press **SCFT relax**.
4. Check that the relax status reads **saddle**, not **open**, before using the numbers.
5. Press **SI** to download the free energy, residuals and D* as JSON/CSV.

## Validation

Measured with `npm run test:science` and direct solver runs (full details and how to reproduce them in [`docs/VALIDATION.md`](docs/VALIDATION.md)).

| Check | Result | Status |
|---|---|---|
| Science test suite | 94 / 94 passing | ✅ |
| 1D lamellar, χN = 20, f = 0.5: free energy | F/nkT = 3.985 | ✅ converged (‖w − w[φ]‖ = 7.6×10⁻⁵) |
| 1D equilibrium period from F(D) minimisation | D*/Rg = 4.043 vs 4.044 (Matsen & Bates 1996) | ✅ 0.02 % |
| 2D SCFT relax, default LiNe 2× recipe | F = 3.845, ΔF vs 1D = +0.006, registration 23 % | ✅ converged (‖w − w[φ]‖ = 1.1×10⁻⁴) |
| 2D SCFT relax, other 17 Chamber recipes | 1 unguided reference converges; 16 stop at the iteration cap | ⚠️ not converged, screening only |
| Inverse design, lines (seed 17, 16 evaluations) | loss −55 %; CD 12.8 nm vs 14 nm target | ✅ converged, target not fully met |
| Inverse design, contacts / vias | loss −56 % / −4 % | ⚠️ unconverged, screening only |

Reproducible inverse runs are in [`examples/`](examples/).

## What you can cite vs. what is screening

**Cite, with the residual you printed:** 1D SCFT at χN ≲ 30, the default LiNe 2× SCFT relax, and SI tables from any run whose status reads *saddle*.

**Screening only:** inverse design (especially contacts and vias), process windows, repair, 3D film, χN ≫ 30, the TMD compact model, and any 2D run whose status reads *open*. At present that includes SCFT relax for every published recipe except LiNe 2× (see the per-recipe table in [`docs/VALIDATION.md`](docs/VALIDATION.md)).

The AFM / TEM / SEM view buttons only change how the field is coloured. They are not a microscope or metrology model. This bench is not PSCF, not a CD-SEM model, and does not reproduce the blend / 3D inverse loop of Zhou et al.

## Project structure

```
src/lib/dsa/      polymer physics: SCFT, kinetics, inverse design, recipes, tests
src/lib/tmd/      2D transistor compact model and tests
src/components/   UI panels (Chamber, Notes, Window, Repair, Inverse, Model, 2D FET)
examples/         reproducible inverse-design runs (seed 17)
docs/             validation report
```

## Development

```sh
npm run typecheck      # TypeScript
npm run test:science   # physics and optimiser regression tests
npm run build          # production build
```

## Contributors

- **Sebastian Pina Delgado** ([@sebastpina](https://github.com/sebastpina))
- [@Yabuzaka](https://github.com/Yabuzaka)
- [@pedropauloc](https://github.com/pedropauloc)

## Citing

If you use this bench in academic work, please cite it using the metadata in [`CITATION.cff`](CITATION.cff) (GitHub's "Cite this repository" button), together with the original papers for any recipe or reference value you rely on.

## References

- M. W. Matsen & M. Schick, *Phys. Rev. Lett.* **72**, 2660 (1994): diblock copolymer SCFT.
- M. W. Matsen & F. S. Bates, *Macromolecules* **29**, 1091 (1996): lamellar period used as the D* reference.
- Vallat et al., SPIE 13982-23 (2026): imec P24 after-etch LER/LWR.
- Zhou et al., [arXiv:2510.02715](https://arxiv.org/abs/2510.02715) (2025): inverse-design inspiration only.
- Snoek, Larochelle & Adams, [NeurIPS 2012](https://proceedings.neurips.cc/paper/2012/hash/05311655a15b75fab86956663e1819cd-Abstract.html): practical Bayesian optimisation.

Each recipe in **Notes** lists its own publication.

## License

Released under the [MIT License](LICENSE).
