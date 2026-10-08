"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/messages";
import { markDoneAction } from "@/modules/ingestion/actions";

type Props = { documentId: string; done: boolean };

/**
 * Done with this document (ADR-004 s4.8). The stored PDF is the only copy, so the first press asks; the second deletes
 * it to free space. Its page text and filed figures stay.
 */
export function DoneButton({ documentId, done }: Props) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const result = await markDoneAction(documentId);
      if (!result.ok) return setError(result.message);
      setFinished(true);
      setAsking(false);
      router.refresh();
    } catch {
      setError(errorText("save-failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {done || finished ? (
        <p role="status" className="text-small text-ink-muted">
          Done with this document. The PDF was deleted; page text is still here.
        </p>
      ) : asking ? (
        <div className="space-y-2">
          <p className="text-small text-ink-body">This deletes the stored PDF and cannot be undone. Its page text and the figures you filed stay.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={finish}>
              Delete the PDF and finish
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setAsking(false)}>
              Keep the PDF
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setAsking(true)}>
          Done with this document
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
