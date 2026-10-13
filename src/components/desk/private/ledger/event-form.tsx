"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/modules/ledger/actions";
import {
  CLOSE_REASONS, HORIZON_CHOICES, LEDGER_ACTION_TEXT, LEDGER_CLOSE_HINT, LEDGER_CLOSE_REASON_TEXT, LEDGER_PROCESS_TEXT, LEDGER_SEALED_WARNING,
  LEDGER_SUBMIT_TEXT, LEDGER_TAG_TEXT, LEDGER_WORDS_LABEL, MISTAKE_TAGS, PROCESS_CALLS, voidHintText, type AddKind,
} from "@/modules/ledger/client";
import { FormError, Hint, RadioGroup, SELECT } from "./fields";
import { useSealedForm } from "./use-sealed-form";

type Props = { ideaId: string; allowed: AddKind[]; voidUntil: string | null; action: (previous: FormState, data: FormData) => Promise<FormState> };

const HORIZONS = [
  { value: "keep", label: "Keep the horizon as it is" },
  ...HORIZON_CHOICES.map((c) => ({ value: String(c.days), label: c.label })),
  { value: "other", label: "A number of days" },
];
const YES_NO = [
  { value: "yes", label: "Yes, I still hold some" },
  { value: "no", label: "No, I hold none now" },
];

/**
 * One action form at a time: pick what to add, fill its few fields, one button. Controlled, so a refusal keeps every field.
 * The page remounts it (a new `key`) after an entry is saved. No date field: the desk sets the date when the entry is sealed.
 */
export function EventForm({ ideaId, allowed, voidUntil, action }: Props) {
  const { state, pending, ready, onSubmit } = useSealedForm(action);
  const [kind, setKind] = useState<AddKind>(allowed[0] ?? "note");
  const [body, setBody] = useState("");
  const [horizon, setHorizon] = useState("keep");
  const [days, setDays] = useState("");
  const [held, setHeld] = useState("");
  const [reason, setReason] = useState("");
  const [process, setProcess] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  if (allowed.length === 0) return <p className="text-small text-ink-muted">This idea was withdrawn, so nothing more can be added to it.</p>;
  return (
    <form method="post" onSubmit={onSubmit} data-ready={ready ? "" : undefined} className="max-w-[44rem] space-y-4">
      <input type="hidden" name="ideaId" value={ideaId} />
      <div className="space-y-1">
        <Label htmlFor="event-kind">What do you want to add?</Label>
        <select id="event-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as AddKind)} className={SELECT}>
          {allowed.map((k) => (
            <option key={k} value={k}>
              {LEDGER_ACTION_TEXT[k]}
            </option>
          ))}
        </select>
      </div>
      {kind === "revise" ? (
        <div>
          <RadioGroup legend="Horizon" name="horizon" value={horizon} onChange={setHorizon} options={HORIZONS} />
          {horizon === "other" ? (
            <div className="mt-1 max-w-48 space-y-1">
              <Label htmlFor="event-days">Days (30 to 3650)</Label>
              <Input id="event-days" name="horizonOther" inputMode="numeric" required value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
          ) : null}
        </div>
      ) : null}
      {kind === "downsize" ? <RadioGroup legend="Do you still hold some?" name="held" value={held} onChange={setHeld} options={YES_NO} /> : null}
      {kind === "close" ? (
        <div className="space-y-1">
          <Label htmlFor="event-reason">Reason</Label>
          <select id="event-reason" name="reason" required value={reason} onChange={(e) => setReason(e.target.value)} className={SELECT}>
            <option value="" disabled>
              Choose a reason
            </option>
            {CLOSE_REASONS.map((r) => (
              <option key={r} value={r}>
                {LEDGER_CLOSE_REASON_TEXT[r]}
              </option>
            ))}
          </select>
          <Hint>{LEDGER_CLOSE_HINT}</Hint>
        </div>
      ) : null}
      {kind === "review" ? (
        <>
          <RadioGroup
            legend="Was the process sound?"
            name="process"
            value={process}
            onChange={setProcess}
            options={PROCESS_CALLS.map((p) => ({ value: p, label: LEDGER_PROCESS_TEXT[p] }))}
          />
          <fieldset className="space-y-1">
            <legend className="text-small text-ink-muted desk:text-small-desk">What kind of mistake, if any? Choose at least one.</legend>
            <div className="grid grid-cols-2 gap-x-3">
              {MISTAKE_TAGS.map((t) => (
                <label key={t} className="flex min-h-11 items-center gap-2 text-body text-ink">
                  <input
                    type="checkbox"
                    name="tags"
                    value={t}
                    checked={tags.includes(t)}
                    onChange={(e) => setTags(e.target.checked ? [...tags, t] : tags.filter((x) => x !== t))}
                    className="size-5 accent-ink"
                  />
                  {LEDGER_TAG_TEXT[t]}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}
      {kind === "void" && voidUntil ? <Hint>{voidHintText(voidUntil)}</Hint> : null}
      <div className="space-y-1">
        <Label htmlFor="event-body">{LEDGER_WORDS_LABEL[kind]}</Label>
        <Textarea id="event-body" name="bodyMd" required rows={5} value={body} onChange={(e) => setBody(e.target.value)} aria-describedby="event-body-hint" />
        <Hint id="event-body-hint">{LEDGER_SEALED_WARNING}</Hint>
      </div>
      <FormError code={state.error} id="event-form-error" />
      <Button type="submit" disabled={!ready || pending} aria-disabled={!ready || pending}>
        {pending ? "Saving..." : LEDGER_SUBMIT_TEXT[kind]}
      </Button>
    </form>
  );
}
