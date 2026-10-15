import Link from "next/link";
import type { MistakeEntry } from "@/modules/showcase";
import { HisWords } from "./case-entry";

/**
 * /mistakes (addendum s6): published cases in which his own review called the process flawed or named a kind of mistake. His
 * judgement picks them, not the outcome; there is no count. Each carries his review words, as sealed, and a link to the case.
 */
export function MistakesList({ entries }: { entries: MistakeEntry[] }) {
  return (
    <ol className="divide-y divide-rule">
      {entries.map((m) => (
        <li key={m.slug} className="space-y-2 py-(--row-y)">
          <p className="text-label uppercase text-ink-muted">{m.company}</p>
          <Link href={m.href} className="text-subtitle desk:text-subtitle-desk">
            {m.title}
          </Link>
          <p className="text-body text-ink">{m.call}</p>
          <p className="text-body text-ink">{m.mistakes}</p>
          <HisWords entry={m.entry} />
          <p className="font-mono text-mono-tag tabular-nums text-ink-muted">Closed {m.closedMonth}</p>
        </li>
      ))}
    </ol>
  );
}
