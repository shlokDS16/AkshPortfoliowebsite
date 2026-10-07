import { Info, TriangleAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PendingButton } from "./pending-button";

type Tone = "bad" | "warn" | "neutral";
type Base = { tone: Tone; stateWord: string; title: string; body: string };
type Props = Base &
  (
    | { /** A link to where the problem is fixed. */ action?: { label: string; href: string }; form?: never }
    | { /** A button that runs a server action (File it now). */ form?: { label: string; action: () => Promise<void> }; action?: never }
  );

const RULE: Record<Tone, string> = { bad: "border-l-bad", warn: "border-l-warn", neutral: "border-l-ink-muted" };
const WORD: Record<Tone, string> = { bad: "text-bad", warn: "text-warn", neutral: "text-ink-muted" };
const ICON = { bad: TriangleAlert, warn: Info, neutral: WifiOff } as const;

/** One card per problem, one action each. "Publish stopped" links to the editor; there is no override. */
export function NeedsYouCard({ tone, stateWord, title, body, action, form }: Props) {
  const Icon = ICON[tone];
  return (
    <article className={cn("rounded-sm border border-l-4 border-rule bg-paper p-4", RULE[tone])}>
      <p className={cn("inline-flex items-center gap-1.5 font-mono text-mono-label uppercase", WORD[tone])}>
        <Icon aria-hidden strokeWidth={1.5} className="size-4" />
        {stateWord}
      </p>
      <h3 className="mt-1 text-subtitle text-ink">{title}</h3>
      <p className="mt-1 text-body text-ink-body">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-3 inline-flex min-h-11 items-center rounded-sm bg-ink px-4 text-body font-medium text-paper no-underline transition-transform duration-(--motion-fast) ease-snap active:scale-(--press-scale)"
        >
          {action.label}
        </Link>
      ) : null}
      {form ? (
        <form action={form.action} className="mt-3">
          <PendingButton>{form.label}</PendingButton>
        </form>
      ) : null}
    </article>
  );
}
