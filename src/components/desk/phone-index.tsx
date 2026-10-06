"use client";

import { cn } from "@/lib/utils";
import * as m from "motion/react-m";
import { CountFlow } from "@/components/ui/count-flow";
import { EASE_SNAP, MOTION } from "@/components/ui/motion-tokens";
import type { RailSection } from "@/lib/view-types";
import { ReadingHairline } from "./reading-hairline";
import { useActiveSection } from "./use-active-section";

/** Sticky four-part file index on phone (View · Tests 3 · Facts 8 · History R2) with the reading hairline. */
export function PhoneIndex({ sections }: { sections: RailSection[] }) {
  const active = useActiveSection(sections.map((s) => s.id));
  return (
    <nav aria-label="On this page" className="sticky top-(--top-bar-h) z-(--z-index) border-b border-rule bg-paper desk:hidden">
      <ul className="flex h-11 px-(--gutter)">
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id} className="relative flex-1">
              <a
                href={`#${s.id}`}
                aria-current={on ? "true" : undefined}
                className={cn("flex h-11 items-center justify-center gap-1 text-small text-ink no-underline", on && "font-semibold")}
              >
                {s.label}
                {typeof s.count === "number" ? <CountFlow value={s.count} className="tabular-nums text-ink-muted" /> : null}
                {typeof s.count === "string" ? <span className="tabular-nums text-ink-muted">{s.count}</span> : null}
              </a>
              {on ? (
                <m.span layoutId="phone-index-active" aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 bg-geru" transition={{ duration: MOTION.slow, ease: EASE_SNAP }} />
              ) : null}
            </li>
          );
        })}
      </ul>
      <ReadingHairline targetId="file-body" />
    </nav>
  );
}
