import Link from "next/link";
import { formatDate } from "@/lib/format";
import { LETTERS_COPY } from "@/modules/distribution/public";
import type { LetterSummary } from "@/modules/showcase";

/** /letters archive (spec s8.9): newest first, the subject he wrote, his one sentence and the date it was published. Nothing about readers or sends. */
export function LetterIndex({ letters }: { letters: LetterSummary[] }) {
  if (letters.length === 0) return <p className="text-body text-ink-muted">{LETTERS_COPY.empty}</p>;
  return (
    <ol className="divide-y divide-rule">
      {letters.map((l) => (
        <li key={l.slug} className="py-(--row-y)">
          <Link href={l.href} className="text-subtitle desk:text-subtitle-desk">
            {l.subject}
          </Link>
          <p className="text-body text-ink-body">{l.objective}</p>
          <p data-machine className="text-small tabular-nums text-ink-muted">
            {LETTERS_COPY.published(formatDate(l.publishedOn))}
          </p>
        </li>
      ))}
    </ol>
  );
}
