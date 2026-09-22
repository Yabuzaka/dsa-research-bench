import { useEffect, useRef, useState } from "react";

export function ExplainLayer({ enabled }: { enabled: boolean }) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean } | null>(null);
  const last = useRef<Element | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTip(null);
      last.current = null;
      return;
    }
    function hide() {
      last.current = null;
      setTip(null);
    }
    function place(el: Element) {
      const text = el.getAttribute("data-explain")?.trim();
      if (!text) return;
      const r = el.getBoundingClientRect();
      const above = r.bottom + 88 > window.innerHeight;
      const x = Math.min(Math.max(8, r.left), window.innerWidth - 328);
      setTip({ text, x, y: above ? r.top : r.bottom, above });
    }
    function onOver(e: MouseEvent) {
      const el = (e.target as Element | null)?.closest?.("[data-explain]");
      if (!el) {
        hide();
        return;
      }
      if (el === last.current) return;
      last.current = el;
      place(el);
    }
    document.addEventListener("mouseover", onOver);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("mouseover", onOver);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [enabled]);

  if (!enabled || !tip) return null;
  return (
    <div
      role="tooltip"
      className="explain-tip"
      style={{
        left: tip.x,
        top: tip.above ? undefined : tip.y + 8,
        bottom: tip.above ? window.innerHeight - tip.y + 8 : undefined,
      }}
    >
      {tip.text}
    </div>
  );
}
