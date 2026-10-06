"use client";

import { useEffect, useState } from "react";

/** The section heading nearest the top of the reading area (below the bars) is active. */
export function useActiveSection(ids: string[]): string | null {
  const key = ids.join("|");
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const elements = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    elements.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return active;
}
