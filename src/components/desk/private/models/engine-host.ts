import type { CalcEngine, ModelObject, ResultCell } from "@/modules/valuation/client";
import type { EngineCell, EngineInput, FromWorker, ToWorker } from "./engine-protocol";

// What the calculator's worker does with a request, apart from the browser's message plumbing (engine.worker.ts), so it can be tested.
// One engine at a time. Requests are answered in the order they came: each waits for the one before it. A request that cannot be
// answered (an unknown sheet, no model loaded, a message of a kind it does not know) is answered "failed"; nothing is thrown out of here.

export type HostDeps = {
  fetchModel: (url: string) => Promise<ModelObject>;
  engineBytes: (model: ModelObject) => Uint8Array;
  loadEngine: (bytes: Uint8Array) => Promise<CalcEngine>;
};

export function createHost(deps: HostDeps) {
  let engine: CalcEngine | null = null;
  let sheets: string[] = [];
  let results: ResultCell[] = [];

  /** The engine's sheet position comes from the engine's own list, never from the stored index (they can differ by a chart sheet). */
  function at(cell: EngineCell): ResultCell {
    const sheet = sheets.indexOf(cell.sheet);
    if (sheet < 0) throw new RangeError("no such sheet");
    return { sheet, addr: cell.addr };
  }
  const set = (inputs: EngineInput[]) => engine!.setInputs(inputs.map((i) => ({ ...at(i), value: i.value })));

  async function handle(m: ToWorker): Promise<FromWorker> {
    if (m.type === "load") {
      const model = await deps.fetchModel(m.url);
      engine?.dispose();
      engine = null;
      const loaded = await deps.loadEngine(deps.engineBytes(model));
      engine = loaded;
      sheets = loaded.sheetNames();
      results = m.results.map(at);
      loaded.prepareResults(results);
      return { type: "done", id: m.id, values: loaded.readResults(results) };
    }
    if (!engine) throw new Error("not loaded");
    if (m.type === "evaluate") {
      set(m.inputs);
      engine.evaluate();
      return { type: "done", id: m.id, values: engine.readResults(results) };
    }
    if (m.type !== "grid") throw new Error("unknown request");
    const target = [at(m.result)];
    const values = m.points.map((p) => {
      set(m.base.map((i) => (i.sheet === m.a.sheet && i.addr === m.a.addr ? { ...i, value: p.a } : i.sheet === m.b.sheet && i.addr === m.b.addr ? { ...i, value: p.b } : i)));
      engine!.evaluate();
      return engine!.readResults(target)[0];
    });
    return { type: "done", id: m.id, values };
  }

  let queue: Promise<unknown> = Promise.resolve();
  return {
    receive(m: ToWorker, reply: (r: FromWorker) => void): void {
      queue = queue.then(async () => {
        try {
          reply(await handle(m));
        } catch {
          const id = (m as { id?: unknown } | null)?.id;
          reply({ type: "failed", id: typeof id === "number" ? id : -1 });
        }
      });
    },
  };
}
