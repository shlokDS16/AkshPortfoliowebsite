"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { KnownTokenLists } from "@/modules/catalog";
import { CaptureButton } from "./capture-button";
import { useKnown } from "./capture-field";
import { CaptureSheet } from "./capture-sheet";
import { useQueueLifecycle } from "./use-queue-state";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/**
 * Mounted once in the desk shell: the Capture button, the sheet, the `c` and `/` keys (design-dna 14), and the
 * offline queue lifecycle (flush on load and when the phone comes back online).
 */
export function CaptureDock({ known }: { known: KnownTokenLists }) {
  const sets = useKnown(known);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  useQueueLifecycle(refresh);
  const openCapture = useCallback(() => {
    const bar = document.getElementById("capture-bar");
    if (bar && bar.offsetParent !== null) bar.focus();
    else setOpen(true);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === "c" || e.key === "/") {
        e.preventDefault();
        openCapture();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCapture]);
  return (
    <>
      <CaptureButton onClick={openCapture} />
      <CaptureSheet open={open} onOpenChange={setOpen} known={sets} />
    </>
  );
}
