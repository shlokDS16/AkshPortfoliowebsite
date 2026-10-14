"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorText } from "@/lib/messages";
import { submitCapture } from "@/modules/capture/actions";
import { discardTranscriptAction, markTranscriptSavedAction } from "@/modules/ingestion/actions";
import { TRANSCRIPT_SAVE_MAX_CHARS } from "@/modules/ingestion/client";
import type { ActionResult } from "@/modules/ingestion/client";
import { detectSource } from "../desk-queue";
import { useInboxAction } from "./use-inbox-action";

/** Copy: pending Shlok approval (spec s16.9). */
export const TRANSCRIPT_LABEL = "Your voice note, typed out";
const TOO_LONG = `This is over ${TRANSCRIPT_SAVE_MAX_CHARS.toLocaleString("en-US")} characters. Shorten it before you save.`;

/**
 * A voice note, typed out, for Aksh to check. The words are his: he edits them here and saves them through the capture box's own
 * path (verbatim storage, the grammar parse, the same as typing them in), with the document's id as the capture's client id so a
 * second press makes no second capture. The desk never saves them for him. Discarding saves nothing.
 */
export function TranscriptCard({ documentId, transcript }: { documentId: string; transcript: string }) {
  const { pending, error, run } = useInboxAction();
  const [text, setText] = useState(transcript);
  const [confirming, setConfirming] = useState(false);
  const id = useId();
  const tooLong = text.length > TRANSCRIPT_SAVE_MAX_CHARS;
  const empty = text.trim().length === 0;

  async function save(): Promise<ActionResult> {
    const saved = await submitCapture({ clientId: documentId, rawText: text, source: detectSource() });
    if (!saved.ok) {
      // A save that failed on the server would be "kept on this device" in the capture box; nothing is queued here, so say so plainly.
      return { ok: false, code: saved.code, message: saved.retry ? (errorText("save-failed") ?? "") : saved.message };
    }
    return markTranscriptSavedAction(documentId);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={id}>{TRANSCRIPT_LABEL}</Label>
        <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} disabled={pending} aria-invalid={tooLong} aria-describedby={`${id}-note`} className="min-h-32" />
        <p id={`${id}-note`} className={tooLong ? "text-small text-bad" : "text-small text-ink-muted"}>
          {tooLong ? TOO_LONG : "Change anything the typing got wrong. What you save is exactly what is here."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={pending || tooLong || empty} onClick={() => void run(save)}>
          Save as a capture
        </Button>
        {confirming ? (
          <>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => void run(() => discardTranscriptAction(documentId))}>
              Yes, discard it
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(true)}>
            Discard
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
