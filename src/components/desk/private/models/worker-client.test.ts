import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FromWorker } from "./engine-protocol";
import { connectWorker } from "./worker-client";

// worker-client with a stand-in for the browser's Worker: the test posts the replies and the errors itself.

class FakeWorker {
  static all: FakeWorker[] = [];
  sent: { type: string; id: number }[] = [];
  terminated = false;
  onmessage: ((e: { data: FromWorker }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: { type: string; id: number }) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: FromWorker) {
    this.onmessage?.({ data: message });
  }
}

const worker = () => FakeWorker.all[0];
const nothing = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const RESULT = { kind: "number", value: 1 } as const;

beforeEach(() => {
  FakeWorker.all = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function opened() {
  const pending = connectWorker("https://storage.test/m.json", [{ sheet: "DCF", addr: "B13" }]);
  await nothing();
  worker().reply({ type: "done", id: worker().sent[0].id, values: [RESULT] });
  return pending;
}

describe("connectWorker", () => {
  it("asks the worker to load the model and returns the engine once it answers", async () => {
    const engine = await opened();
    expect(worker().sent[0]).toMatchObject({ type: "load", url: "https://storage.test/m.json" });
    expect(engine).toHaveProperty("evaluate");
  });

  it("answers each request with its own reply, even when the replies come back out of order", async () => {
    const engine = await opened();
    const first = engine.evaluate([]);
    const second = engine.evaluate([]);
    const [a, b] = worker().sent.slice(1);
    worker().reply({ type: "done", id: b.id, values: [{ kind: "number", value: 2 }] });
    worker().reply({ type: "done", id: a.id, values: [{ kind: "number", value: 1 }] });
    await expect(first).resolves.toEqual([{ kind: "number", value: 1 }]);
    await expect(second).resolves.toEqual([{ kind: "number", value: 2 }]);
  });

  it("a failed reply rejects only that request", async () => {
    const engine = await opened();
    const bad = engine.evaluate([]);
    const good = engine.evaluate([]);
    const [a, b] = worker().sent.slice(1);
    worker().reply({ type: "failed", id: a.id });
    worker().reply({ type: "done", id: b.id, values: [RESULT] });
    await expect(bad).rejects.toThrow();
    await expect(good).resolves.toEqual([RESULT]);
  });

  it("a worker error rejects every request still waiting", async () => {
    const engine = await opened();
    const one = engine.evaluate([]);
    const two = engine.evaluate([]);
    worker().onerror?.();
    await expect(one).rejects.toThrow();
    await expect(two).rejects.toThrow();
  });

  it("a load that fails ends the worker and rejects the connect", async () => {
    const pending = connectWorker("https://storage.test/m.json", []);
    await nothing();
    worker().reply({ type: "failed", id: worker().sent[0].id });
    await expect(pending).rejects.toThrow();
    expect(worker().terminated).toBe(true);
  });

  it("after dispose a request is refused at once instead of waiting for ever", async () => {
    const engine = await opened();
    engine.dispose();
    expect(worker().terminated).toBe(true);
    await expect(engine.evaluate([])).rejects.toThrow("calculator stopped");
  });

  it("a load that never answers is given up after 60 seconds", async () => {
    vi.useFakeTimers();
    const pending = connectWorker("https://storage.test/m.json", []);
    const caught = pending.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(worker().terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await caught).toBeInstanceOf(Error);
    expect(worker().terminated).toBe(true);
  });

  it("an aborted signal ends the worker at once", async () => {
    const controller = new AbortController();
    const caught = connectWorker("https://storage.test/m.json", [], { signal: controller.signal }).catch((e: Error) => e);
    await nothing();
    controller.abort();
    expect(await caught).toBeInstanceOf(Error);
    expect(worker().terminated).toBe(true);
  });

  it("a signal already aborted never starts a request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(connectWorker("https://storage.test/m.json", [], { signal: controller.signal })).rejects.toThrow();
    expect(worker().sent).toHaveLength(0);
  });
});
