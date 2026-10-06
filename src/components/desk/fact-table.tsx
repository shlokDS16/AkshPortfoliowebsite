import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import type { FactGroup } from "@/lib/view-types";
import { AsOf, Withheld } from "./as-of";
import { EmptyState } from "./empty-state";
import { IdMark } from "./id-mark";

/** Source facts (spec SourceFacts): as-of once per group, units column, tabular figures; two-line rows on phone. */
export function FactTable({ groups }: { groups: FactGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        body="No source facts yet. Each fact will show its figure, prior year, source and date."
        shape={["Metric", "Value", "Unit", "Prior", "Source"]}
      />
    );
  }
  return (
    <div className="space-y-(--block-gap)">
      {groups.map((group, g) => (
        <Table key={`${g}-${group.title}`} className="max-desk:block">
          <caption className="mb-2 text-left text-subtitle text-ink desk:text-subtitle-desk">
            {group.title}{" "}
            <span className="text-small font-normal text-ink-muted">
              · <AsOf date={group.asOf} prefix="as of" />
            </span>
          </caption>
          <THead className="max-desk:sr-only">
            <tr>
              <TH>Metric</TH>
              <TH numeric>Value</TH>
              <TH>Unit</TH>
              <TH numeric>Prior</TH>
              <TH>Source</TH>
            </tr>
          </THead>
          <tbody className="max-desk:block">
            {group.rows.map((row) => (
              <TR key={row.id} className="max-desk:grid max-desk:grid-cols-[minmax(0,1fr)_auto_auto_auto] max-desk:gap-x-3 max-desk:py-2">
                <TD className="max-desk:col-span-4 max-desk:p-0">{row.label}</TD>
                <TD numeric className="max-desk:p-0">
                  {row.withheldUntil !== null ? <Withheld availableOn={row.withheldUntil} /> : (row.value ?? "—")}
                </TD>
                <TD className="text-caption text-ink-muted max-desk:p-0">{row.unit}</TD>
                <TD numeric className="text-ink-muted max-desk:p-0">
                  {row.withheldUntil !== null ? "—" : (row.prior ?? "—")}
                </TD>
                <TD className="max-desk:p-0">
                  <IdMark kind="source" value={`${row.source.id} ${row.source.locator}`} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ))}
    </div>
  );
}
