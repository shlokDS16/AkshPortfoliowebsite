"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Fragment, useState } from "react";
import { cardMotion } from "@/components/ui/motion-presets";
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";
import type { SourceChipData, ViewInline } from "@/lib/view-types";
import { SourceFactCard } from "./source-fact-card";

export function SourceChip({ data, open, onToggle }: { data: SourceChipData; open: boolean; onToggle(): void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? `card-${data.chipId}` : undefined}
      onClick={onToggle}
      className={cn(
        "chip-hit relative mx-0.5 inline-flex items-baseline rounded-sm border px-1 font-mono text-mono-inline tabular-nums transition-colors duration-(--motion-fast) ease-snap active:scale-(--press-scale)",
        open ? "border-geru bg-geru-wash text-geru" : "border-rule-strong text-geru hover:bg-surface-2",
      )}
    >
      {data.label}
    </button>
  );
}

/**
 * A paragraph of Aksh's prose with its chips. One card open at a time per paragraph; the card opens in
 * flow under the paragraph (220 ms clip + slide, 120 ms close; reduced: fade) and pushes text only after
 * the reader's own input. The prose itself never animates.
 */
export function ChipParagraph({ inline, as = "p" }: { inline: ViewInline[]; as?: "p" | "span" }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const reduced = usePrefersReducedMotion();
  const Tag = as;
  const open = inline.flatMap((x) => (typeof x === "string" ? [] : [x.chip])).find((c) => c.chipId === openId) ?? null;
  return (
    <>
      <Tag className={as === "p" ? "my-(--para) block" : undefined}>
        {inline.map((x, i) =>
          typeof x === "string" ? (
            <Fragment key={i}>{x}</Fragment>
          ) : (
            <SourceChip key={i} data={x.chip} open={openId === x.chip.chipId} onToggle={() => setOpenId((c) => (c === x.chip.chipId ? null : x.chip.chipId))} />
          ),
        )}
      </Tag>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div key={open.chipId} {...cardMotion(reduced)}>
            <SourceFactCard card={open.card} id={`card-${open.chipId}`} />
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
