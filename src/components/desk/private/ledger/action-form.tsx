"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTION_BUTTON, ACTION_COMPANY_LABEL, ACTION_CORRECT_BUTTON, ACTION_CORRECTING_TEXT, ACTION_DATE_LABEL, ACTION_FACTOR_HINT, ACTION_FACTOR_LABEL,
  ACTION_KIND_LABEL, ACTION_KIND_TEXT, ACTION_NOTE_LABEL,
} from "@/lib/messages-closes";
import type { FormState } from "@/modules/ledger/actions";
import { ACTION_KINDS, type ActionKind, type PickCompany } from "@/modules/ledger/client";
import { errorProps, FormError, Hint, RadioGroup, SELECT } from "./fields";
import { useSealedForm } from "./use-sealed-form";

/** An entry being corrected: the new entry starts from it and replaces it. */
export type Correcting = { id: string; companyId: string; kind: ActionKind; exDate: string; factor: number; note: string | null };

type Props = { companies: PickCompany[]; action: (previous: FormState, data: FormData) => Promise<FormState>; correcting?: Correcting | null };
const ERROR_ID = "action-form-error";
const KINDS = ACTION_KINDS.map((k) => ({ value: k, label: ACTION_KIND_TEXT[k] }));

/**
 * Enter a corporate action, or a correction of one. There is no edit and no removal: a correction is a new entry that names the
 * one it replaces (`supersedes`), and the earlier one stays listed. A company cannot be changed while correcting. Controlled.
 */
export function ActionForm({ companies, action, correcting = null }: Props) {
  const { state, pending, ready, onSubmit } = useSealedForm(action);
  const [company, setCompany] = useState(correcting?.companyId ?? "");
  const [kind, setKind] = useState<string>(correcting?.kind ?? "");
  const [exDate, setExDate] = useState(correcting?.exDate ?? "");
  const [factor, setFactor] = useState(correcting && correcting.kind !== "none" ? String(correcting.factor) : "");
  const [note, setNote] = useState(correcting?.note ?? "");
  const fixed = correcting ? companies.find((c) => c.id === correcting.companyId) : undefined;
  return (
    <form id="action-form" method="post" onSubmit={onSubmit} data-ready={ready ? "" : undefined} className="max-w-[44rem] space-y-4">
      {correcting ? <input type="hidden" name="supersedes" value={correcting.id} /> : null}
      {correcting ? <p className="text-small text-ink-body" data-testid="correcting">{ACTION_CORRECTING_TEXT}</p> : null}
      {fixed ? (
        <>
          <input type="hidden" name="companyId" value={fixed.id} />
          <p className="text-small text-ink-body">
            {ACTION_COMPANY_LABEL}: {fixed.name} ({fixed.symbol})
          </p>
        </>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="action-company">{ACTION_COMPANY_LABEL}</Label>
          <select id="action-company" name="companyId" required value={company} onChange={(e) => setCompany(e.target.value)} className={SELECT} {...errorProps(state.error, "company", ERROR_ID)}>
            <option value="" disabled>
              Choose a company
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.symbol})
              </option>
            ))}
          </select>
        </div>
      )}
      <RadioGroup legend={ACTION_KIND_LABEL} name="kind" value={kind} onChange={setKind} options={KINDS} />
      <div className="max-w-56 space-y-1">
        <Label htmlFor="action-date">{ACTION_DATE_LABEL}</Label>
        <Input id="action-date" name="exDate" type="date" required value={exDate} onChange={(e) => setExDate(e.target.value)} {...errorProps(state.error, "date", ERROR_ID)} />
      </div>
      {kind !== "none" ? (
        <div className="max-w-56 space-y-1">
          <Label htmlFor="action-factor">{ACTION_FACTOR_LABEL}</Label>
          <Input
            id="action-factor"
            name="factor"
            inputMode="decimal"
            autoComplete="off"
            required
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
            {...errorProps(state.error, "factor", ERROR_ID, "action-factor-hint")}
          />
          <Hint id="action-factor-hint">{ACTION_FACTOR_HINT}</Hint>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="action-note">{ACTION_NOTE_LABEL}</Label>
        <Textarea id="action-note" name="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} {...errorProps(state.error, "note", ERROR_ID)} />
      </div>
      <FormError code={state.error} id={ERROR_ID} submitted={state} />
      <Button type="submit" disabled={!ready} aria-disabled={!ready || pending}>
        {pending ? "Entering..." : correcting ? ACTION_CORRECT_BUTTON : ACTION_BUTTON}
      </Button>
    </form>
  );
}
