"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { scrimMotion, sheetMotion } from "@/components/ui/motion-presets";
import { Toast } from "@/components/ui/toast";
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";
import { captureReceipt, receiptLabel, type KnownTokens } from "@/modules/capture/client";
import { CaptureField, useTokenInsert } from "./capture-field";
import { CaptureReceipt } from "./capture-receipt";
import { CaptureStatus } from "./capture-status";
import { GrammarKeyRow } from "./grammar-key-row";
import { NeedsAttention } from "./needs-attention";
import { useCaptureSave } from "./use-capture-save";

const noSubscribe = () => () => {};
// The Toast is portaled to <body>: the sheet's header slot is a stacking context (z 30) that would cap the toast below the scrim.
// Base UI leaves [aria-live] regions out of its aria-hidden pass, so the toast stays announced while the sheet is open.
const useBody = () => useSyncExternalStore(noSubscribe, () => document.body, () => null);

type Props = { open: boolean; onOpenChange(open: boolean): void; known: KnownTokens };

/** Bottom sheet (phone) / top dialog (desktop): Base UI for focus trap and Esc, Motion for the slide (Base UI handbook). */
export function CaptureSheet({ open, onOpenChange, known }: Props) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const reduced = usePrefersReducedMotion();
  const body = useBody();
  const { toast, save } = useCaptureSave();
  const insert = useTokenInsert(field, value, setValue);
  const receipt = captureReceipt(value, known);
  async function submit() {
    const raw = value;
    if (raw.trim() === "") return;
    setValue(""); // already safe: save() queues on the device before any network call
    const outcome = await save(raw, receiptLabel(receipt));
    // Phone: the sheet leaves once the note is on the server. A note still waiting or refused keeps the sheet open,
    // so the status line and Needs attention stay on screen next to the toast.
    if (outcome === "sent" && window.matchMedia("(pointer: coarse)").matches) onOpenChange(false);
  }
  return (
    <>
      <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
        <AnimatePresence>
          {open ? (
            <Dialog.Portal keepMounted>
              <Dialog.Backdrop render={<m.div {...scrimMotion(reduced)} className="fixed inset-0 z-(--z-scrim) bg-(--scrim)" />} />
              <Dialog.Popup
                initialFocus={field}
                render={
                  <m.div
                    {...sheetMotion(reduced)}
                    className="fixed inset-x-0 bottom-0 z-(--z-sheet) rounded-t-sm bg-paper pb-[env(safe-area-inset-bottom)] shadow-(--shadow-sheet) desk:inset-x-auto desk:top-24 desk:bottom-auto desk:left-1/2 desk:w-[40rem] desk:-translate-x-1/2 desk:rounded-sm"
                  />
                }
              >
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <Dialog.Title className="text-subtitle text-ink">Capture</Dialog.Title>
                    <Dialog.Close aria-label="Close" className="inline-flex size-11 items-center justify-center rounded-sm text-ink hover:bg-surface-2">
                      <X aria-hidden strokeWidth={1.5} className="size-5" />
                    </Dialog.Close>
                  </div>
                  <CaptureField ref={field} id="capture-sheet-field" value={value} onChange={setValue} onSubmit={submit} known={known} placeholder="What did you just notice?" />
                  <CaptureReceipt model={receipt} />
                  <CaptureStatus dirty={value !== ""} />
                  <NeedsAttention />
                  <div className="flex items-center gap-2 pt-1">
                    <GrammarKeyRow onInsert={insert} />
                    <div className="flex-1" />
                    <Button onClick={submit} disabled={!value.trim()}>
                      Save
                    </Button>
                  </div>
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          ) : null}
        </AnimatePresence>
      </Dialog.Root>
      {body ? createPortal(<Toast message={toast} />, body) : null}
    </>
  );
}
