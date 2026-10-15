import { describe, expect, it, vi } from "vitest";
import type { CalcEngine, ModelObject, ResultCell, ResultValue } from "@/modules/valuation/client";
import { createHost } from "./engine-host";
import type { FromWorker, ToWorker } from "./engine-protocol";

// engine-host with a stand-in engine: the sheet mapping, the order of answers and the failure replies.

const model = (names: string[]) => ({ index: { sheets: names.map((name) => ({ name })) } }) as unknown as ModelObject;

function setup(engineSheets: string[], modelSheets = engineSheets) {
  const sets: { sheet: number; addr: string; value: number }[][] = [];
  const engine = {
    sheetNames: () => engineSheets,
    prepareResults: vi.fn(),
    setInputs: vi.fn((inputs) => sets.push(inputs)),
    evaluate: vi.fn(),
    readResults: vi.fn((cells: ResultCell[]): ResultValue[] => cells.map((c) => ({ kind: "number", value: c.sheet * 100 }))),
    dispose: vi.fn(),
  } as unknown as CalcEngine;
  const replies: FromWorker[] = [];
  const host = createHost({
    fetchModel: async (url) => {
      await new Promise((r) => setTimeout(r, url.endsWith("slow") ? 20 : 0));
      return model(modelSheets);
    },
    engineBytes: () => new Uint8Array(),
    loadEngine: async () => engine,
  });
  const send = (m: unknown) => host.receive(m as ToWorker, (r) => replies.push(r));
  const settled = () => new Promise((r) => setTimeout(r, 60));
  return { engine, sets, replies, send, settled };
}

describe("engine host", () => {
  it("maps a sheet name to the engine's own sheet position, not the stored index's", async () => {
    // The stored index has a chart sheet in front that the engine does not list.
    const t = setup(["Assumptions", "DCF"], ["Chart1", "Assumptions", "DCF"]);
    t.send({ type: "load", id: 1, url: "u", results: [{ sheet: "DCF", addr: "B13" }] });
    await t.settled();
    expect(t.replies[0]).toEqual({ type: "done", id: 1, values: [{ kind: "number", value: 100 }] });
    expect(t.engine.prepareResults).toHaveBeenCalledWith([{ sheet: 1, addr: "B13" }]);
    t.send({ type: "evaluate", id: 2, inputs: [{ sheet: "Assumptions", addr: "B1", value: 0.125 }] });
    await t.settled();
    expect(t.sets[0]).toEqual([{ sheet: 0, addr: "B1", value: 0.125 }]);
  });

  it("answers a sheet the engine does not have with a failed reply", async () => {
    const t = setup(["Assumptions"]);
    t.send({ type: "load", id: 1, url: "u", results: [{ sheet: "DCF", addr: "B13" }] });
    await t.settled();
    expect(t.replies).toEqual([{ type: "failed", id: 1 }]);
  });

  it("answers in the order the requests came, even when an earlier one is slower", async () => {
    const t = setup(["Assumptions", "DCF"]);
    t.send({ type: "load", id: 1, url: "slow", results: [{ sheet: "DCF", addr: "B13" }] });
    t.send({ type: "evaluate", id: 2, inputs: [] });
    t.send({ type: "evaluate", id: 3, inputs: [] });
    await t.settled();
    expect(t.replies.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(t.replies.every((r) => r.type === "done")).toBe(true);
  });

  it("answers failed, and does not throw, for a message it does not know or one that is not a message", async () => {
    const t = setup(["Assumptions", "DCF"]);
    t.send({ type: "load", id: 1, url: "u", results: [] });
    t.send({ type: "explode", id: 2 });
    t.send(null);
    t.send({ type: "evaluate", id: 4, inputs: [] });
    await t.settled();
    expect(t.replies.map((r) => r.type)).toEqual(["done", "failed", "failed", "done"]);
    expect(t.replies[1].id).toBe(2);
  });

  it("answers failed for an evaluate before any load", async () => {
    const t = setup(["Assumptions"]);
    t.send({ type: "evaluate", id: 1, inputs: [] });
    await t.settled();
    expect(t.replies).toEqual([{ type: "failed", id: 1 }]);
  });

  it("a second load ends the first engine", async () => {
    const t = setup(["Assumptions", "DCF"]);
    t.send({ type: "load", id: 1, url: "u", results: [] });
    t.send({ type: "load", id: 2, url: "u", results: [] });
    await t.settled();
    expect(t.engine.dispose).toHaveBeenCalledTimes(1);
  });

  it("a grid sets the two cells for each point and reads the one result cell", async () => {
    const t = setup(["Assumptions", "DCF"]);
    t.send({ type: "load", id: 1, url: "u", results: [{ sheet: "DCF", addr: "B13" }] });
    t.send({
      type: "grid",
      id: 2,
      base: [
        { sheet: "Assumptions", addr: "B1", value: 0.1 },
        { sheet: "Assumptions", addr: "B2", value: 0.03 },
      ],
      a: { sheet: "Assumptions", addr: "B1" },
      b: { sheet: "Assumptions", addr: "B2" },
      points: [
        { a: 0.2, b: 0.01 },
        { a: 0.3, b: 0.02 },
      ],
      result: { sheet: "DCF", addr: "B13" },
    });
    await t.settled();
    expect(t.sets).toEqual([
      [
        { sheet: 0, addr: "B1", value: 0.2 },
        { sheet: 0, addr: "B2", value: 0.01 },
      ],
      [
        { sheet: 0, addr: "B1", value: 0.3 },
        { sheet: 0, addr: "B2", value: 0.02 },
      ],
    ]);
    expect(t.replies[1]).toEqual({ type: "done", id: 2, values: [{ kind: "number", value: 100 }, { kind: "number", value: 100 }] });
  });
});
