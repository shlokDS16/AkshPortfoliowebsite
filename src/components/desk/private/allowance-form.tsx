"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Rule 1 only: allow this exact sentence, with a reason saved in the gate decision. Never a rule override. */
export function AllowanceForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const reason = new FormData(e.currentTarget).get("reason");
        if (typeof reason !== "string" || reason.trim().length < 3) {
          e.preventDefault();
          setError("Add a reason first.");
        }
      }}
      className="mt-2 space-y-2"
    >
      <label htmlFor={id} className="block text-small text-ink-muted">
        Reason, saved with the gate decision (required)
      </label>
      <Input id={id} name="reason" aria-invalid={error ? true : undefined} aria-describedby={`${id}-help`} />
      {error ? (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      ) : null}
      <p id={`${id}-help`} className="text-caption text-ink-muted">
        Covers this exact sentence only; editing it runs the check again. Only rule 1 sentences can be allowed; no other rule has an allowance.
      </p>
      <Button type="submit" variant="outline" size="sm">
        Allow this sentence
      </Button>
    </form>
  );
}
