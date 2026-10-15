import Link from "next/link";
import type { ConceptRef } from "@/modules/knowledge/client";

/** The concepts an item links, each a link to its desk page. A name still waiting on Names says so in words. */
export function ConceptChips({ concepts }: { concepts: readonly ConceptRef[] }) {
  if (concepts.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {concepts.map((c) => (
        <li key={c.id}>
          <Link
            href={`/desk/concepts/${c.slug}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-rule-strong bg-paper px-3 text-small text-ink underline decoration-1 underline-offset-3"
          >
            {c.name}
            {c.status === "unchecked" ? <span className="text-caption text-ink-muted no-underline">not checked yet</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
