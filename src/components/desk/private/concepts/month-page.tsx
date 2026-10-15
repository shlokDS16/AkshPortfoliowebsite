import Link from "next/link";
import { formatDate } from "@/lib/format";
import { monthLabel, type ItemLine } from "@/modules/knowledge/client";
import type { MonthView } from "@/modules/knowledge";

const LINK = "underline decoration-1 underline-offset-3";

function Lines({ items }: { items: readonly ItemLine[] }) {
  return (
    <ul className="divide-y divide-rule">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
          <span className="font-mono text-mono-tag tabular-nums text-ink-muted">{formatDate(item.createdAt)}</span>
          {/* His title, exactly as stored. */}
          <Link href={`/desk/items/${item.id}`} className={`min-w-0 break-words text-body text-ink ${LINK}`}>
            {item.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Heading({ id, text, count }: { id: string; text: string; count: number }) {
  return (
    <h2 id={id} className="text-title text-ink desk:text-title-desk">
      {text} <span className="font-mono tabular-nums">({count})</span>
    </h2>
  );
}

/**
 * "What I learned in {Month}": put together by the desk from his dated learnings and reads. The grouping, the dates and the counts
 * are the machine's and say so; every title is his, untouched. Nothing is summarised, shortened or ranked.
 */
export function MonthPage({ view }: { view: MonthView }) {
  const label = monthLabel(view.month);
  const empty = view.learningCount === 0 && view.readCount === 0;
  return (
    <article className="space-y-(--block-gap)">
      <header className="space-y-2">
        <h1 className="text-display text-ink desk:text-display-desk">What I learned in {label}</h1>
        <p className="border-l border-dashed border-rule-strong pl-3 text-small text-ink-muted">
          Put together by the desk from your dated learnings and reads. Your words are shown as you wrote them.
        </p>
        <nav aria-label="Months" className="flex flex-wrap gap-x-5 text-small">
          <Link href={`/desk/learned?m=${view.prevMonth}`} className={`inline-flex min-h-11 items-center ${LINK}`}>
            Earlier month
          </Link>
          {view.nextMonth ? (
            <Link href={`/desk/learned?m=${view.nextMonth}`} className={`inline-flex min-h-11 items-center ${LINK}`}>
              Later month
            </Link>
          ) : null}
        </nav>
      </header>
      {empty ? <p className="text-small text-ink-muted">Nothing logged in {label}. A line starting with l: is a learning; r: is something you read.</p> : null}
      {view.learningCount > 0 ? (
        <section aria-labelledby="learnings-h" className="space-y-3">
          <Heading id="learnings-h" text="Learnings" count={view.learningCount} />
          {view.groups.map((group) => (
            <div key={group.concept?.id ?? "none"} className="space-y-1">
              <h3 className="text-subtitle text-ink">
                {group.concept ? (
                  <Link href={`/desk/concepts/${group.concept.slug}`} className={LINK}>
                    {group.concept.name}
                  </Link>
                ) : (
                  "No concept"
                )}
              </h3>
              <Lines items={group.items} />
            </div>
          ))}
        </section>
      ) : null}
      {view.readCount > 0 ? (
        <section aria-labelledby="reads-h" className="space-y-1">
          <Heading id="reads-h" text="Reads" count={view.readCount} />
          <Lines items={view.reads} />
        </section>
      ) : null}
    </article>
  );
}
