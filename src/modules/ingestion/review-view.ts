import { machineFactSchema, proposedFactSchema, type MachineFact } from "./proposed-fact";
import type { ProposalRecord } from "./review-repo";
import { currentRows } from "./supersede";
import { whyFor, type ProposalStatus, type ProposalView } from "./review-types";

// One stored proposal as the review screen and the review operations read it. Server side only.

/** What the machine read; null for a row whose stored value is not a machine fact (the machine validates before it writes, so none is expected). */
export function machineOf(rec: ProposalRecord): MachineFact | null {
  const parsed = machineFactSchema.safeParse(rec.machine);
  return parsed.success ? parsed.data : null;
}

/** The figure as it stands: Aksh's own value once he has decided on it, else the machine's reading. */
export function currentFact(rec: ProposalRecord, machine: MachineFact): MachineFact {
  const accepted = rec.accepted ? proposedFactSchema.safeParse(rec.accepted) : null;
  return accepted?.success ? accepted.data : machine;
}

export function toView(rec: ProposalRecord): ProposalView | null {
  const machine = machineOf(rec);
  if (!machine) return null;
  const f = currentFact(rec, machine);
  const { flags } = rec;
  return {
    id: rec.id,
    page: rec.pageNo,
    label: f.label,
    valueText: f.valueText,
    unit: f.unit ?? "",
    period: f.period ?? "",
    asOf: f.asOf ?? "",
    prior: f.prior?.valueText ?? null,
    priorPeriod: f.prior?.label ?? "",
    quote: f.quote,
    topic: f.topic,
    flags,
    why: whyFor(flags, { valueText: machine.valueText, page: rec.pageNo }),
    status: rec.status as ProposalStatus,
    reason: rec.reason as ProposalView["reason"],
    basis: f.basis,
    machineText: machine.valueText,
  };
}

/**
 * The records the screen lists: a figure Aksh's re-read replaced is gone; a figure he dropped himself stays dropped when a later pass
 * reads the same line again (see supersede.ts); every accepted, edited or filed one stays.
 */
export const currentRecords = (recs: ProposalRecord[]): ProposalRecord[] =>
  currentRows(recs, (r) => ({ key: r.baseKey, pass: r.pass, status: r.status, superseded: r.superseded }));
