"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { modelUrlAction } from "@/modules/valuation/actions";
import type { ResultValue, ScenarioCell, ScenarioRow } from "@/modules/valuation/client";
import { CALCULATOR_FAILED, CALCULATOR_LOADING } from "./copy";
import type { Connect, Engine } from "./engine-protocol";
import { InputsPanel } from "./inputs-panel";
import { FirstResultBar, ResultsPanel } from "./results-panel";
import { DRAFT, ScenarioPicker, WORKBOOK } from "./scenario-picker";
import { SensitivityGrid } from "./sensitivity-grid";
import { connectWorker } from "./worker-client";

// The calculator (spec s7.3, s7.4; layout A, D16): picker on top, inputs left and results right on desktop (inputs first on a phone, the
// first result kept in view), the sensitivity grid below. It is loaded with next/dynamic (ssr: false) on this route only; the engine runs
// in a Web Worker (D18) on the model object fetched through modelUrlAction's 10-minute link. Outputs are never stored: recomputed.

const SETTLE_MS = 150;

type Props = { versionId: string; cells: ScenarioCell[]; scenarios: ScenarioRow[]; connect?: Connect };
type Status = "loading" | "ready" | "failed";

function useEngine(versionId: string, outputs: ScenarioCell[], connect: Connect): { status: Status; engine: Engine | null } {
  const [state, setState] = useState<{ status: Status; engine: Engine | null }>({ status: "loading", engine: null });
  const targets = useMemo(() => outputs.map((c) => ({ sheet: c.sheet, addr: c.addr })), [outputs]);
  useEffect(() => {
    let live = true;
    let opened: Engine | null = null;
    (async () => {
      try {
        const link = await modelUrlAction(versionId);
        if (!link.ok) throw new Error(link.code);
        opened = await connect(link.url, targets);
        if (live) setState({ status: "ready", engine: opened });
        else opened.dispose();
      } catch {
        if (live) setState({ status: "failed", engine: null });
      }
    })();
    return () => {
      live = false;
      opened?.dispose();
    };
  }, [versionId, targets, connect]);
  return state;
}

export default function Calculator({ versionId, cells, scenarios, connect = connectWorker }: Props) {
  const inputs = useMemo(() => cells.filter((c) => c.role === "input"), [cells]);
  const outputs = useMemo(() => cells.filter((c) => c.role === "output"), [cells]);
  const workbook = useMemo(() => Object.fromEntries(inputs.map((c) => [c.id, c.value])), [inputs]);
  const [values, setValues] = useState<Record<string, number>>(workbook);
  const [picked, setPicked] = useState<string>(WORKBOOK);
  const [results, setResults] = useState<ResultValue[] | null>(null);
  const [broken, setBroken] = useState(false);
  const { status, engine } = useEngine(versionId, outputs, connect);
  const seq = useRef(0);

  // Recalculate once he pauses: the newest answer wins.
  useEffect(() => {
    if (!engine) return;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      engine.evaluate(inputs.map((c) => ({ sheet: c.sheet, addr: c.addr, value: values[c.id] ?? c.value }))).then(
        (out) => mine === seq.current && setResults(out),
        () => mine === seq.current && setBroken(true),
      );
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [engine, inputs, values]);

  const unchanged = inputs.every((c) => values[c.id] === c.value);
  // A saved scenario only counts once the refresh after saving has brought it in; until then he sees unsaved changes.
  const known = picked === WORKBOOK || scenarios.some((s) => s.id === picked);
  const shown = picked === DRAFT && unchanged ? WORKBOOK : known ? picked : DRAFT;

  function pick(id: string) {
    const scenario = scenarios.find((s) => s.id === id);
    const next = { ...workbook };
    for (const v of scenario?.values ?? []) if (v.cellId in next) next[v.cellId] = v.value;
    setValues(next);
    setPicked(scenario ? id : WORKBOOK);
  }
  const edit = (id: string, value: number) => {
    setValues((was) => ({ ...was, [id]: value }));
    setPicked(DRAFT);
  };

  const failed = status === "failed" || broken;
  return (
    <div className="space-y-(--block-gap)">
      {failed ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {CALCULATOR_FAILED}
        </p>
      ) : status === "loading" ? (
        <p role="status" className="text-small text-ink-muted desk:text-small-desk">
          {CALCULATOR_LOADING}
        </p>
      ) : null}
      <ScenarioPicker versionId={versionId} scenarios={scenarios} picked={shown} values={values} disabled={status !== "ready"} onPick={pick} onSaved={setPicked} />
      <div>
        <FirstResultBar outputs={outputs} results={failed ? null : results} />
        <div className="grid grid-cols-1 gap-(--block-gap) pt-2 desk:grid-cols-2">
          <InputsPanel inputs={inputs} values={values} disabled={status !== "ready"} onChange={edit} onReset={(id) => edit(id, workbook[id])} />
          <ResultsPanel outputs={outputs} results={failed ? null : results} />
        </div>
      </div>
      <SensitivityGrid inputs={inputs} outputs={outputs} values={values} engine={failed ? null : engine} />
    </div>
  );
}
