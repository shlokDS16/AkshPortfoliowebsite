import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { NoteSummary } from "@/modules/showcase";
import { EmptyState } from "./empty-state";

export function NoteList({ notes, empty }: { notes: NoteSummary[]; empty: string }) {
  if (notes.length === 0) return <EmptyState body={empty} shape={["Title", "What it teaches", "Revised", "Reading time"]} />;
  return (
    <ol className="divide-y divide-rule">
      {notes.map((n) => (
        <li key={n.slug} className="py-(--row-y)">
          <Link href={n.href} className="text-subtitle desk:text-subtitle-desk">
            {n.title}
          </Link>
          <p className="text-body text-ink-body">{n.learningObjective}</p>
          <p className="text-small tabular-nums text-ink-muted">
            Revised {formatDate(n.revisedOn)} · {n.minutes} min
          </p>
        </li>
      ))}
    </ol>
  );
}
