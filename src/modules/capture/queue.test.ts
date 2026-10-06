import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCaptureQueue,
  createMemoryStorage,
  QUEUE_KEY,
  REJECTED_KEY,
  resolveStorage,
  resolveStorageInfo,
  type QueuedCapture,
  type SendOutcome,
  type SendVerdict,
  type StorageLike,
} from "./queue";

const entry = (clientId: string, rawText = `note ${clientId}`): QueuedCapture => ({
  clientId,
  rawText,
  source: "web",
  queuedAt: "2026-10-04T06:00:00.000Z",
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A send that records order, how many calls overlap, and how often each entry was sent. */
function recordingSend(outcome: (id: string) => SendVerdict = () => "sent") {
  const seen: string[] = [];
  let active = 0;
  let maxActive = 0;
  const send = async (e: QueuedCapture): Promise<SendVerdict> => {
    seen.push(e.clientId);
    active++;
    maxActive = Math.max(maxActive, active);
    await tick();
    active--;
    return outcome(e.clientId);
  };
  return { send, seen, maxActive: () => maxActive };
}

/** A promise-chain mutex standing in for navigator.locks (one holder at a time, shared by "tabs"). */
function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}

const failingStorage = (message: string): StorageLike => ({
  getItem: () => null,
  setItem: () => {
    throw new Error(message);
  },
  removeItem: () => undefined,
});

afterEach(() => vi.restoreAllMocks());

describe("createCaptureQueue", () => {
  it("persists entries and de-duplicates by clientId", () => {
    const storage = createMemoryStorage();
    const queue = createCaptureQueue(storage);
    queue.enqueue(entry("a"));
    queue.enqueue(entry("a"));
    queue.enqueue(entry("b"));
    expect(createCaptureQueue(storage).list().map((e) => e.clientId)).toEqual(["a", "b"]);
  });

  it("sends in order and removes what was sent", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("a"));
    queue.enqueue(entry("b"));
    const seen: string[] = [];
    const result = await queue.flush(async (e) => {
      seen.push(e.clientId);
      return "sent";
    });
    expect(seen).toEqual(["a", "b"]);
    expect(result).toEqual({ sent: 2, dropped: 0, remaining: 0 });
  });

  it("stops at the first retry and keeps the rest, in order", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    ["a", "b", "c"].forEach((id) => queue.enqueue(entry(id)));
    const outcomes: Record<string, SendOutcome> = { a: "sent", b: "retry", c: "sent" };
    const result = await queue.flush(async (e) => outcomes[e.clientId]);
    expect(result).toEqual({ sent: 1, dropped: 0, remaining: 2 });
    expect(queue.list().map((e) => e.clientId)).toEqual(["b", "c"]);
  });

  it("treats a thrown send as a retry", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("a"));
    const result = await queue.flush(async () => Promise.reject(new Error("offline")));
    expect(result).toEqual({ sent: 0, dropped: 0, remaining: 1 });
  });

  it("treats an unrecognised outcome as a retry, never as sent", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("a"));
    const result = await queue.flush(async () => undefined as unknown as SendOutcome);
    expect(result).toEqual({ sent: 0, dropped: 0, remaining: 1 });
  });
});

describe("rejected captures (a drop never deletes text)", () => {
  it("moves a rejected entry, with its full text and reason, to the needs-attention list", async () => {
    const storage = createMemoryStorage();
    const queue = createCaptureQueue(storage, { now: () => new Date("2026-10-04T07:00:00.000Z") });
    queue.enqueue(entry("bad", "line one\nline two"));
    queue.enqueue(entry("good"));
    const result = await queue.flush(async (e) => (e.clientId === "bad" ? { outcome: "drop", reason: "invalid-capture" } : "sent"));
    expect(result).toEqual({ sent: 1, dropped: 1, remaining: 0 });
    expect(queue.list()).toEqual([]);
    expect(queue.listRejected()).toEqual([
      { ...entry("bad", "line one\nline two"), reason: "invalid-capture", rejectedAt: "2026-10-04T07:00:00.000Z" },
    ]);
    // It is on the device, not just in memory.
    expect(storage.getItem(REJECTED_KEY)).toContain("line two");
    expect(createCaptureQueue(storage).listRejected()).toHaveLength(1);
  });

  it("gives a bare 'drop' a default reason and still keeps the text", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("bad"));
    await queue.flush(async () => "drop");
    expect(queue.listRejected()).toMatchObject([{ clientId: "bad", rawText: "note bad", reason: "invalid-capture" }]);
  });

  it("keeps a rejected entry until the user dismisses it", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("a"));
    queue.enqueue(entry("b"));
    await queue.flush(async () => "drop");
    expect(queue.listRejected().map((e) => e.clientId)).toEqual(["a", "b"]);
    expect(queue.dismissRejected("a").map((e) => e.clientId)).toEqual(["b"]);
    expect(queue.listRejected().map((e) => e.clientId)).toEqual(["b"]);
    expect(queue.dismissRejected("missing")).toHaveLength(1);
  });

  it("does not list the same clientId twice", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("a"));
    await queue.flush(async () => "drop");
    queue.enqueue(entry("a"));
    await queue.flush(async () => "drop");
    expect(queue.listRejected()).toHaveLength(1);
  });
});

