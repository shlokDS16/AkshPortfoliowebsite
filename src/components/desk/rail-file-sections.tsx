"use client";

import { cn } from "@/lib/utils";
import * as m from "motion/react-m";
import { EASE_SNAP, MOTION } from "@/components/ui/motion-tokens";
import type { FileNo } from "@/lib/desk-types";
import type { RailSection } from "@/lib/view-types";
import { IdMark } from "./id-mark";
import { useActiveSection } from "./use-active-section";

type Props = { fileNo: FileNo; shortName: string; sections: RailSection[] };

/** On a file the rail opens into its sections; a 2 px geru bar marks the one in view (layoutId). */
export function RailFileSections({ fileNo, shortName, sections }: Props) {
  const active = useActiveSection(sections.map((s) => s.id));
  return (
    <div className="mt-1 mb-2 ml-2">
      <p className="px-2 text-caption text-ink-muted">
        <IdMark kind="file" value={fileNo} /> {shortName}
      </p>
      <ul className="mt-1">
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id} className="relative">
              {on ? (
                <m.span layoutId="rail-active" aria-hidden className="absolute inset-y-1 left-0 w-0.5 bg-geru" transition={{ duration: MOTION.slow, ease: EASE_SNAP }} />
              ) : null}
              <a
                href={`#${s.id}`}
                aria-current={on ? "true" : undefined}
                className={cn("flex min-h-8 items-center justify-between pr-2 pl-3 text-small text-ink no-underline hover:bg-surface-2", on && "font-semibold")}
              >
                <span>{s.label}</span>
                {s.count !== undefined ? <span className="tabular-nums text-ink-muted">{s.count}</span> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
