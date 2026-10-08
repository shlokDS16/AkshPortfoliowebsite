"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import type { ProposalView } from "@/modules/ingestion/client";
import { PageText, wordsOf } from "./page-text";

const small = "inline-flex min-h-11 items-center rounded-sm px-2 text-small font-medium text-ink underline decoration-1 underline-offset-3 hover:bg-surface-2";

type Props = {
  row: ProposalView;
  ticked: boolean;
  /** What Aksh has typed over the figure in this list, not yet saved. */
  typed: string | null;
  pageText: string | undefined;
  open: boolean;
  onTick(on: boolean): void;
  onType(valueText: string | null): void;
  onOpen(): void;
};

/** One figure in the values list: tick, the figure with its year and as-of date, the printed line, Edit and the page on demand. */
export function ValueRow({ row, ticked, typed, pageText, open, onTick, onType, onOpen }: Props) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const shown = typed ?? row.valueText;
  const wasRead = row.status === "edited" || typed !== null;

  function confirm() {
    const next = draft.trim();
    onType(next === "" || next === row.valueText ? null : next);
    setEditing(false);
  }
  function keys(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      setEditing(false);
    }
  }

  return (
    <li className="border-b border-rule last:border-b-0">
      <div className="flex items-start gap-3 py-2 pr-1 pl-3">
        <input type="checkbox" className="mt-3 size-5 shrink-0 accent-ink" checked={ticked} aria-labelledby={`${id}-name`} onChange={(e) => onTick(e.target.checked)} />
        <div className="min-w-0 flex-1 py-1.5">
          <p id={`${id}-name`} className="break-words text-body text-ink">
            {row.label}{" "}
            <span className="font-mono text-data tabular-nums">
              {shown}
              {row.unit ? ` ${row.unit}` : ""}
            </span>
          </p>
          <p className="text-small text-ink-muted">
            {row.period}
            {row.asOf ? ` · as of ${formatDate(row.asOf)}` : ""}
            {row.prior ? ` · ${row.priorPeriod ? `${row.priorPeriod} ` : "prior "}${row.prior}` : ""}
          </p>
          {wasRead ? <p className="text-small text-ink">You typed {shown}; the desk read {row.machineText}.</p> : null}
          {row.quote ? <p className="mt-0.5 break-words font-mono text-caption text-ink-muted">p. {row.page} · {row.quote}</p> : <p className="font-mono text-caption text-ink-muted">p. {row.page}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end desk:flex-row">
          <button type="button" className={small} aria-label={`Edit ${row.label}`} aria-expanded={editing} onClick={() => { setDraft(shown); setEditing((v) => !v); }}>
            Edit
          </button>
          <button type="button" className={small} aria-expanded={open} aria-controls={`${id}-page`} aria-label={`Page ${row.page} text for ${row.label}`} onClick={onOpen}>
            p. {row.page}
          </button>
        </div>
      </div>
      {editing ? (
        <form
          className="flex items-end gap-2 px-3 pb-3 pl-11"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
          onKeyDown={keys}
        >
          <Input aria-label={`Value for ${row.label}`} autoFocus autoComplete="off" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} className="max-w-48 font-mono tabular-nums" />
          <Button type="submit">Use</Button>
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : null}
      {open ? (
        <div id={`${id}-page`} className="border-t border-rule bg-surface px-3 py-2 desk:hidden">
          <PageText page={row.page} text={pageText} words={[shown, ...wordsOf(row.label)]} />
        </div>
      ) : null}
    </li>
  );
}
