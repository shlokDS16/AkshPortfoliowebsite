import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCount } from "@/lib/format";
import { LETTERS_OFF_LINE } from "@/lib/providers";
import { CONFIRMATIONS_PER_DAY, type ReaderCounts, WAITING_CAP, type WaitingReader } from "@/modules/distribution";
import { PendingButton } from "../pending-button";
import { WaitingList } from "./waiting-list";

type Action = (formData: FormData) => Promise<void>;
type Props = {
  /** Letters are set up. */
  on: boolean;
  counts: ReaderCounts;
  /** Confirmation emails still allowed today. */
  left: number;
  /** Readers who stopped on the public leave page today (a typed address; the one place a stranger could remove someone else's). */
  leftToday: number;
  signupOn: boolean;
  /** The contact address for questions and complaints is set (the sign-up notice names it). */
  contactSet: boolean;
  waiting: WaitingReader[];
  actions: { sendConfirmations: Action; bin: Action; erase: Action; openSignup: Action; closeSignup: Action };
};

/** The sign-up form closes itself at this many confirmed readers (the free list holds 1,000; spec s11). */
const SIGNUP_CLOSES_AT = 950;
const H2 = "text-subtitle text-ink";

/**
 * /desk/letters/readers (spec s8.5): counts, the people still waiting for a confirmation email, and the controls. It shows what the desk needs and
 * no more: confirmed readers are a number, never a list, and there is no export. Off, the one off line replaces every control that could email.
 */
export function ReadersPanel({ on, counts, left, leftToday, signupOn, contactSet, waiting, actions }: Props) {
  const full = counts.confirmed >= SIGNUP_CLOSES_AT;
  const open = signupOn && !full;
  const goes = Math.min(waiting.length, left);
  return (
    <div className="space-y-(--block-gap)">
      {on ? null : <p className="rounded-sm border border-rule px-3 py-2 text-small text-ink">{LETTERS_OFF_LINE}</p>}
      <section aria-labelledby="counts-heading" className="space-y-1">
        <h2 id="counts-heading" className={H2}>
          Readers
        </h2>
        <p className="text-title text-ink tabular-nums desk:text-title-desk">{formatCount(counts.confirmed, "reader")}</p>
        <p className="text-small text-ink-muted tabular-nums">Waiting: {counts.waiting}</p>
        <p className="text-small text-ink-muted tabular-nums">Asked to confirm: {counts.asked}</p>
        {leftToday > 0 ? <p className="text-small text-ink-muted tabular-nums">Stopped on this page today: {leftToday}</p> : null}
        {counts.waiting >= WAITING_CAP ? (
          <p className="text-small text-ink">{`${WAITING_CAP} requests are waiting. New requests are not kept until you send confirmations or bin some.`}</p>
        ) : null}
        {full ? <p className="text-small text-ink">{`The list has ${counts.confirmed} readers, the free limit is 1,000. New sign-ups are closed.`}</p> : null}
      </section>

      <section aria-labelledby="signup-heading" className="space-y-2">
        <h2 id="signup-heading" className={H2}>
          Sign-ups
        </h2>
        <p role="status" className="text-small text-ink">
          {open ? "Sign-ups open" : "Sign-ups closed"}
        </p>
        {signupOn && !on ? <p className="text-small text-ink">Sign-ups are open, but email is not set up. Close them, or set email up.</p> : null}
        {signupOn && on && !contactSet ? (
          <p className="text-small text-ink">Sign-ups are open, but the contact address for questions and complaints is not set. Close them, or set it.</p>
        ) : null}
        {signupOn ? (
          <form action={actions.closeSignup}>
            <PendingButton variant="outline">Close sign-ups</PendingButton>
          </form>
        ) : on && !full ? (
          <form action={actions.openSignup}>
            <PendingButton variant="outline">Open sign-ups</PendingButton>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="confirm-heading" className="space-y-2">
        <h2 id="confirm-heading" className={H2}>
          Confirmation emails
        </h2>
        {!on || waiting.length === 0 ? null : left === 0 ? (
          <p className="text-small text-ink">{`${CONFIRMATIONS_PER_DAY} confirmation emails sent today. The rest can go tomorrow.`}</p>
        ) : (
          <form action={actions.sendConfirmations} className="space-y-1">
            <PendingButton>{`Send confirmation emails (${goes})`}</PendingButton>
            <p className="text-small text-ink-muted tabular-nums">{`${left} of ${CONFIRMATIONS_PER_DAY} left today.`}</p>
          </form>
        )}
        <WaitingList waiting={waiting} bin={actions.bin} />
      </section>

      <section aria-labelledby="erase-heading" className="space-y-2">
        <h2 id="erase-heading" className={H2}>
          Erase an address
        </h2>
        <form action={actions.erase} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor="erase-email">Email address to erase</Label>
            <Input id="erase-email" name="email" type="email" required autoComplete="off" />
          </div>
          <Button type="submit" variant="outline">
            Erase
          </Button>
        </form>
        <p className="text-small text-ink-muted">For a request that came by email. The address is deleted, and the answer is the same whether or not it was on the list.</p>
      </section>
    </div>
  );
}
