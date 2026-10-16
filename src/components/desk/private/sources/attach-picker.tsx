"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Label } from "@/components/ui/label";

export type AttachOption = { id: string; label: string; hint: string | null };
type Props = { name: string; label: string; noun: "company" | "concept"; options: readonly AttachOption[]; initial: readonly string[]; max: number };

const SHOWN = 6;
const text = (o: AttachOption) => (o.hint ? `${o.label} · ${o.hint}` : o.label);
const plural = (noun: Props["noun"]) => (noun === "company" ? "companies" : "concepts");

/**
 * Companies or concepts for a source: type to find, press to add, press to remove. What is chosen travels as hidden fields named `name`, one per id, in
 * the order chosen (the same repeated field the capture filing and the edit form read). Enter in the search box adds the first match and never submits.
 */
export function AttachPicker({ name, label, noun, options, initial, max }: Props) {
  const uid = useId();
  const [ids, setIds] = useState<string[]>([...initial]);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const full = ids.length >= max;
  const chosen = ids.flatMap((id) => options.find((o) => o.id === id) ?? []);
  const matches = needle === "" || full ? [] : options.filter((o) => !ids.includes(o.id) && `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(needle));
  const shown = matches.slice(0, SHOWN);
  const add = (id: string) => {
    if (!full && !ids.includes(id)) setIds([...ids, id]);
    setQuery("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // Enter chooses here; it never submits the form from the box
    if (shown[0]) add(shown[0].id);
  };
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-label uppercase text-ink-muted">{label}</legend>
      {ids.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {chosen.length > 0 ? (
        <ul aria-label={`Chosen ${plural(noun)}`} className="flex flex-wrap gap-2">
          {chosen.map((o) => (
            <li key={o.id} className="inline-flex items-center gap-1 rounded-sm border border-rule-strong pl-2 text-small text-ink">
              {o.label}
              <button
                type="button"
                onClick={() => setIds(ids.filter((x) => x !== o.id))}
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-small text-ink underline decoration-1 underline-offset-3 desk:min-h-8 desk:min-w-0"
              >
                <span aria-hidden>Remove</span>
                <span className="sr-only">Remove {o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Label htmlFor={`${uid}-q`} className="sr-only">
        Find a {noun}
      </Label>
      <input
        id={`${uid}-q`}
        type="text"
        autoComplete="off"
        placeholder={`Find a ${noun}`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={full}
        className="block min-h-11 w-full rounded-sm border border-input bg-paper px-3 text-body text-ink placeholder:text-ink-muted disabled:opacity-45"
      />
      {shown.length > 0 ? (
        <ul aria-label={`Matching ${plural(noun)}`} className="divide-y divide-rule rounded-sm border border-rule">
          {shown.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => add(o.id)} className="flex min-h-11 w-full items-center px-3 text-left text-body text-ink hover:bg-surface-2">
                Add {text(o)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {needle !== "" && !full && matches.length === 0 ? <p className="text-small text-ink-muted">No {noun} matches.</p> : null}
      {full ? <p className="text-small text-ink-muted">The most a source can have is {max}. Remove one to add another.</p> : null}
      <p aria-live="polite" className="font-mono text-mono-tag tabular-nums text-ink-muted">
        {ids.length} of {max}
      </p>
    </fieldset>
  );
}
