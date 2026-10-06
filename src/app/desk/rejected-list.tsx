"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { rejectionText, type RejectedCapture } from "@/modules/capture/client";

/** Captures the server refused for good. Kept with their full text until the user dismisses them. */
export function RejectedList({ entries, onDismiss }: { entries: RejectedCapture[]; onDismiss: (clientId: string) => void }) {
  const [copy, setCopy] = useState<{ id: string; ok: boolean } | null>(null);
  if (entries.length === 0) return null;

  async function copyText(entry: RejectedCapture) {
    try {
      await navigator.clipboard.writeText(entry.rawText);
      setCopy({ id: entry.clientId, ok: true });
    } catch {
      setCopy({ id: entry.clientId, ok: false });
    }
  }

  return (
    <section aria-label="Needs attention" className="space-y-3 rounded-lg border border-destructive/40 p-3">
      <h2 className="text-sm font-medium">Not saved to the desk (still on this device)</h2>
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.clientId} className="space-y-1">
            <p className="text-sm">{rejectionText(entry.reason)}</p>
            <pre data-testid="rejected-text" className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-sm whitespace-pre-wrap">
              {entry.rawText}
            </pre>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyText(entry)}>
                Copy text
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onDismiss(entry.clientId)}>
                Dismiss
              </Button>
              {copy?.id === entry.clientId ? (
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
