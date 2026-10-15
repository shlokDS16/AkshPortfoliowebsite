"use client";

import { Check } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MAX_ITEM_CONCEPTS, type ConceptRef } from "@/modules/knowledge/client";
import { PendingButton } from "../pending-button";

const SHOWN = 50;
const BLOCKED_TEXT = "A newer version of this note is waiting to be published. Publish it before changing the concepts.";

type Props = {
  options: readonly ConceptRef[];
  /** The ids the item links now, in order. */
  initial: readonly string[];
  save: (conceptIds: string[]) => Promise<void>;
  /** A revision is waiting for the gate: research refuses the change, so the button stays off and the sentence says why. */
  blocked: boolean;
};

/**
 * "Concepts for this note": a multi-select listbox with type-ahead (a combobox over it), keyboard-complete. The order of the taps is
 * the order saved, and the first is the primary concept. Saving makes a new version of the note (a form action, so a double tap sends one).
 */
export function ConceptPicker({ options, initial, save, blocked }: Props) {
  const uid = useId();
  const [ids, setIds] = useState<string[]>([...initial]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const matches = options.filter((o) => o.name.toLowerCase().includes(needle));
  const shown = matches.slice(0, SHOWN);
  const full = ids.length >= MAX_ITEM_CONCEPTS;
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? id;
  const optionId = (id: string) => `${uid}-opt-${id}`;
  const toggle = (id: string) => {
    if (ids.includes(id)) setIds(ids.filter((x) => x !== id));
    else if (!full) setIds([...ids, id]);
  };
  const move = (step: 1 | -1) => {
    if (shown.length === 0) return;
    const at = shown.findIndex((o) => o.id === active);
    const next = at === -1 ? (step === 1 ? 0 : shown.length - 1) : Math.min(shown.length - 1, Math.max(0, at + step));
    setActive(shown[next]!.id);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault(); // Enter chooses here; it never submits the form from the box
      if (active) toggle(active);
    } else if (e.key === "Escape") {
      setQuery("");
      setActive(null);
    }
  };
  const activeShown = active !== null && shown.some((o) => o.id === active);
  return (
    <section aria-labelledby={`${uid}-h`} className="space-y-3 rounded-sm border border-rule p-3">
      <h2 id={`${uid}-h`} className="text-subtitle text-ink">
        Concepts for this note
      </h2>
      <form action={() => save(ids)} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-q`}>Find a concept</Label>
          <input
            id={`${uid}-q`}
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls={shown.length > 0 ? `${uid}-list` : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeShown ? optionId(active) : undefined}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(null);
            }}
            onKeyDown={onKeyDown}
            className="block min-h-11 w-full rounded-sm border border-input bg-paper px-3 text-body text-ink"
          />
        </div>
        {shown.length > 0 ? (
          <ul id={`${uid}-list`} role="listbox" aria-multiselectable="true" aria-label="Concepts" className="divide-y divide-rule rounded-sm border border-rule">
            {shown.map((o) => {
              const at = ids.indexOf(o.id);
              const selected = at !== -1;
              const unavailable = !selected && full;
              return (
                <li
                  key={o.id}
                  id={optionId(o.id)}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={unavailable || undefined}
                  data-name={o.name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(o.id)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 px-3 text-body text-ink",
                    selected && "bg-surface-2 font-medium",
                    unavailable && "cursor-not-allowed text-ink-muted",
                    active === o.id && "outline outline-2 -outline-offset-2 outline-ink",
                  )}
                >
                  <span aria-hidden className="inline-flex size-4 shrink-0 items-center justify-center">
                    {selected ? <Check strokeWidth={1.5} className="size-4" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{o.name}</span>
                  {o.status === "unchecked" ? <span className="text-caption text-ink-muted">not checked yet</span> : null}
                  {selected ? (
                    <span aria-hidden className="font-mono text-mono-tag tabular-nums text-ink-muted">
                      {at + 1}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-small text-ink-muted">No checked concept matches.</p>
        )}
        {matches.length > SHOWN ? <p className="text-caption text-ink-muted">Showing the first {SHOWN}. Keep typing to narrow the list.</p> : null}
        {ids.length > 0 ? (
          <ol aria-label="Chosen, in order" className="flex flex-wrap gap-2">
            {ids.map((id, i) => (
              <li key={id} className="inline-flex items-center gap-1 rounded-sm border border-rule-strong pl-2 text-small text-ink">
                <span aria-hidden className="font-mono text-mono-tag tabular-nums text-ink-muted">
                  {i + 1}
                </span>
                {nameOf(id)}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-small text-ink underline decoration-1 underline-offset-3"
                >
                  Remove <span className="sr-only">{nameOf(id)}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        <p aria-live="polite" className="font-mono text-mono-tag tabular-nums text-ink-muted">
          {ids.length} of {MAX_ITEM_CONCEPTS} chosen
        </p>
        <p className="text-caption text-ink-muted">Up to 8. Saving makes a new version.</p>
        {blocked ? <p className="rounded-sm border border-warn bg-warn-wash px-3 py-2 text-small text-ink">{BLOCKED_TEXT}</p> : null}
        <PendingButton disabled={blocked}>Save concepts</PendingButton>
      </form>
    </section>
  );
}
