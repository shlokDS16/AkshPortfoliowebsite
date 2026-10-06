import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CORRUPT_KEY,
  createCaptureQueue as createRealQueue,
  type QueueOptions,
  isCaptureStorageKey,
  QUEUE_KEY,
  REJECTED_KEY,
  type QueuedCapture,
  type SendOutcome,
  type SendVerdict,
} from "./queue";
import { createMemoryStorage, resolveStorage, resolveStorageInfo, webStorage, type StorageLike } from "./storage";

// Rejections and quarantines are stamped from the clock and sorted by it, so a real clock lets two
// writes cross a millisecond under load and flips the order. Every queue here gets a fixed clock unless a
// test passes its own.
const FIXED_NOW = () => new Date("2026-10-04T09:00:00.000Z");
const createCaptureQueue = (storage: StorageLike, options: QueueOptions = {}) =>
  createRealQueue(storage, { now: FIXED_NOW, ...options });

const qk = (clientId: string) => `${QUEUE_KEY}:${clientId}`;
const rk = (clientId: string) => `${REJECTED_KEY}:${clientId}`;
const corruptKeys = (storage: StorageLike) => storage.keys().filter((k) => k.startsWith(`${CORRUPT_KEY}:`));

/**
 * What a second tab can see: a snapshot taken when the tab last read, plus its own writes. The shared
 * storage gets every write, so the other tab's changes are invisible here until a fresh view is made.
 */
function staleView(shared: StorageLike): StorageLike {
  const view = createMemoryStorage();
  for (const key of shared.keys()) view.setItem(key, shared.getItem(key) as string);
  return {
    getItem: (key) => view.getItem(key),
    keys: () => view.keys(),
    setItem: (key, value) => {
      view.setItem(key, value);
      shared.setItem(key, value);
    },
    removeItem: (key) => {
      view.removeItem(key);
      shared.removeItem(key);
    },
  };
}

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
  keys: () => [],
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
    expect(storage.getItem(rk("bad"))).toContain("line two");
    expect(storage.getItem(qk("bad"))).toBeNull();
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

describe("one key per capture (tabs cannot overwrite each other)", () => {
  it("stores each capture under its own key", () => {
    const storage = createMemoryStorage();
    const queue = createCaptureQueue(storage);
    queue.enqueue(entry("a"));
    queue.enqueue(entry("b"));
    expect(storage.keys().sort()).toEqual([qk("a"), qk("b")]);
    queue.remove("a");
    expect(storage.keys()).toEqual([qk("b")]);
  });

  it("lists oldest first by queuedAt, then clientId", () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue({ ...entry("z"), queuedAt: "2026-10-04T06:00:00.000Z" });
    queue.enqueue({ ...entry("b"), queuedAt: "2026-10-04T06:00:02.000Z" });
    queue.enqueue({ ...entry("a"), queuedAt: "2026-10-04T06:00:02.000Z" });
    expect(queue.list().map((e) => e.clientId)).toEqual(["z", "a", "b"]);
  });

  it("a remove in a tab with a stale view does not erase an entry another tab just queued", async () => {
    const shared = createMemoryStorage();
    createCaptureQueue(shared).enqueue(entry("x"));
    const tabA = createCaptureQueue(staleView(shared)); // A has seen only X
    createCaptureQueue(shared).enqueue(entry("y")); // tab B queues Y after A looked

    tabA.remove("x");
    expect(createCaptureQueue(shared).list().map((e) => e.clientId)).toEqual(["y"]);

    const rec = recordingSend();
    expect(await createCaptureQueue(shared).flush(rec.send)).toEqual({ sent: 1, dropped: 0, remaining: 0 });
    expect(rec.seen).toEqual(["y"]);
  });

  it("a flush in a stale tab sends only what it saw, and the entry queued by the other tab is sent exactly once", async () => {
    const shared = createMemoryStorage();
    createCaptureQueue(shared).enqueue(entry("x"));
    const tabA = createCaptureQueue(staleView(shared));
    createCaptureQueue(shared).enqueue(entry("y"));

    const rec = recordingSend();
    await tabA.flush(rec.send); // sends X, removes only X
    expect(createCaptureQueue(shared).list().map((e) => e.clientId)).toEqual(["y"]);
    await createCaptureQueue(shared).flush(rec.send);
    expect(rec.seen).toEqual(["x", "y"]);
    expect(createCaptureQueue(shared).list()).toEqual([]);
  });

  it("a dismiss in a stale tab does not erase a capture another tab just rejected", async () => {
    const shared = createMemoryStorage();
    const setup = createCaptureQueue(shared);
    setup.enqueue(entry("r1"));
    await setup.flush(async () => "drop");
    const tabA = createCaptureQueue(staleView(shared)); // A has seen only r1

    const tabB = createCaptureQueue(shared);
    tabB.enqueue(entry("r2"));
    await tabB.flush(async () => "drop");

    tabA.dismissRejected("r1");
    expect(createCaptureQueue(shared).listRejected().map((e) => e.clientId)).toEqual(["r2"]);
  });

  it("a reject in a stale tab keeps what another tab rejected meanwhile", async () => {
    const shared = createMemoryStorage();
    const tabA = createCaptureQueue(staleView(shared)); // A sees an empty storage
    const tabB = createCaptureQueue(shared);
    tabB.enqueue(entry("r2"));
    await tabB.flush(async () => "drop");

    tabA.enqueue(entry("r1"));
    await tabA.flush(async () => "drop");
    expect(createCaptureQueue(shared).listRejected().map((e) => e.clientId)).toEqual(["r1", "r2"]);
  });

  it("a crash between writing the rejected copy and removing the queued one duplicates, never loses", async () => {
    const shared = createMemoryStorage();
    const writes: string[] = [];
    const crashing: StorageLike = {
      ...shared,
      setItem: (key, value) => {
        writes.push(`set ${key}`);
        shared.setItem(key, value);
      },
      removeItem: (key) => {
        writes.push(`remove ${key}`);
        throw new Error("tab closed");
      },
    };
    const queue = createCaptureQueue(crashing);
    queue.enqueue(entry("a"));
    await queue.flush(async () => "drop");
    expect(writes.indexOf(`set ${rk("a")}`)).toBeLessThan(writes.indexOf(`remove ${qk("a")}`));
    expect(shared.getItem(rk("a"))).not.toBeNull();
  });
});

