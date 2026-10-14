import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// The ledger side of the publish gate (publishing rules 4 and 5; migration 0014). The gate itself is `publish_revision()` and
// is never overridden from here. This only reads, for the checklist the publish panel shows, what the gate will conclude:
// it asks the SAME database function the gate uses (`ledger_gate_facts`), which reads the sealed events and nothing the
// owner can edit, so the checklist cannot disagree with the gate.

/** What the sealed ledger says about one company, as the gate will see it. */
export type LedgerGateFacts = {
  /** False when the ledger failed its own check: the gate then refuses every item that names a company. */
  ledgerOk: boolean;
  /** The India date (ISO) from which rule 4 passes, or null when it is clear today. */
  stanceClearDate: string | null;
  /** True when a non-withdrawn, not-closed idea on the company is held. A disclosure that says "no" would contradict it. */
  holdsOpenPosition: boolean;
};

/** Asks the database for the gate's own facts. A failure is thrown: it is never read as "clear". */
export async function ledgerGateFacts(db: Db, companyId: string): Promise<LedgerGateFacts> {
  const { data, error } = await db.rpc("ledger_gate_facts", { p_company_id: companyId });
  if (error) throw dbError("ledger.gateFacts", error);
  const row = data?.[0];
  // The function always returns one row; anything else cannot be trusted as a clear.
  if (!row) throw dbError("ledger.gateFacts", { message: "ledger_gate_facts returned no row" });
  return { ledgerOk: row.ledger_ok === true, stanceClearDate: row.clear_from ?? null, holdsOpenPosition: row.holds_position === true };
}
