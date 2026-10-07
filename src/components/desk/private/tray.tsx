import type { ReactNode } from "react";
import { CountFlow } from "@/components/ui/count-flow";

type Props = { title: string; count: number; empty: { body: string }; children?: ReactNode };

/** A state-named group (segment 4 C) with an ink count; explains itself when empty. */
export function Tray({ title, count, empty, children }: Props) {
  const id = `tray-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="flex items-center gap-2 text-label uppercase text-ink-muted">
        {title}
        <span className="rounded-sm bg-ink px-1.5 py-0.5 font-mono text-mono-label text-paper">
          <CountFlow value={count} className="tabular-nums" />
        </span>
      </h2>
      {count === 0 ? <p className="rounded-sm border border-dashed border-rule-strong p-4 text-small text-ink-muted">{empty.body}</p> : null}
      {children}
    </section>
  );
}
