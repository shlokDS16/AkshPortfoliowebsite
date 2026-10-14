import type { ReactNode } from "react";
import { AsOf } from "@/components/desk/as-of";
import { formatDate } from "@/lib/format";
import { formatClose, LEDGER_PRICE_ONLY_TEXT, LEDGER_SOURCE_TEXT, type IdeaLine, type IdeaScore } from "@/modules/ledger/client";
import { MarkList, RestatedList } from "./mark-list";

const source = (s: string | null): string =>
  s && Object.hasOwn(LEDGER_SOURCE_TEXT, s) ? LEDGER_SOURCE_TEXT[s as keyof typeof LEDGER_SOURCE_TEXT] : "source not recorded";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 border-b border-rule py-1.5 text-data desk:grid-cols-[12rem_1fr] desk:text-data-desk">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{children}</dd>
    </div>
  );
}

/**
 * "Scored by the desk": every figure here is the database's own scoring, with the date it is marked to and where each close
 * came from. A flagged idea shows the flag's sentence where its result would be. His words are in another block.
 */
export function IdeaScoreBlock({ line, score }: { line: IdeaLine; score: IdeaScore | null }) {
  return (
    <section aria-labelledby="score-h" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="score-h" className="text-title text-ink desk:text-title-desk">
          Scored by the desk
        </h2>
        {line.markDate ? <AsOf date={line.markDate} prefix="as of" /> : null}
      </div>
      <p className="text-small text-ink-muted">
        {line.expectsText}. The result is for the call: a positive figure means it ended as expected, whichever way it pointed.
      </p>
      {line.state !== "figures" ? <p className="rounded-sm border border-rule bg-surface px-3 py-2 text-body text-ink">{line.headline}</p> : null}
      {score ? (
        <dl>
          {score.entryDate ? (
            <Row label="Entry">
              {formatDate(score.entryDate)}
              {score.entryClose !== null ? `, close ${formatClose(score.entryClose)}` : ""}
              {score.entryIndex !== null ? `, Nifty 50 ${formatClose(score.entryIndex)}` : ""}
              <span className="block text-caption text-ink-muted">{source(score.entrySource)}</span>
            </Row>
          ) : null}
          {score.markDate && score.entryDate ? (
            <Row label={score.isFinal ? "Exit" : "Marked to"}>
              {formatDate(score.markDate)}
              {score.markClose !== null ? `, close ${formatClose(score.markClose)}` : ""}
              {score.markIndex !== null ? `, Nifty 50 ${formatClose(score.markIndex)}` : ""}
              <span className="block text-caption text-ink-muted">{source(score.markSource)}</span>
            </Row>
          ) : null}
          {score.factor !== null && score.factor !== 1 ? <Row label="Split or bonus factor">×{score.factor}</Row> : null}
          {line.state === "figures" ? (
            <>
              <Row label="Share">{line.shareMove}</Row>
              <Row label="Nifty 50">{line.indexMove}</Row>
              <Row label="Result for the call">
                <span className="font-semibold">{line.result}</span> {line.resultWord}
              </Row>
              <Row label="Days held">{line.daysHeld ?? "—"}</Row>
            </>
          ) : null}
        </dl>
      ) : null}
      <MarkList marks={line.marks} />
      <RestatedList items={line.restated} />
      <p className="text-caption text-ink-muted">{LEDGER_PRICE_ONLY_TEXT}</p>
    </section>
  );
}
