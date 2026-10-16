import { KIND_LABEL, POSITION_LABEL, POSITION_WORD, type Candidate } from "@/modules/distribution";
import { PendingButton } from "../pending-button";

type Props = { candidates: Candidate[]; total: number; action: (formData: FormData) => Promise<void> };

/**
 * /desk/letters/new (spec s8.1 step 2): every public change since the last letter, each ticked. His title and his reason are shown as text, copied
 * from the page; the machine's line is set apart in its own face. Unticking is the only edit. It is a plain form: the ticks work without a script.
 */
export function CandidatePicker({ candidates, total, action }: Props) {
  if (candidates.length === 0) return <p className="text-small text-ink-muted">Nothing new since your last letter.</p>;
  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-small text-ink-muted">Changes since your last letter. Take off any you do not want in this one.</legend>
        {total > candidates.length ? <p className="text-small text-ink">{`Showing ${candidates.length} of ${total}. The rest wait for the next letter.`}</p> : null}
        <ul className="divide-y divide-rule">
          {candidates.map((c) => (
            <li key={c.revisionId}>
              <label className="flex min-h-11 items-start gap-3 py-(--row-y)">
                <input type="checkbox" name="revision" value={c.revisionId} defaultChecked className="mt-1 size-[18px] shrink-0 accent-ink" />
                <span className="min-w-0 space-y-1">
                  <span className="block font-mono text-mono-label uppercase tabular-nums text-geru">{KIND_LABEL[c.kind]}</span>
                  <span className="block break-words text-subtitle text-ink">{c.title}</span>
                  {c.changeReason === null ? null : <span className="block break-words text-small text-ink-body">{`“${c.changeReason}”`}</span>}
                  <span data-machine className="block break-words font-mono text-mono-tag tabular-nums text-ink-muted">
                    {c.detail}
                  </span>
                  {c.companyName === null ? null : (
                    <span className="block text-small text-ink-muted">{`${POSITION_LABEL}: ${POSITION_WORD[c.holdsPosition ?? "not_disclosed"]}`}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <PendingButton>Make this letter</PendingButton>
    </form>
  );
}
