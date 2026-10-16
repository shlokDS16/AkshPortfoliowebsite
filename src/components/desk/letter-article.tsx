import Link from "next/link";
import { formatDate } from "@/lib/format";
import { LETTER_POSITION_LABEL, LETTERS_COPY } from "@/modules/distribution/public";
import type { LetterEntryView, LetterPageView } from "@/modules/showcase";
import { SITE_POSITION } from "./disclosure";
import { PrintButton } from "./print-button";
import { PrintDisclosure } from "./print-disclosure";

/**
 * /letters/[slug] (spec s8.9). His side, in the reading face: the subject, "What this teaches" (his one sentence), his note and, for each entry, his
 * title and his change reason, copied as they were when the letter passed the gate. The machine's side, in the mono face: the kind, the page it links
 * to, its own line, the position word and the dates. No unsubscribe placeholder, no reader count and no send time: the archive page is not the email.
 */
export function LetterArticle({ letter }: { letter: LetterPageView }) {
  return (
    <article className="pt-8 desk:max-w-read">
      <span className="file-tag inline-block bg-geru py-0.5 pr-2.5 pl-2 font-mono text-mono-tag uppercase text-on-geru">LETTER</span>
      <h1 className="mt-3 text-display text-ink desk:text-display-desk">{letter.subject}</h1>
      <p className="mt-3 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
        <span className="text-label uppercase text-ink-muted">What this teaches </span>
        {letter.objective}
      </p>
      <p data-machine data-dateline className="mt-2 font-mono text-mono-tag tabular-nums text-ink-muted">
        {LETTERS_COPY.published(formatDate(letter.publishedOn))}
        {letter.revCount > 1 ? ` · Revised ${formatDate(letter.revisedOn)} · R${letter.revNo} of ${letter.revCount}` : ""}
      </p>
      <div className="mt-3 print:hidden">
        <PrintButton />
      </div>
      {letter.note.length > 0 ? (
        <div className="mt-(--block-gap) max-w-(--measure) space-y-4 text-read text-ink-body desk:text-read-desk">
          {letter.note.map((paragraph, i) => (
            <p key={i} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
      <section aria-labelledby="letter-entries" className="mt-(--section-gap)">
        <h2 id="letter-entries" data-section className="text-title text-ink desk:text-title-desk">
          {LETTERS_COPY.whatChanged}
        </h2>
        <ol className="mt-(--stack) divide-y divide-rule border-y border-rule">
          {letter.entries.map((entry) => (
            <Entry key={entry.href} entry={entry} />
          ))}
        </ol>
      </section>
      <p className="mt-(--block-gap) print:hidden">
        <Link href="/letters">{LETTERS_COPY.allLetters}</Link>
      </p>
      <PrintDisclosure position={SITE_POSITION} reviewedOn={letter.revisedOn} />
    </article>
  );
}

function Entry({ entry }: { entry: LetterEntryView }) {
  return (
    <li className="py-(--row-y)">
      <p data-machine className="text-label uppercase text-ink-muted">
        {entry.kindLabel}
      </p>
      <p className="mt-1 text-subtitle desk:text-subtitle-desk">
        <Link href={entry.href}>{entry.title}</Link>
      </p>
      {entry.changeReason ? <p className="mt-1 max-w-(--measure) text-body text-ink-body">&ldquo;{entry.changeReason}&rdquo;</p> : null}
      <p data-machine className="mt-1 text-small tabular-nums text-ink-muted">
        {entry.detail}
      </p>
      {entry.position ? (
        <p data-machine className="text-small text-ink-muted">
          {LETTER_POSITION_LABEL}: {entry.position}
        </p>
      ) : null}
    </li>
  );
}
