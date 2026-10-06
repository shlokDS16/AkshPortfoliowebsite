import { formatDate } from "@/lib/format";
import type { ExhibitData } from "@/lib/view-types";
import { LineChart } from "./chart/line-chart";
import { ExhibitToggle } from "./exhibit-toggle";
import { LedgerTable } from "./ledger-table";

type Props = { data: ExhibitData; height?: { phone: number; desk: number }; defaultView?: "chart" | "table" };

/** Every figure block (segment 3 B): 2 px geru top rule, mono number, factual title, toggle, Source / Data to footer. */
export function Exhibit({ data, height = { phone: 200, desk: 240 }, defaultView = "chart" }: Props) {
  const chartOk = data.chart.series.some((s) => s.points.some((p) => p.y !== null && !p.withheld && Number.isFinite(p.y)));
  const titleId = `ex-${data.fileNo}-${data.n}`;
  return (
    <figure aria-labelledby={titleId} className="border-t-2 border-geru pt-3">
      <figcaption>
        <p className="font-mono text-mono-id text-geru">
          Ex. {data.fileNo}.{data.n}
        </p>
        <p id={titleId} className="text-subtitle text-ink desk:text-subtitle-desk">
          {data.title}
        </p>
        {data.sub ? <p className="text-small text-ink-muted">{data.sub}</p> : null}
      </figcaption>
      <ExhibitToggle
        chart={<LineChart data={data.chart} height={height} />}
        table={<LedgerTable periods={data.ledger.periods} rows={data.ledger.rows} />}
        keyItems={data.key}
        defaultView={defaultView}
        chartOk={chartOk}
      />
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 border-t border-rule pt-2 text-caption text-ink-muted">
        <dt>Source</dt>
        <dd>{data.source}</dd>
        <dt>Data to</dt>
        <dd className="tabular-nums">{data.dataTo ? formatDate(data.dataTo) : "No figure old enough yet"}</dd>
      </dl>
    </figure>
  );
}
