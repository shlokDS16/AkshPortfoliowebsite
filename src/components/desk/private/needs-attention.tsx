"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { rejectionText } from "@/modules/capture/client";
import { dismissCorrupt, dismissRejected } from "./desk-queue";
import { useDeskQueue } from "./use-queue-state";

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
    <section aria-label="Needs attention" className="space-y-3 rounded-sm border border-bad bg-bad-wash p-3">
      <h2 className="text-small font-semibold text-ink">Needs attention (still on this device)</h2>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="space-y-1">
            <p className="text-small text-ink">{item.note}</p>
            <pre data-testid="attention-text" className="max-h-48 overflow-auto rounded-xs bg-surface-2 p-2 text-small whitespace-pre-wrap text-ink">
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
                <span role="status" className="text-caption text-ink-muted">
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

/** The tab's refused and unreadable captures, read from the shared queue (Plan 1A wording kept). */
export function NeedsAttention() {
  const { rejected, corrupt } = useDeskQueue();
  const items: AttentionItem[] = [
    ...rejected.map((entry) => ({
      id: entry.clientId,
      note: rejectionText(entry.reason),
      text: entry.rawText,
      onDismiss: () => dismissRejected(entry.clientId),
    })),
    ...corrupt.map((entry) => ({
      id: entry.key,
      note: "This device could not read a stored capture. The raw saved data is below; it may still hold your text.",
      text: entry.rawValue,
      onDismiss: () => dismissCorrupt(entry.key),
    })),
  ];
  return <RejectedList items={items} />;
}
