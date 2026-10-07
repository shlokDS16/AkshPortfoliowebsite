// Offline-first capture queue (spec s5, s9). Pure: storage and the cross-tab lock are injected.
//
// One storage key per capture (`<prefix>:<clientId>`). A tab never rewrites a list it read earlier, so
// two tabs cannot overwrite each other's entries: every change is a single setItem or removeItem of
// that capture's own key.
import { createMemoryStorage, type StorageLike } from "./storage";
import type { CaptureSource } from "./types";

export const QUEUE_KEY = "desk.captureQueue.v1";
/** Captures the server permanently refused. Kept, never deleted, until the user dismisses them. */
export const REJECTED_KEY = "desk.captureRejected.v1";
/** Stored values that could not be read back. Kept raw (the text may still be recoverable) until dismissed. */
export const CORRUPT_KEY = "desk.captureCorrupt.v1";
const DEFAULT_REJECT_REASON = "invalid-capture";
const DEFAULT_SEND_TIMEOUT_MS = 15_000;

export type QueuedCapture = { clientId: string; rawText: string; source: CaptureSource; queuedAt: string };
export type RejectedCapture = QueuedCapture & { reason: string; rejectedAt: string };
/** `key` identifies it for dismissal; `rawValue` is exactly what was in storage. */
export type CorruptCapture = { key: string; detectedAt: string; rawValue: string };
export type SendOutcome = "sent" | "retry" | "drop";
/** A send may say why it is dropping; a bare "drop" gets a generic reason. */
export type SendVerdict = SendOutcome | { outcome: "drop"; reason: string };
export type FlushResult = { sent: number; dropped: number; remaining: number };
export type LockRunner = <T>(fn: () => Promise<T>) => Promise<T>;
export type FlushOptions = {
  /**
   * For a trigger that says "the network is back" (the `online` event). If a run is already in flight, that
   * run may be an attempt that began while offline and is about to fail: ask it for one more pass right
   * after it stops on a retry, instead of leaving the entry to the next timer tick.
   */
  retryIfBusy?: boolean;
};
export type QueueOptions = { withLock?: LockRunner; now?: () => Date; sendTimeoutMs?: number };

/** True when a `storage` event key can concern the capture queue (null means the whole storage was cleared). */
export function isCaptureStorageKey(key: string | null): boolean {
  return key === null || key.startsWith("desk.capture");
}

function isQueued(value: unknown): value is QueuedCapture {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.clientId === "string" && typeof v.rawText === "string" && typeof v.source === "string" && typeof v.queuedAt === "string";
}

function isRejected(value: unknown): value is RejectedCapture {
  if (!isQueued(value)) return false;
  const v = value as unknown as Record<string, unknown>;
  return typeof v.reason === "string" && typeof v.rejectedAt === "string";
}

const entryKey = (prefix: string, clientId: string) => `${prefix}:${clientId}`;
const byTime = (time: (e: QueuedCapture) => string) => (a: QueuedCapture, b: QueuedCapture) =>
  time(a).localeCompare(time(b)) || a.clientId.localeCompare(b.clientId);

export type CaptureQueue = ReturnType<typeof createCaptureQueue>;

const unlocked: LockRunner = (fn) => fn();

