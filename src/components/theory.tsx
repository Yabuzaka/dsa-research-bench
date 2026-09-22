export function Theory() {
  return (
    <article className="mx-auto max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Solver</p>
      <h1 className="font-display mt-2 text-3xl font-extrabold">
        Spectral Ohta–Kawasaki DSA
      </h1>
      <p className="mt-4 text-muted leading-relaxed">
        This bench integrates a conserved (Model B) Ohta–Kawasaki field theory for
        incompressible diblock copolymers. It is a research screening instrument —
        not a replacement for 3D SCFT, DPD, or a foundry compact model. Use it to
        probe commensurability, template-defect repair, EUV dose, χN, and
        density-multiplication before committing to heavier solvers.
      </p>

      <h2 className="mt-10 font-display text-xl font-bold">Free energy</h2>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-elevated p-4 font-mono text-xs leading-relaxed text-fg">
{`F[φ] = ∫ [ (ε/2)|∇φ|² + (χ̃/4)(φ² − 1)² ] dV
      + (α/2) ∫ (φ − m) (−Δ)⁻¹ (φ − m) dV
      − ∫ h(x) φ dV`}
      </pre>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        φ = 2ρA − 1 is the composition order parameter. The square-gradient term
        sets interface width. The double well, scaled by χN(T), drives microphase
        separation. The long-range Coulomb-like kernel (Ohta–Kawasaki) enforces
        chain connectivity and selects a finite natural period L0.
      </p>

      <h2 className="mt-10 font-display text-xl font-bold">Dynamics</h2>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-elevated p-4 font-mono text-xs text-fg">
{`∂t φ = M ∇² (δF/δφ) + η
δF/δφ = −ε Δφ + χ̃ (φ³ − φ) + α (−Δ)⁻¹(φ − m) − h(x)`}
      </pre>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Semi-implicit spectral convex splitting on a periodic grid (power-of-two).
        Linear operator (bi-Laplacian + long-range) is treated implicitly; the
        cubic well and the chemical guide field h(x) are explicit. Conserved
        mean (k = 0). Gaussian noise satisfies a fluctuation–dissipation sketch
        for anneal temperature.
      </p>

      <h2 className="mt-10 font-display text-xl font-bold">Linear scale selection</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Linearising about φ = 0 gives a dispersion σ(k) = M (χs k² − ε k⁴ − α).
        The peak at k* = 1/√(2ε) is pinned to the user L0 so that 2π/k* = L0 /
        Δx. Binary blends shift L0 to (1−φ)L0 + φ·0.72 L0 (Macromolecules 2025).
      </p>

      <h2 className="mt-10 font-display text-xl font-bold">Guides</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
        <li>
          <span className="text-fg">Chemoepitaxy</span> — sparse stripes of
          affinity h0, period Ls ≈ n L0, duty ≈ 1/(2n) (LiNe-type).
        </li>
        <li>
          <span className="text-fg">Graphoepitaxy</span> — topographic trenches
          with immobile walls and wetting on the sidewalls.
        </li>
        <li>
          <span className="text-fg">Contact wells</span> — circular grapho holes
          on square or hexagonal lattices for via/contact DSA.
        </li>
        <li>
          <span className="text-fg">VIA peanut pair</span> — two Gaussian wells
          whose contour τ is the grapho wall (Zhou 2025).
        </li>
        <li>
          <span className="text-fg">Template defects</span> — missing stripe,
          broken stripe, CD outlier, overlay, High-NA stitch seam.
        </li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-bold">2025–26 mechanisms in this build</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
        <li>
          <span className="text-fg">Sequential energy pathway (SEPA).</span> ACS
          Appl. Polym. Mater. 2026. Template field decays as exp(−z/λ) through the
          film. ΔF between layers scores whether a template defect is repairable
          or trapped. Open the Repairability tab.
        </li>
        <li>
          <span className="text-fg">EUV dose → LER.</span> 3σ LER scales as
          sqrt(pitch/dose), anchored at ~2.4 nm / 40 mJ/cm² / 28 nm pitch. Dose saving
          is the extra EUV dose an unrectified process would need to match DSA LER
          (IMEC 28 nm; Janes SPIE 2026 24 nm 1:1).
        </li>
        <li>
          <span className="text-fg">LER PSD and ξ.</span> Naulleau/Mack edge PSD.
          DSA is expected to cut high-frequency stochastic while leaving
          low-frequency overlay (MRS Commun. 2025; SIS vs dry-liftoff PSD).
        </li>
        <li>
          <span className="text-fg">Interface width floor.</span> w ≈ 0.55 L0 /
          √(χN). Capillary-wave LER floor added in quadrature. Two-step anneal:
          high T kills dislocations (310 °C for PS-b-PMMA), low T sharpens w.
        </li>
        <li>
          <span className="text-fg">Fredrickson–Helfand ODT.</span> (χN)_ODT =
          10.495 + 41 N^(-1/3). Displayed against χN_eff(T).
        </li>
        <li>
          <span className="text-fg">Binary blend path.</span> Short-chain volume
          φ. Quench → homogeneous L0; slow anneal seeds long-wave demixing
          (Macromolecules 2025; inverse co-optimization arXiv:2510.02715).
        </li>
        <li>
          <span className="text-fg">Maekawa CD window.</span> Defect-free 3×
          sub-10 nm HP on 300 mm when PS-guide CD ≈ 0.57–1.0 L0.
        </li>
        <li>
          <span className="text-fg">χ–kinetics trap / microwave / thickness.</span>{" "}
          M_eff = M0 · μ_mw · Arrhenius(χ, T) · microwave, with a thickness trap
          above 3 L0.
        </li>
        <li>
          <span className="text-fg">A-b-(B-r-C) and Hχ-12.</span> L0 = 8 nm
          (MRS 2025) and L0 = 12 nm carbon/Si (Monreal SPIE 2025, LWR 0.85 nm).
        </li>
        <li>
          <span className="text-fg">High-NA stitch seam.</span> Mid-FOV phase jump
          as a proxy for 0.55 NA field stitching (Intel/ASML 2026, ~30%
          throughput tax until 12-inch masks).
        </li>
        <li>
          <span className="text-fg">Hex contact LCDU/PPE.</span> Do et al. SPIE
          2025: thicker film + anneal + high-χ, −62.5% LCDU / −22.8% PPE vs
          low-dose EUV guides.
        </li>
        <li>
          <span className="text-fg">Iterative inverse design.</span> The Inverse
          tab fits a Matérn-5/2 Gaussian process, selects proposals by expected
          improvement, and evaluates every proposal with the same 2D SCFT
          settings. Its project-defined loss includes target CD and pitch,
          roughness, missing domains, registration, and numerical convergence.
          Seeded initialization and a full JSON/CSV trace make runs reproducible.
          The template design is inspired by{" "}
          <a className="text-teal underline" href="https://arxiv.org/abs/2510.02715" target="_blank" rel="noreferrer">Zhou et al. (2025)</a>;
          this solver uses a single diblock and does not implement their binary
          blend or 3D model. The GP follows the methods described by{" "}
          <a className="text-teal underline" href="https://proceedings.neurips.cc/paper/2012/hash/05311655a15b75fab86956663e1819cd-Abstract.html" target="_blank" rel="noreferrer">Snoek, Larochelle &amp; Adams (2012)</a>.
        </li>
        <li>
          <span className="text-fg">CCD / jump outliers.</span> Shang et al.
          IWAPS 2025. Centre-to-centre distance, LCDU, PPE, and 1.5 nm CCD jumps
          on contact and VIA-pair morphologies. Overlay markers in the chamber.
        </li>
        <li>
          <span className="text-fg">After-etch transfer.</span> Dialameh: etch
          windows narrow as L0 drops below 30 nm. imec P24 SPIE 2026 after-etch
          uLWR/uLER target 0.88 / 1.32 nm into TiN. Residual skin from Δγ
          (Xiong, Nanomaterials 2025).
        </li>
        <li>
          <span className="text-fg">L0(T) contraction.</span> Maekawa 2025: the
          5× window expands and shifts toward lower Ls as T rises. L0_eff
          contracts weakly with T; open the T × Ls map.
        </li>
        <li>
          <span className="text-fg">Chemical contrast window.</span> MRS Commun.
          2025: raising h0 of the PS-guide stripe opens the Ls/L0 island from
          ~0% to ±10%.
        </li>
        <li>
          <span className="text-fg">Spectral SCFT with F(D) period search.</span>{" "}
          Matsen–Fredrickson saddle point. Split-step Fourier MDE
          ∂s q = ∇²q − w q (length unit Rg), incompressible φA+φB=1, F/nkT =
          −ln Q + ⟨χN φA φB − w·φ⟩. Exchange and pressure mix separately (w±,
          Picard). Residual is the exchange-field error ‖w− − (χN/2)(φB−φA) + h‖.
          The chemo/grapho field h sits in the exchange saddle, not the pressure.
          Bulk period D* is the minimizer of F(D), scored against Matsen 1996 Fig. 3
          (D/Rg = √6 D/aN^{1/2}; 4.044 at χN=20, f=1/2). 1D residual is typically
          10⁻⁴–10⁻⁵ on a 128×80 contour. High-χ 1D continues in χN (same L) and
          Anderson-mixes the exchange field only. 2D bulk lamellae are extruded from
          that 1D saddle onto an n×L0 cell with ≥20 px/period. Cylinder melts use a
          √3-commensurate hex cell. Chemo cells snap to an integer number of guide
          pitches Ls, shift-align the 1D profile onto the stripe, then Anderson-mix
          with Eyert damping. Every inverse-design trial uses 2D SCFT, with
          residual and incompressibility reported alongside its dimensional fit.
        </li>
        <li>
          <span className="text-fg">3D thin-film OK + x–z SCFT.</span> 32×32×16
          spectral OK for kinetics. An x–z SCFT then compares F⊥ vs F∥; ΔF = F∥ − F⊥
          {" > 0"} prefers perpendicular (DSA). Substrate chemo decays as exp(−z/λ);
          Δγ at the free surface. √⟨φ²⟩(z) is the OK orientation proxy.
        </li>
        <li>
          <span className="text-fg">Subpixel edges and tanh profile.</span>{" "}
          Zero-crossings with linear interpolation. 3σ LER from aligned traces.
          φ(x) overlay of the Helfand–Tagami tanh. S(k) overlay of Leibler RPA
          (k* Rg ≈ 1.95 at f=1/2).
        </li>
        <li>
          <span className="text-fg">Director / hexatic field.</span> Nematic
          hue from 2θ of ∇φ. Dislocations and disclinations appear as colour
          singularities — the fingerprint figure used in DSA papers.
        </li>
        <li>
          <span className="text-fg">Paper colour key.</span> Chamber colours
          follow the chemistry's published figures, not the bench chrome. Default
          PS-b-PMMA is the Nealey / Sibener schematic (Nano Lett. 2017): PS red,
          PMMA blue, PS-OH dark red, random brush gold, Si gray. PS-b-PDMS uses
          the Ross-group key (PS charcoal, PDMS gold). PS-b-P2VP is orange / violet;
          Si-BCP organic amber / Si teal; P4ClS brick / PMA seafoam. AFM is
          tapping-mode gold. TEM is RuO₄ (stained block dark). Etch is the
          remaining mask bright on dark after selective removal. The chemo
          prepattern is a bar at the top of the FOV, the way LiNe papers draw
          Figure 1 — it is not washed over the domains. Maekawa windows paint
          defect-free cells green.
        </li>
        <li>
          <span className="text-fg">Synthetic CD-SEM.</span> 1.2 nm Gaussian
          PSF, Poisson shot noise, PS-bright / PMMA-dark. Screening only, not a
          calibrated CD-SEM library.
        </li>
        <li>
          <span className="text-fg">LER PSD.</span> Log–log with k⁻² capillary
          and k⁻⁴ white-noise guides (Naulleau / Mack).
        </li>
        <li>
          <span className="text-fg">Melt phase locator.</span> Leibler/Matsen
          DIS / LAM / HEX / BCC sketch with the live (f, χN) marked.
        </li>
        <li>
          <span className="text-fg">P4ClS-b-PMA 7×.</span> ACS Appl. Nano Mater.
          2025. L0 = 14.1 nm, matched γ, ~7.5 nm features on 193i guides without
          a topcoat.
        </li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-bold">Validity</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
        <li>
          Two-dimensional OK for live kinetics. SCFT relax is 2D equilibrium
          plus a 1D F(D) Matsen cell as the bulk check (not chain-resolved 3D
          SCFT, not PSCF). 1D residual is 10⁻⁴–10⁻⁵ and D* matches Matsen to
          ~1% at χN=20; 2D bulk lamellae recover the 1D free energy on a
          commensurate cell. Guided 2D shift-aligns the 1D seed onto the stripe
          (unit cell one guide pitch, ≥20 px/period), then Anderson-mixes the
          exchange field w− (pressure stays Picard). Typical LiNe 2× residual is
          10⁻⁴. χN=40 1D is continued 20→28→40; residual is ~10⁻³, not the
          10⁻⁴ of χN=20. Inverse fits a GP to a consistent 2D SCFT objective. The
          3D film is still OK kinetics (32×32×16); an x–z SCFT compares F⊥ vs F∥
          so the orientation is a free-energy statement, not just √⟨φ²⟩(z).
          Inverse is single-diblock GP-BO on 2D SCFT. Coarse, unconverged
          candidates remain screening estimates. Methods-grade for 1D
          bulk Matsen and 2D LiNe/hex at χN≲30. Not a substitute for PSCF.
          After SCFT relax, SI downloads F, residual, D* vs Matsen, F(D), and the
          mix history as local JSON/CSV for a supporting-information table.
        </li>
        <li>No solvent, no evaporation quench, no through-film electric field.</li>
        <li>No chain-level entanglement; kinetics are a single mobility M(T,χ,z).</li>
        <li>
          Metrology (CD, LER, LWR, PSD, LCDU) is on the order parameter, not an
          SEM image with shot noise.
        </li>
        <li>
          Best for process windows, template-defect screening, and equilibrium
          density after SCFT relax. Absolute LER still wants CD-SEM.
        </li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-bold">CPU context</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        DSA is a pitch-multiplication, CD-control, and EUV-stochastic-heal layer
        on top of 0.33/0.55 NA guides: metal lines, dummy fins, contact-hole
        shrink, and High-NA stitch seams. The questions this instrument answers
        are: given L0, χN, dose, and a (possibly defective) sparse guide, does
        the film lock to n-fold multiplication, and can the free surface repair
        the template before kinetics freeze it?
      </p>

      <p className="mt-10 text-xs text-muted">
        Everything on this page, including the spectral anneal, process-window map,
        SEPA stack, and inverse search, runs in a worker in this browser. No cloud
        solver, no API key. Anchors: Ohta & Kawasaki (1986); Leibler (1980);
        Fredrickson–Helfand; Nealey / LiNe. 2025–26: Maekawa AFM; MRS Commun.
        EUV+DSA; ACS Appl. Polym. Mater. SEPA; Monreal SPIE 2025 Hχ; Janes SPIE
        2026 24 nm 1:1; Do SPIE 2025 hex LCDU; Macromolecules 2025 blends; Appl.
        Surf. Sci. 2026 microwave; Zhou arXiv:2510.02715 inverse; Shang IWAPS 2025
        CCD; imec P24 SPIE 2026 etch; ACS Appl. Nano Mater. 2025 P4ClS. Cards are
        literature-typical, not a vendor lot.
      </p>
    </article>
  );
}
