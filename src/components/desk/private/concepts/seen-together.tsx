import Link from "next/link";
import { formatCount } from "@/lib/format";
import type { ConceptRef } from "@/modules/knowledge/client";
import { PendingButton } from "../pending-button";

type Props = {
  conceptId: string;
  slug: string;
  suggestions: readonly { concept: ConceptRef; shared: number }[];
  link: (conceptA: string, conceptB: string, slug: string) => Promise<void>;
};

/** The machine's block: concepts that turn up in the same notes. Nothing is stored; "Link" writes HIS edge, the machine writes none. */
export function SeenTogether({ conceptId, slug, suggestions, link }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <section aria-labelledby="seen-h" className="space-y-2 border-l border-dashed border-rule-strong pl-3">
      <h2 id="seen-h" className="text-subtitle text-ink">
        Seen together in your notes
      </h2>
      <p className="text-small text-ink-muted">The desk found these in the same notes. Link one only if you see a connection.</p>
      <ul className="divide-y divide-rule">
        {suggestions.map(({ concept, shared }) => (
          <li key={concept.id} className="flex items-center justify-between gap-3 py-1">
            <div>
              <Link href={`/desk/concepts/${concept.slug}`} className="text-body text-ink underline decoration-1 underline-offset-3">
                {concept.name}
              </Link>
              <p className="font-mono text-mono-tag tabular-nums text-ink-muted">{formatCount(shared, "note")} in common</p>
            </div>
            <form action={link.bind(null, conceptId, concept.id, slug)}>
              <PendingButton variant="outline" size="sm">
                Link <span className="sr-only">{concept.name}</span>
              </PendingButton>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
