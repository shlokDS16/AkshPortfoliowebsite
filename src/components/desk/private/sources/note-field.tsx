"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STUDIED_NOTE_MAX } from "@/modules/sources/client";
import { cn } from "@/lib/utils";

type Props = { name: string; defaultValue: string; privateNote: string };

/**
 * "What readers see from me" for one source (spec s6.5): his words for the public file, 500 characters at most. It starts from what the revision
 * holds. His private note is copied in only when he presses "Use my private note": nothing private becomes public by a tick alone, and the
 * words are his from then on (the machine never writes here). Over the limit is said, not cut; the server refuses it in a fixed sentence.
 */
export function NoteField({ name, defaultValue, privateNote }: Props) {
  const uid = useId();
  const [value, setValue] = useState(defaultValue);
  const over = value.length > STUDIED_NOTE_MAX;
  return (
    <div className="space-y-1">
      <Label htmlFor={uid}>What readers see from me</Label>
      <Textarea id={uid} name={name} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={over || undefined} className="min-h-20" />
      <div className="flex flex-wrap items-center gap-x-4">
        <p aria-live="polite" className={cn("font-mono text-mono-tag tabular-nums", over ? "text-bad" : "text-ink-muted")}>
          {value.length} of {STUDIED_NOTE_MAX}
        </p>
        {privateNote !== "" ? (
          <Button type="button" variant="link" size="sm" onClick={() => setValue(privateNote)}>
            Use my private note
          </Button>
        ) : null}
      </div>
    </div>
  );
}