describe("single-flight flush", () => {
  it("two concurrent flushes send each entry once and never in parallel", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    ["a", "b", "c"].forEach((id) => queue.enqueue(entry(id)));
    const rec = recordingSend();
    const [first, second] = await Promise.all([queue.flush(rec.send), queue.flush(rec.send)]);
    expect(rec.seen).toEqual(["a", "b", "c"]);
    expect(rec.maxActive()).toBe(1);
    expect(first).toEqual({ sent: 3, dropped: 0, remaining: 0 });
    expect(second).toEqual(first);
  });

  it("an entry queued while a flush is running is sent by that flush, and the later call sees it done", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("a"));
    const rec = recordingSend();
    const running = queue.flush(rec.send);
    await tick();
    queue.enqueue(entry("late"));
    const joined = queue.flush(rec.send);
    const [, result] = await Promise.all([running, joined]);
    expect(rec.seen).toEqual(["a", "late"]);
    expect(result.remaining).toBe(0);
    expect(rec.maxActive()).toBe(1);
  });

  it("allows a new flush once the previous one has finished, including after a failure", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("a"));
    expect(await queue.flush(async () => Promise.reject(new Error("offline")))).toMatchObject({ remaining: 1 });
    const rec = recordingSend();
    expect(await queue.flush(rec.send)).toEqual({ sent: 1, dropped: 0, remaining: 0 });
    expect(rec.seen).toEqual(["a"]);
  });

  it("runs the flush body inside the injected lock", async () => {
    const calls: string[] = [];
    const withLock = async <T,>(fn: () => Promise<T>): Promise<T> => {
      calls.push("lock");
      const value = await fn();
      calls.push("unlock");
      return value;
    };
    const queue = createCaptureQueue(createMemoryStorage(), { withLock });
    queue.enqueue(entry("a"));
    await queue.flush(async () => {
      calls.push("send");
      return "sent";
    });
    expect(calls).toEqual(["lock", "send", "unlock"]);
  });

  it("two tabs sharing storage and a lock send each entry exactly once, one at a time", async () => {
    const storage = createMemoryStorage();
    const withLock = createMutex();
    const tabA = createCaptureQueue(storage, { withLock });
    const tabB = createCaptureQueue(storage, { withLock });
    ["a", "b", "c", "d"].forEach((id) => tabA.enqueue(entry(id)));
    const rec = recordingSend();
    const [a, b] = await Promise.all([tabA.flush(rec.send), tabB.flush(rec.send)]);
    expect([...rec.seen].sort()).toEqual(["a", "b", "c", "d"]);
    expect(rec.maxActive()).toBe(1);
    expect(a.sent + b.sent).toBe(4);
    expect(tabA.list()).toEqual([]);
  });

  it("a lock that cannot be taken leaves the queue untouched and does not wedge later flushes", async () => {
    let fail = true;
    const withLock = async <T,>(fn: () => Promise<T>): Promise<T> => {
      if (fail) throw new Error("locks unavailable");
      return fn();
    };
    const queue = createCaptureQueue(createMemoryStorage(), { withLock });
    queue.enqueue(entry("a"));
    const rec = recordingSend();
    expect(await queue.flush(rec.send)).toEqual({ sent: 0, dropped: 0, remaining: 1 });
    expect(rec.seen).toEqual([]);
    fail = false;
    expect(await queue.flush(rec.send)).toEqual({ sent: 1, dropped: 0, remaining: 0 });
  });
});

describe("storage robustness", () => {
  it("backs up a corrupt queue, resets it, and warns without printing capture text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createMemoryStorage();
    const corrupt = '{"secret thesis text';
    storage.setItem(QUEUE_KEY, corrupt);
    expect(createCaptureQueue(storage).list()).toEqual([]);
    expect(storage.getItem(`${QUEUE_KEY}.corrupt`)).toBe(corrupt);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret thesis text");
  });

  it("keeps a backup when a valid list holds entries it cannot read", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createMemoryStorage();
    const raw = JSON.stringify([entry("a"), { clientId: "x", rawText: 5 }]);
    storage.setItem(QUEUE_KEY, raw);
    expect(createCaptureQueue(storage).list().map((e) => e.clientId)).toEqual(["a"]);
    expect(storage.getItem(`${QUEUE_KEY}.corrupt`)).toBe(raw);
  });

  it("a corrupt rejected list does not crash and is backed up under its own key", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createMemoryStorage();
    storage.setItem(REJECTED_KEY, "nope");
    expect(createCaptureQueue(storage).listRejected()).toEqual([]);
    expect(storage.getItem(`${REJECTED_KEY}.corrupt`)).toBe("nope");
  });

  it("keeps entries for the session when a write fails, and reports the queue as not durable", async () => {
    const queue = createCaptureQueue(failingStorage("QuotaExceededError"));
    expect(queue.isDurable()).toBe(true);
    queue.enqueue(entry("a"));
    expect(queue.isDurable()).toBe(false);
    expect(queue.list().map((e) => e.clientId)).toEqual(["a"]);
    const rec = recordingSend();
    expect(await queue.flush(rec.send)).toEqual({ sent: 1, dropped: 0, remaining: 0 });
  });
});

describe("resolveStorage", () => {
  it("falls back to memory when browser storage is blocked", () => {
    const storage = resolveStorage(() => failingStorage("SecurityError"));
    storage.setItem("k", "v");
    expect(storage.getItem("k")).toBe("v");
  });

  it("says whether the storage survives a reload, so the UI can warn", () => {
    expect(resolveStorageInfo(() => failingStorage("SecurityError")).durable).toBe(false);
    expect(resolveStorageInfo(() => undefined).durable).toBe(false);
    expect(
      resolveStorageInfo(() => {
        throw new Error("access denied");
      }).durable,
    ).toBe(false);
    const working = createMemoryStorage();
    const info = resolveStorageInfo(() => working);
    expect(info.durable).toBe(true);
    expect(info.storage).toBe(working);
  });
});
