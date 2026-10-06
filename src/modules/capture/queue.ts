// Offline-first capture queue (spec s5, s9). Pure: storage and the cross-tab lock are injected.
import type { CaptureSource } from "./types";

export const QUEUE_KEY = "desk.captureQueue.v1";
/** Captures the server permanently refused. They are kept, never deleted, until the user dismisses them. */
export const REJECTED_KEY = "desk.captureRejected.v1";
const PROBE_KEY = "desk.storageProbe";
const DEFAULT_REJECT_REASON = "invalid-capture";

export type QueuedCapture = { clientId: string; rawText: string; source: CaptureSource; queuedAt: string };
export type RejectedCapture = QueuedCapture & { reason: string; rejectedAt: string };
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
export type SendOutcome = "sent" | "retry" | "drop";
/** A send may say why it is dropping; a bare "drop" gets a generic reason. */
export type SendVerdict = SendOutcome | { outcome: "drop"; reason: string };
export type FlushResult = { sent: number; dropped: number; remaining: number };
export type LockRunner = <T>(fn: () => Promise<T>) => Promise<T>;
export type QueueOptions = { withLock?: LockRunner; now?: () => Date };

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

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/**
 * localStorage when it works; memory otherwise (private mode, blocked site data). `durable` is false
 * for memory, so the screen can say plainly that nothing survives a reload on this device.
 */
export function resolveStorageInfo(get: () => StorageLike | undefined): { storage: StorageLike; durable: boolean } {
  try {
    const storage = get();
    if (storage) {
      storage.setItem(PROBE_KEY, "1");
      if (storage.getItem(PROBE_KEY) === "1") {
        storage.removeItem(PROBE_KEY);
        return { storage, durable: true };
      }
    }
  } catch {
    // fall through to memory
  }
  return { storage: createMemoryStorage(), durable: false };
}

export function resolveStorage(get: () => StorageLike | undefined): StorageLike {
  return resolveStorageInfo(get).storage;
}

export type CaptureQueue = ReturnType<typeof createCaptureQueue>;

const unlocked: LockRunner = (fn) => fn();

export function createCaptureQueue(initial: StorageLike, options: QueueOptions = {}) {
  const withLock = options.withLock ?? unlocked;
  const now = options.now ?? (() => new Date());
  let storage = initial;
  let durable = true;
  let inflight: Promise<FlushResult> | null = null;

  /** A failed write must not lose the entry: carry on in memory for this session and say so. */
  function write(key: string, entries: unknown[]): void {
    const value = JSON.stringify(entries);
    try {
      storage.setItem(key, value);
      return;
    } catch {
      // storage full or blocked
    }
    if (durable) {
      durable = false;
      const memory = createMemoryStorage();
      for (const k of [QUEUE_KEY, REJECTED_KEY]) {
        try {
          const existing = storage.getItem(k);
          if (existing !== null) memory.setItem(k, existing);
        } catch {
          // unreadable too: start empty
        }
      }
      storage = memory;
    }
    storage.setItem(key, value);
  }

  function read<T>(key: string, guard: (value: unknown) => value is T): T[] {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      return [];
    }
    if (!raw) return [];
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
    const kept = Array.isArray(value) ? value.filter(guard) : [];
    if (!Array.isArray(value) || kept.length !== value.length) {
      // Unreadable (all or in part): keep the raw text aside; the warning carries no capture text.
      try {
        storage.setItem(`${key}.corrupt`, raw);
      } catch {
        // nothing more we can do on this device
      }
      console.warn(`capture storage: unreadable data under ${key}; a backup was kept under ${key}.corrupt`);
      write(key, kept);
    }
    return kept;
  }

  const list = () => read(QUEUE_KEY, isQueued);
  const listRejected = () => read(REJECTED_KEY, isRejected);

  function enqueue(entry: QueuedCapture): QueuedCapture[] {
    const next = [...list().filter((e) => e.clientId !== entry.clientId), entry];
    write(QUEUE_KEY, next);
    return next;
  }

  function remove(clientId: string): QueuedCapture[] {
    const next = list().filter((e) => e.clientId !== clientId);
    write(QUEUE_KEY, next);
    return next;
  }

  /** Written before the queue entry is removed: a crash in between duplicates, it never loses. */
  function reject(entry: QueuedCapture, reason: string): void {
    const kept = listRejected().filter((e) => e.clientId !== entry.clientId);
    write(REJECTED_KEY, [...kept, { ...entry, reason, rejectedAt: now().toISOString() }]);
  }

  function dismissRejected(clientId: string): RejectedCapture[] {
    const next = listRejected().filter((e) => e.clientId !== clientId);
    write(REJECTED_KEY, next);
    return next;
  }

  async function sendOne(entry: QueuedCapture, send: (entry: QueuedCapture) => Promise<SendVerdict>) {
    try {
      return await send(entry);
    } catch {
      return "retry" as const;
    }
  }

  async function run(send: (entry: QueuedCapture) => Promise<SendVerdict>): Promise<FlushResult> {
    const attempted = new Set<string>();
    let sent = 0;
    let dropped = 0;
    let stopped = false;
    // Entries queued while this run is going are picked up by the next pass instead of a second flush.
    while (!stopped) {
      const todo = list().filter((e) => !attempted.has(e.clientId));
      if (todo.length === 0) break;
      for (const entry of todo) {
        attempted.add(entry.clientId);
        // Another tab without the lock API may have sent it since we listed.
        if (!list().some((e) => e.clientId === entry.clientId)) continue;
        const verdict = await sendOne(entry, send);
        if (verdict === "sent") {
          remove(entry.clientId);
          sent++;
        } else if (verdict === "drop" || (typeof verdict === "object" && verdict !== null && verdict.outcome === "drop")) {
          reject(entry, typeof verdict === "object" ? verdict.reason : DEFAULT_REJECT_REASON);
          remove(entry.clientId);
          dropped++;
        } else {
          stopped = true; // retry or anything unrecognised: keep order, try again later
          break;
        }
      }
    }
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
  function flush(send: (entry: QueuedCapture) => Promise<SendVerdict>): Promise<FlushResult> {
    if (inflight) return inflight;
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

  return { list, enqueue, remove, flush, listRejected, dismissRejected, isDurable: () => durable };
}
