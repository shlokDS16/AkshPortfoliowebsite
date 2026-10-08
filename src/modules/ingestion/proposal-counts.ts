import type { Basis } from "@/modules/documents/client";
import { machineFactSchema } from "./proposed-fact";
import { basisRepeats, isListed } from "./review-values";

// How many figures wait for Aksh on each document, how many of those carry a flag (the inbox card's "5 figures
// ready to check. 1 needs a look."), and how many he has already decided or filed (so a fully checked document still
// has its way back to the review screen, where Done lives). Pure: the inbox reads the document's unfiled proposals and tallies them here.
// A standalone repeat of a consolidated line is left out, exactly as the review screen leaves it out, so the card's
// number is the review's number.

export type ProposalCountRow = { id: string; document_id: string; flags: string[]; status: string; machine_value: unknown; accepted_value: unknown };

export type PendingTally = { pending: number; flagged: number; decided: number };

export function tallyPending(rows: ProposalCountRow[], basisOf: Map<string, Basis>): Map<string, PendingTally> {
  const byDocument = new Map<string, ProposalCountRow[]>();
  for (const r of rows) byDocument.set(r.document_id, [...(byDocument.get(r.document_id) ?? []), r]);

  const out = new Map<string, PendingTally>();
  for (const [documentId, mine] of byDocument) {
    // The figure as it stands (Aksh's value once he has typed one), reduced to what identifies a line.
    const lines = mine.flatMap((r) => {
      const fact = machineFactSchema.safeParse(r.accepted_value ?? r.machine_value);
      return fact.success ? [{ id: r.id, label: fact.data.label, period: fact.data.period ?? "", page: fact.data.page, basis: fact.data.basis, status: r.status, flags: r.flags }] : [];
    });
    const repeats = basisRepeats(lines.filter(isListed), basisOf.get(documentId) ?? "consolidated");
    const waiting = lines.filter((l) => l.status === "pending" && !repeats.has(l.id));
    // Decided: accepted, edited, dropped or filed, whatever the basis; a document with any is not "no figures matched".
    const decided = lines.filter((l) => l.status !== "pending").length;
    if (waiting.length > 0 || decided > 0) out.set(documentId, { pending: waiting.length, flagged: waiting.filter((l) => l.flags.length > 0).length, decided });
  }
  return out;
}
