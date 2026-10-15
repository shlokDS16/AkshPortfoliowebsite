import { cellKey, formatNumber, type ResultValue, type ScenarioCell } from "@/modules/valuation/client";
import { CellName } from "./inputs-panel";
import { HEAD, NOT_AVAILABLE } from "./copy";

// The scenario's results (spec s7.3): "Workbook value", "Scenario output", "Change", tabular figures in the cell's own Excel format. Right
// on desktop; on a phone each row is two lines (the name, then the three figures) and a sticky bar under the top bar keeps the first
// result in view while he edits the inputs. A result the engine cannot give is "Not available" with the engine's error.

/** The scenario output as text, or null while the engine has not answered. */
export function outputText(cell: ScenarioCell, result: ResultValue | undefined): string | null {
  if (!result) return null;
  if (result.kind === "number") return formatNumber(result.value, cell.z);
  if (result.kind === "error") return `${NOT_AVAILABLE} (${result.text})`;
  return NOT_AVAILABLE;
}

export function changeText(cell: ScenarioCell, result: ResultValue | undefined): string | null {
  if (!result || result.kind !== "number") return result ? "" : null;
  const d = result.value - cell.value;
  const shown = formatNumber(Math.abs(d), cell.z);
  return /[1-9]/.test(shown) ? `${d > 0 ? "+" : "−"}${shown}` : shown;
}

const PENDING = "…";
const NUM = "px-(--cell-x) py-(--row-y) text-right tabular-nums whitespace-nowrap";

type Props = { outputs: ScenarioCell[]; results: ResultValue[] | null };

/** Phone only: the first result, kept in view under the top bar while he edits the inputs above the results (the table says it too). */
export function FirstResultBar({ outputs, results }: Props) {
  const first = outputs[0];
  if (!first) return null;
  return (
    <p aria-hidden className="sticky top-(--top-bar-h) z-10 -mx-(--gutter) flex items-baseline justify-between gap-3 border-b border-rule-strong bg-paper px-(--gutter) py-2 desk:hidden">
      <span className="min-w-0 truncate text-small text-ink-muted">{first.label}</span>
      <span className="text-data font-semibold tabular-nums text-ink">{outputText(first, results?.[0]) ?? PENDING}</span>
    </p>
  );
}

export function ResultsPanel({ outputs, results }: Props) {
  return (
    <section aria-labelledby="results-h" className="min-w-0">
      <h2 id="results-h" className="text-subtitle text-ink desk:text-subtitle-desk">
        Results
      </h2>
      <table className="mt-1 w-full border-collapse text-data desk:text-data-desk">
        <thead>
          <tr className="grid grid-cols-3 border-b border-rule-strong desk:table-row">
            <th scope="col" className="sr-only desk:not-sr-only desk:px-(--cell-x) desk:py-2 desk:text-left desk:text-label desk:uppercase desk:text-ink-muted">
              Result
            </th>
            {[HEAD.workbook, HEAD.scenario, HEAD.change].map((h) => (
              <th key={h} scope="col" className="px-(--cell-x) py-2 text-right align-bottom text-label uppercase text-ink-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {outputs.map((cell, i) => (
            <tr key={cell.id} className="grid grid-cols-3 border-b border-rule desk:table-row">
              <th scope="row" className="col-span-3 px-(--cell-x) pt-(--row-y) text-left font-normal text-ink desk:py-(--row-y)">
                <CellName cell={cell} />
                <span className="block font-mono text-mono-id text-ink-muted">{cellKey(cell.sheet, cell.addr)}</span>
              </th>
              <td className={NUM}>{formatNumber(cell.value, cell.z)}</td>
              <td className={`${NUM} font-semibold text-ink`}>{outputText(cell, results?.[i]) ?? PENDING}</td>
              <td className={NUM}>{changeText(cell, results?.[i]) ?? PENDING}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
