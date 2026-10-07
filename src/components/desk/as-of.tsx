import type { ISODate } from "@/lib/desk-types";
import { formatDate, withheldText } from "@/lib/format";

type Prefix = "Figures to" | "as of" | "Data to";

export function AsOf({ date, prefix = "Figures to" }: { date: ISODate; prefix?: Prefix }) {
  return (
    <span className="tabular-nums text-ink-muted">
      {prefix} {formatDate(date)}
    </span>
  );
}

/** Rule 3: a value younger than 30 days is replaced by this marker (chosen upstream by isLagged). */
export function Withheld({ availableOn }: { availableOn: ISODate }) {
  return (
    <span className="withheld tabular-nums text-ink-muted" title="Figures younger than 30 days are withheld (publishing rule 3)">
      {withheldText(availableOn)}
    </span>
  );
}
