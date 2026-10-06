"use client";

import { useEffect, useState } from "react";

// globals.css: [data-section] { scroll-margin-top: top bar + index + 8px } = 52 + 46 + 8 (phone). Used only
// when a heading carries no computed value (no stylesheet).
const FALLBACK_OFFSET = 106;

function offsetOf(heading: HTMLElement): number {
  const margin = Number.parseFloat(getComputedStyle(heading).scrollMarginTop);
  return Number.isFinite(margin) ? margin : FALLBACK_OFFSET;
}

/** The last heading at or above the line the bars leave free (its scroll-margin-top), else the first. */
function currentSection(headings: HTMLElement[]): string {
  const line = offsetOf(headings[0]) + 1;
  let current = headings[0];
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= line) current = heading;
  }
  return current.id;
}

/**
 * Recomputed from every heading on each observer callback and once on mount, so scrolling up and a
 * reload with restored scroll land on the right section. The observer only says "something crossed".
 */
export function useActiveSection(ids: string[]): string | null {
  const key = ids.join("|");
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const headings = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;
    const update = () => setActive(currentSection(headings));
    update();
    const io = new IntersectionObserver(update, { rootMargin: `-${offsetOf(headings[0])}px 0px -60% 0px` });
    headings.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return active;
}
