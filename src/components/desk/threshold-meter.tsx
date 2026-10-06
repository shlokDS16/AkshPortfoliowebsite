import { formatNumber } from "@/lib/format";
import type { MeterData } from "@/lib/view-types";

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/**
 * Distance to threshold (segment 3 C): surface-2 track, hatched Met zone, 2 px neel threshold tick with a neel
 * label, 12 px ink dot for the current reading, hollow ring for the prior. Figures never move.
 */
export function ThresholdMeter({ meter }: { meter: MeterData }) {
  const at = (v: number) => clamp(((v - meter.min) / (meter.max - meter.min)) * 100);
  const pct = (v: number) => `${at(v).toFixed(2)}%`;
  const [from, to] = meter.direction === "below" ? [meter.min, meter.threshold] : [meter.threshold, meter.max];
  const current = meter.current === null ? "not disclosed" : `${formatNumber(meter.current)} ${meter.unit}`;
  return (
    <div role="img" aria-label={`${meter.labels.threshold}; current ${current}`} className="w-full min-w-40">
      <div className="relative h-5">
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
      <div className="relative mt-1 h-4 text-caption tabular-nums">
        <span className="absolute left-0 text-ink-muted">{meter.labels.min}</span>
        <span className="absolute -translate-x-1/2 font-medium whitespace-nowrap text-neel" style={{ left: pct(meter.threshold) }}>
          {meter.labels.threshold}
        </span>
        <span className="absolute right-0 text-ink-muted">{meter.labels.max}</span>
      </div>
    </div>
  );
}
