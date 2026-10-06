import { formatDate } from "@/lib/format";
import type { SourceCard } from "@/lib/view-types";
import { AsOf, Withheld } from "./as-of";
import { IdMark } from "./id-mark";

/** Figure (ink, never geru), prior, the quoted line, source and as-of: every number carries both (design-dna principle 2). */
export function SourceFactCard({ card, id }: { card: SourceCard; id: string }) {
  return (
    <div id={id} role="region" aria-label={`Source for ${card.figure}`} className="my-3 rounded-sm bg-surface p-4 text-body">
      <p className="text-figure-md tabular-nums text-ink desk:text-figure-md-desk">
        {card.withheldUntil ? <Withheld availableOn={card.withheldUntil} /> : card.figure}
        {card.unit && !card.withheldUntil ? <span className="ml-1 text-caption text-ink-muted">{card.unit}</span> : null}
      </p>
      {card.prior ? (
        <p className="text-small text-ink-muted">
          {card.prior.label}: <span className="tabular-nums">{card.prior.value}</span>
        </p>
      ) : null}
      {card.quote ? (
        <blockquote className="mt-2 text-ink-body">“{card.quote}”</blockquote>
      ) : (
        <p className="mt-2 text-small text-ink-muted">Quoted line not captured yet.</p>
      )}
      <p className="mt-2 text-caption text-ink-muted">
        <IdMark kind="source" value={card.source.id} /> {card.source.doc}, {card.source.locator}
        {card.source.filedOn ? `, filed ${formatDate(card.source.filedOn)}` : ""} · <AsOf date={card.asOf} prefix="as of" />
      </p>
    </div>
  );
}
