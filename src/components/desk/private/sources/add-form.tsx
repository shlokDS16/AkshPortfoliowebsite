"use client";

import { useActionState, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorText } from "@/lib/messages";
import { MAX_SOURCE_COMPANIES, MAX_SOURCE_CONCEPTS, NOTE_MAX } from "@/modules/sources/client";
import { PendingButton } from "../pending-button";
import { AttachPicker, type AttachOption } from "./attach-picker";

type Result = { ok: true; id: string; answer: string } | { ok: false; error: string };
type Props = { action: (formData: FormData) => Promise<Result>; companies: readonly AttachOption[]; concepts: readonly AttachOption[] };

/**
 * "Add a source" (spec s6.5): paste a link, attach it to companies and concepts, write his note, one press. The same filing as the capture box's
 * s: line, so the answer is the same sentence. The form empties on a save and keeps what he typed on a refusal.
 */
export function AddForm({ action, companies, concepts }: Props) {
  const uid = useId();
  // Controlled, so a refusal keeps what he typed (a React 19 form action empties an uncontrolled form once it has run).
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(0);
  const [result, run] = useActionState<Result | null, FormData>(async (_previous, formData) => {
    const answer = await action(formData);
    if (answer.ok) {
      setUrl("");
      setNote("");
      setFresh((n) => n + 1); // new pickers, nothing chosen
    }
    return answer;
  }, null);
  return (
    <section aria-labelledby={`${uid}-h`} className="space-y-3">
      <h2 id={`${uid}-h`} className="text-subtitle text-ink desk:text-subtitle-desk">
        Add a source
      </h2>
      <form key={fresh} action={run} className="space-y-4 rounded-sm border border-rule p-3">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-url`}>Link</Label>
          <Input id={`${uid}-url`} name="url" required inputMode="url" autoComplete="off" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-note`}>My note</Label>
          <Textarea id={`${uid}-note`} name="note" maxLength={NOTE_MAX} className="min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="text-caption text-ink-muted">Your words. Private until you put a source on a public file.</p>
        </div>
        <div className="grid gap-4 desk:grid-cols-2">
          <AttachPicker name="companyId" label="Companies" noun="company" options={companies} initial={[]} max={MAX_SOURCE_COMPANIES} />
          <AttachPicker name="themeId" label="Concepts" noun="concept" options={concepts} initial={[]} max={MAX_SOURCE_CONCEPTS} />
        </div>
        <PendingButton>Save source</PendingButton>
      </form>
      {result?.ok ? (
        <p role="status" className="rounded-sm border border-rule px-3 py-2 text-small text-ink">
          {result.answer}
        </p>
      ) : null}
      {result && !result.ok ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {errorText(result.error)}
        </p>
      ) : null}
    </section>
  );
}
