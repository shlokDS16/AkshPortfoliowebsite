"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-describedby="publish-reason">
      {pending ? "Running the gate…" : label}
    </Button>
  );
}

type Rule4 = { company: string; checked: boolean; onChange(checked: boolean): void };
type Props = { action: (formData: FormData) => Promise<void>; label: string; summary: string; rule4: Rule4 | null };

/** Sticky on phone. Never disabled by the preview (R8): the database gate decides and records. */
export function PublishBar({ action, label, summary, rule4 }: Props) {
  return (
    <form action={action} className="sticky bottom-(--tab-bar-h) z-(--z-tab-bar) -mx-(--gutter) border-t border-rule bg-paper px-(--gutter) py-3 desk:static desk:mx-0 desk:px-0">
      {rule4 ? (
        <label className="mb-2 flex min-h-11 items-start gap-3 text-small text-ink">
          <input type="checkbox" name="rule4" checked={rule4.checked} onChange={(e) => rule4.onChange(e.target.checked)} className="mt-0.5 size-[18px] accent-ink" />
          <span>I have not changed my stance on {rule4.company} in my private notes in the last 30 days.</span>
        </label>
      ) : null}
      <Submit label={label} />
      <p id="publish-reason" className="mt-1 text-small text-ink-muted">
        {summary}
      </p>
    </form>
  );
}
