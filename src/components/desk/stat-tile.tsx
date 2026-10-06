import type { ReactNode } from "react";
import { CountFlow } from "@/components/ui/count-flow";

type Props = { label: string; value: number; unit?: string; context?: string; children?: ReactNode };

/** Home band (segment 3 B): counts of desk activity, never returns or hit rates (rule 2). */
export function StatTile({ label, value, unit, context, children }: Props) {
  const note = value === 0 && !context ? "none yet" : context;
  return (
    <div className="border-t border-ink pt-2">
      <p className="text-label uppercase text-ink-muted">{label}</p>
      <p className="mt-1 text-figure-lg text-ink desk:text-figure-lg-desk">
        <CountFlow value={value} className="lining-nums proportional-nums" />
        {unit ? <span className="ml-1.5 text-small font-normal text-ink-muted">{unit}</span> : null}
      </p>
      {children}
      {note ? <p className="mt-1 text-caption text-ink-muted">{note}</p> : null}
    </div>
  );
}
