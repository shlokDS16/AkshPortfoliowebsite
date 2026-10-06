"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  deskQueue,
  dismissCorrupt,
  dismissRejected,
  enqueueCapture,
  flushDeskQueue,
  QUEUE_EVENT,
} from "@/components/desk/private/desk-queue";
import { Textarea } from "@/components/ui/textarea";
import {
  isCaptureStorageKey,
  rejectionText,
  type CaptureQueue,
  type CorruptCapture,
  type FlushOptions,
  type RejectedCapture,
} from "@/modules/capture/client";
import { RejectedList, type AttentionItem } from "./rejected-list";

const RETRY_MS = 30_000;

export function CaptureBox() {
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [rejected, setRejected] = useState<RejectedCapture[]>([]);
  const [corrupt, setCorrupt] = useState<CorruptCapture[]>([]);
  const [durable, setDurable] = useState(true);

  /** The tab's one queue (desk-queue.ts), shared with the strips and cards; browser only. */
  const getQueue = useCallback((): CaptureQueue => {
    const { queue, durable: storageDurable } = deskQueue();
    if (!storageDurable) setDurable(false);
    return queue;
  }, []);

  const syncView = useCallback(() => {
    const queue = getQueue();
    setWaiting(queue.list().length);
    setRejected(queue.listRejected());
    setCorrupt(queue.listCorrupt());
    if (!queue.isDurable()) setDurable(false);
  }, [getQueue]);

  const flush = useCallback(
    async (options?: FlushOptions) => {
      const result = await flushDeskQueue(options);
      syncView();
      if (result.sent > 0) {
        setSaved(true);
        router.refresh();
      }
      return result;
    },
    [router, syncView],
  );

  useEffect(() => {
    ref.current?.focus();
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

  // Another tab queued, sent, rejected or dismissed something (storage), or the queue changed from this
  // tab outside the box (QUEUE_EVENT): show the same counts and lists here.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (isCaptureStorageKey(event.key)) syncView();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(QUEUE_EVENT, syncView);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(QUEUE_EVENT, syncView);
    };
  }, [syncView]);

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

  async function submit() {
    const rawText = text;
    if (rawText.trim() === "") return;
    // Queue first: the thought is on the device before any network call (spec s9).
    enqueueCapture(rawText);
    setText("");
    setSaved(false);
    syncView(); // from here the note is on the device, and the status says so
    try {
      await flush();
    } finally {
      ref.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const attention: AttentionItem[] = [
    ...rejected.map((entry) => ({
      id: entry.clientId,
      note: rejectionText(entry.reason),
      text: entry.rawText,
      onDismiss: () => dismissRejected(entry.clientId),
    })),
    ...corrupt.map((entry) => ({
      id: entry.key,
      note: "This device could not read a stored capture. The raw saved data is below; it may still hold your text.",
      text: entry.rawValue,
      onDismiss: () => dismissCorrupt(entry.key),
    })),
  ];

  let status = "";
  if (waiting > 0) status = `Saved on this device, will sync (${waiting} waiting).`;
  else if (saved) status = "Saved.";

  return (
    <div className="space-y-2">
      <Textarea
        ref={ref}
        aria-label="Capture"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
        }}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder="What did you find? $SYMBOL links a company, #theme a theme, t: thesis, l: learning, p: process"
        className="text-base"
      />
      <p role="status" className="min-h-5 text-xs text-muted-foreground">
        {status}
      </p>
      {durable ? null : (
        <p role="alert" className="text-xs text-destructive">
          Offline saving is unavailable on this device (browser storage is blocked or full). Captures that cannot reach the desk are
          kept only until you close or reload this page.
        </p>
      )}
      <RejectedList items={attention} />
    </div>
  );
}
