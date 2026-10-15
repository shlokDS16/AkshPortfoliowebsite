import Link from "next/link";
import type { CaseSummary } from "@/modules/showcase";

/** /cases: company, title, standfirst and the month it closed. No outcome, no sort control, newest publication first. */
export function CaseList({ cases }: { cases: CaseSummary[] }) {
  return (
    <ol className="divide-y divide-rule">
      {cases.map((c) => (
        <li key={c.slug} className="py-(--row-y)">
          <p className="text-label uppercase text-ink-muted">{c.company}</p>
          <Link href={c.href} className="text-subtitle desk:text-subtitle-desk">
            {c.title}
          </Link>
          <p className="max-w-(--measure) text-body text-ink-body">{c.standfirst}</p>
          <p className="font-mono text-mono-tag tabular-nums text-ink-muted">Closed {c.closedMonth}</p>
        </li>
      ))}
    </ol>
  );
}
