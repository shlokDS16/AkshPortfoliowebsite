// Browser-safe storage plumbing for the capture queue. Pure: nothing here touches `window`.
const PROBE_KEY = "desk.storageProbe";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Every key currently stored. The queue keeps one key per capture, so it must be able to list them. */
  keys(): string[];
};

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  };
}

/** Adapts a Web Storage object (localStorage) to StorageLike. */
export function webStorage(storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">): StorageLike {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    keys: () => {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key !== null) keys.push(key);
      }
      return keys;
    },
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
