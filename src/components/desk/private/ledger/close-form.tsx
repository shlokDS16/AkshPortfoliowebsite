"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TYPE_BUTTON, TYPE_CLOSE_LABEL, TYPE_COMPANY_LABEL, TYPE_DATE_LABEL, TYPE_INDEX_HINT, TYPE_INDEX_LABEL, TYPE_INTRO,
} from "@/lib/messages-closes";
import type { FormState } from "@/modules/ledger/actions";
import type { PickCompany } from "@/modules/ledger/client";
import { errorProps, FormError, Hint, SELECT } from "./fields";
import { useSealedForm } from "./use-sealed-form";

type Props = { companies: PickCompany[]; today: string; action: (previous: FormState, data: FormData) => Promise<FormState> };
const ERROR_ID = "close-form-error";

/**
 * Type a close for one company and one day. Stored as typed (the source is never a field: the database writes "typed by you")
 * and marked on every score that uses it. Controlled, so a refusal keeps everything typed; each refusal is tied to its field.
 */
export function CloseForm({ companies, today, action }: Props) {
  const { state, pending, ready, onSubmit } = useSealedForm(action);
  const [company, setCompany] = useState("");
  const [date, setDate] = useState("");
  const [close, setClose] = useState("");
  const [index, setIndex] = useState("");
  return (
    <form method="post" onSubmit={onSubmit} data-ready={ready ? "" : undefined} className="max-w-[44rem] space-y-4">
      <p className="max-w-[60ch] text-small text-ink-muted">{TYPE_INTRO}</p>
      {companies.length === 0 ? (
        <p className="text-small text-ink-muted">No company has an idea on file yet, so there is nothing to type a close for.</p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="close-company">{TYPE_COMPANY_LABEL}</Label>
        <select id="close-company" name="companyId" required value={company} onChange={(e) => setCompany(e.target.value)} className={SELECT} {...errorProps(state.error, "company", ERROR_ID)}>
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
      <div className="max-w-56 space-y-1">
        <Label htmlFor="close-date">{TYPE_DATE_LABEL}</Label>
        <Input id="close-date" name="date" type="date" max={today} required value={date} onChange={(e) => setDate(e.target.value)} {...errorProps(state.error, "date", ERROR_ID)} />
      </div>
      <div className="max-w-56 space-y-1">
        <Label htmlFor="close-price">{TYPE_CLOSE_LABEL}</Label>
        <Input id="close-price" name="close" inputMode="decimal" autoComplete="off" required value={close} onChange={(e) => setClose(e.target.value)} {...errorProps(state.error, "close", ERROR_ID)} />
      </div>
      <div className="max-w-56 space-y-1">
        <Label htmlFor="close-index">{TYPE_INDEX_LABEL}</Label>
        <Input id="close-index" name="indexClose" inputMode="decimal" autoComplete="off" value={index} onChange={(e) => setIndex(e.target.value)} aria-describedby="close-index-hint" />
        <Hint id="close-index-hint">{TYPE_INDEX_HINT}</Hint>
      </div>
      <FormError code={state.error} id={ERROR_ID} submitted={state} />
      <Button type="submit" disabled={!ready} aria-disabled={!ready || pending}>
        {pending ? "Storing..." : TYPE_BUTTON}
      </Button>
    </form>
  );
}
