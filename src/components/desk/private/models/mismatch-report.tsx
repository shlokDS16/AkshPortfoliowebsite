import type { Report, ReportEntry } from "@/modules/valuation/client";
import { reasonText, reportSentence } from "./copy";

// The read report (spec s7.2 step 1), before anything is computed for him: one sentence, then each cell that is not a match with
// Excel's value, the desk's value and the reason in plain words. Machine output, shown as data. On a phone each cell is two lines.

const SHOWN_OPEN = 12;
const PLAIN = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
const shortNumber = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 10 });
/** A long saved or computed number is shown to 10 significant digits; anything else (an error, text) as it is. */
const shown = (value: string | null) => (value === null ? "no value" : PLAIN.test(value) ? shortNumber.format(Number(value)) : value);

function Entry({ e }: { e: ReportEntry }) {
  return (
    <li className="border-b border-rule py-2">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-mono text-mono-id text-ink">{e.cell}</span>
        <span className="text-small tabular-nums text-ink-muted desk:text-small-desk">
          Excel {shown(e.excel)} · desk {shown(e.desk)}
        </span>
      </p>
      <p className="text-small text-ink-body desk:text-small-desk">{reasonText({ cls: e.cls, fn: e.fn })}</p>
    </li>
  );
}

export function MismatchReport({ report, formulaCount, open = true }: { report: Report; formulaCount: number; open?: boolean }) {
  const first = report.listed.slice(0, SHOWN_OPEN);
  const rest = report.listed.slice(SHOWN_OPEN);
  const body = (
    <>
      <p className="text-body text-ink">{reportSentence(report, formulaCount)}</p>
      {report.unimplemented.length > 0 ? (
        <p className="text-small text-ink-muted desk:text-small-desk">Functions the desk cannot compute yet: {report.unimplemented.join(", ")}.</p>
      ) : null}
      {first.length > 0 ? (
        <ul aria-label="Cells that differ from Excel">
          {first.map((e) => (
            <Entry key={e.cell} e={e} />
          ))}
        </ul>
      ) : null}
      {rest.length > 0 ? (
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-small text-ink">{rest.length} more</summary>
          <ul>
            {rest.map((e) => (
              <Entry key={e.cell} e={e} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
  if (!open) {
    return (
      <details className="rounded-sm border border-rule p-4">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-body font-medium text-ink">How the workbook was checked</summary>
        <div className="mt-2 space-y-2">{body}</div>
      </details>
    );
  }
  return (
    <section aria-labelledby="report-h" className="space-y-2">
      <h2 id="report-h" className="text-subtitle text-ink desk:text-subtitle-desk">
        How the workbook was checked
      </h2>
      {body}
    </section>
  );
}