export function createCaptureQueue(initial: StorageLike, options: QueueOptions = {}) {
  const withLock = options.withLock ?? unlocked;
  const now = options.now ?? (() => new Date());
  const sendTimeoutMs = options.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  let storage = initial;
  let durable = true;
  let legacyChecked = false;
  let inflight: Promise<FlushResult> | null = null;
  let retryRequested = false;

  /** A failed write must not lose the entry: carry on in memory for this session and say so. */
  function write(key: string, value: string): void {
    try {
      storage.setItem(key, value);
      return;
    } catch {
      // storage full or blocked
    }
    if (durable) {
      durable = false;
      const memory = createMemoryStorage();
      try {
        for (const k of storage.keys()) {
          if (!isCaptureStorageKey(k)) continue;
          const existing = storage.getItem(k);
          if (existing !== null) memory.setItem(k, existing);
        }
      } catch {
        // unreadable too: start empty
      }
      storage = memory;
    }
    storage.setItem(key, value);
  }

  function del(key: string): void {
    try {
      storage.removeItem(key);
    } catch {
      // a leftover entry is re-sent later; the server dedupes by clientId
    }
  }

  function has(key: string): boolean {
    try {
      return storage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  /** Moves unreadable stored data aside, raw, BEFORE removing it. The warning names the key, never content. */
  function quarantine(key: string, raw: string): void {
    const stamp = now().toISOString();
    let target = entryKey(CORRUPT_KEY, stamp);
    for (let n = 2; has(target); n++) target = `${entryKey(CORRUPT_KEY, stamp)}#${n}`;
    write(target, raw);
    del(key);
    console.warn(`capture storage: unreadable data under ${key}; the raw value was kept under ${target}`);
  }

  /** The old single-array keys: an empty one is deleted, anything else is kept aside as corrupt. */
  function dropLegacy(): void {
    if (legacyChecked) return;
    legacyChecked = true;
    for (const key of [QUEUE_KEY, REJECTED_KEY]) {
      let raw: string | null;
      try {
        raw = storage.getItem(key);
      } catch {
        continue;
      }
      if (raw === null) continue;
      if (raw.trim() === "" || raw.trim() === "[]") del(key);
      else quarantine(key, raw);
    }
  }

  function storedKeys(prefix: string): string[] {
    try {
      return storage.keys().filter((k) => k.startsWith(`${prefix}:`));
    } catch {
      return [];
    }
  }

  function readEntries<T extends QueuedCapture>(prefix: string, guard: (value: unknown) => value is T): T[] {
    dropLegacy();
    const entries: T[] = [];
    for (const key of storedKeys(prefix)) {
      let raw: string | null;
      try {
        raw = storage.getItem(key);
      } catch {
        continue;
      }
      if (raw === null) continue; // removed by another tab since we listed the keys
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        value = null;
      }
      // The key must name the entry, or removing "by clientId" would never remove it.
      if (guard(value) && key === entryKey(prefix, value.clientId)) entries.push(value);
      else quarantine(key, raw);
    }
    return entries;
  }

  const list = (): QueuedCapture[] => readEntries(QUEUE_KEY, isQueued).sort(byTime((e) => e.queuedAt));
  const listRejected = (): RejectedCapture[] =>
    readEntries(REJECTED_KEY, isRejected).sort(byTime((e) => (e as RejectedCapture).rejectedAt));

  function listCorrupt(): CorruptCapture[] {
    const out: CorruptCapture[] = [];
    for (const key of storedKeys(CORRUPT_KEY)) {
      let raw: string | null = null;
      try {
        raw = storage.getItem(key);
      } catch {
        // skip
      }
      if (raw !== null) out.push({ key, detectedAt: key.slice(CORRUPT_KEY.length + 1).replace(/#\d+$/, ""), rawValue: raw });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  function enqueue(entry: QueuedCapture): QueuedCapture[] {
    write(entryKey(QUEUE_KEY, entry.clientId), JSON.stringify(entry));
    return list();
  }

  function remove(clientId: string): QueuedCapture[] {
    del(entryKey(QUEUE_KEY, clientId));
    return list();
  }

  /** Written before the queue entry is removed: a crash in between duplicates, it never loses. */
  function reject(entry: QueuedCapture, reason: string): void {
    const rejected: RejectedCapture = { ...entry, reason, rejectedAt: now().toISOString() };
    write(entryKey(REJECTED_KEY, entry.clientId), JSON.stringify(rejected));
    del(entryKey(QUEUE_KEY, entry.clientId));
  }

  function dismissRejected(clientId: string): RejectedCapture[] {
    del(entryKey(REJECTED_KEY, clientId));
    return listRejected();
  }

  function dismissCorrupt(key: string): CorruptCapture[] {
    if (key.startsWith(`${CORRUPT_KEY}:`)) del(key);
    return listCorrupt();
  }

  /** A send that hangs counts as a retry, so one dead request cannot hold the queue (or the lock) forever. */
  async function sendOne(entry: QueuedCapture, send: (entry: QueuedCapture) => Promise<SendVerdict>): Promise<SendVerdict> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SendVerdict>((resolve) => {
      timer = setTimeout(() => resolve("retry"), sendTimeoutMs);
    });
    try {
      return await Promise.race([send(entry), timeout]);
    } catch {
      return "retry";
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(send: (entry: QueuedCapture) => Promise<SendVerdict>): Promise<FlushResult> {
    let sent = 0;
    let dropped = 0;
    let stopped: boolean;
    do {
      retryRequested = false;
      stopped = false;
      const attempted = new Set<string>();
      // Entries queued while this run is going are picked up by the next pass instead of a second flush.
      while (!stopped) {
        const todo = list().filter((e) => !attempted.has(e.clientId));
        if (todo.length === 0) break;
        for (const entry of todo) {
          attempted.add(entry.clientId);
          // Another tab without the lock API may have sent it since we listed.
          if (!has(entryKey(QUEUE_KEY, entry.clientId))) continue;
          const verdict = await sendOne(entry, send);
          if (verdict === "sent") {
            remove(entry.clientId);
            sent++;
          } else if (verdict === "drop" || (typeof verdict === "object" && verdict !== null && verdict.outcome === "drop")) {
            reject(entry, typeof verdict === "object" ? verdict.reason : DEFAULT_REJECT_REASON);
            dropped++;
          } else {
            stopped = true; // retry or anything unrecognised: keep order, try again later
            break;
          }
        }
      }
      // One more pass only when a retry was asked for during a pass that then stopped on a retry.
    } while (stopped && retryRequested);
    // Same synchronous block as the last list(): a flush() arriving later starts a fresh run.
    inflight = null;
    return { sent, dropped, remaining: list().length };
  }

  /**
   * Single-flight. A call while a flush is running returns that same promise (the running flush also
   * sends anything queued meanwhile), so one entry is never sent twice and sends never overlap, which
   * matters because two parallel `t:` captures could create two theses for one company. The lock
   * extends that across tabs. Sends oldest first and stops at the first retry to keep order.
   */
  function flush(send: (entry: QueuedCapture) => Promise<SendVerdict>, flushOptions: FlushOptions = {}): Promise<FlushResult> {
    if (inflight) {
      if (flushOptions.retryIfBusy) retryRequested = true;
      return inflight;
    }
    // Started from a microtask so `inflight` is assigned before run() can clear it.
    const promise: Promise<FlushResult> = Promise.resolve()
      .then(() => withLock(() => run(send)))
      .catch((): FlushResult => ({ sent: 0, dropped: 0, remaining: list().length }))
      .finally(() => {
        if (inflight === promise) inflight = null;
      });
    inflight = promise;
    return promise;
  }

  return {
    list,
    enqueue,
    remove,
    flush,
    listRejected,
    dismissRejected,
    listCorrupt,
    dismissCorrupt,
    isDurable: () => durable,
  };
}
