import type { CaseFile } from "@/modules/casefile/client";
import { factDiffers, likePrinted, type FactProvenance, type StagedReading, type StagedRow } from "@/modules/ingestion/client";

// The two small notes under a fact row on the private desk: "From <doc>, p. 4" on a figure waiting to be saved, and the
// chip on a saved figure that says where it was read and whether Aksh changed it. Pure.

export type RowMarks = Record<string, { staged?: string; chip?: string }>;

/** "Read from p. 4 of <doc>; you kept it." / "...; you changed 41.70 to 41.20." */
export function chipText(prov: FactProvenance, fact: CaseFile["facts"][number], quote: string | null): string {
  const read = `Read from p. ${prov.page} of ${prov.documentTitle}`;
  if (!factDiffers(fact, quote, prov.machine)) return prov.edited ? `${read}; you checked it.` : `${read}; you kept it.`;
  if (fact.value !== prov.machine.value) return `${read}; you changed ${prov.machine.valueText} to ${likePrinted(fact.value, prov.machine.valueText)}.`;
  return `${read}; you edited it.`;
}

/** The marks of the staged test readings, keyed by test id ("Reading from <doc>, p. 7"): the test row shows where the number came from. */
export function readingMarks(pairs: { testId: string; proposalId: string }[], readings: StagedReading[]): RowMarks {
  const byProposal = new Map(readings.map((r) => [r.proposalId, r]));
  const out: RowMarks = {};
  for (const { testId, proposalId } of pairs) {
    const row = byProposal.get(proposalId);
    if (row) out[testId] = { staged: `Reading from ${row.document.title}, p. ${row.value.page}` };
  }
  return out;
}

export function buildMarks(pairs: { factId: string; proposalId: string }[], staged: StagedRow[], saved: CaseFile | null, provenance: Record<string, FactProvenance>): RowMarks {
  const out: RowMarks = {};
  const byProposal = new Map(staged.map((s) => [s.proposalId, s]));
  for (const { factId, proposalId } of pairs) {
    const row = byProposal.get(proposalId);
    if (row) out[factId] = { staged: `From ${row.document.title}, p. ${row.value.page}` };
  }
  if (saved) {
    for (const fact of saved.facts) {
      const prov = provenance[fact.id];
      if (!prov || out[fact.id]) continue;
      out[fact.id] = { chip: chipText(prov, fact, saved.sources.find((s) => s.id === fact.sourceId)?.quote[fact.id] ?? null) };
    }
  }
  return out;
}
