# DSA Research Bench

Local browser workbench for **directed self-assembly (DSA)** lithography and a separate **2D TMD FET** calculator. Nothing is sent off the machine. Recipes save in the browser under `dsa-bench-local-v8`.

It is a **notebook + 2D saddle**, not PSCF, not a CD-SEM, and not Zhou’s 3D inverse loop.

## What it does

- Load a published wafer recipe (imec P24, Maekawa PGFM, LiNe 2×, microwave 4×, …).
- **Anneal** the polymer field (Ohta–Kawasaki / Model B) and watch CD, LER, defects, and order.
- **SCFT relax** to an equilibrium density: *F*, residual, *D\** vs Matsen 1996.
- Download **SI** JSON/CSV for a supporting-information table.
- Screen a process **Window**, test template **Repair** (SEPA), run **Inverse** (GP-BO on 2D SCFT).
- Optionally size a **2D TMD FET** against IRDS.

## Run locally

Requires **Node.js 22.18+ (22.x) or 24+** with npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8080 and leave the terminal open. Press Ctrl+C to stop.
In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.
Restart VS Code after installing Node.js so its terminal gets the updated PATH.

On Windows, you can also double-click **Start DSA Bench.cmd**. This installs
dependencies if needed, starts a hidden local server, and opens the browser.
Use `npm run dev` when you want a visible terminal and an easy way to stop it.

This is a standalone React + Vite app. Simulations run in browser workers;
recipes use browser localStorage. No account, database, platform service,
or environment file is needed. Keep `package-lock.json` in Git; `node_modules/`
is installed locally and excluded from Git.

`npm run build` produces a static site in `dist/`. Use `npm run preview` to
check that build at http://127.0.0.1:8081.

## How to use it

1. Turn **Help on** (top bar) and hover any control.
2. **Notes** → Load a published wafer win, or start from **LiNe 2×** in Chamber.
3. **Anneal** until stripes register, then **SCFT relax**.
4. **SI** — save *F*, residual, *D\** vs Matsen. Cite the residual.
5. Optional: **Window**, **Repair**, **Inverse** (screening). Apply inverse results back to Chamber.
6. **2D FET** is a separate compact transistor lab, not mixed into the polymer solver.

### Inverse (honest scope)

Latin hypercube, then Matérn-5/2 GP + expected improvement. **Every** trial is scored with the same 2D SCFT (`gp-ei-scft2d`). Inspired by Zhou — **not** their blend / 3D loop. Unconverged trials are guesses. Lower loss ≠ the CD was hit.

## Map

| Place | Purpose |
|---|---|
| Chamber | Live field, recipes, anneal, SCFT, SI, looks |
| Notes | Published successful wafers only. Load → Chamber |
| Window | CD / χN / overlay maps (screening) |
| Repair | SEPA: missing stripe / stitch |
| Inverse | GP-BO on 2D SCFT |
| Model | Hamiltonian, residual, validity |
| 2D FET / Materials | Compact TMD transistor |

## What you may cite vs screening

**Methods-grade (with the residual you printed):** 1D Matsen χ*N*=20, 2D LiNe/hex at χ*N* ≲ 30, SI table.

**Screening only:** inverse (especially contacts/vias), Window, Repair, 3D film, colored “SEM” look, χ*N* ≫ 30, TMD compact model.

Colored AFM / TEM / SEM buttons change appearance. They are not a microscope.

## Checks

```sh
npm run typecheck
npm run test:science
npm run build
```

## License

Use and modify for research. Cite Matsen 1996, imec P24 (Vallat SPIE 2026), and any Notes recipe you load.

## References

- Matsen & Schick, *Phys. Rev. Lett.* **72**, 2660 (1994); Matsen, *J. Chem. Phys.* (1996) — 1D diblock SCFT / *D\**.
- Vallat et al., SPIE 13982-23 — imec P24 after-etch LER/LWR.
- Zhou et al., [arXiv:2510.02715](https://arxiv.org/abs/2510.02715) — inverse-design *inspiration only*.

## Contributors
Spidel- Coauthor.
Yabuzaka - Coauthor.
Pedropauloc - Coauthor.

