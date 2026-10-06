"use client";

import { useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ExhibitKeyMark } from "@/lib/view-types";
import { KeySwatch } from "./chart/key-swatch";

type Props = {
  chart: ReactNode;
  table: ReactNode;
  keyItems: { mark: ExhibitKeyMark; label: string }[];
  defaultView: "chart" | "table";
  chartOk: boolean;
};

/** Chart/Table swap is instant (it is data); only the indicator moves. */
export function ExhibitToggle({ chart, table, keyItems, defaultView, chartOk }: Props) {
  const [view, setView] = useState<"chart" | "table">(chartOk ? defaultView : "table");
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul aria-label="Key" className="flex flex-wrap gap-x-3 text-caption text-ink-muted">
          {keyItems.map((k) => (
            <li key={k.label} className="inline-flex items-center gap-1.5">
              <KeySwatch mark={k.mark} />
              {k.label}
            </li>
          ))}
        </ul>
        <SegmentedControl
          size="sm"
          aria-label="Show as"
          value={view}
          onValueChange={(v) => setView(v === "table" ? "table" : "chart")}
          items={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {!chartOk ? <p className="mt-2 text-small text-ink-muted">Chart could not be drawn. The table holds the same figures.</p> : null}
      <div className="mt-2">{view === "chart" && chartOk ? chart : table}</div>
    </div>
  );
}
