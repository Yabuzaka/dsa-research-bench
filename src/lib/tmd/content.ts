export const WHY_POINTS = [
  {
    k: "Body is the monolayer",
    v: "A 0.65 nm MoS₂ sheet is thinner than any manufacturable Si film. Natural length λ scales as √(t_ch t_ox), so the 2D body buys electrostatics that 3 nm SOI cannot.",
  },
  {
    k: "No dangling bonds",
    v: "Basal plane is chemically saturated. That is why TMD channels survive as stacked GAA / CFET nanosheets without the interface-state tax of thinned Si.",
  },
  {
    k: "Gap stays open",
    v: "Monolayer TMDs are 1.1–2.1 eV semiconductors. Ultrascaled Si, at the same thickness, is a gapless sheet with a density-of-states penalty and leakage.",
  },
  {
    k: "The catch is not λ",
    v: "Contacts, high-κ nucleation, grain boundaries, and a missing high-performance p-FET (WSe₂ is close, not done) dominate the remaining gap to IRDS.",
  },
];

export const BOTTLENECKS = [
  {
    id: "contacts",
    title: "Contacts",
    stat: "Rc 15–800 Ω·µm",
    body: "Fermi-level pinning at the metal–TMD interface sets a Schottky barrier that refuses to vanish with doping the way Si does. Hybrid contacts beat edge below 10 nm L_c and approach the quantum limit above 10¹³ cm⁻² (Phys. Rev. Applied 2026). TSMC Sb/MoS₂ holds current to L_c ≈ 30 nm at Rc ≲ 100 Ω·µm. p-WSe₂ still needs topological semimetals or 2D/2D doping to post the same number (arXiv:2608.06793; Nano Lett. 2026).",
  },
  {
    id: "dielectric",
    title: "Dielectric",
    stat: "EOT ≲ 1 nm, Dit ~ 10¹²",
    body: "No native oxide. Seed layers (SiH₄, MOCVD HfO₂, transferred stack) fight pinholes at EOT ~ 0.9 nm. Dit still sits near 10¹²–10¹³ cm⁻² eV⁻¹, which is the SS floor once λ is no longer the problem.",
  },
  {
    id: "growth",
    title: "Growth",
    stat: "300 mm MOCVD",
    body: "Intel, IMEC, TSMC have shown 300 mm MoS₂ / WS₂ / WSe₂. Grain boundaries, chalcogen vacancies, and transfer vs direct-growth still set yield. Epitaxy on sapphire then bond-transfer is the research path; foundry path wants deposition on the device wafer.",
  },
  {
    id: "cmos",
    title: "Complementary pair",
    stat: "n = MoS₂/WS₂, p = WSe₂",
    body: "n-FETs are ahead. p-WSe₂ needs NO doping or contact tricks to hold I_on; a matched CMOS inverter at Vdd = 0.6–0.7 V with both sides > 500 µA/µm is still a paper, not a tape-out.",
  },
  {
    id: "yield",
    title: "Yield / variation",
    stat: "LCDU of the channel",
    body: "A vacancy is a dopant. A grain boundary is a percolation path. 2D CMOS computers (Penn State) prove the circuit idea; 300 mm NMOS+PMOS (IEDM) prove the wafer idea. Neither is a SRAM bit-cell yield curve.",
  },
];

export const ROADMAP = [
  { y: "2011", t: "First monolayer MoS₂ FET (Kis)", d: "Proof that a 6.5 Å channel switches." },
  { y: "2022–23", t: "300 mm NMOS + PMOS", d: "Intel IEDM: MoS₂, WS₂, WSe₂ on 300 mm. Manufacturability argument starts." },
  { y: "2024", t: "2D CMOS computer", d: "Penn State: a complete (small) computer in 2D devices. Not a foundry node — a circuit existence proof." },
  { y: "2025", t: "Lch, Lc < 35 nm", d: "Nat. Electronics: wafer-scale MoS₂, Au contacts, EOT < 2.5 nm, trilayer I_on 230 µA/µm at Vds = 1 V." },
  { y: "2026", t: "Nanoribbon + hybrid contacts", d: "Width scaling to 30–40 nm lifts I_on ~42% (champion 995 µA/µm). Hybrid contacts scale below 10 nm L_c; source injection, not μ, caps sub-10 nm L_g." },
  { y: "2028–30", t: "IRDS 2D-channel option", d: "GAA / CFET nanosheet with a TMD sheet as the body, not a Si fin. DSA (the other bench here) is how you print the dummy fins and M0 that sit next to it." },
  { y: "2030s", t: "RISC-V research CPUs", d: "Lab 2D CPUs exist as a research target. A production 2D logic node is still a foundry decision, not a material one." },
];

export const GLOSSARY: { term: string; def: string }[] = [
  { term: "λ, natural length", def: "Electrostatic scaling length. Short-channel effects explode when L_g ≲ few × λ." },
  { term: "SS", def: "Subthreshold swing, mV/decade of drain current. Floor 60 mV/dec at 300 K for a Boltzmann FET." },
  { term: "EOT", def: "Equivalent oxide thickness. Cox = 3.9 ε0 / EOT." },
  { term: "Dit", def: "Interface trap density, cm⁻² eV⁻¹. Adds to the n-factor: n = 1 + Cit/Cox + SCE." },
  { term: "Rc", def: "Contact resistivity × width, Ω·µm. Two contacts add 2 Rc / W to the device." },
  { term: "GAA", def: "Gate-all-around. n = 4 in the λ sketch used here (vs 1 SG, 2 DG)." },
  { term: "CFET", def: "Complementary FET: stacked n and p nanosheets. A TMD sheet is a candidate body in each stack." },
  { term: "2H", def: "Hexagonal semiconducting polytype of MX₂. 1T/1T′ are metallic / semi-metallic." },
  { term: "SBH", def: "Schottky barrier height at the metal–TMD interface. Pinned, not equal to work-function difference." },
  { term: "I_on / I_off", def: "Drive vs leakage at a given Vdd. HP targets ~10⁴–10⁶; LP wants I_off ~ pA/µm." },
  { term: "Nanoribbon", def: "Width-scaled TMD channel (~30–40 nm). Edges help gating and side injection if they stay clean." },
  { term: "Hybrid contact", def: "Top + edge injection into the TMD. Phys. Rev. Applied 2026: best of the three geometries below 10 nm L_c, near the quantum-limit Rc at n > 10¹³ cm⁻²." },
  { term: "L_c", def: "Contact length along the channel. TSMC 2025 Sb/MoS₂: I_on independent of L_c down to ~30 nm." },
];
