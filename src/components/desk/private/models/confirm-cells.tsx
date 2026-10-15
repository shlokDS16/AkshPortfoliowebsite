"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/messages";
import { confirmValuationAction } from "@/modules/valuation/actions";
import { cellKey, type CellRole, type ConfirmData, type ConfirmRow } from "@/modules/valuation/client";
import { AddCell } from "./add-cell";
import { ConfirmRowView } from "./confirm-row";
import { confirmLabel } from "./copy";

// Confirm (spec s7.2, D10, D11, D15): the suggested inputs and results as a list, nothing ticked but an unchanged carry-forward, "Add a
// cell" for anything the rules missed, and one button. Nothing is trusted before that click; confirmValuationAction checks every cell
// again against the model object and is the only caller of confirm_valuation_version. His label is only what he typed, or null.

const MAX_INPUTS = 40;
const MAX_RESULTS = 20;

type Props = { versionId: string; data: ConfirmData };
type Choice = { role: CellRole; label: string };

export function ConfirmCells({ versionId, data }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState({ input: data.inputs, output: data.outputs });
  const [chosen, setChosen] = useState(() => {
    const map = new Map<string, Choice>();
    for (const r of data.inputs) if (r.carried) map.set(cellKey(r.sheet, r.addr), { role: "input", label: "" });
    for (const r of data.outputs) if (r.carried) map.set(cellKey(r.sheet, r.addr), { role: "output", label: "" });
    return map;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const count = (role: CellRole) => [...chosen.values()].filter((c) => c.role === role).length;
  const inputs = count("input");
  const results = count("output");
  const tooMany = inputs > MAX_INPUTS || results > MAX_RESULTS;

  function update(key: string, next: Choice | null) {
    setChosen((was) => {
      const map = new Map(was);
      if (next) map.set(key, next);
      else map.delete(key);
      return map;
    });
  }

  function add(row: ConfirmRow, role: CellRole) {
    const key = cellKey(row.sheet, row.addr);
    setRows((was) => (was[role].some((r) => cellKey(r.sheet, r.addr) === key) ? was : { ...was, [role]: [...was[role], row] }));
    update(key, { role, label: chosen.get(key)?.label ?? "" });
  }

  function confirm() {
    const cells = (["input", "output"] as const).flatMap((role) =>
      rows[role].flatMap((r) => {
        const c = chosen.get(cellKey(r.sheet, r.addr));
        return c && c.role === role ? [{ sheet: r.sheet, addr: r.addr, role, label: c.label.trim() || null }] : [];
      }),
    );
    start(async () => {
      try {
        const result = await confirmValuationAction({ versionId, cells });
        if (result.ok) {
          setError(null);
          router.refresh();
        } else setError(result.cell ? `${result.message} (${result.cell})` : result.message);
      } catch {
        setError(errorText("save-failed"));
      }
    });
  }

  const list = (role: CellRole, title: string, hint: string) => (
    <section aria-labelledby={`${role}-h`} className="space-y-2">
      <h2 id={`${role}-h`} className="text-subtitle text-ink desk:text-subtitle-desk">
        {title}
      </h2>
      <p className="text-small text-ink-muted desk:text-small-desk">{hint}</p>
      <ul>
        {rows[role].map((r) => {
          const key = cellKey(r.sheet, r.addr);
          const c = chosen.get(key);
          return (
            <ConfirmRowView
              key={key}
              row={r}
              checked={c?.role === role}
              label={c?.label ?? ""}
              carriedFrom={data.carriedFrom}
              onCheck={(on) => update(key, on ? { role, label: "" } : null)}
              onLabel={(text) => update(key, { role, label: text })}
            />
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="space-y-(--block-gap)">
      <div className="grid grid-cols-1 gap-(--block-gap) desk:grid-cols-2">
        {list("input", "Inputs", "Plain numbers the formulas read. Tick the ones you want to change.")}
        {list("output", "Results", "Cells the workbook calculates. Tick the ones you want to watch.")}
      </div>
      <AddCell versionId={versionId} onAdd={add} />
      <div className="space-y-2 border-t border-rule-strong pt-4">
        {tooMany ? <p className="text-small text-bad">Choose at most {MAX_INPUTS} inputs and {MAX_RESULTS} results.</p> : null}
        <Button type="button" disabled={pending || inputs === 0 || results === 0 || tooMany} onClick={confirm}>
          {confirmLabel(inputs, results)}
        </Button>
        <p className="text-small text-ink-muted desk:text-small-desk">Nothing is calculated for you until you press this. You can change the choice only by uploading the workbook again.</p>
        {error ? (
          <p role="alert" className="text-small text-bad">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
