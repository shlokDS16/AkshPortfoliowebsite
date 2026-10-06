"use client";

import { useEffect, useState } from "react";
import { QUEUE_EVENT, type QueueEventDetail } from "./desk-queue";
import { useDeskQueue } from "./use-queue-state";

export function CaptureStatus({ dirty }: { dirty: boolean }) {
  const { waiting, durable } = useDeskQueue();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const on = (event: Event) => {
      const detail = (event as CustomEvent<QueueEventDetail>).detail;
      if (detail?.kind === "enqueued") setSaved(false);
      else if (detail?.kind === "flushed" && detail.sent > 0) setSaved(true);
    };
    window.addEventListener(QUEUE_EVENT, on);
    return () => window.removeEventListener(QUEUE_EVENT, on);
  }, []);
  const text = waiting > 0 ? `Saved on this device, will sync (${waiting} waiting).` : saved && !dirty ? "Saved." : "";
  return (
    <>
      <p role="status" className="min-h-5 text-small text-ink-muted">{text}</p>
      {durable ? null : (
        <p role="alert" className="text-small text-bad">
          Offline saving is unavailable on this device (browser storage is blocked or full). Captures that cannot reach the desk are
          kept only until you close or reload this page.
        </p>
      )}
    </>
  );
}
