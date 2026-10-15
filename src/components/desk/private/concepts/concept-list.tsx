import Link from "next/link";
import { EmptyState } from "@/components/desk/empty-state";
import { formatDate } from "@/lib/format";
import { ITEM_GROUP_LABELS, ITEM_GROUPS, type ConceptStatus } from "@/modules/knowledge/client";
import type { ConceptIndexRow } from "@/modules/knowledge";

const EMPTY = "No concepts yet. Write #name in a capture, for example #capital-cycle.";
const STATUS: Record<ConceptStatus, string> = { private: "Private", public: "Public", unchecked: "Not checked yet" };

/** Every screened concept, newest activity first. Counts and dates are the machine's and are set in the machine face. */
export function ConceptList({ rows }: { rows: readonly ConceptIndexRow[] }) {
  if (rows.length === 0) return <EmptyState body={EMPTY} shape={[]} />;
  return (
    <ul className="divide-y divide-rule">
      {rows.map(({ concept, counts, total, lastActivity }) => (
        <li key={concept.id} className="space-y-1 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <Link href={`/desk/concepts/${concept.slug}`} className="text-subtitle text-ink underline decoration-1 underline-offset-3">
              {concept.name}
            </Link>
            <span className="text-small text-ink-muted">{STATUS[concept.status]}</span>
          </div>
          <p className="border-l border-dashed border-rule-strong pl-3 font-mono text-mono-tag tabular-nums text-ink-muted">
            {total === 0
              ? "Nothing linked yet"
              : [...ITEM_GROUPS.filter((g) => counts[g] > 0).map((g) => `${counts[g]} ${ITEM_GROUP_LABELS[g]}`), lastActivity ? `Last activity ${formatDate(lastActivity)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
