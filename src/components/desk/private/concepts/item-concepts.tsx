"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ConceptRef } from "@/modules/knowledge/client";
import { ConceptChips } from "./concept-chips";
import { ConceptPicker } from "./concept-picker";

type Props = {
  /** What the newest version of the item links now, in order. */
  linked: readonly ConceptRef[];
  /** Screened live concepts. A linked concept still waiting on Names is added so it can be taken out. */
  options: readonly ConceptRef[];
  save: (conceptIds: string[]) => Promise<void>;
  blocked: boolean;
};

/** The item page's Concepts row: chips to the concept pages and "Change", which opens the picker below the row. */
export function ItemConcepts({ linked, options, save, blocked }: Props) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const choices = [...new Map([...options, ...linked].map((c) => [c.id, c])).values()].sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id));
  return (
    <section aria-label="Concepts" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-label uppercase text-ink-muted">Concepts</p>
        {linked.length > 0 ? <ConceptChips concepts={linked} /> : <p className="text-small text-ink-muted">None yet</p>}
        <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
          Change
        </Button>
      </div>
      {open ? (
        <div id={panel}>
          <ConceptPicker options={choices} initial={linked.map((c) => c.id)} save={save} blocked={blocked} />
        </div>
      ) : null}
    </section>
  );
}
