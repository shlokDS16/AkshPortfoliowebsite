"use client";

import { useScroll } from "motion/react";
import * as m from "motion/react-m";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

const supportsTimeline = () => typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timeline: scroll()");
const noop = () => () => {};

/** Scroll-linked reading progress; the reader moves it, so it stays under reduced motion (design-dna 10.4). */
export function ReadingHairline({ targetId }: { targetId: string }) {
  const target = useRef<HTMLElement | null>(null);
  // A layout effect so the ref is set before useScroll's own layout effect reads it. A missing target
  // falls back to the page: Motion throws an uncaught "ref is defined but not hydrated" on a null one.
  useLayoutEffect(() => {
    target.current = document.getElementById(targetId) ?? document.documentElement;
  }, [targetId]);
  const { scrollYProgress } = useScroll({ target, offset: ["start start", "end end"] });
  const css = useSyncExternalStore(noop, supportsTimeline, () => true);
  return (
    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 block h-px bg-rule-strong">
      {css ? (
        <span data-hairline="css" className="progress-hairline block h-px bg-ink" />
      ) : (
        <m.span data-hairline="js" className="block h-px origin-left bg-ink" style={{ scaleX: scrollYProgress }} />
      )}
    </span>
  );
}
