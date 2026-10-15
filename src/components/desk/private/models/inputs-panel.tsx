"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cellKey, formatNumber, fromEditText, isPercentFormat, MAX_SCENARIO_VALUE, toEditText, type ScenarioCell } from "@/modules/valuation/client";
import { HEAD, SHEET_MARK } from "./copy";

// The scenario's inputs (spec s7.3): his label, else the sheet's marked "sheet"; the workbook value; an editable scenario value
// (inputmode decimal; a percent cell is edited in percent, so 11.5 means 11.5%); a reset per row. Left on desktop, first on phone.

export function CellName({ cell }: { cell: ScenarioCell }) {
  return (
    <span className="break-words">
      {cell.label}
      {cell.own ? null : (
        <span className="ml-1.5 rounded-xs border border-rule px-1 align-middle font-mono text-mono-tag text-ink-muted" title="The sheet's label, not yours">
          {SHEET_MARK}
        </span>
      )}
    </span>
  );
}

type RowProps = { cell: ScenarioCell; value: number; disabled: boolean; onChange: (value: number) => void; onReset: () => void };

function InputRow({ cell, value, disabled, onChange, onReset }: RowProps) {
  const percent = isPercentFormat(cell.z);
  const [text, setText] = useState(() => toEditText(value, cell.z));
  const [shown, setShown] = useState(value);
  const [bad, setBad] = useState(false);
  // A value set from outside (a scenario picked, a reset) replaces what is in the box; his own typing is kept as typed.
  if (value !== shown) {
    setShown(value);
    setText(toEditText(value, cell.z));
    setBad(false);
  }
  const key = cellKey(cell.sheet, cell.addr);
  const id = `in-${cell.id}`;

  function type(next: string) {
    setText(next);
    const parsed = fromEditText(next, cell.z);
    const ok = parsed !== null && Math.abs(parsed) <= MAX_SCENARIO_VALUE;
    setBad(!ok);
    if (ok) {
      setShown(parsed);
      onChange(parsed);
    }
  }

  return (
    <li className="border-b border-rule py-3">
      <label htmlFor={id} className="block text-body text-ink">
        <CellName cell={cell} />
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-mono-id text-ink-muted">{key}</span>
        <span className="text-small text-ink-muted desk:text-small-desk">
          {HEAD.workbook}: <span className="tabular-nums text-ink">{formatNumber(cell.value, cell.z)}</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="relative min-w-0 flex-1 desk:max-w-56">
          <Input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${cell.label}, scenario value${percent ? " in percent" : ""}`}
            aria-invalid={bad || undefined}
            disabled={disabled}
            value={text}
            onChange={(e) => type(e.target.value)}
            className={percent ? "pr-8 text-right tabular-nums" : "text-right tabular-nums"}
          />
          {percent ? (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body text-ink-muted">
              %
            </span>
          ) : null}
        </span>
        <Button type="button" variant="outline" disabled={disabled || value === cell.value} onClick={onReset} aria-label={`Reset ${cell.label} to the workbook value`}>
          Reset
        </Button>
      </div>
      {bad ? <p className="mt-1 text-small text-bad">Type a number{percent ? " in percent, for example 11.5" : ""}.</p> : null}
    </li>
  );
}

type Props = { inputs: ScenarioCell[]; values: Record<string, number>; disabled: boolean; onChange: (id: string, value: number) => void; onReset: (id: string) => void };

export function InputsPanel({ inputs, values, disabled, onChange, onReset }: Props) {
  return (
    <section aria-labelledby="inputs-h" className="min-w-0">
      <h2 id="inputs-h" className="text-subtitle text-ink desk:text-subtitle-desk">
        Inputs
      </h2>
      <ul>
        {inputs.map((cell) => (
          <InputRow key={cell.id} cell={cell} value={values[cell.id] ?? cell.value} disabled={disabled} onChange={(v) => onChange(cell.id, v)} onReset={() => onReset(cell.id)} />
        ))}
      </ul>
    </section>
  );
}
