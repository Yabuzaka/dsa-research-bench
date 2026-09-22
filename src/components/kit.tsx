import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("panel p-4", className)}>{children}</section>;
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
      {children}
    </div>
  );
}

export function Fold({
  title,
  defaultOpen = true,
  hint,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between px-4 text-left"
        aria-expanded={open}
        data-explain={hint}
      >
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          {title}
        </span>
        <ChevronDown
          className={cn("size-4 text-muted transition-transform duration-150", open && "rotate-180")}
        />
      </button>
      {open ? <div className="border-t border-border px-4 pb-4 pt-1">{children}</div> : null}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-3 block" data-explain={hint}>
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-fg">{formatTick(value, step)}</span>
      </div>
      <input
        type="range"
        className="mt-1 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        suppressHydrationWarning
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Metric({
  k,
  v,
  u,
  hint,
  className,
}: {
  k: string;
  v: string;
  u: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b border-border/70 py-1.5 last:border-0"
      data-explain={hint}
    >
      <span className="text-xs text-muted">{k}</span>
      <span className={cn("font-mono text-sm tabular-nums", className)}>
        {v}
        {u ? <span className="ml-1 text-xs text-muted">{u}</span> : null}
      </span>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  delta,
  up,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: string;
  up?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="panel p-4" data-explain={hint}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted">{label}</p>
        {delta ? (
          <span className={cn("rounded-md px-2 py-0.5 font-mono text-xs tabular-nums", up ? "delta-up" : "delta-down")}>
            {delta}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {children}
    </section>
  );
}

export function fmt(n: number | undefined, d = 1) {
  if (n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(d);
}

function formatTick(value: number, step: number) {
  const d = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return value.toFixed(d);
}
