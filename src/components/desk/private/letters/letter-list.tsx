import Link from "next/link";
import { istDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { listLine, type LetterRow } from "@/modules/distribution";

/** /desk/letters (spec s8.1): his subject, one line from the send rows, the day it was made. A subject that is still the desk's label says so. */
export function LetterList({ rows }: { rows: LetterRow[] }) {
  if (rows.length === 0) return <p className="text-small text-ink-muted">No letters yet. Start from what changed.</p>;
  return (
    <ul className="divide-y divide-rule">
      {rows.map((r) => (
        <li key={r.itemId} className="space-y-1 py-(--row-y)">
          <Link href={`/desk/letters/${r.itemId}`} className="inline-flex min-h-11 items-center break-words text-subtitle underline decoration-1 underline-offset-3 desk:min-h-8">
            {r.title}
          </Link>
          {r.subjectIsLabel ? <p className="text-small text-ink">Subject still a label</p> : null}
          <p className="text-small text-ink-muted">{listLine(r)}</p>
          <p data-machine className="font-mono text-mono-tag tabular-nums text-ink-muted">
            Made {formatDate(istDate(r.createdAt))}
          </p>
        </li>
      ))}
    </ul>
  );
}
