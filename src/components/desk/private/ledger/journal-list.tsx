import Link from "next/link";
import { formatDate, formatTime } from "@/lib/format";
import { JOURNAL_EMPTY, journalMoreText } from "@/lib/messages-closes";
import type { LessonLine } from "@/modules/ledger/client";
import { WORDS_CLASS } from "./idea-timeline";

/**
 * The lessons he wrote when closing ideas, newest first. His words are shown exactly as typed (plain text, wrapped anywhere,
 * each paragraph isolating its own direction); the idea is a link, and his own choices (the process call and the tags) are a
 * plain line. No figure, chart or export: a read-only list.
 */
export function JournalList({ lessons, limit, moreHref }: { lessons: LessonLine[]; limit: number; moreHref: string | null }) {
  if (lessons.length === 0) return <p className="max-w-[60ch] text-body text-ink-body">{JOURNAL_EMPTY}</p>;
  const shown = lessons.slice(0, limit);
  const hidden = lessons.length - shown.length;
  return (
    <div className="space-y-4">
      <ol className="space-y-6" aria-label="Lessons, newest first">
        {shown.map((l) => (
          <li key={l.entry.id} data-lesson={l.entry.id} className="border-l-2 border-rule-strong pl-3">
            <p className="flex flex-wrap items-baseline gap-x-3 text-small text-ink-muted">
              <Link href={`/desk/ledger/${l.ideaId}#entries`} className="text-subtitle text-ink underline decoration-1 underline-offset-3 desk:text-subtitle-desk">
                {l.name}
              </Link>
              {l.symbol ? <span className="font-mono text-mono-id">{l.symbol}</span> : null}
              <span className="tabular-nums">
                {formatDate(l.entry.recordedAt)}, {formatTime(l.entry.recordedAt)}
              </span>
            </p>
            {l.entry.choices.length > 0 ? <p className="mt-1 text-small text-ink-body">{l.entry.choices.join(" · ")}</p> : null}
            <p className={WORDS_CLASS} dir="auto" data-words>
              {l.entry.body}
            </p>
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <p className="text-small text-ink-muted">
          {journalMoreText(hidden)}{" "}
          {moreHref ? (
            <Link href={moreHref} className="underline decoration-1 underline-offset-3">
              Show more
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
