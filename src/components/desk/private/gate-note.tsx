"use client";

import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { allowSentenceAction } from "@/modules/compliance/actions";
import type { BodyFlag } from "@/modules/compliance/client";
import { AllowanceForm } from "./allowance-form";
import { EDIT_EVENT } from "./edit-event";

// design-dna 13.2 gate notes, verbatim where the design fixed them.
function messageFor(flag: BodyFlag, named: boolean): string {
  const match = flag.match ?? "";
  if (flag.rule === "1") return `Rule 1, no actionable language: "${match}"${named ? " about a named company" : ""}. Rewrite it as a scenario range, or remove it.`;
  if (flag.rule === "2") return `Rule 2, no performance claims: "${match}". Rewrite it as what you expected and what happened, without a return figure. Rule 2 has no allowance; rewrite it.`;
  if (flag.rule === "3") return `Rule 3, 30-day lag: ${flag.message} Rule 3 has no allowance.`;
  return flag.message;
}

/** The advisory preview's note under a sentence. An allowance is offered only for a rule 1 sentence the gate has recorded. */
export function GateNote({ itemId, flag, named }: { itemId: string; flag: BodyFlag; named: boolean }) {
  return (
    <div className="my-2 border-l-2 border-bad bg-bad-wash p-3 text-body text-ink">
      <p>{messageFor(flag, named)}</p>
      {flag.rule === "1" ? (
        <p className="mt-1 text-small text-ink-muted">
          {flag.allowable
            ? `Rule 1 matched "${flag.match ?? ""}". The gate recorded this sentence, so if it explains your process rather than a view on the stock, you can allow this one sentence, with a reason.`
            : "Run the publishing gate; if it records this sentence under rule 1 you can then allow it with a reason."}
        </p>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => window.dispatchEvent(new CustomEvent(EDIT_EVENT, { detail: flag.sentence }))}>
        <PencilLine aria-hidden strokeWidth={1.5} />
        Edit sentence
      </Button>
      {flag.allowable ? <AllowanceForm action={allowSentenceAction.bind(null, itemId, flag.hash)} /> : null}
    </div>
  );
}
