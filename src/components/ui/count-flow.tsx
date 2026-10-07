"use client";

import type NumberFlowType from "@number-flow/react";
import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";
import { EASE_SNAP, MOTION, easeCss } from "./motion-tokens";

type Flow = typeof NumberFlowType;
const TIMING = { duration: MOTION.slow * 1000, easing: easeCss(EASE_SNAP) };

/**
 * Counts of desk activity only (files, tests, revisions, tray counts). Never a financial figure
 * (design-dna 10.3). Server HTML shows the final value; NumberFlow loads after hydration with the
 * same value, so a roll happens only when the value later changes on the client (Plan 1B D22).
 */
export function CountFlow({ value, className }: { value: number; className?: string }) {
  const [Flow, setFlow] = useState<Flow | null>(null);
  useEffect(() => {
    let live = true;
    void import("@number-flow/react").then((mod) => {
      if (live) setFlow(() => mod.default);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!Flow) return <span className={className ?? "tabular-nums"}>{formatNumber(value, 0)}</span>;
  return <Flow value={value} locales="en-IN" className={className ?? "tabular-nums"} transformTiming={TIMING} spinTiming={TIMING} />;
}
