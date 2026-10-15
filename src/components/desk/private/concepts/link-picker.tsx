"use client";

import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { PendingButton } from "../pending-button";

type Option = { id: string; name: string };
type Props = {
  conceptId: string;
  slug: string;
  options: readonly Option[];
  link: (conceptA: string, conceptB: string, slug: string) => Promise<void>;
};

/** "Link a concept": his own link from this concept to another screened one. A native select, so it is keyboard-complete as it stands. */
export function LinkPicker({ conceptId, slug, options, link }: Props) {
  const id = useId();
  const [value, setValue] = useState("");
  if (options.length === 0) return null;
  return (
    <form action={() => (value ? link(conceptId, value, slug) : Promise.resolve())} className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1 space-y-1">
        <Label htmlFor={id}>Link a concept</Label>
        <select
          id={id}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="block min-h-11 w-full rounded-sm border border-input bg-paper px-2 text-body text-ink"
        >
          <option value="">Choose a concept</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <PendingButton variant="outline">Link</PendingButton>
    </form>
  );
}
