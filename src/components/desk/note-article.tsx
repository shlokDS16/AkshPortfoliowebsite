import { formatDate } from "@/lib/format";
import type { NoteView } from "@/modules/showcase";
import { BlockHeader } from "./block-header";
import { Disclosure } from "./disclosure";
import { UsedIn } from "./used-in";
import { ViewBlock } from "./view-block";

/** A learning or process note: standfirst "What this teaches", Aksh's text, and for learning notes the Used in table. */
export function NoteArticle({ note }: { note: NoteView }) {
  return (
    <article className="pt-8">
      <p className="text-label uppercase text-ink-muted">
        {note.kind === "learning" ? "Learning note" : "Process note"} · R{note.revNo} of {note.revCount}
      </p>
      <h1 className="mt-2 text-display text-ink desk:text-display-desk">{note.title}</h1>
      <p className="mt-3 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
        <span className="text-label uppercase text-ink-muted">What this teaches </span>
        {note.learningObjective}
      </p>
      <p className="mt-2 text-small tabular-nums text-ink-muted">
        Revised {formatDate(note.revisedOn)} · first written {formatDate(note.firstWrittenOn)} · {note.minutes} min
      </p>
      <div className="mt-(--block-gap)">
        <ViewBlock blocks={note.body} />
      </div>
      {note.kind === "learning" ? (
        <section className="mt-(--section-gap)">
          <BlockHeader label="LINKS" id="used-in" title="Used in" sub="Public files that rely on this note." />
          <UsedIn uses={note.usedIn} />
        </section>
      ) : null}
      {note.holdsPosition ? (
        <div className="mt-(--section-gap)">
          <Disclosure holdsPosition={note.holdsPosition} reviewedOn={note.revisedOn} />
        </div>
      ) : null}
    </article>
  );
}
