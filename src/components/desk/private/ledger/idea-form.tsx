"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/modules/ledger/actions";
import { HORIZON_CHOICES, LEDGER_EXPECTS_TEXT, LEDGER_SEALED_WARNING, type PickCompany } from "@/modules/ledger/client";
import { WordingGuide } from "../wording-guide";
import { FormError, Hint, RadioGroup, SELECT } from "./fields";
import { useSealedForm } from "./use-sealed-form";

type Props = { companies: PickCompany[]; action: (previous: FormState, data: FormData) => Promise<FormState>; companyId?: string; itemId?: string };

const HORIZONS = [...HORIZON_CHOICES.map((c) => ({ value: String(c.days), label: c.label })), { value: "other", label: "A number of days" }];
const EXPECTS = [
  { value: "outperform", label: LEDGER_EXPECTS_TEXT.outperform },
  { value: "underperform", label: LEDGER_EXPECTS_TEXT.underperform },
];

/** Why a company cannot be picked yet. Anything else is pickable. */
const unavailable = (c: PickCompany): string | null => (c.needsReview ? "waiting for review" : c.symbol ? null : "no NSE symbol yet");

/**
 * "New idea": one form, one submit (spec s4). Every field is controlled, so a refusal leaves exactly what was typed and chosen
 * (React resets an uncontrolled form after its action). There is no date: the desk sets it when the entry is sealed.
 */
export function IdeaForm({ companies, action, companyId = "", itemId }: Props) {
  const { state, pending, ready, onSubmit } = useSealedForm(action);
  const [company, setCompany] = useState(companies.some((c) => c.id === companyId && !unavailable(c)) ? companyId : "");
  const [expects, setExpects] = useState("");
  const [horizon, setHorizon] = useState("");
  const [days, setDays] = useState("");
  const [held, setHeld] = useState("");
  const [body, setBody] = useState("");
  const pickable = companies.filter((c) => !unavailable(c));
  const blocked = companies.filter((c) => unavailable(c));
  return (
    <form method="post" onSubmit={onSubmit} data-ready={ready ? "" : undefined} className="grid gap-6 desk:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        {itemId ? <input type="hidden" name="itemId" value={itemId} /> : null}
        <div className="space-y-1">
          <Label htmlFor="idea-company">Company</Label>
          <select id="idea-company" name="companyId" required value={company} onChange={(e) => setCompany(e.target.value)} className={SELECT}>
            <option value="" disabled>
              Choose a company
            </option>
            {pickable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.symbol})
              </option>
            ))}
            {blocked.map((c) => (
              <option key={c.id} value={c.id} disabled>
                {c.name}: {unavailable(c)}
              </option>
            ))}
          </select>
          {blocked.length > 0 ? (
            <Hint>
              Companies that cannot be picked yet are listed but disabled. Add a symbol or settle a name under{" "}
              <Link href="/desk/names" className="underline decoration-1 underline-offset-3">Names</Link>.
            </Hint>
          ) : null}
        </div>
        <RadioGroup legend="What do you expect?" name="expects" value={expects} onChange={setExpects} options={EXPECTS} />
        <div>
          <RadioGroup legend="Over what horizon?" name="horizon" value={horizon} onChange={setHorizon} options={HORIZONS} />
          {horizon === "other" ? (
            <div className="mt-1 max-w-48 space-y-1">
              <Label htmlFor="idea-days">Days (30 to 3650)</Label>
              <Input id="idea-days" name="horizonOther" inputMode="numeric" required value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
          ) : null}
        </div>
        <RadioGroup
          legend="Do you hold it?"
          name="held"
          value={held}
          onChange={setHeld}
          options={[{ value: "yes", label: "Yes, I hold a position" }, { value: "no", label: "No, I do not hold it" }]}
        />
        <div className="space-y-1">
          <Label htmlFor="idea-body">Why do you think so, and what would prove you wrong?</Label>
          <Textarea
            id="idea-body"
            name="bodyMd"
            required
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-describedby="idea-body-hint"
          />
          <Hint id="idea-body-hint">{LEDGER_SEALED_WARNING}</Hint>
        </div>
        <FormError code={state.error} id="idea-form-error" />
        <Button type="submit" disabled={!ready || pending} aria-disabled={!ready || pending}>
          {pending ? "Recording..." : "Record the idea"}
        </Button>
      </div>
      <aside aria-label="Wording">
        <WordingGuide />
      </aside>
    </form>
  );
}
