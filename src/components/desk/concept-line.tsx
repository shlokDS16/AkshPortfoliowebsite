import Link from "next/link";
import type { ItemConcept } from "@/modules/showcase";

/**
 * Plan 4 (spec s8): the public concepts of an item's CURRENT gated revision, as one labelled line after the item's own words and
 * never inside them. Absent when there are none. The names are his; nothing here is written by a machine.
 */
export function ConceptLine({ concepts }: { concepts: ItemConcept[] }) {
  if (concepts.length === 0) return null;
  return (
    <div data-concept-line className="mt-(--block-gap) flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-3">
      <span id="concept-line-label" className="text-label uppercase text-ink-muted">
        Concepts
      </span>
      <ul aria-labelledby="concept-line-label" className="flex flex-wrap gap-2">
        {concepts.map((c) => (
          <li key={c.slug}>
            <Link
              href={c.href}
              className="inline-flex min-h-11 items-center rounded-sm border border-rule-strong px-3 text-small text-ink no-underline hover:border-ink desk:min-h-8 desk:text-small-desk"
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
