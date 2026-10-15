import Link from "next/link";
import { formatDate } from "@/lib/format";
import { errorText } from "@/lib/messages";
import type { CaseState } from "@/modules/cases/client";
import { PendingButton } from "../pending-button";

type Props = {
  /** Null when the state could not be read. */
  state: CaseState | null;
  /** Whether the site owner has case studies switched on, as the database reads it. */
  reveal: boolean;
  draftAction: (formData: FormData) => Promise<void>;
};

/** The "Case study" block of a closed idea (spec s33.8). Open and withdrawn ideas get none. Drafting is idempotent and the button disables itself while it runs. */
export function IdeaCaseBlock({ state, reveal, draftAction }: Props) {
  if (state && (state.state === "not_closed" || state.state === "void")) return null;
  return (
    <section aria-labelledby="case-h" id="case-study" className="space-y-2">
      <h2 id="case-h" className="text-title text-ink desk:text-title-desk">
        Case study
      </h2>
      {state === null ? <p className="text-body text-ink-body">Whether a case study can be drafted could not be read just now.</p> : null}
      {state?.state === "no_lesson" ? <p className="text-body text-ink-body">{errorText("case-no-lesson")}</p> : null}
      {state?.state === "exit_pending" ? <p className="text-body text-ink-body">{errorText("case-exit-pending")}</p> : null}
      {state?.state === "ready" ? (
        <form action={draftAction} className="space-y-2">
          <p className="max-w-[60ch] text-body text-ink-body">
            It can be published from {formatDate(state.earliest)} at the earliest, and only while the site owner has case studies switched on (now{" "}
            {reveal ? "on" : "off"}).
          </p>
          <PendingButton>Draft a case study</PendingButton>
        </form>
      ) : null}
      {state?.state === "draft" || state?.state === "public" ? (
        <p className="text-body text-ink-body">
          <span>{`Case study: ${state.state}.`}</span>{" "}
          <Link href={`/desk/items/${state.itemId}`} className="underline decoration-1 underline-offset-3">
            Open it
          </Link>
        </p>
      ) : null}
    </section>
  );
}
