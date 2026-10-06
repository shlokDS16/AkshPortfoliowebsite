import { StatusShape } from "@/components/ui/status-shape";
import { TickInView } from "@/components/ui/tick-in-view";
import { TEST_STATUSES, type TestCounts } from "@/lib/desk-types";
import { statusSummaryLabel } from "@/lib/test-status";

/** One 12 px ink shape per test in the fixed order; ticks in once when first in view. */
export function UnitSquares({ counts }: { counts: TestCounts }) {
  const shapes = TEST_STATUSES.flatMap((s) => Array.from({ length: counts[s] }, () => s));
  return (
    <TickInView className="mt-2">
      <span role="img" aria-label={statusSummaryLabel(counts)} className="flex flex-wrap gap-1">
        {shapes.map((s, i) => (
          <StatusShape key={i} status={s} withWord={false} tick index={i} />
        ))}
      </span>
    </TickInView>
  );
}
