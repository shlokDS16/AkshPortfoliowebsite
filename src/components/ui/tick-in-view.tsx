"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Arms the CSS status tick (`[data-tick="run"] .status-tick`) once, when the block first enters view.
 * Anything already on screen at hydration renders final and never animates (design-dna 10.3);
 * reduced motion never arms it.
 */
export function TickInView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight && rect.height > 0) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setRun(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} data-tick={run ? "run" : undefined}>
      {children}
    </div>
  );
}
