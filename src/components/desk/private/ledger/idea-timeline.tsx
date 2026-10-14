import { formatDate, formatTime } from "@/lib/format";
import type { EventLine } from "@/modules/ledger/client";

/** His words: wrapped anywhere (a 10,000-character word cannot widen the page), and each paragraph keeps its own text direction, so a right-to-left override inside his words cannot reorder the lines around it. */
export const WORDS_CLASS = "mt-1 whitespace-pre-wrap text-body text-ink [overflow-wrap:anywhere] [unicode-bidi:isolate]";

/**
 * "What you wrote": his entries in order, each with its date, its kind and the first eight characters of its hash. His words are
 * shown exactly as sealed, as plain text (React escapes it; nothing here is read as markup), and no machine figure is ever
 * placed in or beside them: the figures are in the "Scored by the desk" block.
 */
export function IdeaTimeline({ events }: { events: EventLine[] }) {
  return (
    <section aria-labelledby="entries-h" id="entries" className="space-y-3">
      <h2 id="entries-h" className="text-title text-ink desk:text-title-desk">
        What you wrote
      </h2>
      <ol className="space-y-5">
        {events.map((e) => (
          <li key={e.id} data-event={e.seq} className="border-l-2 border-rule-strong pl-3">
            <p className="flex flex-wrap items-baseline gap-x-3 text-small text-ink-muted">
              <span className="text-label uppercase text-ink">{e.kindText}</span>
              <span className="tabular-nums">
                {formatDate(e.recordedAt)}, {formatTime(e.recordedAt)}
              </span>
              <span className="tabular-nums">Entry {e.seq}</span>
              <span className="font-mono text-mono-id" title="The first 8 characters of this entry's hash">
                <span className="sr-only">Hash starts </span>
                {e.hashShort}
              </span>
            </p>
            {e.choices.length > 0 ? <p className="mt-1 text-small text-ink-body">{e.choices.join(" · ")}</p> : null}
            <p className={WORDS_CLASS} dir="auto" data-words>
              {e.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
