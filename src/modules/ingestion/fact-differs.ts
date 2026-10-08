import type { CfFact } from "@/modules/casefile/client";
import type { MachineFact } from "./proposed-fact";

// Pure and browser-safe: the server uses it to decide `edited` when it records a filing, and the private desk's
// chip uses it to say whether Aksh changed what the machine read (ADR-004 s4.7).

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** True when the saved fact (and its quoted line) is not exactly what the machine read. */
export function factDiffers(fact: CfFact, quote: string | null, m: MachineFact): boolean {
  return (
    fact.label !== m.label || fact.value !== m.value || fact.unit !== m.unit || fact.period !== m.period || fact.asOf !== m.asOf ||
    fact.locator !== m.locator || (fact.prior?.value ?? null) !== (m.prior?.value ?? null) || collapse(quote ?? "") !== collapse(m.quote)
  );
}

/** The saved number written with the decimals (and grouping) of the machine's printed text: 41.2 beside "41.70" reads "41.20". */
export function likePrinted(value: number, printed: string): string {
  const decimals = /\.(\d+)\s*$/.exec(printed)?.[1].length ?? 0;
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: printed.includes(",") });
}
