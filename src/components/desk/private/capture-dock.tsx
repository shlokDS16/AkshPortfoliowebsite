"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KnownTokenLists } from "@/modules/catalog";
import { CaptureButton } from "./capture-button";
import { useKnown } from "./capture-field";
import { CaptureSheet } from "./capture-sheet";
import { useQueueLifecycle } from "./use-queue-state";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
// A key pressed inside an open dialog, menu or list belongs to that widget.
const inOverlay = (el: EventTarget | null) => el instanceof Element && el.closest('[role="dialog"], [role="menu"], [role="listbox"]') !== null;

/**
 * Mounted once in the desk shell: the Capture button, the sheet, the `c` and `/` keys (design-dna 14), and the
 * offline queue lifecycle (flush on load and when the phone comes back online).
 */
export function CaptureDock({ known }: { known: KnownTokenLists }) {
  const sets = useKnown(known);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
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
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || inOverlay(e.target)) return;
      if (e.key === "c" || e.key === "/") {
        e.preventDefault();
        openCapture();
      }
    };
    window.addEventListener("keydown", onKey);
    // The signal e2e waits for before pressing c: set on the DOM node, since it only says "the listener is attached".
    const marked = button.current;
    marked?.setAttribute("data-shortcuts", "ready");
    return () => {
      window.removeEventListener("keydown", onKey);
      marked?.removeAttribute("data-shortcuts");
    };
  }, [openCapture]);
  return (
    <>
      <CaptureButton ref={button} onClick={openCapture} />
      <CaptureSheet open={open} onOpenChange={setOpen} known={sets} />
    </>
  );
}
