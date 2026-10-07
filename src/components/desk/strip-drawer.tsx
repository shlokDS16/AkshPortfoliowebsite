"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useId, useState, type ReactNode } from "react";
import { drawerMotion } from "@/components/ui/motion-presets";
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";

/** The strip's Details drawer: clip from top + 8 px slide, 180 ms open / 120 ms close; reduced: fade. */
export function StripDrawer({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const reduced = usePrefersReducedMotion();
  const id = useId();
  return (
    <div className="mx-auto max-w-page px-(--gutter)">
      <div className="flex min-h-10 items-center gap-2">
        <p className="flex-1 py-2">{summary}</p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-10 items-center gap-1 text-geru underline underline-offset-3 pointer-coarse:min-h-11"
        >
          Details
          <ChevronDown aria-hidden strokeWidth={1.5} className={cn("size-4 transition-transform duration-(--motion-base) ease-snap", open && "rotate-180")} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div key="drawer" id={id} data-strip-drawer {...drawerMotion(reduced)} className="pb-3">
            {children}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
