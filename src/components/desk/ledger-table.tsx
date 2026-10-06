import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import { Table, TD, TH } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { LedgerPeriod, LedgerRow } from "@/lib/view-types";
import { Withheld } from "./as-of";
import { EmptyState } from "./empty-state";
import { IdMark } from "./id-mark";

type Props = { periods: LedgerPeriod[]; rows: LedgerRow[] };

/** Rule 3: a withheld cell renders the marker only; the value, even if present in the data, is never read. */
function Cell({ value, withheld }: { value: string | null; withheld: string | null }) {
  return withheld ? <Withheld availableOn={withheld} /> : <>{value ?? "—"}</>;
}

/** Exhibit 1's Table tab (segment 3 A): years across, double ink rule; on phone a sticky key row, no sideways scroll. */
export function LedgerTable({ periods, rows }: Props) {
  if (periods.length === 0 || rows.length === 0) {
    return <EmptyState body="No figures yet for this exhibit. Each column will show its year end and source." shape={["Metric", "Unit", "Years"]} />;
  }
  const cols = { "--cols": `repeat(${periods.length}, minmax(0, 1fr))` } as CSSProperties;
  return (
    <>
      <Table className="hidden desk:table">
        <thead>
          <tr className="border-b-[3px] border-double border-ink">
            <TH>Metric</TH>
            <TH>Unit</TH>
            {periods.map((p) => (
              <TH key={p.label} numeric data-current={p.current ? "" : undefined} className={cn(p.current && "bg-surface")}>
                {p.label}
                <span className="block text-caption font-normal normal-case">
                  {formatDate(p.yearEnd)} · <IdMark kind="source" value={p.source.id} />
                </span>
              </TH>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-rule">
              <TH scope="row" className="text-data normal-case font-normal text-ink-body">
                {r.computed ? "= " : ""}
                {r.label}
              </TH>
              <TD className="text-caption text-ink-muted">{r.unit}</TD>
              {r.values.map((v, i) => (
                <TD key={periods[i]?.label ?? i} numeric className={cn(periods[i]?.current && "bg-surface font-semibold")}>
                  <Cell value={v} withheld={r.withheld[i] ?? null} />
                </TD>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
      <table className="block w-full text-data desk:hidden" style={cols}>
        <thead className="block">
          <tr data-key-row className="sticky top-[calc(var(--top-bar-h)+var(--index-h))] z-(--z-sticky-key) grid grid-cols-(--cols) border-b-[3px] border-double border-ink bg-paper py-1">
            {periods.map((p) => (
              <th key={p.label} scope="col" className={cn("px-1 text-right text-caption font-semibold text-ink", p.current && "bg-surface")}>
                {p.label}
                <span className="block font-normal text-ink-muted">{formatDate(p.yearEnd)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block">
          {rows.map((r) => (
            <tr key={r.label} className="grid grid-cols-(--cols) border-b border-rule py-2">
              <th scope="row" className="col-span-full text-left text-small font-normal text-ink-body">
                {r.computed ? "= " : ""}
                {r.label} <span className="text-caption text-ink-muted">{r.unit}</span>
              </th>
              {r.values.map((v, i) => (
                <td key={periods[i]?.label ?? i} className={cn("px-1 text-right tabular-nums", periods[i]?.current && "bg-surface font-semibold")}>
                  <Cell value={v} withheld={r.withheld[i] ?? null} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
