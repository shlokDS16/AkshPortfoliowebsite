"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/messages";
import { rereadPageAction } from "@/modules/ingestion/actions";
import type { RereadCost } from "@/modules/ingestion/client";

type Props = { documentId: string; pageNo: number };

/**
 * "Re-read page N" (Plan 2b Task 8): the price first, from the server's own constants; nothing is spent or rejected until Aksh
 * says yes. The page's figures he has not checked are replaced by the new reading, which is in the price's sentence.
 */
export function RereadControl({ documentId, pageNo }: Props) {
  const [pending, start] = useTransition();
  const [cost, setCost] = useState<RereadCost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  function run(confirmed: boolean) {
    setError(null);
    start(async () => {
      try {
        const result = await rereadPageAction(documentId, pageNo, confirmed);
        if (!result.ok) {
          setCost(null);
          return setError(result.message);
        }
        if ("cost" in result) return setCost(result.cost);
        setCost(null);
        setQueued(true);
      } catch {
        setCost(null);
        setError(errorText("save-failed"));
      }
    });
  }

  // The page list stops offering this control once the page is being read again, so the note is brief; the card's own line
  // ("Reading figures: ...") is what stays.
  if (queued) {
    return (
      <p role="status" className="text-caption text-ink-muted">
        Queued. This page will be read again.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {cost ? (
        <div role="group" aria-label={`Re-read page ${pageNo}`} className="space-y-2 rounded-sm border border-rule bg-surface p-3">
          <p className="text-small text-ink">{cost.text}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={() => run(true)}>
              Re-read, using about {cost.tokens.toLocaleString("en-US")} tokens
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setCost(null)}>
              Not now
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(false)}>
          Re-read page {pageNo}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
