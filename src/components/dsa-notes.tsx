import { Button } from "@/components/ui/button";
import { DSA_WINS } from "@/lib/dsa/success";

export function DsaNotes({ onLoad }: { onLoad: (recipeId: string) => void }) {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
        Published successes only
      </p>
      <h2 className="font-display mt-1 text-xl font-semibold">DSA combinations that worked</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Wafer or SEM-confirmed process windows from 2025–26 (plus the LiNe baseline they still sit
        on). Not a screening list. Load a row into Chamber to run that recipe locally.
      </p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-border bg-elevated text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Combination</th>
              <th className="px-4 py-3 font-medium">BCP</th>
              <th className="px-4 py-3 font-medium">Guide</th>
              <th className="px-4 py-3 font-medium">What passed</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {DSA_WINS.map((w) => (
              <tr key={w.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 align-top">
                  <p className="font-medium text-fg">{w.title}</p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {w.year} · {w.layer} · L0 {w.l0Nm} nm · Ls {w.lsNm} nm · {w.nx} · CD/L0 {w.cdL0}
                  </p>
                  <p className="mt-1 text-xs text-muted">{w.source}</p>
                </td>
                <td className="px-4 py-3 align-top text-muted">{w.bcp}</td>
                <td className="px-4 py-3 align-top text-muted">{w.flow}</td>
                <td className="px-4 py-3 align-top text-fg">{w.result}</td>
                <td className="px-4 py-3 align-top">
                  <Button size="sm" variant="outline" onClick={() => onLoad(w.recipeId)} data-explain="Load this published combination into Chamber.">
                    Load
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
