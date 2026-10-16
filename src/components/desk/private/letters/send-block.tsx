import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SendState } from "@/modules/distribution";
import { PendingButton } from "../pending-button";
import { SendDialog } from "./send-dialog";

type Action = (formData: FormData) => Promise<void>;
type Props = {
  state: SendState;
  subject: string;
  confirmed: number;
  /** The approval for exactly this letter and revision (approveSendAction bound); null while no revision is published. */
  approve: Action | null;
  /** Withdraws the waiting approval (cancelSendAction bound); only given while the state is `approved`. */
  cancel: Action | null;
  /** One test copy to himself (sendTestCopyAction bound); null when it cannot be asked for. */
  testCopy: Action | null;
  testLine: string | null;
};

const TONE: Record<SendState["tone"], string> = {
  ok: "border-rule-strong text-ink",
  warn: "border-warn bg-warn-wash text-ink",
  bad: "border-bad bg-bad-wash text-ink",
  muted: "border-transparent px-0 text-ink-muted",
};

/**
 * What can be done about sending this letter (spec s8.1, s8.6), read from its `letter_sends` rows: one sentence of status, then only the
 * controls that state allows. The tone is a border and a wash on top of the sentence, never the only signal. Off, every control is replaced by
 * the off line. The buttons are the first door only: each action checks the admin again on the server, and the database checks the rest.
 */
export function SendBlock({ state, subject, confirmed, approve, cancel, testCopy, testLine }: Props) {
  const label = state.control === "again" ? "Approve again" : `Send to ${formatCount(confirmed, "subscriber")}`;
  return (
    <section aria-labelledby="send-heading" className="space-y-3">
      <h2 id="send-heading" className="text-subtitle text-ink">
        Send
      </h2>
      <p role="status" className={cn("rounded-sm border px-3 py-1.5 text-small", TONE[state.tone])}>
        {state.line}
      </p>
      {(state.control === "send" || state.control === "again") && approve ? (
        <div className="space-y-2">
          <SendDialog label={label} subject={subject} confirmed={confirmed} approve={approve} disabledWhy={state.disabledWhy} />
        </div>
      ) : null}
      {state.control === "cancel" && cancel ? (
        <form action={cancel}>
          <PendingButton variant="outline">Cancel this approval</PendingButton>
        </form>
      ) : null}
      {testCopy ? (
        <form action={testCopy} className="space-y-1">
          <PendingButton variant="outline">Send me a test copy</PendingButton>
        </form>
      ) : null}
      {testLine ? <p className="text-small text-ink-muted">{testLine}</p> : null}
    </section>
  );
}
