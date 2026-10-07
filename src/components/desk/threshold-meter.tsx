import { formatNumber } from "@/lib/format";
import type { MeterData } from "@/lib/view-types";

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/**
 * Distance to threshold (segment 3 C): surface-2 track, hatched Met zone, 2 px neel threshold tick with a neel
 * label on its own row above the track (min/max captions sit below, so no two labels share a row), 12 px ink dot for the current reading, hollow ring for the prior. Figures never move.
 */
export function ThresholdMeter({ meter }: { meter: MeterData }) {
  // An inverted or empty range is normalised, never NaN: a zero span puts every mark at the start.
  const lo = Math.min(meter.min, meter.max);
  const span = Math.max(meter.min, meter.max) - lo;
  const at = (v: number) => (span > 0 ? clamp(((v - lo) / span) * 100) : 0);
  const pct = (v: number) => `${at(v).toFixed(2)}%`;
  const [from, to] = meter.direction === "below" ? [lo, meter.threshold] : [meter.threshold, lo + span];
  const current = meter.current === null ? "not disclosed" : `${formatNumber(meter.current)} ${meter.unit}`;
  return (
    <div role="img" aria-label={`${meter.labels.threshold}; current ${current}`} className="w-full min-w-40">
      {/* Anchored at its own P% point (left P%, shift -P%): the label always covers the tick and never leaves the meter. */}
      <div data-row="threshold-label" className="relative mb-0.5 h-4 text-caption tabular-nums">
        <span
          className="absolute font-medium whitespace-nowrap text-neel"
          style={{ left: pct(meter.threshold), transform: `translateX(-${pct(meter.threshold)})` }}
        >
          {meter.labels.threshold}
        </span>
      </div>
      <div data-row="track" className="relative h-5">
        <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-surface-2" />
        <span data-mark="met-zone" className="hatch absolute top-1/2 h-2 -translate-y-1/2" style={{ left: pct(from), width: `${(at(to) - at(from)).toFixed(2)}%` }} />
        <span data-mark="threshold" className="absolute top-0 h-5 w-0.5 bg-neel" style={{ left: pct(meter.threshold) }} />
        {meter.prior !== null ? (
          <span data-mark="prior" className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-paper" style={{ left: pct(meter.prior) }} />
        ) : null}
        {meter.current !== null ? (
          <span data-mark="current" className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: pct(meter.current) }} />
        ) : null}
      </div>
      <div data-row="scale" className="mt-1 flex justify-between gap-2 text-caption tabular-nums text-ink-muted">
        <span>{meter.labels.min}</span>
        <span>{meter.labels.max}</span>
      </div>
    </div>
  );
}
