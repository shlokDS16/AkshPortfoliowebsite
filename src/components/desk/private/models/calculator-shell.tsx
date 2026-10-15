import type { ScenarioCell } from "@/modules/valuation/client";
import { CALCULATOR_FAILED, CALCULATOR_LOADING } from "./copy";
import { InputsPanel } from "./inputs-panel";
import { ResultsPanel } from "./results-panel";

// What the scenarios page shows before the calculator's chunk has loaded (the workbook values, read-only), and in its place when the
// chunk or the wasm cannot be loaded (the spec s8 sentence; his saved scenarios are untouched).

const noop = () => {};

export function CalculatorShell({ cells, failed = false }: { cells: ScenarioCell[]; failed?: boolean }) {
  const inputs = cells.filter((c) => c.role === "input");
  const outputs = cells.filter((c) => c.role === "output");
  return (
    <div className="space-y-(--block-gap)">
      <p role={failed ? "alert" : "status"} className={failed ? "rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink" : "text-small text-ink-muted desk:text-small-desk"}>
        {failed ? CALCULATOR_FAILED : CALCULATOR_LOADING}
      </p>
      <div className="grid grid-cols-1 gap-(--block-gap) desk:grid-cols-2">
        <InputsPanel inputs={inputs} values={{}} disabled onChange={noop} onReset={noop} />
        <ResultsPanel outputs={outputs} results={null} />
      </div>
    </div>
  );
}
