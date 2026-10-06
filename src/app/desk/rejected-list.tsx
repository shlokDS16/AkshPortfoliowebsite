"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** One thing the desk could not take or could not read: the text stays here until the user dismisses it. */
export type AttentionItem = { id: string; note: string; text: string; onDismiss: () => void };

/**
 * "Needs attention": captures the server refused for good, and stored values this device could not read
 * back (the raw text may still hold the thought). Nothing is deleted until the user presses Dismiss.
 */
export function RejectedList({ items }: { items: AttentionItem[] }) {
  const [copy, setCopy] = useState<{ id: string; ok: boolean } | null>(null);
  if (items.length === 0) return null;

  async function copyText(item: AttentionItem) {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopy({ id: item.id, ok: true });
    } catch {
      setCopy({ id: item.id, ok: false });
    }
  }

  return (
    <section aria-label="Needs attention" className="space-y-3 rounded-lg border border-destructive/40 p-3">
      <h2 className="text-sm font-medium">Needs attention (still on this device)</h2>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="space-y-1">
            <p className="text-sm">{item.note}</p>
            <pre data-testid="attention-text" className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-sm whitespace-pre-wrap">
              {item.text}
            </pre>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyText(item)}>
                Copy text
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={item.onDismiss}>
                Dismiss
              </Button>
              {copy?.id === item.id ? (
                <span role="status" className="text-xs text-muted-foreground">
                  {copy.ok ? "Copied." : "Copy is blocked here; select the text above."}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
