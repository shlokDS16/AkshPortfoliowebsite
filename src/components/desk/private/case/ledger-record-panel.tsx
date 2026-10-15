import { CaseEntry, Machine } from "@/components/desk/case/case-entry";
import { PendingButton } from "@/components/desk/private/pending-button";
import { formatDate } from "@/lib/format";
import { errorText } from "@/lib/messages";
import type { CaseRecordV1 } from "@/modules/casefile/client";
import type { LedgerStatus } from "@/modules/cases/client";
import { recordEntryViews } from "@/modules/showcase";

type Props = {
  /** Null when the record in the newest revision does not read. */
  record: CaseRecordV1 | null;
  /** Null when the ledger could not be read just now. */
  status: LedgerStatus | null;
  refreshAction: (formData: FormData) => Promise<void>;
};

const STALE = "The ledger has changed since this revision (a new lesson, or a day listed in the public file).";

/** The refusal the gate would give (case_figures_to) when the date is frozen by publication: the way out is unpublishing first. */
const frozenText = (figuresTo: string) =>
  `Figures to is fixed while a case study is public. To use the ledger's date, ${formatDate(figuresTo)}: Unpublish it, then Refresh from the ledger, then Publish.`;

function ChangeNotice({ status, refreshAction }: { status: LedgerStatus | null; refreshAction: Props["refreshAction"] }) {
  if (status === null) return <p className="text-small text-ink-muted">Whether the ledger has changed could not be read just now.</p>;
  if (status.frozen) return <p role="status" className="rounded-sm border border-warn bg-warn-wash px-3 py-2 text-small text-ink">{frozenText(status.figuresTo)}</p>;
  if (!status.differs && !status.dateOut) return null;
  return (
    <div role="status" className="space-y-2 rounded-sm border border-warn bg-warn-wash px-3 py-2 text-small text-ink">
      <p>{status.differs ? STALE : `Figures to on this case study is not the ledger's date, ${formatDate(status.figuresTo)}.`}</p>
      <form action={refreshAction}>
        <PendingButton>Refresh from the ledger</PendingButton>
      </form>
    </div>
  );
}

/** The record of a ledger case study, read-only (D41): his sealed entries as the page will show them, the machine's dates, and whether the ledger has moved on. */
export function LedgerRecordPanel({ record, status, refreshAction }: Props) {
  return (
    <section aria-labelledby="ledger-record-h" id="ledger-record" className="space-y-4">
      <h2 id="ledger-record-h" className="text-title text-ink desk:text-title-desk">
        From the ledger (sealed; cannot be edited)
      </h2>
      {record === null ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {errorText("case-record-unreadable")}
        </p>
      ) : (
        <>
          <ChangeNotice status={status} refreshAction={refreshAction} />
          <Machine>
            <p>Figures to {formatDate(record.figures_to)}</p>
            <p>
              Entry: NSE close of {formatDate(record.entry_date)}. Exit: NSE close of {formatDate(record.exit_date)}. {record.holding_days} days from entry to exit.
            </p>
            <p>{record.chart ? `Chart: included (${record.chart.points.length} weekly points).` : "Chart: not included."}</p>
          </Machine>
          <ol className="space-y-5">
            {recordEntryViews(record).map((entry) => (
              <li key={entry.seq} className="space-y-2">
                <h3 className="text-subtitle text-ink">{entry.kindLabel}</h3>
                <CaseEntry entry={entry} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
