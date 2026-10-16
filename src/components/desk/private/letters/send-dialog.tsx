"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PendingButton } from "../pending-button";

type Action = (formData: FormData) => Promise<void>;
type Props = { label: string; subject: string; confirmed: number; approve: Action; disabledWhy: string | null };

/**
 * The press that records the approval (spec s8.1): the subject, the count, the sentence that an email cannot be called back, and a tick before
 * Send works. The trigger is off while the subject is still the label or nobody has confirmed, and says why beside it; the database and the
 * action refuse the same cases, so this is the first of three doors, not the only one. A double press makes one approval: Send turns itself off
 * while the action runs.
 */
export function SendDialog({ label, subject, confirmed, approve, disabledWhy }: Props) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);
  return (
    <>
      <Button type="button" disabled={disabledWhy !== null} aria-describedby={disabledWhy ? "send-why" : undefined} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {disabledWhy ? (
        <p id="send-why" className="text-small text-ink-muted">
          {disabledWhy}
        </p>
      ) : null}
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setRead(false);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-(--z-scrim) bg-(--scrim)" />
          <Dialog.Popup className="fixed inset-x-0 bottom-0 z-(--z-sheet) rounded-t-sm bg-paper pb-[env(safe-area-inset-bottom)] shadow-(--shadow-sheet) desk:inset-x-auto desk:top-24 desk:bottom-auto desk:left-1/2 desk:w-[32rem] desk:-translate-x-1/2 desk:rounded-sm">
            <form action={approve} className="space-y-4 p-4">
              <Dialog.Title className="text-subtitle text-ink">Send this letter</Dialog.Title>
              <p className="text-small text-ink-muted">Subject</p>
              <p className="-mt-3 break-words text-body text-ink">{subject}</p>
              <Dialog.Description className="text-body text-ink">
                This emails {confirmed} {confirmed === 1 ? "person" : "people"}. An email cannot be called back.
              </Dialog.Description>
              <label className="flex min-h-11 items-start gap-3 text-small text-ink">
                <input type="checkbox" name="read" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-0.5 size-[18px] accent-ink" />
                <span>I have read the preview</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <PendingButton disabled={!read}>Send</PendingButton>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Not now
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
