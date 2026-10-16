import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LETTERS_COPY } from "@/modules/distribution/public";

type Action = (formData: FormData) => Promise<void>;

/**
 * The confirm page's button. The link in the email carries only the token and a GET of it confirms nothing (mail scanners open links); this POST does.
 * The token travels in a hidden field, never in an address that the next page repeats.
 */
export function ConfirmForm({ action, token }: { action: Action; token: string }) {
  return (
    <form action={action} className="mt-4 max-w-(--measure) space-y-4">
      <p className="text-body text-ink-body">{LETTERS_COPY.confirmIntro}</p>
      <input type="hidden" name="token" value={token} />
      <button type="submit" className={cn(buttonVariants(), "w-full desk:w-auto")}>
        {LETTERS_COPY.confirmButton}
      </button>
    </form>
  );
}

/** Withdrawal as easy as giving: one field and one press, no sign-in. The answer is the same whether or not the address was on the list. */
export function LeaveForm({ action }: { action: Action }) {
  return (
    <form action={action} className="mt-4 max-w-(--measure) space-y-4">
      <p className="text-body text-ink-body">{LETTERS_COPY.leaveIntro}</p>
      <div className="space-y-1">
        <Label htmlFor="leave-email">{LETTERS_COPY.emailLabel}</Label>
        <Input id="leave-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={320} required />
      </div>
      <button type="submit" className={cn(buttonVariants(), "w-full desk:w-auto")}>
        {LETTERS_COPY.leaveButton}
      </button>
    </form>
  );
}
