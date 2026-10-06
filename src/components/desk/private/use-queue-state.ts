"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isCaptureStorageKey, type CorruptCapture, type RejectedCapture } from "@/modules/capture/client";
import { deskQueue, QUEUE_EVENT } from "./desk-queue";

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
