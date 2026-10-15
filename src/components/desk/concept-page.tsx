import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import type { ConceptItem, ConceptView } from "@/modules/showcase";
import { IdMark } from "./id-mark";

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <header className="mb-(--stack) border-b border-rule pb-3">
        <h2 id={id} data-section className="text-title text-ink desk:text-title-desk">
          {title}
        </h2>
      </header>
      <ol className="divide-y divide-rule">{children}</ol>
    </section>
  );
}

/** His title and his learning objective as he wrote them; the date is the machine's (the first gated revision that listed the concept). */
function Entry({ item }: { item: ConceptItem }) {
  return (
    <li className="py-(--row-y)">
      {item.label ? (
        <p className="text-label uppercase text-ink-muted">
          {item.fileNo ? (
            <>
              <IdMark kind="file" value={item.fileNo} />{" "}
            </>
          ) : null}
          {item.label}
        </p>
      ) : null}
      {item.href ? (
        <Link href={item.href} className="text-subtitle desk:text-subtitle-desk">
          {item.title}
        </Link>
      ) : (
        <span className="text-subtitle text-ink desk:text-subtitle-desk">{item.title}</span>
      )}
      {item.learningObjective ? <p className="max-w-(--measure) text-body text-ink-body">{item.learningObjective}</p> : null}
      <p data-machine className="mt-1 font-mono text-mono-tag tabular-nums text-ink-muted">
        Since {formatDate(item.since)}
      </p>
    </li>
  );
}

/**
 * /concepts/[slug] (spec s8): the name, one fixed sentence, then the gated notes and the files and cases that use it. No description,
 * no links between concepts, no count across ideas. The standard disclosure comes from the public frame.
 */
export function ConceptPage({ view }: { view: ConceptView }) {
  return (
    <article>
      <header className="pt-6">
        <span className="file-tag inline-block bg-geru py-0.5 pr-2.5 pl-2 font-mono text-mono-tag uppercase text-on-geru">CONCEPT</span>
        <h1 className="mt-3 text-display text-ink desk:text-display-desk">{view.name}</h1>
        <p data-lint-exclude className="mt-3 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
          {view.standfirst}
        </p>
      </header>
      <div className="space-y-(--section-gap) pt-(--block-gap)">
        {view.notes.length > 0 ? (
          <Group id="concept-notes" title="Notes">
            {view.notes.map((n) => (
              <Entry key={`${n.href}-${n.title}`} item={n} />
            ))}
          </Group>
        ) : null}
        {view.applied.length > 0 ? (
          <Group id="concept-applied" title="Applied in">
            {view.applied.map((n) => (
              <Entry key={`${n.href}-${n.title}`} item={n} />
            ))}
          </Group>
        ) : null}
      </div>
    </article>
  );
}
