"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clipWithEllipsis, formatDate } from "@/lib/format";
import { SECTORS } from "@/lib/sectors";
import type { NameToScreen } from "@/modules/catalog";

const QUOTE_MAX = 200;

type Props = { name: NameToScreen; action: (formData: FormData) => Promise<void> };

/** "Like a screener: say who each one is." One stub per card; choices post to decideNameAction (D24). */
export function NameCard({ name, action }: Props) {
  const [adding, setAdding] = useState(false);
  const id = useId();
  const noun = name.type === "company" ? "company" : "theme";
  return (
    <article className="rounded-sm border border-rule bg-paper p-4">
      <p className="text-label uppercase text-ink-muted">
        {noun} · first seen {formatDate(name.firstSeen)}
      </p>
      <p className="mt-1 font-mono text-subtitle text-ink">{name.token}</p>
      {name.quote ? <blockquote className="mt-1 text-small text-ink-muted">“{clipWithEllipsis(name.quote, QUOTE_MAX)}”</blockquote> : null}
      <form action={action} className="mt-3 space-y-2">
        {name.suggestion ? <input type="hidden" name="intoId" value={name.suggestion.id} /> : null}
        {adding ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input id={`${id}-name`} name="name" required />
            </div>
            {name.type === "company" ? (
              <div className="space-y-1">
                <Label htmlFor={`${id}-sector`}>Sector</Label>
                <select id={`${id}-sector`} name="sector" defaultValue="Capital goods" className="block min-h-11 w-full rounded-sm border border-input bg-paper px-2 text-body text-ink">
                  {SECTORS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <Button type="submit" name="kind" value="new">
              Yes, add it
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            {name.suggestion ? (
              <Button type="submit" name="kind" value="merge" variant="outline">
                Same as {name.suggestion.label}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setAdding(true)}>
              New {noun}
            </Button>
            <Button type="submit" name="kind" value="plain" variant="ghost">
              Not a {noun}, keep as text
            </Button>
          </div>
        )}
      </form>
    </article>
  );
}
