"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { formatTime } from "@/lib/format";
import { enqueueCapture, flushDeskQueue, outcomeOf, type CaptureOutcome } from "./desk-queue";

/** Queue first, then flush the tab's one queue. A refusal keeps the text under Needs attention with its reason. */
export function useCaptureSave() {
  const router = useRouter();
  const [toast, showToast] = useToast();
  const save = useCallback(
    async (rawText: string, label: string): Promise<CaptureOutcome> => {
      const clientId = enqueueCapture(rawText);
      await flushDeskQueue();
      const outcome = outcomeOf(clientId);
      if (outcome === "queued") showToast("Saved on this phone. It will sync.");
      if (outcome !== "sent") return outcome; // "dropped": the text waits under Needs attention with its reason
      showToast(`Saved ${formatTime(new Date().toISOString())} · ${label}`);
      router.refresh();
      return outcome;
    },
    [router, showToast],
  );
  return { toast, save };
}
