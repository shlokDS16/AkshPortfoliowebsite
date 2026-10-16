import { Machine } from "@/components/desk/case/case-entry";
import { type Chapter, parseChapters } from "@/modules/distribution/client";
import { formatClock } from "@/modules/distribution/public";
import { PendingButton } from "../pending-button";

const same = (a: Chapter[], b: Chapter[]) => a.length === b.length && a.every((c, i) => c.s === b[i].s && c.title === b[i].title);

type Props = { description: string | null; current: Chapter[]; useAction: (formData: FormData) => Promise<void> };

/**
 * His chapter list as YouTube would read it from his own description (spec s7.5), shown in the machine's face until he presses "Use chapters
 * from the description"; only then are the titles his words in a revision, copied as typed. A list YouTube would not accept says why.
 */
export function ChaptersPreview({ description, current, useAction }: Props) {
  if (description === null) return <p className="text-small text-ink-muted">The chapters are read from the YouTube description once YouTube has answered.</p>;
  const read = parseChapters(description);
  if (read.chapters.length === 0) return <p className="text-small text-ink-muted">{read.reason}</p>;
  return (
    <div className="space-y-3">
      <Machine>
        <ol className="space-y-1">
          {read.chapters.map((c) => (
            <li key={c.s} className="grid grid-cols-[3.75rem_1fr] gap-x-2">
              <span>{formatClock(c.s)}</span>
              <span className="break-words text-ink-body">{c.title}</span>
            </li>
          ))}
        </ol>
      </Machine>
      {same(current, read.chapters) ? (
        <p className="text-small text-ink">These chapters are in the latest revision.</p>
      ) : (
        <form action={useAction}>
          <PendingButton variant="outline" size="sm">
            Use chapters from the description
          </PendingButton>
        </form>
      )}
    </div>
  );
}