describe("a send that hangs", () => {
  it("counts as a retry after the timeout, keeps the entry, and frees the queue", async () => {
    vi.useFakeTimers();
    try {
      const queue = createCaptureQueue(createMemoryStorage(), { sendTimeoutMs: 15_000 });
      queue.enqueue(entry("a"));
      let settled = false;
      const flushing = queue.flush(() => new Promise<SendVerdict>(() => {})).then((r) => {
        settled = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await flushing).toEqual({ sent: 0, dropped: 0, remaining: 1 });
      expect(queue.list().map((e) => e.clientId)).toEqual(["a"]);
      // The queue is not wedged: the next flush sends it.
      vi.useRealTimers();
      expect(await queue.flush(async () => "sent")).toEqual({ sent: 1, dropped: 0, remaining: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not time out a send that answers in time", async () => {
    vi.useFakeTimers();
    try {
      const queue = createCaptureQueue(createMemoryStorage(), { sendTimeoutMs: 15_000 });
      queue.enqueue(entry("a"));
      const flushing = queue.flush(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        return "sent";
      });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await flushing).toEqual({ sent: 1, dropped: 0, remaining: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("storage robustness", () => {
  it("quarantines a corrupt entry raw under a timestamped key, and warns without printing capture text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createMemoryStorage();
    const corrupt = '{"secret thesis text';
    storage.setItem(qk("bad"), corrupt);
    storage.setItem(qk("ok"), JSON.stringify(entry("ok")));
    const queue = createCaptureQueue(storage, { now: () => new Date("2026-10-04T08:00:00.000Z") });

    expect(queue.list().map((e) => e.clientId)).toEqual(["ok"]);
    expect(storage.getItem(qk("bad"))).toBeNull();
    expect(storage.getItem(`${CORRUPT_KEY}:2026-10-04T08:00:00.000Z`)).toBe(corrupt);
    expect(queue.listCorrupt()).toEqual([
      { key: `${CORRUPT_KEY}:2026-10-04T08:00:00.000Z`, detectedAt: "2026-10-04T08:00:00.000Z", rawValue: corrupt },
    ]);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret thesis text");
  });

  it("quarantines an entry that parses but is not a capture, or whose key does not match it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createMemoryStorage();
    storage.setItem(qk("x"), JSON.stringify({ clientId: "x", rawText: 5 }));
    storage.setItem(qk("liar"), JSON.stringify(entry("someone-else")));
    const queue = createCaptureQueue(storage);
    expect(queue.list()).toEqual([]);
    expect(queue.listCorrupt()).toHaveLength(2);
  });

  it("two corrupt values found in the same millisecond get distinct keys", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createMemoryStorage();
    storage.setItem(qk("a"), "nope-a");
    storage.setItem(qk("b"), "nope-b");
    const queue = createCaptureQueue(storage, { now: () => new Date("2026-10-04T08:00:00.000Z") });
    queue.list();
    expect(queue.listCorrupt().map((c) => c.rawValue).sort()).toEqual(["nope-a", "nope-b"]);
  });

  it("a corrupt rejected entry is quarantined too, and a dismissal removes only that value", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createMemoryStorage();
    storage.setItem(rk("bad"), "nope");
    const queue = createCaptureQueue(storage);
    expect(queue.listRejected()).toEqual([]);
    const [only] = queue.listCorrupt();
    expect(only.rawValue).toBe("nope");
    expect(queue.dismissCorrupt(only.key)).toEqual([]);
    expect(corruptKeys(storage)).toEqual([]);
  });

  it("dismissCorrupt refuses a key outside the corrupt namespace", () => {
    const storage = createMemoryStorage();
    const queue = createCaptureQueue(storage);
    queue.enqueue(entry("a"));
    queue.dismissCorrupt(qk("a"));
    expect(queue.list()).toHaveLength(1);
  });

  it("deletes an empty legacy whole-array key and keeps a non-empty one aside, raw", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const empty = createMemoryStorage();
    empty.setItem(QUEUE_KEY, "[]");
    createCaptureQueue(empty).list();
    expect(empty.getItem(QUEUE_KEY)).toBeNull();

    const full = createMemoryStorage();
    const legacy = JSON.stringify([entry("old", "legacy words")]);
    full.setItem(QUEUE_KEY, legacy);
    const queue = createCaptureQueue(full);
    expect(queue.list()).toEqual([]);
    expect(full.getItem(QUEUE_KEY)).toBeNull();
    expect(queue.listCorrupt().map((c) => c.rawValue)).toEqual([legacy]);
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

  it("carries entries that were already stored over to memory when a later write fails", () => {
    const shared = createMemoryStorage();
    createCaptureQueue(shared).enqueue(entry("a"));
    let full = false;
    const flaky: StorageLike = {
      ...shared,
      setItem: (key, value) => {
        if (full) throw new Error("QuotaExceededError");
        shared.setItem(key, value);
      },
    };
    const queue = createCaptureQueue(flaky);
    full = true;
    queue.enqueue(entry("b"));
    expect(queue.isDurable()).toBe(false);
    expect(queue.list().map((e) => e.clientId)).toEqual(["a", "b"]);
  });
});

describe("isCaptureStorageKey", () => {
  it("recognises the queue's keys, and a cleared storage, but not other sites' keys", () => {
    expect(isCaptureStorageKey(qk("a"))).toBe(true);
    expect(isCaptureStorageKey(rk("a"))).toBe(true);
    expect(isCaptureStorageKey(`${CORRUPT_KEY}:2026-10-04`)).toBe(true);
    expect(isCaptureStorageKey(null)).toBe(true);
    expect(isCaptureStorageKey("theme")).toBe(false);
  });
});

describe("storage helpers", () => {
  it("webStorage lists keys through key(i)/length", () => {
    const map = new Map<string, string>([
      ["a", "1"],
      ["b", "2"],
    ]);
    const fake = {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
    const storage = webStorage(fake);
    expect(storage.keys()).toEqual(["a", "b"]);
    storage.removeItem("a");
    expect(storage.keys()).toEqual(["b"]);
  });

  it("resolveStorage falls back to memory when browser storage is blocked", () => {
    const storage = resolveStorage(() => failingStorage("SecurityError"));
    storage.setItem("k", "v");
    expect(storage.getItem("k")).toBe("v");
  });

  it("resolveStorageInfo says whether the storage survives a reload, so the UI can warn", () => {
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
