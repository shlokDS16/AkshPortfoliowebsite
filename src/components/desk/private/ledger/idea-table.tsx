import Link from "next/link";
import { AsOf } from "@/components/desk/as-of";
import { EmptyState } from "@/components/desk/empty-state";
import { formatCount, formatDate } from "@/lib/format";
import { LEDGER_EMPTY_TEXT, type IdeaLine } from "@/modules/ledger/client";
import { MarkList, RestatedList } from "./mark-list";

const CELL = "text-data tabular-nums text-ink desk:text-data-desk";
const LABEL = "text-label uppercase text-ink-muted";

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className={CELL}>{children}</dd>
    </div>
  );
}

/** One idea: where it stands, the machine's figures (or the flag's sentence in their place), and what rests behind them. */
function IdeaRow({ idea }: { idea: IdeaLine }) {
  const closed = idea.status === "closed";
  return (
    <li className="border-b border-rule py-4" data-idea={idea.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-subtitle text-ink desk:text-subtitle-desk">
          <Link href={`/desk/ledger/${idea.id}`} className="underline decoration-1 underline-offset-3">
            {idea.name}
          </Link>
        </h3>
        {idea.symbol ? <span className="font-mono text-mono-id text-ink-muted">{idea.symbol}</span> : null}
      </div>
      <p className="mt-0.5 text-small text-ink-muted desk:text-small-desk">
        {idea.expectsText} · over {idea.horizonText}
        {idea.pastHorizon ? " · past its horizon" : ""}
      </p>
      {idea.state === "figures" ? (
        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-3 desk:grid-cols-6">
          <Figure label="Entry">{idea.entryDate ? formatDate(idea.entryDate) : "—"}</Figure>
          <Figure label="Days held">{idea.daysHeld ?? "—"}</Figure>
          <Figure label="Share">{idea.shareMove ?? "—"}</Figure>
          <Figure label="Nifty 50">{idea.indexMove ?? "—"}</Figure>
          <Figure label="Result for the call">
            <span className="font-semibold">{idea.result}</span>
            <span className="block text-caption font-normal text-ink-muted">{idea.resultWord}</span>
          </Figure>
          <Figure label={idea.isFinal ? "Exit" : "Marked"}>{idea.markDate ? <AsOf date={idea.markDate} prefix="as of" /> : "—"}</Figure>
        </dl>
      ) : (
        <p className="mt-3 rounded-sm border border-rule bg-surface px-3 py-2 text-small text-ink">{idea.headline}</p>
      )}
      <MarkList marks={idea.marks} />
      <RestatedList items={idea.restated} />
      {closed ? (
        <p className="mt-2 text-small text-ink-muted">
          Closed {idea.closedOn ? formatDate(idea.closedOn) : ""}
          {idea.closeReasonText ? ` · ${idea.closeReasonText}` : ""} · {idea.lesson === "written" ? `Lesson written${idea.processText ? ` (${idea.processText.toLowerCase()})` : ""}` : "No lesson yet"}
        </p>
      ) : null}
    </li>
  );
}

type Props = { id: string; title: string; ideas: IdeaLine[]; limit: number; moreHref: string | null; emptyBody?: string };

/** A list of ideas with an explicit window: it shows `limit` and says how many more there are. */
export function IdeaTable({ id, title, ideas, limit, moreHref, emptyBody }: Props) {
  const shown = ideas.slice(0, limit);
  const hidden = ideas.length - shown.length;
  return (
    <section aria-labelledby={`${id}-h`} id={id} className="space-y-2">
      <h2 id={`${id}-h`} className="text-label uppercase text-ink-muted">
        {title} <span className="tabular-nums">{ideas.length}</span>
      </h2>
      {ideas.length === 0 ? <EmptyState body={emptyBody ?? LEDGER_EMPTY_TEXT} shape={[]} /> : <ul>{shown.map((idea) => <IdeaRow key={idea.id} idea={idea} />)}</ul>}
      {hidden > 0 ? (
        <p className="text-small text-ink-muted">
          {formatCount(hidden, "more idea")} not shown.{" "}
          {moreHref ? (
            <Link href={moreHref} className="underline decoration-1 underline-offset-3">
              Show more
            </Link>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
