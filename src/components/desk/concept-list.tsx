import Link from "next/link";
import type { ConceptSummary } from "@/modules/showcase";

/** /concepts: each public concept A to Z. The name is his; the count line is the machine's, in the machine face. */
export function ConceptList({ concepts }: { concepts: ConceptSummary[] }) {
  return (
    <ol className="divide-y divide-rule">
      {concepts.map((c) => (
        <li key={c.slug} className="py-(--row-y)">
          <Link href={c.href} className="text-subtitle desk:text-subtitle-desk">
            {c.name}
          </Link>
          <p data-machine className="font-mono text-mono-tag tabular-nums text-ink-muted">
            {c.countLine}
          </p>
        </li>
      ))}
    </ol>
  );
}
