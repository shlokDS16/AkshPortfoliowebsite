// How many figures wait for Aksh on each document, and how many of those carry a flag (the inbox card's "5 figures
// ready to check. 1 needs a look."). Pure: the inbox reads the pending proposals' flags and tallies them here.

export type PendingRow = { document_id: string; flags: string[] };

export function tallyPending(rows: PendingRow[]): Map<string, { pending: number; flagged: number }> {
  const out = new Map<string, { pending: number; flagged: number }>();
  for (const r of rows) {
    const t = out.get(r.document_id) ?? { pending: 0, flagged: 0 };
    t.pending += 1;
    if (r.flags.length > 0) t.flagged += 1;
    out.set(r.document_id, t);
  }
  return out;
}
