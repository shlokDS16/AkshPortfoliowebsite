"use client";

import { useId } from "react";
import { formatDate } from "@/lib/format";
import type { ReadingView } from "@/modules/ingestion/client";

type Props = { readings: ReadingView[]; ticked(id: string): boolean; onTick(id: string, on: boolean): void };

/**
 * The machine's reading of each test the file watches (Plan 2b Task 8): ticked like a figure and filed beside the figures. It has no Edit:
 * Aksh changes a reading in the Facts form, and a reading never touches a test's status.
 */
export function ReadingRows({ readings, ticked, onTick }: Props) {
  const base = useId();
  if (readings.length === 0) return null;
  return (
    <section aria-label="Test readings" className="space-y-1">
      <h3 className="font-mono text-mono-label uppercase text-ink-muted">Test readings</h3>
      <p className="text-small text-ink-muted">A reading sets the test&apos;s reading, its date and its prior. Its status stays yours.</p>
      <ul className="rounded-sm border border-rule bg-paper">
        {readings.map((r) => {
          const id = `${base}-${r.id}`;
          return (
            <li key={r.id} className="flex items-start gap-3 border-b border-rule py-2 pr-3 pl-3 last:border-b-0">
              <input type="checkbox" className="mt-3 size-5 shrink-0 accent-ink" checked={ticked(r.id)} aria-labelledby={`${id}-name`} onChange={(e) => onTick(r.id, e.target.checked)} />
              <div className="min-w-0 flex-1 py-1.5">
                <p id={`${id}-name`} className="break-words text-body text-ink">
                  <span className="font-mono text-mono-id text-geru">{r.testId}</span> <span>{r.label}</span>{" "}
                  <span className="font-mono text-data tabular-nums">{`${r.valueText}${r.unit ? ` ${r.unit}` : ""}`}</span>
                </p>
                <p className="text-small text-ink-muted">
                  {r.period} · as of {formatDate(r.asOf)}
                  {r.prior !== null ? ` · prior ${r.prior}` : ""}
                </p>
                <p className="mt-0.5 break-words font-mono text-caption text-ink-muted">
                  p. {r.page}
                  {r.quote ? ` · ${r.quote}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
