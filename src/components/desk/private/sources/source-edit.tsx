"use client";

import { useActionState, useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorText } from "@/lib/messages";
import { MAX_SOURCE_COMPANIES, MAX_SOURCE_CONCEPTS, NOTE_MAX } from "@/modules/sources/client";
import { PendingButton } from "../pending-button";
import { AttachPicker, type AttachOption } from "./attach-picker";

type Result = { ok: true; id: string; answer: string } | { ok: false; error: string };
type Props = {
  note: string;
  action: (formData: FormData) => Promise<Result>;
  companies: readonly AttachOption[];
  concepts: readonly AttachOption[];
  attached: { companyIds: readonly string[]; themeIds: readonly string[] };
};

/**
 * The card's "Edit note and attachments": his note and the companies and concepts, saved together as exactly what the form holds. The form carries
 * nothing of the machine's: no title, no picture, no hash.
 */
export function SourceEdit({ note, action, companies, concepts, attached }: Props) {
  const uid = useId();
  const [text, setText] = useState(note);
  const [result, run] = useActionState<Result | null, FormData>(async (_previous, formData) => action(formData), null);
  return (
    <details className="rounded-sm border border-rule">
      <summary className="inline-flex min-h-11 w-full cursor-pointer items-center px-3 text-small text-ink underline decoration-1 underline-offset-3 desk:min-h-8">
        Edit note and attachments
      </summary>
      <form action={run} className="space-y-4 border-t border-rule p-3">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-note`}>My note</Label>
          <Textarea id={`${uid}-note`} name="note" maxLength={NOTE_MAX} className="min-h-20" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <AttachPicker name="companyId" label="Companies" noun="company" options={companies} initial={attached.companyIds} max={MAX_SOURCE_COMPANIES} />
        <AttachPicker name="themeId" label="Concepts" noun="concept" options={concepts} initial={attached.themeIds} max={MAX_SOURCE_CONCEPTS} />
        <PendingButton size="sm">Save changes</PendingButton>
        {result && !result.ok ? (
          <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
            {errorText(result.error)}
          </p>
        ) : null}
      </form>
    </details>
  );
}
