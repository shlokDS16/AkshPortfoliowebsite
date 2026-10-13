import { TriangleAlert } from "lucide-react";
import { formatDate, formatTime } from "@/lib/format";
import {
  CHAIN_CHECK_LABEL, CHAIN_UNREADABLE_TEXT, closesLineText, copyLineText, LEDGER_JOB_LABEL, type AnchorStatus, type ChainState, type ClosesStatus,
} from "@/modules/ledger/client";

/** The latest run of a daily ledger step, as the desk's heartbeat table holds it. `ranAt` null means it has not run yet. */
export type JobRun = { job: keyof typeof LEDGER_JOB_LABEL; ranAt: string | null; ok: boolean | null; detail?: string };

/**
 * The integrity line. A pass shows its headline and the standing limit together, always; a failure names the check that found
 * it and offers no reassurance; a check that could not run says "could not check" and nothing that reads as intact.
 */
function Integrity({ chain }: { chain: ChainState }) {
  if (chain.kind === "unreadable") {
    return (
      <p role="alert" data-testid="chain-unreadable" className="flex items-start gap-2 rounded-sm border border-warn bg-warn-wash px-3 py-2 text-ink">
        <TriangleAlert aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-warn" />
        {CHAIN_UNREADABLE_TEXT}
      </p>
    );
  }
  const { report, status } = chain;
  if (report.ok) {
    return (
      <div data-testid="chain-ok">
        <p className="text-ink">{report.headline}</p>
        <p className="text-caption text-ink-muted">{report.limit}</p>
      </div>
    );
  }
  return (
    <div role="alert" data-testid="chain-failed" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-ink">
      <p className="flex items-center gap-2 font-semibold text-bad">
        <TriangleAlert aria-hidden strokeWidth={1.5} className="size-4 shrink-0" />
        The ledger failed its own check
      </p>
      <ul className="mt-1 space-y-1">
        {report.lines.map((line, i) => (
          <li key={line}>
            <span className="text-label uppercase text-ink-muted">{CHAIN_CHECK_LABEL[status.problems[i]?.source ?? "chain"]}</span>
            <br />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Jobs({ runs }: { runs: JobRun[] }) {
  const failed = runs.some((r) => r.ok === false);
  return (
    <details open={failed} className="text-caption text-ink-muted">
      <summary className="cursor-pointer text-small text-ink-body">Daily steps{failed ? ": one failed" : ""}</summary>
      <ul className="mt-1 space-y-1">
        {runs.map((r) => (
          <li key={r.job} data-job={r.job} className="tabular-nums">
            <span className="font-medium text-ink-body">{LEDGER_JOB_LABEL[r.job]}</span>:{" "}
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
    </details>
  );
}

type Props = { closes: ClosesStatus | null; anchors: AnchorStatus | null; chain: ChainState; runs: JobRun[] | null };

export function LedgerStatus({ closes, anchors, chain, runs }: Props) {
  return (
    <section aria-label="Ledger status" className="space-y-2 rounded-sm border border-rule p-3 text-small desk:text-small-desk">
      <p className="tabular-nums text-ink">{closes ? closesLineText(closes.latestOpenDay, closes.handEnteredDays) : "Could not read how current the closes are."}</p>
      <Integrity chain={chain} />
      <p className="tabular-nums text-ink-body">
        {anchors ? copyLineText(anchors.latestPublishedDate, anchors.waitingDays) : "Could not read the public copy's state."}
      </p>
      {runs ? <Jobs runs={runs} /> : null}
    </section>
  );
}
