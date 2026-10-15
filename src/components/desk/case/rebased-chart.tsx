import { formatDate } from "@/lib/format";
import type { CaseChartView } from "@/modules/showcase";
import { buildCaseChartGeometry } from "./chart-geometry";

/**
 * The one depiction of how the share moved (publishing rule 10.6/10.7), behind its own owner switch. Server-rendered SVG, no library,
 * no script, no animation. Two lines on one scale: the share solid and heavy, the Nifty 50 thin and dashed, so no meaning rests on
 * colour. Gridlines carry no number and the only label is the 100 baseline; no value is written anywhere, in text or in a label.
 */
export function RebasedChart({ chart }: { chart: CaseChartView }) {
  const g = buildCaseChartGeometry(chart.points);
  return (
    <figure className="mt-(--stack)">
      <div className="relative">
        <svg role="img" aria-label={chart.alt} viewBox={`0 0 ${g.width} ${g.height}`} preserveAspectRatio="none" className="block h-44 w-full border-y border-rule desk:h-56">
          {g.grid.map((y) => (
            <line key={y} x1="0" x2={g.width} y1={y} y2={y} className="stroke-rule" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={g.width} y1={g.baselineY} y2={g.baselineY} className="stroke-ink-muted" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polyline points={g.index} fill="none" className="stroke-bench" strokeWidth="1.5" strokeDasharray="6 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <polyline points={g.share} fill="none" className="stroke-ink" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 -translate-y-full bg-paper px-1 font-mono text-mono-tag tabular-nums text-ink-muted"
          style={{ top: `${g.baselineTop}%` }}
        >
          100
        </span>
      </div>
      <div className="mt-1 flex justify-between font-mono text-mono-tag tabular-nums text-ink-muted">
        <span>{formatDate(chart.from)}</span>
        <span>{formatDate(chart.to)}</span>
      </div>
      <ul aria-label="Key" className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-small text-ink-body desk:text-small-desk">
        <li className="flex items-center gap-2">
          <svg aria-hidden width="24" height="8" viewBox="0 0 24 8">
            <line x1="0" y1="4" x2="24" y2="4" className="stroke-ink" strokeWidth="2.5" />
          </svg>
          {chart.company}
        </li>
        <li className="flex items-center gap-2">
          <svg aria-hidden width="24" height="8" viewBox="0 0 24 8">
            <line x1="0" y1="4" x2="24" y2="4" className="stroke-bench" strokeWidth="1.5" strokeDasharray="6 4" />
          </svg>
          Nifty 50
        </li>
      </ul>
      <figcaption data-lint-exclude className="mt-2 max-w-[72ch] text-small text-ink-muted desk:text-small-desk">
        {chart.caption}
      </figcaption>
    </figure>
  );
}
