"use client";

import { submitCapture } from "@/modules/capture/actions";
import {
  createCaptureQueue,
  resolveStorageInfo,
  webStorage,
  type CaptureQueue,
  type CaptureSource,
  type FlushOptions,
  type FlushResult,
  type LockRunner,
  type QueuedCapture,
  type SendVerdict,
} from "@/modules/capture/client";

export const QUEUE_EVENT = "desk:queue";
export type QueueEventDetail = { kind: "enqueued" } | { kind: "flushed"; sent: number } | { kind: "dismissed" };
const LOCK_NAME = "desk-capture-flush";

/** One flush at a time across tabs where the browser supports it; within a tab the queue is single-flight. */
const withLock: LockRunner = async (fn) => {
  if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(LOCK_NAME, fn);
  return fn();
};

async function sendToServer(entry: QueuedCapture): Promise<SendVerdict> {
  const response = await submitCapture({ clientId: entry.clientId, rawText: entry.rawText, source: entry.source });
  if (response.ok) return "sent";
  return response.retry ? "retry" : { outcome: "drop", reason: response.code };
}

let instance: { queue: CaptureQueue; durable: boolean } | null = null;

/** The tab's one queue (Plan 1A Task 12 ruling 1). Browser only: call from effects and handlers, never in render. */
export function deskQueue(): { queue: CaptureQueue; durable: boolean } {
  if (!instance) {
    const info = resolveStorageInfo(() => webStorage(window.localStorage));
    instance = { queue: createCaptureQueue(info.storage, { withLock }), durable: info.durable };
  }
  return instance;
}

/** Tests only: forget the tab's queue. */
export function resetDeskQueueForTests(): void {
  instance = null;
}

const notify = (detail: QueueEventDetail) => window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail }));

export const detectSource = (): CaptureSource => (window.matchMedia("(pointer: coarse)").matches ? "mobile" : "web");

/** Queue first (spec s9): the thought is on the device before any network call. */
export function enqueueCapture(rawText: string): string {
  const clientId = crypto.randomUUID();
  deskQueue().queue.enqueue({ clientId, rawText, source: detectSource(), queuedAt: new Date().toISOString() });
  notify({ kind: "enqueued" });
  return clientId;
}

export async function flushDeskQueue(options?: FlushOptions): Promise<FlushResult> {
  const result = await deskQueue().queue.flush(sendToServer, options);
  notify({ kind: "flushed", sent: result.sent });
  return result;
}

export function dismissRejected(clientId: string): void {
  deskQueue().queue.dismissRejected(clientId);
  notify({ kind: "dismissed" });
}

export function dismissCorrupt(key: string): void {
  deskQueue().queue.dismissCorrupt(key);
  notify({ kind: "dismissed" });
}
