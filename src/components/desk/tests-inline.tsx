import { StatusShape } from "@/components/ui/status-shape";
import { TEST_STATUSES, type TestCounts } from "@/lib/desk-types";
import { statusSummaryLabel } from "@/lib/test-status";

/** Register "Tests" cell: shapes plus counts, aria-label spells them out. */
export function TestsInline({ counts }: { counts: TestCounts }) {
  return (
    <span role="img" aria-label={statusSummaryLabel(counts)} className="inline-flex flex-wrap gap-2">
      {TEST_STATUSES.filter((s) => counts[s] > 0).map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <StatusShape status={s} withWord={false} />
          <span className="tabular-nums">{counts[s]}</span>
        </span>
      ))}
    </span>
  );
}
