import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LETTERS_COPY, LETTERS_NOTICE } from "@/modules/distribution/public";

type Props = {
  /** The page's server action (a plain form post; the page adds no script). */
  action: (formData: FormData) => Promise<void>;
  /** The render-time ticket (lib/letters-form): the action accepts a submit only if it is genuine and at least 3 seconds old. */
  ticket: string;
};

/**
 * The sign-up (spec s8.5): the notice first, then one email field, the required "18 or older" tick, a trap field no person sees, and the button.
 * No address is put in a URL; the answer to every post is the same sentence (the page shows it after the redirect). Its words are public.ts's.
 */
export function SignupForm({ action, ticket }: Props) {
  return (
    <form action={action} className="relative mt-3 max-w-(--measure) space-y-4">
      <p id="signup-notice" data-lint-exclude className="text-small text-ink-muted">
        {LETTERS_NOTICE}
      </p>
      <input type="hidden" name="ticket" value={ticket} />
      <div className="space-y-1">
        <Label htmlFor="signup-email">{LETTERS_COPY.emailLabel}</Label>
        <Input id="signup-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={320} required aria-describedby="signup-notice" />
      </div>
      <label htmlFor="signup-adult" className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink">
        <input id="signup-adult" name="adult" type="checkbox" required className="size-5 shrink-0 accent-ink" />
        {LETTERS_COPY.adultLabel}
      </label>
      <Trap />
      <button type="submit" className={cn(buttonVariants(), "w-full desk:w-auto")}>
        {LETTERS_COPY.ask}
      </button>
    </form>
  );
}

/** The honeypot: off the page, out of the tab order and hidden from assistive technology. A person never fills it; a script that fills every field does. */
function Trap() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label htmlFor="signup-website">{LETTERS_COPY.honeypotLabel}</label>
      <input id="signup-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}
