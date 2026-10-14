import { AsOf } from "@/components/desk/as-of";
import { CountFlow } from "@/components/ui/count-flow";
import { formatCount } from "@/lib/format";
import {
  closedNotCountedText, formatPoints, LEDGER_ALL_OUTCOME_TEXT, LEDGER_DIRECTION_NOTE, LEDGER_OUTCOME_TEXT, LEDGER_PLAIN_FIGURES_NOTE, LEDGER_PRICE_ONLY_TEXT, type Summary,
} from "@/modules/ledger/client";

/** A figure block in the style of the home tiles (ink rule, large figure), taking text so it can hold "4 of 7" or "+3.1 pp". */
function Tile({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="border-t border-ink pt-2">
      <p className="text-label uppercase text-ink-muted">{label}</p>
      <p className="mt-1 text-figure-lg text-ink desk:text-figure-lg-desk lining-nums tabular-nums">{children}</p>
      {note}
    </div>
  );
}

const Of = ({ value, total }: { value: number; total: number }) => (
  <>
    <CountFlow value={value} className="lining-nums tabular-nums" />{" "}
    <span className="text-small font-normal text-ink-muted">of</span>{" "}
    <CountFlow value={total} className="lining-nums tabular-nums" />
  </>
);

const Caption = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-caption text-ink-muted">{children}</p>;
const points = (v: number | null) => (v === null ? "none yet" : formatPoints(v));

/**
 * The counts, the medians and the holding period, all private. "N of M" is the calls that ended as expected, and the closed
 * ideas the figure leaves out are named right beside it (closedNotCountedText), so the headline cannot hide them. Counts roll
 * (CountFlow); the financial figures are plain text and never animate.
 */
export function LedgerTiles({ summary, asOf }: { summary: Summary; asOf: string | null }) {
  const { closed, all, byDirection, holdingDays, withdrawn } = summary;
  const mixed = byDirection.outperform > 0 && byDirection.underperform > 0;
  // The note beside the closed count promises no median below 5 closed ideas; the tile keeps that promise.
  const showMedian = closed.showPercent;
  const percent = closed.showPercent && closed.total > 0 ? ` (${Math.round((closed.asExpected / closed.total) * 100)}%)` : "";
  return (
    <section aria-label="Ledger figures" className="space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 desk:grid-cols-4">
        <Tile
          label="Closed ideas"
          note={
            <>
              <Caption>
                {closed.total === 0 ? "none counted yet" : `${LEDGER_OUTCOME_TEXT}${percent}`}
              </Caption>
              {closed.total > 0 && !closed.showPercent ? <Caption>{LEDGER_PLAIN_FIGURES_NOTE}</Caption> : null}
              {closed.notCounted > 0 ? <p className="mt-1 text-caption text-ink" data-testid="not-counted">{closedNotCountedText(closed.notCounted)}</p> : null}
            </>
          }
        >
          <Of value={closed.asExpected} total={closed.total} />
        </Tile>
        <Tile label="All ideas, to the latest close" note={<Caption>{all.total === 0 ? "none counted yet" : LEDGER_ALL_OUTCOME_TEXT}</Caption>}>
          <Of value={all.asExpected} total={all.total} />
        </Tile>
        <Tile
          label="Median result, closed ideas"
          note={<Caption>all ideas, to the latest close: {showMedian ? points(summary.medianExcessAll) : "none yet"}</Caption>}
        >
          <span className="text-figure-md desk:text-figure-md-desk">{showMedian ? points(summary.medianExcessClosed) : "none yet"}</span>
        </Tile>
        <Tile
          label="Median days held"
          note={<Caption>{holdingDays ? `closed ideas, ${holdingDays.min} to ${holdingDays.max} days` : "no closed idea counted yet"}</Caption>}
        >
          {holdingDays ? holdingDays.median : "—"}
        </Tile>
      </div>
      <div className="space-y-1 text-small text-ink-muted">
        {all.total > 0 ? (
          <p>
            Counted: {formatCount(byDirection.outperform, "idea")} expecting to do better than the Nifty 50, {formatCount(byDirection.underperform, "idea")} expecting to do worse.
            {mixed ? ` ${LEDGER_DIRECTION_NOTE}` : ""}
          </p>
        ) : null}
        {withdrawn > 0 ? <p>{formatCount(withdrawn, "idea")} withdrawn, not counted.</p> : null}
        <p>{LEDGER_PRICE_ONLY_TEXT}</p>
        {asOf ? (
          <p>
            <AsOf date={asOf} prefix="Figures to" />
          </p>
        ) : null}
      </div>
    </section>
  );
}
