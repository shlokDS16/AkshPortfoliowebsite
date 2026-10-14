import { formatDate, formatTime } from "@/lib/format";
import { CLOSES_DAYS_NOTE, DAY_UNDECIDED_NOTE, missingText, NO_MISSING_TEXT } from "@/lib/messages-closes";
import { closesLineText, type ClosesStatus, type DayLine } from "@/modules/ledger/client";
import type { JobRun } from "./ledger-status";

const STATE_CLASS = { open: "text-ink", shut: "text-ink-muted", undecided: "text-ink", today: "text-ink-muted" } as const;

/** How current the closes are, and what the two daily steps last said, in the steps' own words. */
export function ClosesCurrent({ status, runs }: { status: ClosesStatus | null; runs: JobRun[] | null }) {
  return (
    <div className="space-y-1 text-small desk:text-small-desk">
      <p className="tabular-nums text-ink" data-testid="closes-line">
        {status ? closesLineText(status.latestOpenDay, status.handEnteredDays) : "Could not read how current the closes are."}
      </p>
      {runs ? (
        <ul className="space-y-0.5 text-caption text-ink-muted" aria-label="The last runs of the daily steps">
          {runs.map((r) => (
            <li key={r.job} data-job={r.job} className="tabular-nums">
              <span className="font-medium text-ink-body">{r.job === "ledger:prices" ? "Closing prices" : "Scores"}</span>:{" "}
              {r.ranAt === null ? (
                "has not run yet"
              ) : (
                <>
                  {r.ok === false ? <strong className="text-bad">failed</strong> : "ran"} {formatDate(r.ranAt)}, {formatTime(r.ranAt)}
                  {r.detail ? `: ${r.detail}` : ""}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The recent days, newest first: each day's state in words (never colour alone), where an open day's closes came from, and who has no close. */
export function ClosesDays({ days }: { days: DayLine[] }) {
  return (
    <div className="space-y-2">
      <p className="text-small text-ink-muted">{CLOSES_DAYS_NOTE}</p>
      <ol className="divide-y divide-rule border-y border-rule" aria-label="Recent days">
        {days.map((d) => (
          <li key={d.date} data-day={d.date} data-state={d.state} className="grid grid-cols-[7.5rem_1fr] gap-x-3 py-2 text-small desk:text-small-desk">
            <span className="tabular-nums text-ink">{formatDate(d.date)}</span>
            <span className="space-y-0.5">
              <span className={`block font-medium ${STATE_CLASS[d.state]}`}>
                {d.stateText}
                {d.sourceText ? <span className="font-normal text-ink-body">: {d.sourceText}</span> : null}
              </span>
              {d.state === "undecided" ? <span className="block text-caption text-ink-muted">{DAY_UNDECIDED_NOTE}</span> : null}
              {d.state === "open" ? (
                <span className="block text-caption text-ink-body" data-testid="missing">
                  {d.missing.length > 0 ? missingText(d.missing) : NO_MISSING_TEXT}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
