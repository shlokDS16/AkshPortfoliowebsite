"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText, noticeText } from "@/lib/messages";
import { markDoneAction } from "@/modules/ingestion/actions";

type Props = { documentId: string; done: boolean };

/** Done with this document (ADR-004 s4.8): the stored PDF is deleted to free space; its page text and filed figures stay. */
export function DoneButton({ documentId, done }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function finish() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await markDoneAction(documentId);
      setMessage(result.ok ? { ok: true, text: noticeText("document-done") ?? "" } : { ok: false, text: result.message });
      if (result.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: errorText("save-failed") ?? "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {done ? (
        <p className="text-small text-ink-muted">Done with this document. The PDF was deleted; page text is still here.</p>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={finish}>
          Done with this document
        </Button>
      )}
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-small text-ink-muted" : "text-small text-bad"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
