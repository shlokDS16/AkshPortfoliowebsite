"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { cellKey, formatNumber, MAX_LABEL_CHARS, type ConfirmRow as Row } from "@/modules/valuation/client";
import { reasonText, sheetSays, usedIn } from "./copy";

// One suggested cell in the confirm list (spec s7.2): the sheet's label marked as the sheet's, the value as Excel shows it, sheet!cell,
// a tick, and, once ticked, an empty label field for his own words (the placeholder shows the sheet's label; it is never pre-filled, D11).

type Props = {
  row: Row;
  checked: boolean;
  label: string;
  carriedFrom: number | null;
  onCheck: (checked: boolean) => void;
  onLabel: (text: string) => void;
};

export function ConfirmRowView({ row, checked, label, carriedFrom, onCheck, onLabel }: Props) {
  const key = cellKey(row.sheet, row.addr);
  const id = `cell-${key.replace(/[^A-Za-z0-9]/g, "-")}`;
  const blocked = row.blocked;
  return (
    <li className={cn("border-b border-rule py-3", blocked && "text-ink-muted")}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-ink disabled:opacity-45"
          checked={checked}
          disabled={blocked !== null}
          aria-describedby={blocked ? `${id}-why` : undefined}
          onChange={(e) => onCheck(e.target.checked)}
          aria-label={row.sheetLabel ? `${key}, ${sheetSays(row.sheetLabel)}` : key}
        />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className={cn("break-words text-body", blocked ? "text-ink-muted" : "text-ink")}>{row.sheetLabel ? sheetSays(row.sheetLabel) : "no label on the sheet"}</span>
            <span className="text-data tabular-nums text-ink desk:text-data-desk">{formatNumber(row.value, row.z)}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-mono-id text-ink-muted">{key}</span>
            {row.carried && carriedFrom !== null ? <span className="rounded-sm border border-rule-strong px-1.5 py-0.5 font-mono text-mono-tag text-ink">{usedIn(carriedFrom)}</span> : null}
          </span>
        </label>
      </div>
      {blocked ? (
        <p id={`${id}-why`} className="mt-1 pl-8 text-small">
          Cannot be chosen: {reasonText(blocked)}.
        </p>
      ) : null}
      {checked && !blocked ? (
        <div className="mt-2 pl-8">
          <Input
            aria-label={`Your label for ${key} (optional)`}
            placeholder={row.sheetLabel ?? ""}
            maxLength={MAX_LABEL_CHARS}
            value={label}
            onChange={(e) => onLabel(e.target.value)}
          />
        </div>
      ) : null}
    </li>
  );
}
