import { StatusShape } from "@/components/ui/status-shape";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { TickInView } from "@/components/ui/tick-in-view";
import { TEST_STATUSES } from "@/lib/desk-types";
import { formatDate } from "@/lib/format";
import { countStatuses, statusSummaryLabel } from "@/lib/test-status";
import type { KillTest } from "@/lib/view-types";
import { AsOf, Withheld } from "./as-of";
import { EmptyState } from "./empty-state";
import { ThresholdMeter } from "./threshold-meter";

/** "I would be wrong if": statuses are shapes + words, readings carry their data date (rule 3). */
export function KillCriteriaTable({ tests }: { tests: KillTest[] }) {
  if (tests.length === 0) {
    return (
      <EmptyState
        body="No tests yet. A test says what would prove the view wrong; each will show its latest reading and status."
        shape={["No.", "Condition", "Latest reading", "Data to", "Status"]}
      />
    );
  }
  const counts = countStatuses(tests.map((t) => t.status));
  return (
    <TickInView>
      <div role="group" aria-label={statusSummaryLabel(counts)} className="flex flex-wrap gap-x-4 text-small">
        {TEST_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <StatusShape status={s} /> <span className="tabular-nums text-ink-muted">{counts[s]}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 mb-4 text-small text-ink-muted">&quot;Met&quot; means his view is wrong.</p>
      <Table className="max-desk:block">
        <THead className="max-desk:sr-only">
          <tr>
            <TH>No.</TH>
            <TH>Condition</TH>
            <TH>Latest reading</TH>
            <TH>Data to</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody className="max-desk:block">
          {tests.map((t, i) => (
            <TR key={t.id} className="max-desk:block max-desk:py-3">
              <TD className="font-mono text-mono-id text-ink-muted max-desk:inline max-desk:p-0 max-desk:pr-2">{t.id}</TD>
              <TD className="text-body text-ink-body max-desk:inline max-desk:p-0">{t.condition}</TD>
              <TD className="max-desk:mt-2 max-desk:block max-desk:p-0">
                {t.withheldUntil ? <Withheld availableOn={t.withheldUntil} /> : <span className="tabular-nums">{t.reading ?? "Not disclosed yet"}</span>}
                {t.meter && !t.withheldUntil ? (
                  <div className="mt-2">
                    <ThresholdMeter meter={t.meter} />
                  </div>
                ) : null}
                {!t.meter && t.status === "no_data" ? (
                  <div className="mt-2 rounded-sm border border-dashed border-rule-strong px-2 py-1 text-caption text-ink-muted">Not disclosed yet</div>
                ) : null}
              </TD>
              <TD className="text-small text-ink-muted max-desk:mt-1 max-desk:block max-desk:p-0">
                {t.readingAsOf ? <AsOf date={t.readingAsOf} prefix="Data to" /> : "—"}
                <span className="block">checked {formatDate(t.lastChecked)}</span>
              </TD>
              <TD className="max-desk:mt-1 max-desk:block max-desk:p-0">
                <StatusShape status={t.status} tick index={i} />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </TickInView>
  );
}
