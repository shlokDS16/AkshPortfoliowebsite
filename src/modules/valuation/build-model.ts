import "server-only";
import { diffWorkbook } from "./diff";
import { probeFunctions, runNodeEngine } from "./engine-node";
import { buildGraph } from "./graph";
import { MAX_EVAL_ESTIMATE_MS, MODEL_OBJECT_MAX_BYTES, READ_BUDGET_MS } from "./limits";
import { readWorkbook } from "./read-workbook";
import { XlsxRefusal } from "./refusal";
import { buildReport } from "./report";
import { suggest } from "./suggest";
import { loadTokenizer } from "./tokens";
import type { CellClass, ModelObject } from "./types";
import { ENGINE_VERSIONS } from "./versions";

// The whole read in one call (spec s5.1-s5.6): size and zip checks, the SheetJS index, the IronCalc recalculation, the diff against
// Excel's saved values, the reference graph and taint, the suggestions and the report. It returns the object that is stored at
// models/<versionId>.json (the step does the storing). A time budget is checked after every stage; past it the read ends in
// `too_slow`. Throws XlsxRefusal for anything it will not read; never puts text from the workbook in an error.

export type BuildStage = "scan" | "parse" | "graph" | "load" | "evaluate" | "read" | "diff";

export type BuildOptions = {
  now?: () => number;
  budgetMs?: number;
  tmpDir?: string;
  maxObjectBytes?: number;
  /** Called as each stage finishes (the step logs the stage name and nothing else). */
  onStage?: (stage: BuildStage) => void;
};

/** The classes that make a cell's result unreliable: everything but a match and a date that moves by design. */
const SOURCES = new Set<CellClass>(["differs", "unsupported", "cycle", "no_cache", "random"]);

export async function buildModel(bytes: Uint8Array, opts: BuildOptions = {}): Promise<ModelObject> {
  const now = opts.now ?? Date.now;
  const started = now();
  const budget = opts.budgetMs ?? READ_BUDGET_MS;
  const stage = (name: BuildStage) => {
    opts.onStage?.(name);
    if (now() - started > budget) throw new XlsxRefusal("too_slow");
  };

  const index = readWorkbook(bytes, { checkpoint: stage });
  const tokenizer = await loadTokenizer();
  // The graph comes before the engine: its estimate of the engine's time (cost.ts) is what lets a workbook be refused instead of started,
  // because the engine's evaluate() is one native call that cannot be interrupted.
  const graph = buildGraph(index, tokenizer);
  stage("graph");
  if (graph.estimatedEvalMs > MAX_EVAL_ESTIMATE_MS) throw new XlsxRefusal("too_complex");
  const engine = runNodeEngine(bytes, index, { tmpDir: opts.tmpDir, checkpoint: stage });

  const functionsOf = (key: string) => graph.functions(graph.id(key)!);
  const classes = diffWorkbook(index, engine.values, functionsOf);

  const sources: number[] = [];
  for (const [key, cls] of classes) if (SOURCES.has(cls)) sources.push(graph.id(key)!);
  const taint = graph.taint(sources);
  const suggestions = suggest(index, graph, taint);

  // Function names the engine lacks, from the cells it answered #NAME? or #N/IMPL for while Excel had a value.
  const wanted = new Set<string>();
  for (const [key, cls] of classes) {
    const value = engine.values.get(key);
    if (cls === "unsupported" && value?.kind === "e" && (value.error === "NAME" || value.error === "NIMPL")) for (const fn of functionsOf(key)) wanted.add(fn);
  }
  const unimplemented = probeFunctions([...wanted]);

  const keysOf = (pick: (id: number) => boolean) => Array.from({ length: graph.size }, (_, id) => id).filter(pick).map((id) => graph.key(id));
  const tainted = keysOf((id) => taint[id] === 1);
  const dynamic = keysOf((id) => graph.isDynamic(id));
  const report = buildReport({
    index,
    classes,
    values: engine.values,
    functionsOf,
    unimplemented,
    tainted: Math.max(0, tainted.length - sources.length),
    dynamic: dynamic.length,
  });
  stage("diff");

  const model: ModelObject = {
    modelVersion: 1,
    engine: { ...ENGINE_VERSIONS },
    index,
    classes: Object.fromEntries([...classes].filter(([, cls]) => cls !== "match")) as ModelObject["classes"],
    taint: tainted,
    dynamic,
    suggestions,
    report,
    engineBytes: Buffer.from(engine.engineBytes).toString("base64"),
  };
  if (Buffer.byteLength(JSON.stringify(model)) > (opts.maxObjectBytes ?? MODEL_OBJECT_MAX_BYTES)) throw new XlsxRefusal("model_too_large");
  return model;
}
