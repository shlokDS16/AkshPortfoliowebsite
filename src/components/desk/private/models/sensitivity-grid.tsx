"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { axisValues, defaultStep, formatNumber, fromEditText, gridPoints, gridSize, isPercentFormat, toEditText, type ResultValue, type ScenarioCell } from "@/modules/valuation/client";
import { THIS_SCENARIO } from "./copy";
import type { Engine } from "./engine-protocol";
import { outputText } from "./results-panel";

// The sensitivity grid (spec s7.3, D17): one result, two inputs, 5 x 5 (3 x 3 below 480 px) around the current scenario; step 0.5
// percentage point for a percent input, else 5% of the value, editable. The centre cell is "this scenario". Tabular figures, no colour
// scale. The worker evaluates every point in one pass; the grid is filled on request, because a 5 x 5 grid takes seconds on a phone.

type Filled = { size: number; a: ScenarioCell; b: ScenarioCell; result: ScenarioCell; as: number[]; bs: number[]; values: ResultValue[]; at: string };
type Props = { inputs: ScenarioCell[]; outputs: ScenarioCell[]; values: Record<string, number>; engine: Engine | null };

const SELECT = "min-h-11 w-full rounded-sm border border-input bg-paper px-3 text-body text-ink disabled:opacity-45";
const valueOf = (values: Record<string, number>, cell: ScenarioCell) => values[cell.id] ?? cell.value;

function StepField({ label, cell, text, onText }: { label: string; cell: ScenarioCell; text: string; onText: (t: string) => void }) {
  const percent = isPercentFormat(cell.z);
  return (
    <label className="block space-y-1">
      <span className="block text-small text-ink-muted">
        {label}
        {percent ? " (percentage points)" : ""}
      </span>
      <Input inputMode="decimal" autoComplete="off" value={text} onChange={(e) => onText(e.target.value)} className="text-right tabular-nums" />
    </label>
  );
}

export function SensitivityGrid({ inputs, outputs, values, engine }: Props) {
  const [resultId, setResultId] = useState(outputs[0]?.id ?? "");
  const [aId, setAId] = useState(inputs[0]?.id ?? "");
  const [bId, setBId] = useState(inputs[1]?.id ?? "");
  const stepText = (cell: ScenarioCell | undefined) => (cell ? toEditText(defaultStep(valueOf(values, cell), cell.z), cell.z) : "");
  const [steps, setSteps] = useState(() => ({ a: stepText(inputs[0]), b: stepText(inputs[1]) }));
  const [filled, setFilled] = useState<Filled | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (inputs.length < 2 || outputs.length === 0) {
    return <p className="text-small text-ink-muted desk:text-small-desk">The sensitivity grid needs two inputs and one result; this model has {inputs.length === 1 ? "one input" : "fewer"}.</p>;
  }
  const byId = (id: string) => [...inputs, ...outputs].find((c) => c.id === id);
  const a = byId(aId) ?? inputs[0];
  const b = byId(bId) ?? inputs[1];
  const result = byId(resultId) ?? outputs[0];
  const stepA = fromEditText(steps.a, a.z);
  const stepB = fromEditText(steps.b, b.z);
  const snapshot = JSON.stringify(values);

  async function fill() {
    if (!engine || stepA === null || stepB === null) return;
    const size = gridSize(window.innerWidth);
    const centre = { a: valueOf(values, a), b: valueOf(values, b) };
    const points = gridPoints({ value: centre.a, step: stepA }, { value: centre.b, step: stepB }, size);
    const base = inputs.map((c) => ({ sheet: c.sheet, addr: c.addr, value: valueOf(values, c) }));
    setBusy(true);
    try {
      const out = await engine.grid(base, a, b, points.map((p) => ({ a: p.a, b: p.b })), result);
      setFilled({ size, a, b, result, as: axisValues(centre.a, stepA, size), bs: axisValues(centre.b, stepB, size), values: out, at: snapshot });
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const pick = (axis: "a" | "b", id: string) => {
    (axis === "a" ? setAId : setBId)(id);
    setSteps((s) => ({ ...s, [axis]: stepText(byId(id)) }));
  };
  const mid = filled ? (filled.size - 1) / 2 : 0;

  return (
    <section aria-labelledby="grid-h" className="space-y-3">
      <h2 id="grid-h" className="text-subtitle text-ink desk:text-subtitle-desk">
        Sensitivity
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block space-y-1">
          <span className="block text-small text-ink-muted">Result</span>
          <select className={SELECT} value={result.id} onChange={(e) => setResultId(e.target.value)}>
            {outputs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {(["a", "b"] as const).map((axis) => (
          <div key={axis} className="space-y-2">
            <label className="block space-y-1">
              <span className="block text-small text-ink-muted">{axis === "a" ? "Down the rows" : "Across the columns"}</span>
              <select className={SELECT} value={(axis === "a" ? a : b).id} onChange={(e) => pick(axis, e.target.value)}>
                {inputs.filter((c) => c.id !== (axis === "a" ? b : a).id).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <StepField label={axis === "a" ? "Step between rows" : "Step between columns"} cell={axis === "a" ? a : b} text={steps[axis]} onText={(t) => setSteps((s) => ({ ...s, [axis]: t }))} />
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" disabled={!engine || busy || stepA === null || stepB === null || stepA === 0 || stepB === 0} onClick={() => void fill()}>
        {busy ? "Working out the grid" : "Fill the grid"}
      </Button>
      {failed ? <p className="text-small text-bad">The grid could not be worked out. Try again.</p> : null}
      {filled && filled.at !== snapshot ? <p className="text-small text-ink-muted">The grid shows the scenario before your last change. Fill it again to update it.</p> : null}
      {filled ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-data tabular-nums desk:text-data-desk">
            <caption className="pb-2 text-left text-small text-ink-muted desk:text-small-desk">
              {filled.result.label}: {filled.a.label} down the rows, {filled.b.label} across the columns
            </caption>
            <thead>
              <tr className="border-b border-rule-strong">
                <td />
                {filled.bs.map((v, j) => (
                  <th key={j} scope="col" className="px-(--cell-x) py-2 text-right font-semibold text-ink">
                    {formatNumber(v, filled.b.z)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filled.as.map((v, i) => (
                <tr key={i} className="border-b border-rule">
                  <th scope="row" className="px-(--cell-x) py-(--row-y) text-left font-semibold text-ink">
                    {formatNumber(v, filled.a.z)}
                  </th>
                  {filled.bs.map((_, j) => {
                    const centre = i === mid && j === mid;
                    return (
                      <td key={j} className={centre ? "border border-ink px-(--cell-x) py-(--row-y) text-right text-ink" : "px-(--cell-x) py-(--row-y) text-right text-ink-body"}>
                        {outputText(filled.result, filled.values[i * filled.size + j]) ?? ""}
                        {centre ? <span className="block text-caption text-ink-muted">{THIS_SCENARIO}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
