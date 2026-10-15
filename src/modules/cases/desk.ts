import type { Db } from "@/lib/supabase/types";
import { createSupabaseResearchRepo } from "@/modules/research";
import { createSupabaseCasesRepo } from "./repo";
import { caseBlockFor, ledgerStatus } from "./service";
import type { CaseState, LedgerStatus } from "./types";

// The two reads the desk screens make, wired to the admin's cookie client. Advisory only: the database gate decides.

const depsOf = (db: Db) => ({ cases: createSupabaseCasesRepo(db), research: createSupabaseResearchRepo(db) });

/** The "Case study" block of a closed idea's page. */
export function loadCaseBlock(db: Db, ideaId: string): Promise<{ state: CaseState | null; reveal: boolean }> {
  return caseBlockFor(depsOf(db), ideaId);
}

/** The ledger against one case study item, and the two owner switches, for the item page. Null parts mean "could not be read". */
export async function loadLedgerView(db: Db, itemId: string): Promise<{ status: LedgerStatus | null; switches: { reveal: boolean; chart: boolean } | null }> {
  const deps = depsOf(db);
  const [status, switches] = await Promise.all([ledgerStatus(deps, itemId).catch(() => null), deps.cases.switches().catch(() => null)]);
  return { status, switches };
}
