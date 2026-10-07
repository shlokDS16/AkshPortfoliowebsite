import { Table, TD, TH, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { ScenarioData } from "@/lib/view-types";
import { EmptyState } from "./empty-state";

/** Public SCENARIO block: static, lagged, operating outputs only (rule 9; the casefile schema rejects value fields). */
export function ScenarioTable({ data }: { data: ScenarioData | null }) {
  if (!data) {
    return <EmptyState body="No scenarios in this file. A scenario table shows operating outputs under stated assumptions." shape={["Assumption", "Scenarios"]} />;
  }
  return (
    <div>
      <Table>
        <thead>
          <tr className="border-b-[3px] border-double border-ink">
            <TH>Input or output</TH>
            <TH>Unit</TH>
            {data.names.map((n) => (
              <TH key={n} numeric>
                {n}
              </TH>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.assumptions.map((a) => (
            <TR key={a.label}>
              <TH scope="row" className="text-data normal-case font-normal text-ink-muted">
                {a.label}
              </TH>
              <TD />
              {a.values.map((v, i) => (
                <TD key={data.names[i] ?? i} numeric className="text-ink-muted">
                  {v}
                </TD>
              ))}
            </TR>
          ))}
          {data.outputs.map((o) => (
            <TR key={o.label}>
              <TH scope="row" className="text-data normal-case font-normal text-ink-body">
                {o.label}
              </TH>
              <TD className="text-caption text-ink-muted">{o.unit}</TD>
              {o.values.map((v, i) => (
                <TD key={data.names[i] ?? i} numeric>
                  {v}
                </TD>
              ))}
            </TR>
          ))}
        </tbody>
      </Table>
      <p className="mt-2 text-caption text-ink-muted">
        Scenario outputs under the stated inputs, for learning. Frozen with R{data.frozenAtRev} · figures to {formatDate(data.dataAsOf)}.
      </p>
    </div>
  );
}
