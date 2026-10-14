import { fiscalYearEnd } from "@/modules/casefile/client";
import { parsePrinted } from "@/modules/documents/client";
import { ReviewError } from "./errors";
import { proposedFactSchema, type Flag, type MachineFact, type ProposedFact } from "./proposed-fact";
import type { EditFields } from "./review-types";

// What Aksh's decision does to one proposal (spec s6.5, rulings R28). Pure: the machine's reading is never changed,
// only a status and Aksh's own value are recorded beside it.

export type Decision = { kind: "accept" } | { kind: "edit"; value: ProposedFact } | { kind: "reject" };
export type Decided = { status: "accepted" | "edited" | "rejected"; acceptedValue: ProposedFact | null };

/** True when every field of the typed fact is the machine's reading. */
export function sameFact(a: ProposedFact, b: MachineFact): boolean {
  const priorSame = a.prior === null || b.prior === null ? a.prior === b.prior : a.prior.label === b.prior.label && a.prior.value === b.prior.value && a.prior.valueText === b.prior.valueText;
  return (
    priorSame &&
    a.label === b.label && a.value === b.value && a.valueText === b.valueText && a.unit === b.unit && a.period === b.period && a.asOf === b.asOf &&
    a.page === b.page && a.locator === b.locator && a.quote === b.quote && a.basis === b.basis && a.topic === b.topic && a.statement === b.statement
  );
}

export function decide(p: { status: string; flags: Flag[]; machine: MachineFact }, d: Decision): Decided {
  if (p.status === "filed") throw new ReviewError("figure-filed");
  if (d.kind === "reject") return { status: "rejected", acceptedValue: null };
  if (d.kind === "accept") {
    if (p.flags.length > 0) throw new ReviewError("type-value-first");
    const whole = proposedFactSchema.safeParse(p.machine);
    if (!whole.success) throw new ReviewError("figure-incomplete");
    return { status: "accepted", acceptedValue: whole.data };
  }
  const typed = proposedFactSchema.safeParse(d.value);
  if (!typed.success) throw new ReviewError("figure-incomplete");
  // A flagged figure Aksh resolved is his reading, even when it equals the machine's (R28).
  const status = p.flags.length === 0 && sameFact(typed.data, p.machine) ? "accepted" : "edited";
  return { status, acceptedValue: typed.data };
}

/** "FY26" -> "FY25", "Q1 FY26" -> "Q1 FY25"; null when the label is not a period. */
export function priorPeriodOf(period: string): string | null {
  const m = /^(Q[1-4] )?FY(\d{2})$/.exec(period);
  return m ? `${m[1] ?? ""}FY${String((Number(m[2]) + 99) % 100).padStart(2, "0")}` : null;
}

/**
 * The fact Aksh's typed fields make out of the figure as it stands (`base`: the machine's reading, or his earlier
 * edit). Fields he left empty keep the base's; the as-of date follows a changed period.
 */
export function buildFact(base: MachineFact, f: EditFields): ProposedFact {
  const valueText = f.valueText.trim();
  const value = parsePrinted(valueText);
  if (value === null) throw new ReviewError("figure-not-a-number");
  const period = f.period?.trim().toUpperCase() || base.period;
  const asOf = f.asOf?.trim() || (period && period !== base.period ? fiscalYearEnd(period) : base.asOf) || (period ? fiscalYearEnd(period) : null);

  let prior: MachineFact["prior"] = null;
  if (base.prior) {
    const priorText = f.priorValueText?.trim() || base.prior.valueText;
    const priorValue = parsePrinted(priorText);
    if (priorValue === null) throw new ReviewError("figure-not-a-number");
    prior = { label: f.priorPeriod?.trim().toUpperCase() || base.prior.label || (period ? priorPeriodOf(period) : null), value: priorValue, valueText: priorText };
  }
  // A period, date, unit or prior label still missing is refused here: the figure is not fit to file.
  const fact = proposedFactSchema.safeParse({ ...base, value, valueText, unit: f.unit?.trim() || base.unit, period, asOf, prior });
  if (!fact.success) throw new ReviewError("figure-incomplete");
  return fact.data;
}
