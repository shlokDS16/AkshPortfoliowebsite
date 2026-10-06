import { formatDate } from "@/lib/format";
import type { DatelineData } from "@/lib/view-types";

/** arXiv-style dateline (B+): which gated revision is live (rule 7) and the figures-to date (rule 3). */
export function Dateline({ revNo, revCount, revisedOn, firstWrittenOn, dataAsOf }: DatelineData) {
  const rows: [string, string][] = [
    ["This version", `R${revNo} of ${revCount}`],
    ["Revised", formatDate(revisedOn)],
    ["First written", formatDate(firstWrittenOn)],
    ["Figures to", formatDate(dataAsOf)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-y border-rule py-3 desk:grid-cols-4">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt className="text-label uppercase text-ink-muted">{key}</dt>
          <dd className="text-small tabular-nums text-ink desk:text-small-desk">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
