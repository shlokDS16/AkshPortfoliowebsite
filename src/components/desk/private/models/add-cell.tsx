"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { modelUrlAction } from "@/modules/valuation/actions";
import { buildLookup, cellKey, CHOICE_TEXT, checkChoice, formatNumber, type CellRole, type ConfirmRow, type ModelObject, type SheetLookup } from "@/modules/valuation/client";
import { sheetSays } from "./copy";
import { fetchModel } from "./fetch-model";

// "Add a cell" (spec s7.2 step 4): by address (DCF!C42) or by searching the sheet's labels. The model object is fetched only when he
// asks, through modelUrlAction's 10-minute link. Every candidate is checked with the same rule the confirm action applies.

const MAX_MATCHES = 8;
const ADDRESS = /^'?(.+?)'?!\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/;

type Match = { row: ConfirmRow; why: string | null };
type Loaded = { model: ModelObject; lookup: SheetLookup };

function find(loaded: Loaded, query: string, role: CellRole): Match[] {
  const { model, lookup } = loaded;
  const verdict = (sheet: string, addr: string) => {
    const v = checkChoice(model, [{ sheet, addr, role, label: null }]);
    return v.ok ? null : CHOICE_TEXT[v.code];
  };
  const toMatch = (sheet: string, addr: string): Match | null => {
    const cell = lookup.cell(sheet, addr);
    const value = cell && typeof cell[2] === "number" ? cell[2] : null;
    if (value === null || !cell) return null;
    return { row: { sheet, addr, value, z: cell[4], sheetLabel: lookup.labelFor(sheet, addr), carried: false, blocked: null }, why: verdict(sheet, addr) };
  };
  const at = ADDRESS.exec(query.trim());
  if (at) {
    const sheet = model.index.sheets.find((s) => s.name.toLowerCase() === at[1].toLowerCase())?.name ?? at[1];
    const m = toMatch(sheet, `${at[2].toUpperCase()}${at[3]}`);
    return m ? [m] : [];
  }
  const words = query.trim().toLowerCase();
  if (!words) return [];
  const out: Match[] = [];
  for (const sheet of model.index.sheets) {
    for (const cell of sheet.cells) {
      if (out.length >= MAX_MATCHES) return out;
      if (typeof cell[2] !== "number") continue;
      if (!lookup.labelFor(sheet.name, cell[0])?.toLowerCase().includes(words)) continue;
      const m = toMatch(sheet.name, cell[0]);
      if (m) out.push(m);
    }
  }
  return out;
}

type Props = { versionId: string; onAdd: (row: ConfirmRow, role: CellRole) => void };

export function AddCell({ versionId, onAdd }: Props) {
  const loaded = useRef<Loaded | null>(null);
  const [role, setRole] = useState<CellRole>("input");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!loaded.current) {
        const link = await modelUrlAction(versionId);
        if (!link.ok) throw new Error(link.message);
        const model = await fetchModel(link.url);
        loaded.current = { model, lookup: buildLookup(model.index) };
      }
      setMatches(find(loaded.current, query, role));
    } catch {
      setError("The workbook's cells could not be loaded. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-sm border border-rule p-4">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-body font-medium text-ink">Add a cell</summary>
      <form onSubmit={search} className="mt-3 space-y-3">
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1 text-label uppercase text-ink-muted">Add as</legend>
          {(["input", "output"] as const).map((r) => (
            <label key={r} className="inline-flex min-h-11 items-center gap-2 text-body text-ink">
              <input type="radio" name="add-role" className="size-5 accent-ink" checked={role === r} onChange={() => setRole(r)} />
              {r === "input" ? "An input" : "A result"}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1">
            <span className="block text-small text-ink-muted">Address or the sheet&apos;s label</span>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="DCF!C42 or Cost of equity" autoComplete="off" />
          </label>
          <Button type="submit" variant="outline" disabled={busy || query.trim() === ""}>
            Find
          </Button>
        </div>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-small text-bad">
          {error}
        </p>
      ) : null}
      {matches !== null ? (
        <ul aria-label="Cells found" className="mt-3">
          {matches.length === 0 ? <li className="text-small text-ink-muted">No numeric cell matches. Check the sheet name and the cell, as in DCF!C42.</li> : null}
          {matches.map(({ row, why }) => {
            const key = cellKey(row.sheet, row.addr);
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule py-2">
                <span className="min-w-0">
                  <span className="block text-body text-ink">{row.sheetLabel ? sheetSays(row.sheetLabel) : "no label on the sheet"}</span>
                  <span className="font-mono text-mono-id text-ink-muted">{key}</span> <span className="text-data tabular-nums text-ink">{formatNumber(row.value, row.z)}</span>
                  {why ? <span className="block text-small text-ink-muted">{why}</span> : null}
                </span>
                {why ? null : (
                  <Button type="button" variant="outline" size="sm" onClick={() => onAdd(row, role)}>
                    Add {key}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </details>
  );
}
