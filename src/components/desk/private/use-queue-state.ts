"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isCaptureStorageKey, type CorruptCapture, type FlushOptions, type RejectedCapture } from "@/modules/capture/client";
import { deskQueue, flushDeskQueue, QUEUE_EVENT } from "./desk-queue";

export type DeskQueueView = { waiting: number; rejected: RejectedCapture[]; corrupt: CorruptCapture[]; durable: boolean };
const EMPTY: DeskQueueView = { waiting: 0, rejected: [], corrupt: [], durable: true };

/** The tab's queue as React state: this tab's changes (QUEUE_EVENT) and other tabs' (storage event). */
export function useDeskQueue(): DeskQueueView {
  const [view, setView] = useState(EMPTY);
  useEffect(() => {
    const read = () => {
      const { queue, durable } = deskQueue();
      setView({ waiting: queue.list().length, rejected: queue.listRejected(), corrupt: queue.listCorrupt(), durable: durable && queue.isDurable() });
    };
    const onStorage = (event: StorageEvent) => void (isCaptureStorageKey(event.key) && read());
    read();
    window.addEventListener(QUEUE_EVENT, read);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(QUEUE_EVENT, read);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return view;
}

export function useQueuedCount(): number {
  return useDeskQueue().waiting;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

const RETRY_MS = 30_000;

/** Mounted once (CaptureDock): first flush, online, 30 s retry while anything waits, and a warning before
 *  closing when nothing survives a reload (Plan 1A Task 12 rulings). */
export function useQueueLifecycle(onSent: () => void): void {
  const { waiting, durable } = useDeskQueue();
  const sent = useRef(onSent);
  useEffect(() => {
    sent.current = onSent;
  });
  const flush = useCallback(async (options?: FlushOptions) => {
    if ((await flushDeskQueue(options)).sent > 0) sent.current();
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void flush(), 0);
    // Back online: if an attempt that began while offline is still in flight, it gets one more pass when it
    // fails, so the user never waits for the 30 s timer after reconnecting.
    const onOnline = () => void flush({ retryIfBusy: true });
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  // A server that is down (not just offline) never fires "online": keep trying while something waits.
  useEffect(() => {
    if (waiting === 0) return;
    const timer = window.setInterval(() => void flush(), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [waiting, flush]);

  // Without durable storage the queue lives in this page only: warn before it is closed.
  useEffect(() => {
    if (durable || waiting === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [durable, waiting]);
}
