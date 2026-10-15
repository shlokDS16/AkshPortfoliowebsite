import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import type { CaseBodyBlock, CaseStudyView } from "@/modules/showcase";
import { Disclosure } from "../disclosure";
import { PrintButton } from "../print-button";
import { CaseEntry, Machine } from "./case-entry";
import { HowToCheck } from "./how-to-check";
import { RebasedChart } from "./rebased-chart";

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <header className="mb-(--stack) border-b border-rule pb-3">
        <h2 id={id} data-section className="text-title text-ink desk:text-title-desk">
          {title}
        </h2>
        {sub ? <p className="mt-1 text-small text-ink-muted desk:text-small-desk">{sub}</p> : null}
      </header>
      <div className="space-y-(--block-gap)">{children}</div>
    </section>
  );
}

function Body({ blocks }: { blocks: CaseBodyBlock[] }) {
  return (
    <div className="prose-read border-l-2 border-ink pl-3 text-read text-ink-body desk:pl-4 desk:text-read-desk">
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <h3 key={i} className="mt-6 text-subtitle text-ink desk:text-subtitle-desk">
            {b.text}
          </h3>
        ) : b.kind === "ul" ? (
          <ul key={i} className="my-(--para) list-disc pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="my-(--para)">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}

/**
 * The case study page (spec s33.5): what he expected, what happened, what he learned, each entry in his sealed words with its
 * fingerprint, then how to check them. His words are quoted and sans; the machine's lines are mono behind a dashed rule; the desk's
 * own sentences are plain. No result is printed anywhere (rule 10.7). Server-rendered; the one client piece is the check button.
 */
export function CasePage({ view }: { view: CaseStudyView }) {
  const { dateline: d, happened } = view;
  return (
    <article>
      <header className="pt-6">
        <span className="file-tag inline-block bg-geru py-0.5 pr-2.5 pl-2 font-mono text-mono-tag uppercase text-on-geru">CLOSED CASE · R{view.revNo}</span>
        <h1 className="mt-3 text-display text-ink desk:text-display-desk">{view.company}</h1>
        <p className="mt-1 font-mono text-mono-tag text-ink-muted">{view.symbol}</p>
        <p className="mt-4 max-w-(--measure) text-subtitle text-ink desk:text-subtitle-desk">{view.title}</p>
        <p className="mt-2 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
          <span className="text-label uppercase text-ink-muted">What this teaches </span>
          {view.standfirst}
        </p>
        <p className="mt-4 border-y border-rule py-3 font-mono text-mono-tag tabular-nums text-ink">
          Written {formatDate(d.writtenOn)} · Closed {formatDate(d.closedOn)} · Figures to {formatDate(d.figuresTo)}
        </p>
        <div className="mt-3 print:hidden">
          <PrintButton />
        </div>
      </header>

      <div id="file-body" className="space-y-(--section-gap) pt-(--block-gap)">
        <Section id="expected" title="What he expected">
          <p className="max-w-(--measure) text-subtitle text-ink desk:text-subtitle-desk">{view.expected}</p>
          <CaseEntry entry={view.opening} />
          {view.revisions.map((r) => (
            <CaseEntry key={r.seq} entry={r} />
          ))}
        </Section>

        <Section id="happened" title="What happened">
          {happened.chart ? <RebasedChart chart={happened.chart} /> : null}
          <Machine>
            <p>{happened.priceLine}</p>
          </Machine>
          <p className="text-body text-ink">{happened.closedLine}</p>
          <CaseEntry entry={happened.closing} />
        </Section>

        <Section id="learned" title="What he learned">
          {view.learned.map((l) => (
            <div key={l.entry.seq} className="space-y-2">
              {l.call ? <p className="text-body text-ink">{l.call}</p> : null}
              {l.mistakes ? <p className="text-body text-ink">{l.mistakes}</p> : null}
              <CaseEntry entry={l.entry} />
            </div>
          ))}
        </Section>

        {view.lookingBack.length > 0 ? (
          <Section id="looking-back" title="Looking back">
            <Body blocks={view.lookingBack} />
          </Section>
        ) : null}

        <Section id="check" title="How to check these entries">
          <HowToCheck checks={view.checks} publicFile={view.publicFile} />
        </Section>

        <Disclosure holdsPosition={view.holdsPosition} reviewedOn={view.reviewedOn} />
        <p data-lint-exclude className="text-subtitle text-ink desk:text-subtitle-desk">
          A past case, not a view on the share today.
        </p>
      </div>
    </article>
  );
}
