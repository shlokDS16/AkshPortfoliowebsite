"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { formatNumber } from "@/lib/format";
import type { LineChartData } from "@/lib/view-types";
import { buildGeometry, chartLabel, thresholdLabelY } from "./chart-geometry";
import { ChartReadout } from "./chart-readout";

type Props = { data: LineChartData; height: { phone: number; desk: number } };
const SERIES_CLASS = { subject: "chart-subject stroke-ink", projection: "stroke-ink", benchmark: "stroke-bench" } as const;

/**
 * Hand-rolled SVG (Plan 1B D3). Height is reserved by CSS variables, so measuring the width never shifts layout.
 * The subject draws to the data cap (220 ms, pathLength 1) only if the chart was below the fold at hydration.
 * Rule 3: geometry drops withheld points, so no label, readout or path ever carries a withheld figure.
 */
export function LineChart({ data, height }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: height.desk });
  const [draw, setDraw] = useState<"armed" | "run" | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const hatch = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.max(280, Math.round(el.clientWidth || 640)), h: Math.round(el.clientHeight || height.desk) });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height.desk]);
  useEffect(() => {
    const el = box.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setDraw("armed");
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setDraw("run");
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const g = buildGeometry(data, size.w, size.h);
  const subject = g.series.find((s) => s.kind === "subject");
  const points = subject?.points ?? [];
  const last = points[points.length - 1];
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next: Record<string, number> = { ArrowRight: (focus ?? -1) + 1, ArrowLeft: (focus ?? points.length) - 1, Home: 0, End: points.length - 1 };
    if (!(event.key in next) || points.length === 0) return;
    event.preventDefault();
    setFocus(Math.min(points.length - 1, Math.max(0, next[event.key])));
  }
  const focused = focus === null ? null : points[focus];
  const vars = { "--chart-h": `${height.phone}px`, "--chart-h-desk": `${height.desk}px` } as CSSProperties;
  return (
    <div role="group" aria-label="Chart readout: use the arrow keys" tabIndex={0} onKeyDown={onKeyDown} className="rounded-xs">
      <div ref={box} data-draw={draw ?? undefined} style={vars} className="chart h-(--chart-h) w-full desk:h-(--chart-h-desk)">
        <svg role="img" aria-label={chartLabel(data)} viewBox={`0 0 ${g.width} ${g.height}`} preserveAspectRatio="xMinYMin meet" className="block size-full">
          <defs>
            <pattern id={hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" className="stroke-rule-strong" strokeWidth="1" />
            </pattern>
          </defs>
          {data.yTicks.map((t) => (
            <g key={t}>
              <line x1={g.plot.left} x2={g.plot.right} y1={g.yAt(t)} y2={g.yAt(t)} className="stroke-rule" strokeWidth="1" />
              <text x={g.plot.left - 6} y={g.yAt(t) + 4} textAnchor="end" className="fill-ink-muted text-caption tabular-nums">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {g.xs.map((x, i) => (
            <text key={x} x={g.xAt(i)} y={g.height - 6} textAnchor="middle" className="fill-ink-muted text-caption tabular-nums">
              {x}
            </text>
          ))}
          {g.withheldFromX !== null ? (
            <g>
              <rect x={g.withheldFromX - 8} y={g.plot.top} width={g.plot.right - g.withheldFromX + 8} height={g.plot.bottom - g.plot.top} fill={`url(#${hatch})`} />
              <text x={g.plot.right - 4} y={g.plot.top + 12} textAnchor="end" className="fill-ink-muted text-caption">
                withheld
              </text>
            </g>
          ) : null}
          {g.thresholds.map((t) => (
            <g key={t.label} data-threshold>
              <line x1={g.plot.left} x2={g.plot.right} y1={t.y} y2={t.y} className="stroke-neel" strokeWidth="1.5" strokeDasharray="5 4" />
              <text x={g.plot.left + 4} y={thresholdLabelY(t.y)} className="fill-neel text-caption font-medium">
                {t.label}
              </text>
            </g>
          ))}
          {g.series.map((s) => (
            <path
              key={s.label}
              d={s.d}
              fill="none"
              pathLength={s.kind === "subject" ? 1 : undefined}
              strokeWidth={s.kind === "benchmark" ? 1.5 : 2}
              strokeDasharray={s.kind === "projection" ? "3 3" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              className={SERIES_CLASS[s.kind]}
            />
          ))}
          {points.map((p, i) => (
            <circle key={p.label} cx={p.x} cy={p.y} r={i === focus ? 4 : 2.6} className="fill-ink" />
          ))}
          {last ? (
            <text x={last.x - 6} y={last.y - 8} textAnchor="end" className="fill-ink text-caption font-semibold tabular-nums">
              {formatNumber(last.value)}
            </text>
          ) : null}
          {g.capX !== null && data.dataCap ? (
            <g>
              <line x1={g.capX} x2={g.capX} y1={g.plot.top} y2={g.plot.bottom} className="stroke-ink" strokeWidth="1" />
              <text x={g.capX - 4} y={g.plot.bottom - 6} textAnchor="end" className="cap-label fill-ink text-caption font-semibold">
                {data.dataCap.label}
              </text>
            </g>
          ) : null}
        </svg>
      </div>
      <ChartReadout text={focused ? `${focused.label}: ${formatNumber(focused.value)} ${data.unit}` : null} />
    </div>
  );
}
