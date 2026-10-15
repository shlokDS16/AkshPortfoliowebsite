"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, type ComponentType } from "react";
import type { ScenarioCell, ScenarioRow } from "@/modules/valuation/client";
import { CalculatorShell } from "./calculator-shell";

// Loads the calculator's chunk on this route only (spec s7.4: next/dynamic, ssr: false), so no other page carries the engine. Until it
// arrives the page shows the workbook values, read-only (rendered on the server too, so the shell paints before the chunk); a chunk that
// fails to load shows the spec s8 sentence instead of an error page.

export type CalculatorProps = { versionId: string; cells: ScenarioCell[]; scenarios: ScenarioRow[] };

/** A chunk that cannot be loaded becomes the failed shell, with the spec s8 sentence. */
export function withFallback(load: () => Promise<{ default: ComponentType<CalculatorProps> }>) {
  return () =>
    load().catch(() => ({
      default: function CalculatorFailed({ cells }: CalculatorProps) {
        return <CalculatorShell cells={cells} failed />;
      },
    }));
}

// next/dynamic's loading view gets no props: the cells reach it through this context.
const Cells = createContext<ScenarioCell[]>([]);
function Loading() {
  return <CalculatorShell cells={useContext(Cells)} />;
}

const Calculator = dynamic(withFallback(() => import("./calculator")), { ssr: false, loading: Loading });

export function CalculatorLoader(props: CalculatorProps) {
  return (
    <Cells value={props.cells}>
      <Calculator {...props} />
    </Cells>
  );
}
