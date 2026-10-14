"use client";

import type { ProposalView, ReadingView } from "@/modules/ingestion/client";
import { ReadingRows } from "./reading-rows";
import { ValueRow } from "./value-row";

type Props = {
  groups: { topic: string; rows: ProposalView[] }[];
  hiddenBasis: number;
  texts: Record<number, string>;
  ticked(id: string): boolean;
  typed: Record<string, string>;
  openId: string | null;
  onTick(id: string, on: boolean): void;
  onType(id: string, valueText: string | null): void;
  onOpen(id: string): void;
  /** The machine's test readings, listed after the figures with ticks of their own (Plan 2b Task 8). */
  readings?: ReadingView[];
  readingTicked?(id: string): boolean;
  onReadingTick?(id: string, on: boolean): void;
};

/** The figures that can be filed, by topic (segment 4 C): verified ones ticked, each with its page and line. Untick or edit any. */
export function ValuesList({ groups, hiddenBasis, texts, ticked, typed, openId, onTick, onType, onOpen, readings = [], readingTicked = () => true, onReadingTick = () => {} }: Props) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.topic} aria-label={group.topic}>
          <h3 className="mb-1 font-mono text-mono-label uppercase text-ink-muted">{group.topic}</h3>
          <ul className="rounded-sm border border-rule bg-paper">
            {group.rows.map((row) => (
              <ValueRow
                key={row.id}
                row={row}
                ticked={ticked(row.id)}
                typed={typed[row.id] ?? null}
                pageText={texts[row.page]}
                open={openId === row.id}
                onTick={(on) => onTick(row.id, on)}
                onType={(v) => onType(row.id, v)}
                onOpen={() => onOpen(row.id)}
              />
            ))}
          </ul>
        </section>
      ))}
      <ReadingRows readings={readings} ticked={readingTicked} onTick={onReadingTick} />
      {hiddenBasis > 0 ? <p className="text-small text-ink-muted">{hiddenBasis === 1 ? "1 standalone figure repeats a consolidated one and is left out." : `${hiddenBasis} standalone figures repeat consolidated ones and are left out.`}</p> : null}
    </div>
  );
}
